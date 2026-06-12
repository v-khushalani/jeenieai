import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Swords, Flame, Timer, ArrowLeft, Crown, Loader2, Skull, Shield, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { MathDisplay } from '@/components/admin/MathDisplay';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { logger } from '@/utils/logger';

type Phase = 'idle' | 'matching' | 'playing' | 'finished';
type Mode = 'real' | 'bot';
const QUESTION_TIME_SECONDS = 30;
const MATCH_TIMEOUT_MS = 5500; // wait this long for a real opponent before falling back to bot
const OPTIONS = ['A', 'B', 'C', 'D'] as const;

const BOT_NAMES = [
  'Aarav_J', 'IshaRanker', 'KaeXcalibur', 'RxnMaster', 'NeoTensor',
  'PhyPhoenix', 'OrgoOracle', 'QuantumQ', 'IntegralIvy', 'VectorVik',
  'MoleMaverick', 'TheKotaKid', 'JeeShark', 'AcidRain_07', 'SineWave',
];

interface BattleQuestion {
  id: string;
  question: string | null;
  question_text?: string | null;
  option_a?: string | null;
  option_b?: string | null;
  option_c?: string | null;
  option_d?: string | null;
  correct_option?: string | null;
  correct_options?: string[] | null;
  question_type?: string | null;
}

interface PlayerRow {
  user_id: string;
  display_name: string | null;
  score: number;
  correct_count: number;
  wrong_count: number;
  streak: number;
  finished_at: string | null;
}

const pickBotName = () => BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
const BOT_ID = '__bot__';

