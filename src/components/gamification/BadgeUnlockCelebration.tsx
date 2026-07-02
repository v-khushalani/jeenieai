// src/components/gamification/BadgeUnlockCelebration.tsx
// Global watcher: detects new badges (both `profiles.badges` string list and
// `user_badges` rows) and shows a full-screen celebration with a share CTA.
// Sharing the badge awards +50 XP (once per badge, tracked via points_log reason).

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { X, Share2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import ReferralService from '@/services/referralService';
import ShareCardDialog from '@/components/ShareCardDialog';
import type { ShareCardOpts } from '@/lib/shareCard';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { logger } from '@/utils/logger';

interface NewBadge {
  name: string;
  icon: string;
  description: string;
  category: string;
  rarity: string;
  ringColor: string;
  earnedAt?: string;
}

const RARITY_HEX: Record<string, string> = {
  Common: '#94a3b8', Rare: '#3b82f6', Epic: '#a855f7', Legendary: '#f59e0b', Mythic: '#ef4444',
};

const SEEN_KEY = (uid: string) => `jeenie.badges.celebrated.${uid}`;
const SHARE_REWARD_XP = 50;

const readSeen = (uid: string): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY(uid)) || '[]')); }
  catch { return new Set(); }
};
const writeSeen = (uid: string, s: Set<string>) => {
  try { localStorage.setItem(SEEN_KEY(uid), JSON.stringify([...s])); } catch { /* noop */ }
};

const rarityFor = (name: string): string => {
  const n = name.toLowerCase();
  if (n.includes('year') || n.includes('mythic') || n.includes('legend')) return 'Mythic';
  if (n.includes('centurion') || n.includes('champion') || n.includes('master')) return 'Legendary';
  if (n.includes('warrior') || n.includes('marathon') || n.includes('beast')) return 'Epic';
  if (n.includes('streak') || n.includes('fire')) return 'Rare';
  return 'Common';
};

