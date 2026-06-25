import { useEffect, useMemo, useState } from 'react';
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

// ---------- Badge meta ----------
interface DynamicBadge {
  name: string;
  icon: string;
  category: string;
  description: string;
  threshold: number; // for progress + rarity
  metric: 'answer_streak' | 'day_streak' | 'milestone';
}

const DYNAMIC_BADGE_META: Record<string, DynamicBadge> = {
  // Answer streaks (in-a-row correct)
  'Hot Streak':         { name: 'Hot Streak',         icon: '🔥', category: 'Answer Streaks', description: '5 correct answers in a row',  threshold: 5,   metric: 'answer_streak' },
  'On Fire':            { name: 'On Fire',            icon: '🚀', category: 'Answer Streaks', description: '10 correct answers in a row', threshold: 10,  metric: 'answer_streak' },
  'Unstoppable':        { name: 'Unstoppable',        icon: '⚡', category: 'Answer Streaks', description: '20 correct answers in a row', threshold: 20,  metric: 'answer_streak' },
  'Galat Hi Nahi':      { name: 'Galat Hi Nahi',      icon: '🧠', category: 'Answer Streaks', description: '30 correct in a row — machine mode', threshold: 30, metric: 'answer_streak' },
  'BEAST MODE':         { name: 'BEAST MODE',         icon: '👑', category: 'Answer Streaks', description: '50 correct answers in a row', threshold: 50,  metric: 'answer_streak' },
  // Day streaks (consecutive days practiced)
  '3-Day Spark':        { name: '3-Day Spark',        icon: '✨', category: 'Day Streaks',    description: '3 din lagataar — momentum on',     threshold: 3,   metric: 'day_streak' },
  '7-Day Warrior':      { name: '7-Day Warrior',      icon: '⚔️', category: 'Day Streaks',    description: '7 consecutive days of practice',   threshold: 7,   metric: 'day_streak' },
  '15-Day Champion':    { name: '15-Day Champion',    icon: '🏆', category: 'Day Streaks',    description: '15 consecutive days of practice',  threshold: 15,  metric: 'day_streak' },
  'Monthly Master':     { name: 'Monthly Master',     icon: '📅', category: 'Day Streaks',    description: '30 consecutive days of practice',  threshold: 30,  metric: 'day_streak' },
  'Quarter Master':     { name: 'Quarter Master',     icon: '🎯', category: 'Day Streaks',    description: '90 consecutive days of practice',  threshold: 90,  metric: 'day_streak' },
  'Centurion':          { name: 'Centurion',          icon: '🛡️', category: 'Day Streaks',    description: '100-day streak — elite club',      threshold: 100, metric: 'day_streak' },
  'Half Year Legend':   { name: 'Half Year Legend',   icon: '⭐', category: 'Day Streaks',    description: '180 consecutive days of practice', threshold: 180, metric: 'day_streak' },
  'YEARLY CHAMPION':    { name: 'YEARLY CHAMPION',    icon: '💎', category: 'Day Streaks',    description: '365 consecutive days of practice', threshold: 365, metric: 'day_streak' },

  // Skill milestones
  'Comeback Kid':       { name: 'Comeback Kid',       icon: '🦅', category: 'Skill',          description: '80%+ test after a sub-40% one — phoenix mode', threshold: 1,   metric: 'milestone' },
  'Speed Demon':        { name: 'Speed Demon',        icon: '⚡', category: 'Skill',          description: '10 correct answers in under 60s total',         threshold: 10,  metric: 'milestone' },
  'Marathoner':         { name: 'Marathoner',         icon: '🏃', category: 'Skill',          description: '100 questions solved in a single day',          threshold: 100, metric: 'milestone' },
  'Iron Brain':         { name: 'Iron Brain',         icon: '🧱', category: 'Skill',          description: '5 consecutive Hard questions correct',          threshold: 5,   metric: 'milestone' },
  'Bug-Free Day':       { name: 'Bug-Free Day',       icon: '💯', category: 'Skill',          description: '100% score on any chapter test',                threshold: 1,   metric: 'milestone' },
  'Perfectionist':      { name: 'Perfectionist',      icon: '🏵️', category: 'Skill',          description: '1000 questions solved at ≥ 90% accuracy',       threshold: 1000, metric: 'milestone' },

  // Consistency
  'Morning Person':     { name: 'Morning Person',     icon: '🌅', category: 'Consistency',    description: '7 sessions started before 8 AM',                threshold: 7,   metric: 'milestone' },
  'Night Owl':          { name: 'Night Owl',          icon: '🦉', category: 'Consistency',    description: '7 sessions after 11 PM',                        threshold: 7,   metric: 'milestone' },
  'Weekend Warrior':    { name: 'Weekend Warrior',    icon: '🗓️', category: 'Consistency',    description: 'Practice both Sat + Sun for 4 weeks',           threshold: 4,   metric: 'milestone' },

  // Subject mastery
  'Newton ka Beta':     { name: 'Newton ka Beta',     icon: '🍎', category: 'Subject Mastery',description: '95% accuracy on 50 Mechanics questions',        threshold: 50,  metric: 'milestone' },
  'Mole Master':        { name: 'Mole Master',        icon: '⚗️', category: 'Subject Mastery',description: '95% accuracy on 50 Mole Concept questions',     threshold: 50,  metric: 'milestone' },
  'Integration Ninja':  { name: 'Integration Ninja',  icon: '🥷', category: 'Subject Mastery',description: 'Solve 30 Hard Calculus questions',              threshold: 30,  metric: 'milestone' },

  // Social / engagement
  'Influencer':         { name: 'Influencer',         icon: '📣', category: 'Engagement',     description: 'Share 5 result or badge cards',                  threshold: 5,   metric: 'milestone' },
  'Doubt Slayer':       { name: 'Doubt Slayer',       icon: '🗡️', category: 'Engagement',     description: 'Use JEEnie AI 20 times in a week',               threshold: 20,  metric: 'milestone' },
  'Roast Survivor':     { name: 'Roast Survivor',     icon: '🔥', category: 'Engagement',     description: 'Get roasted 5 times — aur wapas aaya',           threshold: 5,   metric: 'milestone' },

  // Mythic / rare
  'Topper Mode':        { name: 'Topper Mode',        icon: '🥇', category: 'Mythic',         description: 'Rank #1 on weekly leaderboard',                  threshold: 1,   metric: 'milestone' },
};