const BattlePage: React.FC = () => {
  const navigate = useNavigate();
  const { user, subscriptionTier } = useAuth();
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('real');
  const [battleId, setBattleId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<BattleQuestion[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(QUESTION_TIME_SECONDS);
  const [lastResult, setLastResult] = useState<{ isCorrect: boolean; points: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [winnerId, setWinnerId] = useState<string | null>(null);

  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const advancingRef = useRef(false);
  const matchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<any>(null);
  const botTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const modeRef = useRef<Mode>('real');
  // Refs to defeat stale closures in the tick/handleTimeout callbacks — these
  // are the ROOT CAUSE of the "0% accuracy / 34 attempts on 5 Qs" bug. The
  // setInterval tick captures the FIRST render's handleTimeout, which sees
  // stale `lastResult`/`currentIndex` and triggers a no-op submit + advance.
  const lastResultRef = useRef<{ isCorrect: boolean; points: number } | null>(null);
  const currentIndexRef = useRef(0);
  const submittingRef = useRef(false);

  const me = useMemo(() => players.find(p => p.user_id === user?.id), [players, user?.id]);
  const opponents = useMemo(() => players.filter(p => p.user_id !== user?.id), [players, user?.id]);
  const currentQuestion = questions[currentIndex];

  useEffect(() => { lastResultRef.current = lastResult; }, [lastResult]);
  useEffect(() => { currentIndexRef.current = currentIndex; }, [currentIndex]);
  useEffect(() => { submittingRef.current = submitting; }, [submitting]);


  useEffect(() => {
    if (user && subscriptionTier !== 'pro_plus') {
      toast.error('Battle Mode is exclusive to JEEnie Pro+ warriors');
      navigate('/subscription-plans');
    }
  }, [user, subscriptionTier, navigate]);

  // ── DB helpers (real mode) ──
  const loadPlayers = useCallback(async (bId: string) => {
    const { data } = await supabase
      .from('battle_players')
      .select('user_id, display_name, score, correct_count, wrong_count, streak, finished_at')
      .eq('battle_id', bId)
      .order('score', { ascending: false });
    if (data) setPlayers(data as PlayerRow[]);
  }, []);

  const loadQuestions = useCallback(async (ids: string[]) => {
    if (!ids.length) return [] as BattleQuestion[];
    const { data } = await supabase
      .from('questions')
      .select('id, question, question_text, option_a, option_b, option_c, option_d, correct_option, correct_options, question_type')
      .in('id', ids);
    if (!data) return [];
    const ordered = ids.map(id => (data as BattleQuestion[]).find(q => q.id === id)).filter(Boolean) as BattleQuestion[];
    setQuestions(ordered);
    return ordered;
  }, []);

  // ── BOT mode helpers ──
  const fetchRandomQuestionsForBot = useCallback(async (): Promise<BattleQuestion[]> => {
    // Grab a small batch, then randomly pick 5
    const { data, error } = await supabase
      .from('questions')
      .select('id, question, question_text, option_a, option_b, option_c, option_d, correct_option, correct_options, question_type')
      .eq('is_active', true)
      .eq('question_type', 'single_correct')
      .limit(80);
    if (error || !data?.length) return [];
    const shuffled = [...data].sort(() => Math.random() - 0.5).slice(0, 5);
    return shuffled as BattleQuestion[];
  }, []);

  const cleanupRealtime = useCallback(() => {
    if (channelRef.current) {
      try {
        supabase.removeChannel(channelRef.current);
      } catch (error) {
        logger.warn('Failed to remove battle channel', error);
      }
      channelRef.current = null;
    }
    if (matchTimeoutRef.current) {
      clearTimeout(matchTimeoutRef.current);
      matchTimeoutRef.current = null;
    }
  }, []);

  const clearBotTimer = () => {
    if (botTimerRef.current) {
      clearTimeout(botTimerRef.current);
      botTimerRef.current = null;
    }
  };

  // Start bot battle (after timeout or immediately if RPC fails)
  const startBotBattle = useCallback(async () => {
    if (modeRef.current === 'bot') return;
    modeRef.current = 'bot';
    setMode('bot');
    cleanupRealtime();

    const qs = await fetchRandomQuestionsForBot();
    if (!qs.length) {
      toast.error('No questions available for battle right now');
      setPhase('idle');
      return;
    }
    setQuestions(qs);

    const meRow: PlayerRow = {
      user_id: user!.id,
      display_name: 'You',
      score: 0, correct_count: 0, wrong_count: 0, streak: 0, finished_at: null,
    };
    const botRow: PlayerRow = {
      user_id: BOT_ID,
      display_name: pickBotName(),
      score: 0, correct_count: 0, wrong_count: 0, streak: 0, finished_at: null,
    };
    setPlayers([meRow, botRow]);
    setCurrentIndex(0);
    setPhase('playing');
  }, [cleanupRealtime, fetchRandomQuestionsForBot, user]);

  // Bot answers current question after a randomized delay
  useEffect(() => {
    if (phase !== 'playing' || modeRef.current !== 'bot' || !currentQuestion) return;
    clearBotTimer();
    // Bot accuracy ~62%, response time 6–22s
    const willBeCorrect = Math.random() < 0.62;
    const delayMs = 6000 + Math.floor(Math.random() * 16000);
    botTimerRef.current = setTimeout(() => {
      setPlayers(prev => prev.map(p => {
        if (p.user_id !== BOT_ID) return p;
        if (willBeCorrect) {
          const streak = p.streak + 1;
          const pts = 100 + Math.min(50, (streak - 1) * 10);
          return { ...p, score: p.score + pts, correct_count: p.correct_count + 1, streak };
        }
        return { ...p, score: p.score - 20, wrong_count: p.wrong_count + 1, streak: 0 };
      }));
    }, delayMs);
    return clearBotTimer;
  }, [phase, currentIndex, currentQuestion?.id]);

  // ── Matchmaking entry ──
  const findMatch = async () => {
    if (!user) return;
    modeRef.current = 'real';
    setMode('real');
    setPhase('matching');
    try {
      const { data, error } = await supabase.rpc('start_battle', {
        p_subject: null, p_chapter: null, p_topic_id: null, p_difficulty: null,
      } as any);
      if (error) throw error;
      const result = data as { battle_id: string; status: string; question_ids: string[]; error?: string } | null;
      if (!result || result.error) {
        // fall back to bot quietly
        await startBotBattle();
        return;
      }
      setBattleId(result.battle_id);
      await loadQuestions(result.question_ids || []);
      await loadPlayers(result.battle_id);

      const channel = supabase
        .channel(`battle-${result.battle_id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'battle_players', filter: `battle_id=eq.${result.battle_id}` }, () => {
          loadPlayers(result.battle_id);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battle_sessions', filter: `id=eq.${result.battle_id}` }, (payload: any) => {
          if (payload.new?.status === 'active' && modeRef.current === 'real') setPhase('playing');
          if (payload.new?.status === 'completed' && modeRef.current === 'real') {
            setWinnerId(payload.new?.winner_user_id || null);
            setPhase('finished');
          }
        })
        .subscribe();
      channelRef.current = channel;

      if (result.status === 'active') {
        setPhase('playing');
        return;
      }

      // Waiting → set fallback timer to bot mode
      matchTimeoutRef.current = setTimeout(() => {
        if (modeRef.current === 'real') {
          startBotBattle();
        }
      }, MATCH_TIMEOUT_MS);
    } catch (e: any) {
      logger.error('Battle match error:', e);
      // Silent fallback to bot
      await startBotBattle();
    }
  };

  // Question timer
  useEffect(() => {
    if (phase !== 'playing' || !currentQuestion) return;
    setTimeLeft(QUESTION_TIME_SECONDS);
    setLastResult(null);
    advancingRef.current = false;
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) { handleTimeout(); return 0; }
        return t - 1;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, currentIndex, currentQuestion?.id]);

  const goToNext = () => {
    if (advancingRef.current) return;
    advancingRef.current = true;
    if (tickRef.current) clearInterval(tickRef.current);
    clearBotTimer();
    setTimeout(() => {
      if (currentIndex + 1 >= questions.length) finishBattle();
      else setCurrentIndex(i => i + 1);
    }, 900);
  };

  // ── Wait for opponent — advance only when BOTH players have responded
  // (or the round timer hits zero, handled in handleTimeout).
  useEffect(() => {
    if (phase !== 'playing' || !currentQuestion) return;
    if (!lastResult) return; // I haven't answered yet
    if (advancingRef.current) return;
    const opp = players.find(p => p.user_id !== user?.id);
    if (!opp) return;
    const oppAnswered = (opp.correct_count + opp.wrong_count) >= (currentIndex + 1);
    if (oppAnswered) goToNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, lastResult, currentIndex, phase]);

  // ── Bot-mode local scoring ──
  const scoreLocalAnswer = (letter: string | null) => {
    if (!currentQuestion) return { isCorrect: false, points: -20 };
    const correctLetter = (currentQuestion.correct_option || currentQuestion.correct_options?.[0] || '').toUpperCase();
    const isCorrect = !!letter && letter.toUpperCase() === correctLetter;
    setPlayers(prev => prev.map(p => {
      if (p.user_id !== user?.id) return p;
      if (isCorrect) {
        const streak = p.streak + 1;
        const pts = 100 + Math.min(50, (streak - 1) * 10);
        return { ...p, score: p.score + pts, correct_count: p.correct_count + 1, streak };
      }
      return { ...p, score: p.score - 20, wrong_count: p.wrong_count + 1, streak: 0 };
    }));
    const streakNow = (me?.streak ?? 0) + (isCorrect ? 1 : 0);
    const pts = isCorrect ? 100 + Math.min(50, Math.max(0, streakNow - 1) * 10) : -20;
    return { isCorrect, points: pts };
  };

  const handleTimeout = async () => {
    // Use refs to read the LATEST values — `lastResult`/`submitting`/`currentIndex`
    // captured by the tick interval are stale on every re-render.
    if (!currentQuestion || submittingRef.current || advancingRef.current) return;
    if (tickRef.current) clearInterval(tickRef.current);

    if (modeRef.current === 'bot') {
      if (!lastResultRef.current) {
        const res = scoreLocalAnswer(null);
        setLastResult(res);
        lastResultRef.current = res;
      }
      clearBotTimer();
      setPlayers(prev => prev.map(p => {
        if (p.user_id !== BOT_ID) return p;
        const botAnswered = (p.correct_count + p.wrong_count) >= (currentIndexRef.current + 1);
        if (botAnswered) return p;
        return { ...p, score: p.score - 20, wrong_count: p.wrong_count + 1, streak: 0 };
      }));
      goToNext();
    } else if (battleId) {
      try {
        if (!lastResultRef.current) {
          // Server-side RPC now guards against double-submission, so calling
          // this repeatedly is safe — it returns the previous result.
          const { data } = await supabase.rpc('submit_battle_answer', {
            p_battle_id: battleId, p_question_id: currentQuestion.id,
            p_selected_options: null, p_numerical_answer: null,
          } as any);
          const result = data as { is_correct: boolean; points: number } | null;
          const res = { isCorrect: !!result?.is_correct, points: result?.points ?? -20 };
          setLastResult(res);
          lastResultRef.current = res;
        }
        await loadPlayers(battleId);
      } catch (e) { logger.error('battle timeout submit error:', e); }
      goToNext();
    }
  };


  const handleAnswer = async (letter: string) => {
    if (!currentQuestion || submitting || lastResult) return;
    setSubmitting(true);
    // Keep the round timer running — we still need it to fire handleTimeout
    // if the opponent never responds.

    try {
      if (modeRef.current === 'bot') {
        const res = scoreLocalAnswer(letter);
        setLastResult(res);
        // do not auto-advance — wait for bot via effect
      } else if (battleId) {
        const { data, error } = await supabase.rpc('submit_battle_answer', {
          p_battle_id: battleId, p_question_id: currentQuestion.id,
          p_selected_options: [letter], p_numerical_answer: null,
        } as any);
        if (error) throw error;
        const result = data as { is_correct: boolean; points: number } | null;
        setLastResult({ isCorrect: !!result?.is_correct, points: result?.points ?? 0 });
        await loadPlayers(battleId);
        // do not auto-advance — wait for opponent via effect
      }
    } catch (e: any) {
      logger.error('battle answer error:', e);
      toast.error('Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const finishBattle = async () => {
    clearBotTimer();
    if (modeRef.current === 'bot') {
      // local winner
      const sorted = [...players].sort((a, b) => b.score - a.score);
      setWinnerId(sorted[0]?.score === sorted[1]?.score ? null : sorted[0]?.user_id || null);
      setPhase('finished');
      return;
    }
    if (!battleId) { setPhase('finished'); return; }
    try {
      const { data } = await supabase.rpc('finish_battle', { p_battle_id: battleId } as any);
      const result = data as { winner_user_id: string | null } | null;
      setWinnerId(result?.winner_user_id || null);
      await loadPlayers(battleId);
    } catch (e) { logger.error('finish battle error:', e); }
    setPhase('finished');
  };

  const resetBattle = () => {
    cleanupRealtime();
    clearBotTimer();
    modeRef.current = 'real';
    setMode('real');
    setBattleId(null);
    setQuestions([]);
    setPlayers([]);
    setCurrentIndex(0);
    setLastResult(null);
    setWinnerId(null);
    setPhase('idle');
  };

  useEffect(() => () => { cleanupRealtime(); clearBotTimer(); if (tickRef.current) clearInterval(tickRef.current); }, [cleanupRealtime]);

  if (!user) return <LoadingScreen pageName="Battle" />;

  // ════════════════════════════════════════════════════════════════
  // WAR THEME — bg layers reused
  // ════════════════════════════════════════════════════════════════
  const WarBackdrop = () => (
    <>
      {/* base */}
      <div className="fixed inset-0 -z-30 bg-[#0a0202]" />
      {/* radial blood glow */}
      <div className="fixed inset-0 -z-20 bg-[radial-gradient(ellipse_at_center,rgba(180,20,20,0.35),transparent_60%)]" />
      {/* smoke / texture */}
      <div className="fixed inset-0 -z-20 opacity-40 mix-blend-screen"
           style={{ backgroundImage: 'radial-gradient(circle at 20% 30%, rgba(255,80,40,0.18), transparent 40%), radial-gradient(circle at 80% 70%, rgba(120,0,0,0.45), transparent 50%), radial-gradient(circle at 50% 100%, rgba(255,140,0,0.18), transparent 55%)' }} />
      {/* ember particles */}
      <div className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
        {Array.from({ length: 24 }).map((_, i) => (
          <span
            key={i}
            className="absolute block rounded-full"
            style={{
              left: `${(i * 37) % 100}%`,
              bottom: `-${10 + (i % 5) * 15}px`,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              background: i % 2 ? 'rgba(255,140,40,0.9)' : 'rgba(255,80,30,0.8)',
              boxShadow: '0 0 8px rgba(255,120,40,0.9)',
              animation: `ember ${6 + (i % 7)}s linear ${i * 0.4}s infinite`,
            }}
          />
        ))}
      </div>
      <style>{`
        @keyframes ember {
          0% { transform: translateY(0) translateX(0); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(-110vh) translateX(${Math.random() > 0.5 ? '40px' : '-40px'}); opacity: 0; }
        }
        @keyframes warPulse {
          0%, 100% { box-shadow: 0 0 40px rgba(255,40,20,0.7), 0 0 80px rgba(255,80,0,0.4), inset 0 0 30px rgba(0,0,0,0.5); }
          50% { box-shadow: 0 0 70px rgba(255,80,30,0.95), 0 0 140px rgba(255,120,0,0.55), inset 0 0 30px rgba(0,0,0,0.5); }
        }
        @keyframes shake {
          0%,100% { transform: translate(0,0) rotate(0); }
          20% { transform: translate(-1px,1px) rotate(-0.5deg); }
          40% { transform: translate(1px,-1px) rotate(0.5deg); }
          60% { transform: translate(-1px,0) rotate(0); }
          80% { transform: translate(1px,1px) rotate(0.3deg); }
        }
        @keyframes bannerGleam {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>
    </>
  );

  // ── IDLE / Royal entrance ──
  if (phase === 'idle') {
    return (
      <div className="min-h-screen relative text-white overflow-hidden">
        <WarBackdrop />
        <div className="container mx-auto px-4 py-5 max-w-3xl relative">
          <Button variant="ghost" onClick={() => navigate('/dashboard')} className="text-orange-200/70 hover:text-white hover:bg-red-950/40 mb-3">
            <ArrowLeft className="w-4 h-4 mr-2" /> Retreat
          </Button>

          {/* Crest */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center gap-3 mb-3">
              <div className="h-px w-16 bg-gradient-to-r from-transparent via-amber-500 to-amber-400" />
              <Skull className="w-5 h-5 text-amber-400" />
              <div className="h-px w-16 bg-gradient-to-l from-transparent via-amber-500 to-amber-400" />
            </div>
            <h1
              className="text-5xl sm:text-7xl font-black tracking-[0.15em] leading-none"
              style={{
                fontFamily: 'Saira, system-ui, sans-serif',
                background: 'linear-gradient(180deg, #fde68a 0%, #f59e0b 40%, #b45309 70%, #7c2d12 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                textShadow: '0 4px 30px rgba(255,80,0,0.45)',
              }}
            >
              YUDDH
            </h1>
            <p className="mt-2 text-amber-200/80 tracking-[0.4em] text-xs font-semibold">⚔ BATTLE ARENA ⚔</p>
            <Badge className="mt-3 bg-gradient-to-r from-amber-500 via-orange-500 to-red-600 text-black font-black tracking-wider border border-amber-300/50">
              <Crown className="w-3 h-3 mr-1" /> PRO+ WARRIORS ONLY
            </Badge>
          </div>

          {/* Banner */}
          <div className="relative rounded-2xl p-[2px] mb-6"
               style={{
                 background: 'linear-gradient(135deg, #f59e0b, #7c2d12, #f59e0b, #7c2d12)',
                 backgroundSize: '300% 300%',
                 animation: 'bannerGleam 6s linear infinite',
               }}>
            <div className="rounded-2xl bg-gradient-to-br from-[#1a0606]/95 via-[#2a0808]/95 to-[#0a0202]/95 p-5 backdrop-blur">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="rounded-xl bg-black/50 border border-amber-700/40 p-3">
                  <Timer className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                  <p className="text-[10px] uppercase tracking-widest text-amber-200/70">Per Strike</p>
                  <p className="font-black text-lg">30s</p>
                </div>
                <div className="rounded-xl bg-black/50 border border-red-700/40 p-3">
                  <Swords className="w-5 h-5 mx-auto mb-1 text-red-400" />
                  <p className="text-[10px] uppercase tracking-widest text-red-200/70">Rounds</p>
                  <p className="font-black text-lg">5</p>
                </div>
                <div className="rounded-xl bg-black/50 border border-amber-700/40 p-3">
                  <Crown className="w-5 h-5 mx-auto mb-1 text-amber-300" />
                  <p className="text-[10px] uppercase tracking-widest text-amber-200/70">Conqueror</p>
                  <p className="font-black text-lg">+250</p>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-gradient-to-b from-black/60 to-red-950/30 border border-amber-800/30 p-4 text-sm space-y-1.5 font-mono">
                <p className="flex items-center gap-2"><Zap className="w-3.5 h-3.5 text-amber-400" /> <span className="text-amber-200/60">Strike true:</span> +100 (+10/streak)</p>
                <p className="flex items-center gap-2"><Skull className="w-3.5 h-3.5 text-red-400" /> <span className="text-amber-200/60">Falter / Frozen:</span> −20</p>
                <p className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-amber-400" /> <span className="text-amber-200/60">Survivor:</span> +75 • <span className="text-amber-200/60">Victor:</span> +250</p>
              </div>
            </div>
          </div>

          {/* ROYAL ENTER BATTLE BUTTON */}
          <div className="relative">
            <button
              onClick={findMatch}
              className="group relative w-full overflow-hidden rounded-2xl py-6 px-8"
              style={{
                background: 'linear-gradient(180deg, #2a0606 0%, #6b0e0e 50%, #2a0606 100%)',
                border: '2px solid transparent',
                backgroundClip: 'padding-box',
                animation: 'warPulse 2.4s ease-in-out infinite',
              }}
            >
              {/* gold border */}
              <span className="absolute inset-0 rounded-2xl pointer-events-none"
                    style={{ padding: 2, background: 'linear-gradient(135deg, #fde68a, #b45309, #fde68a, #7c2d12)', WebkitMask: 'linear-gradient(#000,#000) content-box, linear-gradient(#000,#000)', WebkitMaskComposite: 'xor', maskComposite: 'exclude' }} />
              {/* sheen */}
              <span className="absolute inset-y-0 -left-1/2 w-1/3 skew-x-12 bg-gradient-to-r from-transparent via-amber-100/30 to-transparent group-hover:translate-x-[400%] transition-transform duration-700" />

              <div className="relative flex items-center justify-center gap-4">
                <Swords className="w-7 h-7 text-amber-300 group-hover:rotate-12 transition-transform" />
                <span
                  className="text-2xl sm:text-3xl font-black tracking-[0.3em]"
                  style={{
                    fontFamily: 'Saira, system-ui, sans-serif',
                    background: 'linear-gradient(180deg, #fde68a, #f59e0b, #92400e)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}
                >
                  ENTER BATTLE
                </span>
                <Swords className="w-7 h-7 text-amber-300 -scale-x-100 group-hover:-rotate-12 transition-transform" />
              </div>
              <p className="relative mt-1 text-center text-[10px] tracking-[0.45em] text-amber-200/60 font-bold">RAISE THY SWORD</p>
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-amber-200/40 tracking-widest">— ONLY ONE SHALL RISE —</p>
        </div>
      </div>
    );
  }

  // ── MATCHING ──
  if (phase === 'matching') {
    return (
      <div className="min-h-screen relative text-white flex items-center justify-center">
        <WarBackdrop />
        <div className="text-center relative px-6">
          <div className="relative mx-auto w-28 h-28 mb-6">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-red-700 via-orange-600 to-amber-500 animate-ping opacity-40" />
            <div className="absolute inset-2 rounded-full bg-gradient-to-br from-[#3a0606] to-black border-2 border-amber-500/60 flex items-center justify-center"
                 style={{ animation: 'shake 0.6s infinite' }}>
              <Swords className="w-12 h-12 text-amber-300" />
            </div>
          </div>
          <h2
            className="text-3xl font-black tracking-[0.2em] mb-2"
            style={{
              fontFamily: 'Saira, system-ui, sans-serif',
              background: 'linear-gradient(180deg, #fde68a, #f59e0b, #92400e)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            }}
          >
            SUMMONING FOE
          </h2>
          <p className="text-amber-200/60 text-sm tracking-widest mb-6">Scouring the battlefield for a worthy rival…</p>
          <div className="flex items-center justify-center gap-2 text-amber-200/80">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm tracking-wider">{players.length}/2 warriors in arena</span>
          </div>
          <Button variant="ghost" onClick={resetBattle} className="mt-8 text-amber-200/60 hover:text-white hover:bg-red-950/40 tracking-widest">
            Retreat
          </Button>
        </div>
      </div>
    );
  }

  // ── FINISHED ──
  if (phase === 'finished') {
    const sorted = [...players].sort((a, b) => b.score - a.score);
    const iWon = winnerId && winnerId === user?.id;
    return (
      <div className="min-h-screen relative text-white">
        <WarBackdrop />
        <div className="container mx-auto px-4 py-8 max-w-2xl relative">
          <div className="rounded-2xl p-[2px]"
               style={{ background: 'linear-gradient(135deg, #fde68a, #7c2d12, #fde68a)' }}>
            <div className="rounded-2xl bg-gradient-to-br from-[#1a0606] via-[#2a0808] to-black p-6">
              <div className="text-center">
                <div className={`mx-auto w-24 h-24 rounded-full flex items-center justify-center mb-3 border-2 ${iWon ? 'border-amber-300 bg-gradient-to-br from-amber-400 to-orange-600' : 'border-red-700 bg-gradient-to-br from-red-900 to-black'}`}>
                  {iWon ? <Crown className="w-12 h-12 text-black" /> : <Skull className="w-12 h-12 text-red-300" />}
                </div>
                <h2
                  className="text-4xl font-black tracking-[0.2em]"
                  style={{
                    fontFamily: 'Saira, system-ui, sans-serif',
                    background: iWon
                      ? 'linear-gradient(180deg, #fde68a, #f59e0b, #92400e)'
                      : 'linear-gradient(180deg, #fca5a5, #b91c1c, #450a0a)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}
                >
                  {iWon ? 'VICTORY' : winnerId ? 'DEFEAT' : 'STALEMATE'}
                </h2>
                <p className="text-amber-200/70 text-sm tracking-widest mt-2">
                  {iWon ? '+250 Glory awarded' : 'The arena remembers your courage'}
                </p>
              </div>

              <div className="space-y-2 mt-6">
                {sorted.map((p, idx) => (
                  <div
                    key={p.user_id}
                    className={`flex items-center justify-between p-4 rounded-xl border ${
                      idx === 0
                        ? 'bg-gradient-to-r from-amber-600/20 via-orange-600/15 to-transparent border-amber-500/50'
                        : 'bg-black/40 border-red-900/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-black border ${idx === 0 ? 'bg-amber-500 text-black border-amber-200' : 'bg-red-950 text-amber-200 border-red-800'}`}>
                        {idx === 0 ? <Crown className="w-5 h-5" /> : idx + 1}
                      </div>
                      <div>
                        <p className="font-bold tracking-wider">{p.user_id === user?.id ? 'YOU' : (p.display_name || 'Opponent').toUpperCase()}</p>
                        <p className="text-xs text-amber-200/50 font-mono">{p.correct_count} hits • {p.wrong_count} misses</p>
                      </div>
                    </div>
                    <p className="text-3xl font-black tabular-nums" style={{ fontFamily: 'Saira, system-ui, sans-serif' }}>{p.score}</p>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 pt-5">
                <Button onClick={resetBattle} className="flex-1 h-12 bg-gradient-to-r from-red-700 via-orange-600 to-amber-500 hover:from-red-800 hover:to-amber-600 text-black font-black tracking-widest border border-amber-300">
                  <Swords className="w-4 h-4 mr-2" /> REMATCH
                </Button>
                <Button variant="outline" onClick={() => navigate('/dashboard')} className="flex-1 h-12 bg-black/40 border-amber-700/50 text-amber-200 hover:bg-red-950/40 hover:text-white tracking-widest">
                  Retreat
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── PLAYING ──
  if (!currentQuestion) return <LoadingScreen pageName="Battle" />;
  const questionText = currentQuestion.question_text || currentQuestion.question || '';
  const timePct = (timeLeft / QUESTION_TIME_SECONDS) * 100;
  const meScore = me?.score ?? 0;
  const opp = opponents[0];

  return (
    <div className="min-h-screen relative text-white">
      <WarBackdrop />
      <div className="container mx-auto px-3 py-3 max-w-3xl relative">
        {/* Scoreboard — Warrior vs Warrior */}
        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-stretch mb-3">
          <div className="rounded-xl p-3 bg-gradient-to-br from-amber-900/40 to-black/60 border border-amber-600/40 backdrop-blur">
            <p className="text-[9px] uppercase tracking-[0.3em] text-amber-300/70 font-bold">⚔ YOU</p>
            <div className="flex items-baseline justify-between mt-1">
              <p className="text-3xl font-black tabular-nums" style={{ fontFamily: 'Saira, system-ui, sans-serif' }}>{meScore}</p>
              {me && me.streak > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-orange-500/90 text-black flex items-center gap-0.5">
                  <Flame className="w-3 h-3" /> {me.streak}×
                </span>
              )}
            </div>
            <p className="text-[10px] text-amber-200/50 font-mono mt-0.5">{me?.correct_count ?? 0} hits</p>
          </div>

          <div className="flex items-center justify-center px-2">
            <span
              className="text-2xl font-black tracking-widest"
              style={{
                fontFamily: 'Saira, system-ui, sans-serif',
                background: 'linear-gradient(180deg, #fde68a, #f59e0b)',
                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              }}
            >VS</span>
          </div>

          {opp && (
            <div className="rounded-xl p-3 bg-gradient-to-br from-red-900/40 to-black/60 border border-red-600/40 backdrop-blur text-right">
              <p className="text-[9px] uppercase tracking-[0.3em] text-red-300/80 font-bold truncate">FOE • {opp.display_name || 'RIVAL'}</p>
              <div className="flex items-baseline justify-between mt-1 flex-row-reverse">
                <p className="text-3xl font-black tabular-nums" style={{ fontFamily: 'Saira, system-ui, sans-serif' }}>{opp.score}</p>
                {opp.streak > 0 && (
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-red-500/90 text-black flex items-center gap-0.5">
                    <Flame className="w-3 h-3" /> {opp.streak}×
                  </span>
                )}
              </div>
              <p className="text-[10px] text-red-200/50 font-mono mt-0.5">{opp.correct_count} hits</p>
            </div>
          )}
        </div>

        {/* Timer */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[10px] text-amber-200/60 tracking-[0.3em] font-bold">ROUND {currentIndex + 1} / {questions.length}</p>
            <p className={`text-xs font-black tracking-wider ${timeLeft <= 10 ? 'text-red-400 animate-pulse' : 'text-amber-200'}`}>
              <Timer className="w-3 h-3 inline mr-1" />{timeLeft}s
            </p>
          </div>
          <div className="h-2 rounded-full bg-black/60 border border-amber-900/40 overflow-hidden">
            <div
              className="h-full transition-all"
              style={{
                width: `${timePct}%`,
                background: timeLeft <= 10
                  ? 'linear-gradient(90deg, #ef4444, #b91c1c)'
                  : 'linear-gradient(90deg, #fde68a, #f59e0b, #b91c1c)',
                boxShadow: '0 0 10px rgba(255,120,40,0.6)',
              }}
            />
          </div>
        </div>

        {/* Question scroll */}
        <div className="rounded-2xl p-[2px]"
             style={{ background: 'linear-gradient(135deg, #fde68a, #7c2d12, #fde68a)' }}>
          <div className="rounded-2xl bg-gradient-to-b from-[#f8ecd0] to-[#e8d5a8] text-stone-900 p-4 shadow-2xl">
            <div className="text-base font-medium mb-4 leading-relaxed">
              <MathDisplay text={questionText} />
            </div>
            <div className="space-y-2">
              {OPTIONS.map(letter => {
                const text = String((currentQuestion as any)[`option_${letter.toLowerCase()}`] || '').trimStart();
                if (!text) return null;
                const disabled = !!lastResult || submitting;
                return (
                  <button
                    key={letter}
                    onClick={() => handleAnswer(letter)}
                    disabled={disabled}
                    className={`w-full p-3 text-left rounded-xl border-2 transition-all flex items-center gap-3 ${
                      disabled
                        ? 'opacity-60 cursor-not-allowed border-stone-400 bg-stone-100'
                        : 'border-stone-500/60 bg-white hover:border-red-700 hover:bg-amber-100 hover:shadow-[0_0_20px_rgba(180,40,20,0.25)] cursor-pointer'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full border-2 border-red-800/60 bg-gradient-to-br from-amber-200 to-amber-400 flex items-center justify-center text-sm font-black shrink-0 text-red-900" style={{ fontFamily: 'Saira, system-ui, sans-serif' }}>{letter}</div>
                    <div className="text-sm flex-1"><MathDisplay text={text} /></div>
                  </button>
                );
              })}
            </div>
            {lastResult && (
              <>
                <div className={`mt-3 p-3 rounded-lg text-center font-black tracking-widest border-2 ${
                  lastResult.isCorrect
                    ? 'bg-gradient-to-r from-amber-200 to-amber-400 text-red-900 border-amber-600'
                    : 'bg-gradient-to-r from-red-200 to-red-400 text-red-900 border-red-700'
                }`}>
                  {lastResult.isCorrect ? `⚔ STRIKE TRUE  +${lastResult.points}` : `☠ FALTERED  ${lastResult.points}`}
                </div>
                {opp && (opp.correct_count + opp.wrong_count) < (currentIndex + 1) && (
                  <div className="mt-2 p-2.5 rounded-lg bg-black/70 border border-amber-700/40 text-center text-amber-200/90 text-xs tracking-[0.3em] font-bold flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    AWAITING FOE'S STRIKE…
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BattlePage;
