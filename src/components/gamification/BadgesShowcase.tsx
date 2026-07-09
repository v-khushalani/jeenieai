// src/components/gamification/BadgesShowcase.tsx
// Trophy Cabinet — single source of truth is the `badges` DB table.
// No hardcoded badge list. All progress/rarity/thresholds come from DB.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Lock, Trophy, Share2, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import ReferralService from '@/services/referralService';
import ShareCardDialog from '@/components/ShareCardDialog';
import type { ShareCardOpts } from '@/lib/shareCard';
import { logger } from '@/utils/logger';

type Rarity = 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

const RARITY_RINGS: Record<Rarity, { ring: string; chip: string; glow: string }> = {
  Common:    { ring: 'from-slate-300 to-slate-500',           chip: 'bg-slate-200 text-slate-700',     glow: 'shadow-slate-400/40' },
  Rare:      { ring: 'from-sky-400 to-blue-600',              chip: 'bg-sky-100 text-sky-700',         glow: 'shadow-sky-400/50' },
  Epic:      { ring: 'from-fuchsia-400 to-purple-700',        chip: 'bg-fuchsia-100 text-fuchsia-700', glow: 'shadow-fuchsia-500/50' },
  Legendary: { ring: 'from-amber-300 to-orange-600',          chip: 'bg-amber-100 text-amber-800',     glow: 'shadow-amber-500/60' },
  Mythic:    { ring: 'from-rose-400 via-red-500 to-rose-700', chip: 'bg-rose-100 text-rose-700',       glow: 'shadow-rose-500/60' },
};

const RARITY_HEX: Record<Rarity, string> = {
  Common: '#94a3b8', Rare: '#3b82f6', Epic: '#a855f7', Legendary: '#f59e0b', Mythic: '#ef4444',
};

const CATEGORY_FLAVOR: Record<string, string> = {
  'Answer Streaks':  'Ek galat answer aur sab gaya 💀',
  'Day Streaks':     'Daily showup karne walon ka elite club',
  'Skill':           'Skill flex — yahan se respect milti hai',
  'Consistency':     'Same time, same energy — bina excuse',
  'Subject Mastery': 'Topic ka boss tu hi hai',
  'Engagement':      'JEEnie family ka active member',
  'Mythic':          'Sirf chosen ones — legend tier',
};

interface BadgeRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  category: string | null;
  rarity: string;
  requirement_type: string;
  requirement_value: number;
  sort_order: number;
}

interface UnifiedBadge {
  key: string;
  id: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  earned: boolean;
  earnedAt?: string;
  rarity: Rarity;
  progressPct: number;
  progressLabel: string;
  requirementType: string;
  requirementValue: number;
}

const normalizeRarity = (r: string): Rarity => {
  const key = (r || 'Common') as Rarity;
  return RARITY_RINGS[key] ? key : 'Common';
};