const CATEGORY_FLAVOR: Record<string, string> = {
  'Answer Streaks':  'Ek galat answer aur sab gaya 💀',
  'Day Streaks':     'Daily showup karne walon ka elite club',
  'Skill':           'Skill flex — yahan se respect milti hai',
  'Consistency':     'Same time, same energy — bina excuse',
  'Subject Mastery': 'Topic ka boss tu hi hai',
  'Engagement':      'JEEnie family ka active member',
  'Mythic':          'Sirf chosen ones — legend tier',
  achievement:       'Milestones jo dikhate hain — tu serious hai',
  skill:             'Skill flex — yahan se respect milti hai',
  subject:           'Subject ka boss ban gaya tu',
  streak:            'Consistency = compounding',
};


const RARITY_RINGS: Record<string, { ring: string; chip: string; glow: string }> = {
  Common:    { ring: 'from-slate-300 to-slate-500',     chip: 'bg-slate-200 text-slate-700',         glow: 'shadow-slate-400/40' },
  Rare:      { ring: 'from-sky-400 to-blue-600',        chip: 'bg-sky-100 text-sky-700',             glow: 'shadow-sky-400/50' },
  Epic:      { ring: 'from-fuchsia-400 to-purple-700',  chip: 'bg-fuchsia-100 text-fuchsia-700',     glow: 'shadow-fuchsia-500/50' },
  Legendary: { ring: 'from-amber-300 to-orange-600',    chip: 'bg-amber-100 text-amber-800',         glow: 'shadow-amber-500/60' },
  Mythic:    { ring: 'from-rose-400 via-red-500 to-rose-700', chip: 'bg-rose-100 text-rose-700',     glow: 'shadow-rose-500/60' },
};

const RARITY_HEX: Record<string, string> = {
  Common: '#94a3b8', Rare: '#3b82f6', Epic: '#a855f7', Legendary: '#f59e0b', Mythic: '#ef4444',
};

function rarityFromThreshold(t: number): keyof typeof RARITY_RINGS {
  if (t >= 180) return 'Mythic';
  if (t >= 60)  return 'Legendary';
  if (t >= 20)  return 'Epic';
  if (t >= 10)  return 'Rare';
  return 'Common';
}

function rarityFromPoints(p: number): keyof typeof RARITY_RINGS {
  if (p >= 5000) return 'Mythic';
  if (p >= 2000) return 'Legendary';
  if (p >= 800)  return 'Epic';
  if (p >= 200)  return 'Rare';
  return 'Common';
}

