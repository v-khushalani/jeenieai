import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import SEOHead from '@/components/SEOHead';
import LoadingScreen from '@/components/ui/LoadingScreen';
import { Button } from '@/components/ui/button';
import {
  Share2, X, ChevronLeft, ChevronRight, Sparkles, Flame, Target,
  TrendingUp, Award, BookOpen, Clock, Trophy, Moon,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import { supabase } from '@/integrations/supabase/client';
import ReferralService from '@/services/referralService';
import ShareCardDialog from '@/components/ShareCardDialog';
import type { WrappedSlideOpts } from '@/lib/shareCard';
import { logger } from '@/utils/logger';

type Period = 'month' | 'year';

interface WrappedData {
  totalQuestions: number;
  totalCorrect: number;
  accuracy: number;
  hoursStudied: number;
  daysActive: number;
  longestStreak: number;
  strongestTopic: string;
  weakestTopic: string;
  weakestAccuracy: number;
  totalTests: number;
  pointsEarned: number;
  rank: number | null;
  totalUsers: number;
  nightSessions: number;
  morningSessions: number;
  fullName: string;
}

interface Slide {
  key: string;
  bg: string;              // background gradient
  accent: string;          // accent hex
  icon: React.ElementType;
  kicker: string;
  bigStat: string;
  heading: string;
  caption: string;
  shareOpts: WrappedSlideOpts | null;
}

const SLIDE_DURATION = 5500;

const WrappedPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const shareCardEnabled = useFeatureFlag('share_card');
  const [period, setPeriod] = useState<Period>('month');
  const [data, setData] = useState<WrappedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareSlide, setShareSlide] = useState<WrappedSlideOpts | null>(null);
  const startedAt = useRef<number>(Date.now());

  // ---- Load data ----
  useEffect(() => {
    const load = async () => {
      if (!user?.id) return;
      setLoading(true);
      try {
        const since = new Date();
        if (period === 'month') since.setDate(since.getDate() - 30);
        else since.setDate(since.getDate() - 365);
        const sinceIso = since.toISOString();

        const [attemptsRes, profileRes, testsRes, pointsRes, lbRes] = await Promise.all([
          supabase.from('question_attempts')
            .select('is_correct, time_spent, question_id, created_at')
            .eq('user_id', user.id).gte('created_at', sinceIso).limit(10000),
          supabase.from('profiles').select('longest_streak, total_points, full_name').eq('id', user.id).maybeSingle(),
          supabase.from('test_sessions').select('id').eq('user_id', user.id).gte('created_at', sinceIso),
          supabase.from('points_log').select('points').eq('user_id', user.id).gte('created_at', sinceIso).limit(5000),
          supabase.rpc('get_leaderboard_with_stats', { limit_count: 1000 }).then(r => r.data, () => null),
        ]);

        const attempts = attemptsRes.data || [];
        const totalQ = attempts.length;
        const correct = attempts.filter(a => a.is_correct).length;
        const accuracy = totalQ > 0 ? Math.round((correct / totalQ) * 100) : 0;
        const seconds = attempts.reduce((s, a) => s + (a.time_spent || 0), 0);
        const hours = Math.round((seconds / 3600) * 10) / 10;
        const days = new Set(attempts.map(a => (a.created_at || '').slice(0, 10))).size;

        let night = 0, morning = 0;
        attempts.forEach(a => {
          const h = new Date(a.created_at!).getHours();
          if (h >= 23 || h < 4) night++;
          else if (h < 8) morning++;
        });

        // Topic mastery — best effort, may fail silently
        const qIds = [...new Set(attempts.map(a => a.question_id))].slice(0, 1500);
        const qMeta: Record<string, { topic: string | null }> = {};
        try {
          for (let i = 0; i < qIds.length; i += 500) {
            const chunk = qIds.slice(i, i + 500);
            const { data: qData } = await supabase
              .from('questions_public' as any).select('id, topic').in('id', chunk);
            (qData || []).forEach((q: any) => { qMeta[q.id] = { topic: q.topic }; });
          }
        } catch { /* noop */ }
        const topicMap: Record<string, { c: number; t: number }> = {};
        attempts.forEach(a => {
          const t = qMeta[a.question_id]?.topic;
          if (!t) return;
          if (!topicMap[t]) topicMap[t] = { c: 0, t: 0 };
          topicMap[t].t++;
          if (a.is_correct) topicMap[t].c++;
        });
        let strongest = 'Keep exploring', weakest = 'Keep exploring';
        let weakAcc = 100, strongAcc = 0;
        Object.entries(topicMap).forEach(([t, s]) => {
          if (s.t >= 5) {
            const a = (s.c / s.t) * 100;
            if (a < weakAcc) { weakAcc = a; weakest = t; }
            if (a > strongAcc) { strongAcc = a; strongest = t; }
          }
        });

        const pts = (pointsRes.data || []).reduce((s, r: any) => s + (r.points || 0), 0);
        const lb = Array.isArray(lbRes) ? lbRes : [];
        const idx = lb.findIndex((p: any) => p.id === user.id);

        setData({
          totalQuestions: totalQ, totalCorrect: correct, accuracy,
          hoursStudied: hours, daysActive: days,
          longestStreak: profileRes.data?.longest_streak || 0,
          strongestTopic: strongest, weakestTopic: weakest,
          weakestAccuracy: Math.round(weakAcc === 100 ? 0 : weakAcc),
          totalTests: (testsRes.data || []).length,
          pointsEarned: pts,
          rank: idx >= 0 ? idx + 1 : null,
          totalUsers: lb.length,
          nightSessions: night, morningSessions: morning,
          fullName: profileRes.data?.full_name || 'JEE Warrior',
        });
      } catch (e) {
        logger.error('Wrapped load error', e);
      } finally { setLoading(false); }
    };
    load();
  }, [user?.id, period]);

  // ---- Build slides ----
  const slides: Slide[] = useMemo(() => {
    if (!data || !user) return [];
    const refUrl = ReferralService.getReferralLink(user.id);
    const suffix = period === 'month' ? 'last 30 days' : 'this year';

    const personality =
      data.nightSessions > data.morningSessions * 2 ? { title: 'The Night Owl', emoji: '🦉', desc: `${data.nightSessions} late-night sessions. Chai + questions = your love language.` } :
      data.morningSessions > data.nightSessions * 2 ? { title: 'The Sunrise Sniper', emoji: '🌅', desc: `${data.morningSessions} pre-8AM sessions. Discipline > motivation.` } :
      data.longestStreak >= 30 ? { title: 'The Marathoner', emoji: '🏃‍♂️', desc: `${data.longestStreak}-day streak. Compounding is real.` } :
      data.accuracy >= 80 ? { title: 'The Sniper', emoji: '🎯', desc: `${data.accuracy}% accuracy. Precision > volume.` } :
      { title: 'The Volume Hero', emoji: '📚', desc: `${data.totalQuestions} questions solved. Reps build empires.` };

    const wrap = (opts: Omit<WrappedSlideOpts, 'type' | 'referralUrl'>): WrappedSlideOpts => ({
      type: 'wrapped', referralUrl: refUrl, ...opts,
    });

    return [
      {
        key: 'cover',
        bg: 'from-[#0f0524] via-[#1e0b3a] to-[#3d1163]',
        accent: '#ec4899',
        icon: Sparkles,
        kicker: 'JEENIE WRAPPED',
        bigStat: data.fullName.split(' ')[0] || 'You',
        heading: `Your ${suffix}, wrapped.`,
        caption: 'Tap anywhere to begin →',
        shareOpts: null,
      },
      {
        key: 'questions',
        bg: 'from-[#01102b] via-[#012060] to-[#0757c0]',
        accent: '#60a5fa',
        icon: BookOpen,
        kicker: 'QUESTIONS SOLVED',
        bigStat: `${data.totalQuestions}`,
        heading: `${data.totalQuestions.toLocaleString()} questions in ${data.daysActive} active days`,
        caption: `That's ~${Math.round(data.totalQuestions / Math.max(data.daysActive, 1))}/day. Silent grinding.`,
        shareOpts: wrap({ heading: `Solved ${data.totalQuestions} questions on JEEnie`, bigStat: `${data.totalQuestions}`, subStat: `across ${data.daysActive} days — ${suffix}`, emoji: '📚' }),
      },
      {
        key: 'streak',
        bg: 'from-[#3d0a0a] via-[#7a1414] to-[#f97316]',
        accent: '#fb923c',
        icon: Flame,
        kicker: 'LONGEST STREAK',
        bigStat: `${data.longestStreak}`,
        heading: `${data.longestStreak} din lagataar 🔥`,
        caption: data.longestStreak >= 30 ? 'Certified maniac. Rank walla mindset.' : 'Consistency compounds. Keep going.',
        shareOpts: wrap({ heading: 'My longest streak on JEEnie', bigStat: `${data.longestStreak}🔥`, subStat: 'consecutive days of practice', emoji: '🔥' }),
      },
      {
        key: 'accuracy',
        bg: 'from-[#052e16] via-[#065f46] to-[#10b981]',
        accent: '#34d399',
        icon: Target,
        kicker: 'ACCURACY',
        bigStat: `${data.accuracy}%`,
        heading: `${data.totalCorrect} of ${data.totalQuestions} correct`,
        caption: data.accuracy >= 75 ? 'Sniper mode unlocked. 🎯' : 'Volume today, precision tomorrow.',
        shareOpts: wrap({ heading: 'My JEEnie accuracy', bigStat: `${data.accuracy}%`, subStat: `${data.totalCorrect}/${data.totalQuestions} correct`, emoji: '🎯' }),
      },
      {
        key: 'hours',
        bg: 'from-[#1e1b4b] via-[#312e81] to-[#6366f1]',
        accent: '#a5b4fc',
        icon: Clock,
        kicker: 'TIME INVESTED',
        bigStat: `${data.hoursStudied}h`,
        heading: `${data.hoursStudied} hours of pure focus`,
        caption: `~${Math.round((data.hoursStudied * 60) / Math.max(data.daysActive, 1))} min/day. Quietly building rank.`,
        shareOpts: wrap({ heading: 'Hours I studied on JEEnie', bigStat: `${data.hoursStudied}h`, subStat: `across ${suffix}`, emoji: '⏱️' }),
      },
      {
        key: 'strong',
        bg: 'from-[#422006] via-[#78350f] to-[#f59e0b]',
        accent: '#fbbf24',
        icon: Trophy,
        kicker: 'STRONGEST CHAPTER',
        bigStat: '★',
        heading: data.strongestTopic,
        caption: 'You own this. Use it as your anchor.',
        shareOpts: wrap({ heading: 'My strongest chapter', bigStat: '★', subStat: data.strongestTopic, emoji: '🏆' }),
      },
      {
        key: 'weak',
        bg: 'from-[#450a0a] via-[#7f1d1d] to-[#ef4444]',
        accent: '#fca5a5',
        icon: TrendingUp,
        kicker: 'WEAK SPOT',
        bigStat: `${data.weakestAccuracy}%`,
        heading: data.weakestTopic,
        caption: `Next mission: 80%+ on ${data.weakestTopic}. Chalo lag ja.`,
        shareOpts: null,
      },
      {
        key: 'rank',
        bg: 'from-[#0c0a09] via-[#1c1917] to-[#78716c]',
        accent: '#fde047',
        icon: Award,
        kicker: data.rank ? 'YOUR RANK' : 'POINTS EARNED',
        bigStat: data.rank ? `#${data.rank}` : `${data.pointsEarned}`,
        heading: data.rank ? `#${data.rank} of ${data.totalUsers.toLocaleString()} learners` : `${data.pointsEarned} points banked`,
        caption: `${data.pointsEarned.toLocaleString()} points in your wallet.`,
        shareOpts: wrap({ heading: data.rank ? 'My JEEnie rank' : 'Points I earned', bigStat: data.rank ? `#${data.rank}` : `${data.pointsEarned}`, subStat: data.rank ? `out of ${data.totalUsers} learners` : 'points banked', emoji: '⭐' }),
      },
      {
        key: 'personality',
        bg: 'from-[#2e1065] via-[#5b21b6] to-[#c026d3]',
        accent: '#f0abfc',
        icon: Moon,
        kicker: 'YOUR VIBE',
        bigStat: personality.emoji,
        heading: personality.title,
        caption: personality.desc,
        shareOpts: wrap({ heading: 'JEEnie says I am…', bigStat: personality.emoji, subStat: `${personality.title} — ${personality.desc}`, emoji: personality.emoji }),
      },
      {
        key: 'finale',
        bg: 'from-[#020617] via-[#0f172a] to-[#1e293b]',
        accent: '#f472b6',
        icon: Sparkles,
        kicker: 'THAT WAS YOU',
        bigStat: '🧞‍♂️',
        heading: 'Share your wrapped',
        caption: 'Post it. Tag your rivals. Kickstart the next chapter.',
        shareOpts: wrap({ heading: `${data.fullName.split(' ')[0]}'s JEEnie Wrapped`, bigStat: `${data.totalQuestions}`, subStat: `questions · ${data.hoursStudied}h · ${data.accuracy}% accuracy · ${data.longestStreak}-day streak`, emoji: '🧞‍♂️' }),
      },
    ];
  }, [data, user, period]);

  // ---- Auto-advance ----
  useEffect(() => {
    if (loading || slides.length === 0) return;
    startedAt.current = Date.now();
    setProgress(0);
    if (paused) return;

    const tick = setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      const pct = Math.min(100, (elapsed / SLIDE_DURATION) * 100);
      setProgress(pct);
      if (pct >= 100) {
        setIndex(i => (i + 1 < slides.length ? i + 1 : i));
      }
    }, 60);
    return () => clearInterval(tick);
  }, [index, paused, slides.length, loading]);

  const goNext = useCallback(() => {
    setIndex(i => Math.min(i + 1, slides.length - 1));
  }, [slides.length]);
  const goPrev = useCallback(() => setIndex(i => Math.max(0, i - 1)), []);
  const exit = useCallback(() => navigate('/dashboard'), [navigate]);

  // Keyboard nav
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'Escape') exit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev, exit]);

  // Tap zones
  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (x < rect.width * 0.33) goPrev();
    else if (x > rect.width * 0.66) goNext();
  };

  // Swipe (touch)
  const touchStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    setPaused(true);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    setPaused(false);
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    const dt = Date.now() - touchStart.current.t;
    touchStart.current = null;
    // Swipe down to exit
    if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { exit(); return; }
    // Swipe up on finale to share
    if (dy < -80 && Math.abs(dy) > Math.abs(dx) && slides[index]?.shareOpts) {
      setShareSlide(slides[index].shareOpts); setShareOpen(true); return;
    }
    // Fast tap → handled by onClick
    if (dt < 200 && Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
  };

  if (loading || !data) return <LoadingScreen pageName="JEEnie Wrapped" message="Cooking your story…" />;

  const slide = slides[index];
  const Icon = slide.icon;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white overflow-hidden">
      <SEOHead
        title="JEEnie Wrapped — Your Learning Story"
        description="Story-mode recap of your JEE prep on JEEnie. Solve. Share. Slay."
        canonical="https://www.jeenie.website/snapshot"
      />

      {/* Slide */}
      <AnimatePresence mode="wait">
        <motion.div
          key={slide.key}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
          onClick={onTap}
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
          onMouseLeave={() => setPaused(false)}
          className={`absolute inset-0 bg-gradient-to-br ${slide.bg} flex flex-col select-none cursor-pointer`}
          style={{ paddingTop: 'max(20px, env(safe-area-inset-top))', paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
        >
          {/* Ambient glow */}
          <div className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full blur-3xl opacity-30" style={{ background: slide.accent }} />
          <div className="pointer-events-none absolute -bottom-32 -right-32 w-[500px] h-[500px] rounded-full blur-3xl opacity-20" style={{ background: slide.accent }} />

          {/* Content */}
          <div className="relative flex-1 flex flex-col items-center justify-center px-6 text-center max-w-md mx-auto w-full">
            <motion.div
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.5 }}
              className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.35em]"
              style={{ color: slide.accent }}
            >
              <Icon className="w-3.5 h-3.5" /> {slide.kicker}
            </motion.div>

            <motion.div
              initial={{ y: 30, opacity: 0, scale: 0.85 }} animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.25, type: 'spring', stiffness: 200, damping: 18 }}
              className="mt-6 mb-4 font-black leading-none tracking-tight drop-shadow-2xl"
              style={{
                fontSize: 'clamp(4.5rem, 22vw, 9rem)',
                background: `linear-gradient(180deg, #ffffff 0%, ${slide.accent} 100%)`,
                WebkitBackgroundClip: 'text', backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {slide.bigStat}
            </motion.div>

            <motion.h2
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, duration: 0.4 }}
              className="text-xl sm:text-2xl font-bold leading-snug mb-3"
            >
              {slide.heading}
            </motion.h2>

            <motion.p
              initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.55, duration: 0.4 }}
              className="text-sm text-white/70 leading-relaxed max-w-xs"
            >
              {slide.caption}
            </motion.p>

            {/* Share CTA — always visible on slides that have shareOpts */}
            {shareCardEnabled && slide.shareOpts && (
              <motion.div
                initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.75, duration: 0.4 }}
                className="mt-8"
              >
                <Button
                  onClick={(e) => { e.stopPropagation(); setShareSlide(slide.shareOpts); setShareOpen(true); }}
                  className="rounded-full bg-white text-black hover:bg-white/90 font-bold h-12 px-6 shadow-2xl"
                >
                  <Share2 className="w-4 h-4 mr-2" /> Share this
                </Button>
              </motion.div>
            )}
          </div>

          {/* Bottom hint */}
          <div className="relative text-center text-[10px] text-white/40 uppercase tracking-[0.3em] px-4">
            {index === slides.length - 1 ? 'Swipe down to exit' : 'Tap right to continue · Hold to pause'}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Top chrome: progress bars + close */}
      <div className="absolute inset-x-0 top-0 z-10 pointer-events-none" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-1 px-3">
          {slides.map((_, i) => (
            <div key={i} className="flex-1 h-[3px] bg-white/25 rounded-full overflow-hidden">
              <div
                className="h-full bg-white transition-[width]"
                style={{
                  width: i < index ? '100%' : i === index ? `${progress}%` : '0%',
                  transitionDuration: i === index ? '60ms' : '0ms',
                }}
              />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between px-3 mt-2 pointer-events-auto">
          <div className="flex gap-1 rounded-full bg-white/10 backdrop-blur p-0.5 text-[10px]">
            <button
              onClick={() => setPeriod('month')}
              className={`px-2.5 py-1 rounded-full font-bold ${period === 'month' ? 'bg-white text-black' : 'text-white/80'}`}
            >30D</button>
            <button
              onClick={() => setPeriod('year')}
              className={`px-2.5 py-1 rounded-full font-bold ${period === 'year' ? 'bg-white text-black' : 'text-white/80'}`}
            >1Y</button>
          </div>
          <button
            onClick={exit}
            aria-label="Close"
            className="rounded-full bg-white/10 backdrop-blur p-2 hover:bg-white/20"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Desktop arrows */}
      <button
        onClick={goPrev}
        aria-label="Previous"
        className="hidden md:flex absolute left-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 backdrop-blur p-3 hover:bg-white/20 disabled:opacity-30"
        disabled={index === 0}
      ><ChevronLeft className="w-5 h-5" /></button>
      <button
        onClick={goNext}
        aria-label="Next"
        className="hidden md:flex absolute right-4 top-1/2 -translate-y-1/2 z-10 rounded-full bg-white/10 backdrop-blur p-3 hover:bg-white/20 disabled:opacity-30"
        disabled={index === slides.length - 1}
      ><ChevronRight className="w-5 h-5" /></button>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        opts={shareSlide}
        shareText="Mera JEEnie Wrapped dekh! 🧞‍♂️"
        filename={`jeenie-wrapped-${period}.png`}
      />
    </div>
  );
};

export default WrappedPage;