// ---------- Medallion tile ----------
const Medallion = ({ b, onClick }: { b: UnifiedBadge; onClick: () => void }) => {
  const skin = RARITY_RINGS[b.rarity];
  const size = 96;
  const r = 44;
  const c = 2 * Math.PI * r;
  const dashOffset = c - (c * (b.earned ? 100 : b.progressPct)) / 100;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ y: -4, scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 320, damping: 20 }}
      className="relative flex flex-col items-center gap-2 group focus:outline-none"
    >
      {b.earned && (
        <span className={`absolute -inset-2 rounded-full blur-xl opacity-60 bg-linear-to-br ${skin.ring} animate-pulse pointer-events-none`} />
      )}

      <div className="relative" style={{ width: size, height: size }}>
        {b.earned ? (
          <motion.div
            className={`absolute inset-0 rounded-full bg-linear-to-br ${skin.ring} shadow-lg ${skin.glow}`}
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 12, ease: 'linear' }}
            style={{ padding: 4 }}
          >
            <div className="w-full h-full rounded-full bg-white" />
          </motion.div>
        ) : (
          <svg className="absolute inset-0 -rotate-90" width={size} height={size}>
            <circle cx={size/2} cy={size/2} r={r} stroke="#e2e8f0" strokeWidth={6} fill="white" />
            <circle
              cx={size/2} cy={size/2} r={r}
              stroke={RARITY_HEX[b.rarity]}
              strokeWidth={6}
              fill="transparent"
              strokeDasharray={c}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          </svg>
        )}

        <div className={`absolute inset-2 rounded-full flex items-center justify-center text-4xl ${
          b.earned ? '' : 'grayscale opacity-60'
        }`}>
          <span>{b.icon}</span>
        </div>

        {!b.earned && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow border border-slate-200">
            <Lock className="w-3 h-3 text-slate-500" />
          </div>
        )}
      </div>

      <div className={`relative px-2 py-1 rounded-md text-[11px] font-extrabold text-center max-w-[110px] leading-tight ${
        b.earned ? `bg-linear-to-r ${skin.ring} text-white` : 'bg-slate-100 text-slate-600'
      }`}>
        {b.name}
      </div>

      <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${skin.chip}`}>
        {b.rarity}
      </span>
    </motion.button>
  );
};

const BadgesShowcase = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<UnifiedBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [active, setActive] = useState<UnifiedBadge | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState<ShareCardOpts | null>(null);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Fire the awarder first so any newly-eligible badges show up immediately.
      await supabase.rpc('check_and_award_badges', { _user_id: user.id });

      const [profileRes, badgesRes, userBadgesRes, attemptsRes, sharesRes, perfectRes, morningRes, nightRes, maxDailyRes] = await Promise.all([
        supabase.from('profiles').select('current_streak').eq('id', user.id).maybeSingle(),
        supabase.from('badges').select('*').eq('is_active', true).order('sort_order', { ascending: true }),
        supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', user.id),
        supabase.from('question_attempts').select('is_correct', { count: 'exact', head: false }).eq('user_id', user.id),
        supabase.from('points_log').select('id', { count: 'exact', head: true }).eq('user_id', user.id).in('action_type', ['badge_share', 'result_share', 'share']),
        supabase.from('test_sessions').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('score', 100),
        supabase.from('question_attempts').select('attempted_at').eq('user_id', user.id).lt('attempted_at', new Date().toISOString()),
        supabase.from('question_attempts').select('attempted_at').eq('user_id', user.id),
        supabase.from('question_attempts').select('attempted_at').eq('user_id', user.id),
      ]);

      const streak = profileRes.data?.current_streak || 0;
      const attempts = attemptsRes.data || [];
      const totalQ = attempts.length;
      const totalCorrect = attempts.filter(a => a.is_correct).length;

      // Best consecutive correct streak
      let bestStreak = 0, cur = 0;
      for (const a of attempts) {
        if (a.is_correct) { cur++; if (cur > bestStreak) bestStreak = cur; }
        else cur = 0;
      }

      // Morning/night distinct days, max daily
      const daysByBucket = { morning: new Set<string>(), night: new Set<string>(), all: new Map<string, number>() };
      for (const a of (maxDailyRes.data || [])) {
        const d = new Date(a.attempted_at);
        const day = d.toISOString().slice(0, 10);
        const hr = d.getUTCHours();
        if (hr < 8) daysByBucket.morning.add(day);
        if (hr >= 23) daysByBucket.night.add(day);
        daysByBucket.all.set(day, (daysByBucket.all.get(day) || 0) + 1);
      }
      const maxDaily = Math.max(0, ...Array.from(daysByBucket.all.values()));
      const morningDays = daysByBucket.morning.size;
      const nightDays = daysByBucket.night.size;
      const shares = sharesRes.count || 0;
      const perfectTests = perfectRes.count || 0;

      const earnedAtMap = new Map<string, string>();
      (userBadgesRes.data || []).forEach(ub => earnedAtMap.set(ub.badge_id, ub.earned_at || ''));

      const rows = (badgesRes.data || []) as BadgeRow[];
      const unified: UnifiedBadge[] = rows.map((b) => {
        const rarity = normalizeRarity(b.rarity);
        const target = b.requirement_value || 1;
        let current = 0;
        switch (b.requirement_type) {
          case 'day_streak':       current = streak; break;
          case 'answer_streak':    current = bestStreak; break;
          case 'total_questions':  current = totalQ; break;
          case 'total_correct':    current = totalCorrect; break;
          case 'daily_questions':  current = maxDaily; break;
          case 'perfect_test':     current = perfectTests; break;
          case 'morning_sessions': current = morningDays; break;
          case 'night_sessions':   current = nightDays; break;
          case 'shares':           current = shares; break;
          default:                 current = 0;
        }
        const earned = earnedAtMap.has(b.id);
        const pct = earned ? 100 : Math.min(100, Math.round((current / target) * 100));
        const label = b.requirement_type === 'manual'
          ? 'Awarded by JEEnie'
          : `${Math.min(current, target)} / ${target}`;

        return {
          key: b.id,
          id: b.id,
          name: b.name,
          icon: b.icon || '🏅',
          description: b.description || '',
          category: b.category || 'achievement',
          earned,
          earnedAt: earnedAtMap.get(b.id) || undefined,
          rarity,
          progressPct: pct,
          progressLabel: label,
          requirementType: b.requirement_type,
          requirementValue: target,
        };
      });

      setItems(unified);

      // Confetti on newly-earned since last visit
      try {
        const seenKey = `jeenie.badges.seen.${user.id}`;
        const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || '[]'));
        const nowEarned = unified.filter(x => x.earned).map(x => x.key);
        const fresh = nowEarned.filter(k => !seen.has(k));
        if (fresh.length > 0 && seen.size > 0) {
          confetti({ particleCount: 120, spread: 80, origin: { y: 0.3 } });
        }
        localStorage.setItem(seenKey, JSON.stringify(nowEarned));
      } catch { /* noop */ }
    } catch (err) {
      logger.error('Error fetching badges:', err);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    void fetchAll();
  }, [user, fetchAll]);

  const earnedCount = useMemo(() => items.filter(i => i.earned).length, [items]);
  const totalCount = items.length;
  const completion = totalCount ? Math.round((earnedCount / totalCount) * 100) : 0;

  const rarestEarned = useMemo(() => {
    const order: Rarity[] = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];
    for (const r of order) {
      const hit = items.find(i => i.earned && i.rarity === r);
      if (hit) return hit;
    }
    return null;
  }, [items]);

  const categories = useMemo(() => {
    const grouped: Record<string, UnifiedBadge[]> = {};
    items.forEach(i => {
      grouped[i.category] = grouped[i.category] || [];
      grouped[i.category].push(i);
    });
    return grouped;
  }, [items]);

  const openDetail = (b: UnifiedBadge) => {
    setActive(b);
    setSheetOpen(true);
  };

  const shareBadge = (b: UnifiedBadge) => {
    if (!user) return;
    const opts: ShareCardOpts = {
      type: 'badge',
      badgeName: b.name,
      badgeIcon: b.icon,
      category: b.category,
      description: b.description,
      rarity: b.rarity,
      earnedAt: b.earnedAt,
      ringColor: RARITY_HEX[b.rarity],
      referralUrl: ReferralService.getReferralLink(user.id),
    };
    setShareOpts(opts);
    setShareOpen(true);
  };

  const shareCollection = () => {
    if (!user) return;
    const topIcons = items.filter(i => i.earned).slice(0, 5).map(i => i.icon);
    const opts: ShareCardOpts = {
      type: 'badgeCollection',
      earnedCount,
      totalCount,
      topIcons,
      referralUrl: ReferralService.getReferralLink(user.id),
    };
    setShareOpts(opts);
    setShareOpen(true);
  };

  if (loading) {
    return <Card className="p-8 text-center">Loading badges…</Card>;
  }

  return (
    <div className="space-y-6">
      {/* HERO */}
      <Card className="relative overflow-hidden border-[#013062]/15 bg-linear-to-br from-[#013062] via-[#013062] to-[#0a4080] text-white">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-amber-400/20 blur-3xl" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-fuchsia-400/20 blur-3xl" />
        <CardContent className="relative p-5 md:p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/70 font-bold">
                <Trophy className="w-4 h-4" /> Trophy Cabinet
              </div>
              <div className="mt-2 flex items-end gap-2">
                <span className="text-5xl md:text-6xl font-black leading-none">{earnedCount}</span>
                <span className="text-lg text-white/70 pb-1">/ {totalCount}</span>
              </div>
              <div className="mt-1 text-sm text-white/80">badges unlocked — {completion}% collection</div>

              <div className="mt-4 w-full max-w-xs h-2 bg-white/15 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completion}%` }}
                  transition={{ duration: 0.9, ease: 'easeOut' }}
                  className="h-full bg-linear-to-r from-amber-300 via-amber-400 to-orange-500"
                />
              </div>

              <Button
                size="sm"
                onClick={shareCollection}
                disabled={earnedCount === 0}
                className="mt-4 bg-white text-[#013062] hover:bg-white/90 font-bold"
              >
                <Share2 className="w-3.5 h-3.5 mr-1.5" /> Share cabinet
              </Button>
            </div>

            {rarestEarned && (
              <motion.div
                animate={{ y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                className="flex flex-col items-center gap-2"
              >
                <div className="text-[10px] uppercase tracking-widest text-white/70 font-bold">Featured</div>
                <div className={`relative w-28 h-28 rounded-full p-1 bg-linear-to-br ${RARITY_RINGS[rarestEarned.rarity].ring} shadow-2xl`}>
                  <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-5xl">
                    {rarestEarned.icon}
                  </div>
                  <Sparkles className="absolute -top-1 -right-1 w-5 h-5 text-amber-300 drop-shadow" />
                </div>
                <div className="text-xs font-bold text-center max-w-[120px] leading-tight">{rarestEarned.name}</div>
                <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-white/20 text-white">
                  {rarestEarned.rarity}
                </span>
              </motion.div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* CATEGORIES */}
      {Object.entries(categories).map(([cat, list]) => {
        const earnedInCat = list.filter(l => l.earned).length;
        const nextUp = !list.some(l => l.earned)
          ? [...list].sort((a, b) => b.progressPct - a.progressPct)[0]
          : null;

        return (
          <Card key={cat} className="border-slate-200">
            <CardContent className="p-4 md:p-5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <h3 className="font-extrabold text-[#013062] capitalize">{cat}</h3>
                <span className="text-xs font-bold text-slate-500">{earnedInCat} / {list.length}</span>
              </div>
              <p className="text-xs text-slate-500 mb-3 italic">{CATEGORY_FLAVOR[cat] || 'Earn these by playing the long game.'}</p>

              <div className="relative w-full h-1.5 bg-slate-100 rounded-full mb-5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${list.length ? (earnedInCat / list.length) * 100 : 0}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-linear-to-r from-amber-400 to-orange-500"
                />
              </div>

              <motion.div
                initial="hidden"
                animate="show"
                variants={{ show: { transition: { staggerChildren: 0.04 } } }}
                className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-y-5 gap-x-3"
              >
                {list.map(b => (
                  <motion.div
                    key={b.key}
                    variants={{
                      hidden: { opacity: 0, y: 12 },
                      show:   { opacity: 1, y: 0 },
                    }}
                  >
                    <Medallion b={b} onClick={() => openDetail(b)} />
                  </motion.div>
                ))}
              </motion.div>

              {nextUp && (
                <div className="mt-5 rounded-xl border border-dashed border-amber-300 bg-amber-50 p-3 flex items-center gap-3">
                  <div className="text-2xl">{nextUp.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-amber-900">Closest to unlocking: {nextUp.name}</div>
                    <div className="text-[11px] text-amber-800/80 truncate">{nextUp.description}</div>
                  </div>
                  <div className="text-xs font-bold text-amber-900 shrink-0">{nextUp.progressPct}%</div>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {items.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <Trophy className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Start practicing to earn badges!</p>
        </div>
      )}

      {/* Detail sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <AnimatePresence>
            {active && (
              <motion.div
                key={active.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="max-w-md mx-auto"
              >
                <SheetHeader>
                  <SheetTitle className="text-center">Badge details</SheetTitle>
                </SheetHeader>
                <div className="flex flex-col items-center gap-3 py-4">
                  <div className={`relative w-28 h-28 rounded-full p-1 bg-linear-to-br ${RARITY_RINGS[active.rarity].ring} shadow-xl ${active.earned ? '' : 'opacity-70'}`}>
                    <div className="w-full h-full rounded-full bg-white flex items-center justify-center text-5xl">
                      {active.earned ? active.icon : <Lock className="w-8 h-8 text-slate-400" />}
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-extrabold text-[#013062]">{active.name}</div>
                    <span className={`inline-block mt-1 text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded ${RARITY_RINGS[active.rarity].chip}`}>
                      {active.rarity}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 text-center">{active.description}</p>

                  {!active.earned && (
                    <div className="w-full mt-2">
                      <div className="flex justify-between text-[11px] text-slate-500 mb-1">
                        <span>Progress</span>
                        <span>{active.progressLabel}</span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-linear-to-r from-amber-400 to-orange-500"
                          style={{ width: `${active.progressPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {active.earned && active.earnedAt && (
                    <p className="text-xs text-emerald-600 font-semibold">
                      ✓ Earned {new Date(active.earnedAt).toLocaleDateString()}
                    </p>
                  )}

                  {active.earned ? (
                    <Button
                      onClick={() => { setSheetOpen(false); shareBadge(active); }}
                      className="mt-3 w-full bg-[#013062] hover:bg-[#013062]/90 text-white"
                    >
                      <Share2 className="w-4 h-4 mr-1.5" /> Share this badge
                    </Button>
                  ) : (
                    <Button disabled className="mt-3 w-full">
                      <Lock className="w-4 h-4 mr-1.5" /> Locked
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </SheetContent>
      </Sheet>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        opts={shareOpts}
        shareText="Naya badge unlock ho gaya on JEEnie 🏅"
        filename="jeenie-badge.png"
      />
    </div>
  );
};

export default BadgesShowcase;