// ---------- Unified item shape ----------
interface UnifiedBadge {
  key: string;
  name: string;
  icon: string;
  description: string;
  category: string;
  earned: boolean;
  earnedAt?: string;
  rarity: keyof typeof RARITY_RINGS;
  progressPct: number;     // 0-100
  progressLabel?: string;  // e.g. "12 / 20 in a row"
}

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
      {/* Halo glow for earned */}
      {b.earned && (
        <span className={`absolute -inset-2 rounded-full blur-xl opacity-60 bg-linear-to-br ${skin.ring} animate-pulse pointer-events-none`} />
      )}

      <div className="relative" style={{ width: size, height: size }}>
        {/* Outer rotating ring (earned) */}
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

        {/* Icon */}
        <div className={`absolute inset-2 rounded-full flex items-center justify-center text-4xl ${
          b.earned ? '' : 'grayscale opacity-60'
        }`}>
          <span>{b.icon}</span>
        </div>

        {/* Lock overlay */}
        {!b.earned && (
          <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-1 shadow border border-slate-200">
            <Lock className="w-3 h-3 text-slate-500" />
          </div>
        )}
      </div>

      {/* Ribbon name */}
      <div className={`relative px-2 py-1 rounded-md text-[11px] font-extrabold text-center max-w-[110px] leading-tight ${
        b.earned ? `bg-linear-to-r ${skin.ring} text-white` : 'bg-slate-100 text-slate-600'
      }`}>
        {b.name}
      </div>

      {/* Rarity chip */}
      <span className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${skin.chip}`}>
        {b.rarity}
      </span>
    </motion.button>
  );
};

// ---------- Main ----------
const BadgesShowcase = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<UnifiedBadge[]>([]);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [active, setActive] = useState<UnifiedBadge | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState<ShareCardOpts | null>(null);

  useEffect(() => {
    if (!user) return;
    void fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchAll = async () => {
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;

      const [profileRes, allBadgesRes, userBadgesRes] = await Promise.all([
        supabase.from('profiles').select('total_points, badges, current_streak').eq('id', u.id).single(),
        supabase.from('badges').select('*').order('points_required', { ascending: true }),
        supabase.from('user_badges').select('badge_id, earned_at').eq('user_id', u.id),
      ]);

      const userPoints = profileRes.data?.total_points || 0;
      const earnedDynamic: string[] = Array.isArray(profileRes.data?.badges)
        ? (profileRes.data!.badges as unknown[]).filter((b): b is string => typeof b === 'string')
        : [];

      const bestAnswerStreak = 0; // not tracked separately; rely on earned flag
      const bestDayStreak = profileRes.data?.current_streak || 0;

      const earnedAtMap = new Map<string, string>();
      (userBadgesRes.data || []).forEach(ub => earnedAtMap.set(ub.badge_id, ub.earned_at || ''));

      const dyn: UnifiedBadge[] = Object.values(DYNAMIC_BADGE_META).map(d => {
        const earned = earnedDynamic.includes(d.name);
        const current = d.metric === 'answer_streak'
          ? bestAnswerStreak
          : d.metric === 'day_streak'
          ? bestDayStreak
          : 0; // milestone — backend awards it; no live progress bar
        const pct = Math.min(100, Math.round((current / d.threshold) * 100));

        return {
          key: `dyn:${d.name}`,
          name: d.name,
          icon: d.icon,
          description: d.description,
          category: d.category,
          earned,
          earnedAt: undefined,
          rarity: rarityFromThreshold(d.threshold),
          progressPct: earned ? 100 : pct,
          progressLabel: `${Math.min(current, d.threshold)} / ${d.threshold}`,
        };
      });

      const tableBadges: UnifiedBadge[] = (allBadgesRes.data || []).map((b) => {
        const earned = earnedAtMap.has(b.id);
        const req = b.points_required || 1;
        const pct = Math.min(100, Math.round((userPoints / req) * 100));
        return {
          key: `tbl:${b.id}`,
          name: b.name,
          icon: b.icon || '🏅',
          description: b.description || '',
          category: b.category || 'achievement',
          earned,
          earnedAt: earnedAtMap.get(b.id) || undefined,
          rarity: rarityFromPoints(req),
          progressPct: earned ? 100 : pct,
          progressLabel: `${userPoints} / ${req} pts`,
        };
      });

      const all = [...dyn, ...tableBadges];
      setItems(all);

      // Confetti on newly-earned since last visit
      try {
        const seenKey = `jeenie.badges.seen.${u.id}`;
        const seen = new Set<string>(JSON.parse(localStorage.getItem(seenKey) || '[]'));
        const nowEarned = all.filter(x => x.earned).map(x => x.key);
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
  };

  const earnedCount = useMemo(() => items.filter(i => i.earned).length, [items]);
  const totalCount = items.length;
  const completion = totalCount ? Math.round((earnedCount / totalCount) * 100) : 0;

  const rarestEarned = useMemo(() => {
    const order: (keyof typeof RARITY_RINGS)[] = ['Mythic', 'Legendary', 'Epic', 'Rare', 'Common'];
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

            {/* Featured medallion */}
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

              {/* Milestone bar */}
              <div className="relative w-full h-1.5 bg-slate-100 rounded-full mb-5">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${list.length ? (earnedInCat / list.length) * 100 : 0}%` }}
                  transition={{ duration: 0.8 }}
                  className="h-full rounded-full bg-linear-to-r from-amber-400 to-orange-500"
                />
                {list.map((_, i) => (
                  <span
                    key={i}
                    className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-white border border-slate-300"
                    style={{ left: `calc(${(i / Math.max(1, list.length - 1)) * 100}% - 4px)` }}
                  />
                ))}
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