export const BadgeUnlockCelebration = () => {
  const { user } = useAuth();
  const celebrationEnabled = useFeatureFlag('badge_celebration');
  const shareCardEnabled = useFeatureFlag('share_card');

  const [queue, setQueue] = useState<NewBadge[]>([]);
  const [current, setCurrent] = useState<NewBadge | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareOpts, setShareOpts] = useState<ShareCardOpts | null>(null);
  const [sharing, setSharing] = useState(false);
  const initialised = useRef(false);

  // Detect new badges from a fresh snapshot
  const check = useCallback(async () => {
    if (!user?.id) return;
    try {
      const [profileRes, userBadgesRes] = await Promise.all([
        supabase.from('profiles').select('badges').eq('id', user.id).maybeSingle(),
        supabase.from('user_badges').select('badge_id, earned_at, badges(name, icon, description, category)').eq('user_id', user.id),
      ]);

      const dyn: string[] = Array.isArray(profileRes.data?.badges)
        ? (profileRes.data!.badges as unknown[]).filter((b): b is string => typeof b === 'string')
        : [];

      const dbBadges: NewBadge[] = (userBadgesRes.data || []).map((row: any) => {
        const b = row.badges || {};
        const name = b.name || 'Achievement';
        const rar = rarityFor(name);
        return {
          name, icon: b.icon || '🏅',
          description: b.description || '',
          category: b.category || 'achievement',
          rarity: rar, ringColor: RARITY_HEX[rar],
          earnedAt: row.earned_at,
        };
      });

      const dynBadges: NewBadge[] = dyn.map(name => {
        const rar = rarityFor(name);
        return {
          name, icon: '🏅',
          description: `You earned the ${name} badge`,
          category: 'achievement',
          rarity: rar, ringColor: RARITY_HEX[rar],
        };
      });

      const all = [...dbBadges, ...dynBadges];
      const seen = readSeen(user.id);

      // First run after login: just record everything as seen, no celebration.
      if (!initialised.current) {
        const merged = new Set(seen);
        all.forEach(b => merged.add(b.name));
        writeSeen(user.id, merged);
        initialised.current = true;
        return;
      }

      const fresh = all.filter(b => !seen.has(b.name));
      if (fresh.length === 0) return;

      // Mark seen immediately to avoid dupes.
      const merged = new Set(seen);
      fresh.forEach(b => merged.add(b.name));
      writeSeen(user.id, merged);

      if (celebrationEnabled) {
        setQueue(q => [...q, ...fresh]);
      }
    } catch (e) {
      logger.error('BadgeUnlockCelebration check failed', e);
    }
  }, [user?.id, celebrationEnabled]);

  // Initial + realtime subscription
  useEffect(() => {
    if (!user?.id) return;
    initialised.current = false;
    void check();

    const channel = supabase
      .channel(`badge-unlock-${user.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_badges', filter: `user_id=eq.${user.id}` },
        () => { void check(); })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => { void check(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user?.id, check]);

  // Pop next from queue
  useEffect(() => {
    if (!current && queue.length > 0) {
      const [next, ...rest] = queue;
      setCurrent(next);
      setQueue(rest);
      // Fire confetti
      setTimeout(() => {
        try {
          confetti({ particleCount: 160, spread: 90, origin: { y: 0.35 }, colors: ['#fbbf24', '#f472b6', '#60a5fa', '#34d399'] });
          confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0, y: 0.6 } });
          confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1, y: 0.6 } });
        } catch { /* noop */ }
      }, 200);
    }
  }, [queue, current]);

  const close = () => setCurrent(null);

  const handleShare = async () => {
    if (!current || !user) return;
    setSharing(true);
    try {
      const opts: ShareCardOpts = {
        type: 'badge',
        badgeName: current.name,
        badgeIcon: current.icon,
        category: current.category,
        description: current.description,
        rarity: current.rarity,
        earnedAt: current.earnedAt,
        ringColor: current.ringColor,
        referralUrl: ReferralService.getReferralLink(user.id),
      };
      setShareOpts(opts);
      setShareOpen(true);

      // Award XP once per badge share (tracked via action_type + reference_id)
      const actionType = 'badge_share';
      const refId = current.name;
      const { data: existing } = await supabase
        .from('points_log')
        .select('id')
        .eq('user_id', user.id)
        .eq('action_type', actionType)
        .eq('reference_id', refId)
        .limit(1)
        .maybeSingle();

      if (!existing) {
        const { error: logErr } = await supabase.from('points_log').insert({
          user_id: user.id,
          points: SHARE_REWARD_XP,
          action_type: actionType,
          reference_id: refId,
          description: `Shared badge: ${current.name}`,
        });
        if (logErr) throw logErr;

        // Bump profile total_points
        const { data: prof } = await supabase.from('profiles').select('total_points').eq('id', user.id).maybeSingle();
        const next = (prof?.total_points || 0) + SHARE_REWARD_XP;
        await supabase.from('profiles').update({ total_points: next }).eq('id', user.id);
        toast.success(`+${SHARE_REWARD_XP} XP for sharing ${current.name}! 🚀`);
      }
    } catch (e) {
      logger.error('Badge share reward failed', e);
    } finally {
      setSharing(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <AnimatePresence>
        {current && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
            onClick={close}
          >
            <motion.div
              initial={{ scale: 0.7, y: 40, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl"
              style={{
                background: `linear-gradient(160deg, #0f0524 0%, #1e0b3a 50%, ${current.ringColor}44 100%)`,
              }}
            >
              {/* Ambient glow */}
              <div
                className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-72 h-72 rounded-full blur-3xl opacity-60"
                style={{ background: current.ringColor }}
              />

              <button
                onClick={close}
                aria-label="Close"
                className="absolute top-3 right-3 z-10 rounded-full bg-white/10 hover:bg-white/20 p-1.5 text-white"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="relative p-6 pt-8 text-center text-white">
                <div className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.35em] font-black text-white/70">
                  <Sparkles className="w-3 h-3" /> Badge Unlocked
                </div>

                {/* Medallion */}
                <motion.div
                  initial={{ scale: 0, rotate: -30 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.15, type: 'spring', stiffness: 220, damping: 14 }}
                  className="relative mx-auto mt-5 w-36 h-36"
                >
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 14, ease: 'linear' }}
                    className="absolute inset-0 rounded-full p-1.5 shadow-2xl"
                    style={{ background: `conic-gradient(${current.ringColor}, #ffffff44, ${current.ringColor})` }}
                  >
                    <div className="w-full h-full rounded-full bg-black/60 backdrop-blur flex items-center justify-center">
                      <span className="text-6xl drop-shadow-lg">{current.icon}</span>
                    </div>
                  </motion.div>
                </motion.div>

                <h2 className="mt-5 text-2xl font-black leading-tight">{current.name}</h2>
                <span
                  className="inline-block mt-2 text-[10px] font-black uppercase tracking-[0.25em] px-2.5 py-1 rounded-full"
                  style={{ background: `${current.ringColor}30`, color: current.ringColor }}
                >
                  {current.rarity}
                </span>
                <p className="mt-3 text-sm text-white/75 leading-relaxed">
                  {current.description}
                </p>

                {shareCardEnabled ? (
                  <>
                    <Button
                      onClick={handleShare}
                      disabled={sharing}
                      className="mt-6 w-full h-12 rounded-full bg-white text-black hover:bg-white/90 font-black text-sm shadow-xl"
                    >
                      <Share2 className="w-4 h-4 mr-2" />
                      Share &amp; earn +{SHARE_REWARD_XP} XP
                    </Button>
                    <button
                      onClick={close}
                      className="mt-2 w-full text-xs font-semibold text-white/60 hover:text-white/90 py-2"
                    >
                      Maybe later
                    </button>
                  </>
                ) : (
                  <Button
                    onClick={close}
                    className="mt-6 w-full h-12 rounded-full bg-white text-black hover:bg-white/90 font-black text-sm"
                  >
                    Awesome!
                  </Button>
                )}

                {queue.length > 0 && (
                  <p className="mt-3 text-[11px] text-white/50 font-semibold">
                    +{queue.length} more badge{queue.length > 1 ? 's' : ''} coming up…
                  </p>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ShareCardDialog
        open={shareOpen}
        onOpenChange={(o) => { setShareOpen(o); if (!o) close(); }}
        opts={shareOpts}
        shareText={current ? `Naya badge unlock hua on JEEnie: ${current.name} 🏅` : 'Naya badge unlock hua on JEEnie 🏅'}
        filename={`jeenie-badge-${(current?.name || 'badge').toLowerCase().replace(/\s+/g, '-')}.png`}
      />
    </>
  );
};

export default BadgeUnlockCelebration;
