/**
 * RewardsPage — points, streak milestones, podium prizes and the points store.
 * Podium + store items are admin-managed rows in public.reward_store_items.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Flame, ShoppingBag, Trophy, Lock, Check, Loader2, Package } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type StoreItem = {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  category: string;
  mrp: number | null;
  points_cost: number | null;
  streak_required: number | null;
  units_total: number;
  units_left: number;
  podium_rank: number | null;
  display_order: number;
};

type Claim = { item_id: string | null; claim_type: string; status: string };

const MILESTONES = [
  { days: 7, reward: 'Consistency badge' },
  { days: 30, reward: '1 month Pro free' },
  { days: 100, reward: 'Sticker pack + notebook' },
  { days: 180, reward: 'Premium merch box' },
  { days: 365, reward: 'Grand prize entry' },
];

const db = supabase as any;

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const PODIUM_STYLE: Record<number, { h: string; ring: string; label: string }> = {
  1: { h: 'sm:h-56', ring: 'border-amber-400/70 bg-gradient-to-b from-amber-400/20 to-transparent', label: 'Rank 1' },
  2: { h: 'sm:h-44', ring: 'border-slate-400/60 bg-gradient-to-b from-slate-400/15 to-transparent', label: 'Rank 2' },
  3: { h: 'sm:h-36', ring: 'border-orange-500/50 bg-gradient-to-b from-orange-500/15 to-transparent', label: 'Rank 3' },
};

export default function RewardsPage() {
  const { user, profile, refreshProfile } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const points = Number(profile?.total_points ?? 0);
  const streak = Number(profile?.current_streak ?? 0);
  const best = Math.max(Number(profile?.longest_streak ?? 0), streak);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [store, claimRows] = await Promise.all([
      db.from('reward_store_items').select('*').eq('is_active', true).order('display_order'),
      db.from('reward_claims').select('item_id, claim_type, status').eq('user_id', user.id),
    ]);
    setItems(store.data ?? []);
    setClaims(claimRows.data ?? []);
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  const claimedItem = (id: string) => claims.some((c) => c.item_id === id);
  const claimedMilestone = (days: number) =>
    claims.some((c) => c.claim_type === `milestone_${days}`);

  const redeem = async (item: StoreItem) => {
    if (!user?.id) return;
    setBusy(item.id);
    const { error } = await db.from('reward_claims').insert({
      user_id: user.id,
      item_id: item.id,
      claim_type: item.category === 'podium' ? 'podium' : 'store',
      points_spent: item.points_cost ?? 0,
      status: 'pending',
    });
    setBusy(null);
    if (error) { toast.error('Could not place the claim. Try again.'); return; }
    toast.success(`Claim placed: ${item.name}`);
    await Promise.all([load(), refreshProfile?.()]);
  };

  const claimMilestone = async (days: number, reward: string) => {
    if (!user?.id) return;
    setBusy(`m${days}`);
    const { error } = await db.from('reward_claims').insert({
      user_id: user.id,
      claim_type: `milestone_${days}`,
      points_spent: 0,
      status: 'pending',
      notes: reward,
    });
    setBusy(null);
    if (error) { toast.error('Could not claim right now.'); return; }
    toast.success(`Claimed: ${reward}`);
    await load();
  };

  const podium = items.filter((i) => i.category === 'podium').sort((a, b) => (a.podium_rank ?? 9) - (b.podium_rank ?? 9));
  const store = items.filter((i) => i.category !== 'podium');
  const podiumOrder = [podium.find(p => p.podium_rank === 2), podium.find(p => p.podium_rank === 1), podium.find(p => p.podium_rank === 3)].filter(Boolean) as StoreItem[];

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="container mx-auto max-w-4xl space-y-5 px-3 py-4 sm:px-4 lg:px-8">
          <header className="space-y-1">
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Gift className="h-6 w-6 text-primary" /> Rewards
            </h1>
            <p className="text-sm text-muted-foreground">Study daily, earn points, claim real prizes.</p>
          </header>

          <Card className="flex items-center justify-between border-2 p-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">JEEnie Points</div>
              <div className="text-3xl font-black tabular-nums">{points}</div>
            </div>
            <div className="flex items-center gap-1 text-sm font-bold">
              <Flame className="h-4 w-4 text-orange-500" /> {streak} day streak
            </div>
          </Card>

          {/* Podium */}
          <section className="space-y-3">
            <h2 className="text-sm font-black uppercase tracking-tight">Top prizes</h2>
            {loading ? (
              <Card className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
            ) : podiumOrder.length === 0 ? (
              <Card className="border-2 border-dashed p-6 text-center text-sm text-muted-foreground">
                Prizes coming soon.
              </Card>
            ) : (
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
                {podiumOrder.map((it) => {
                  const style = PODIUM_STYLE[it.podium_rank ?? 3];
                  const eligible = best >= (it.streak_required ?? 0);
                  const done = claimedItem(it.id);
                  return (
                    <motion.div
                      key={it.id}
                      initial={{ opacity: 0, y: 18 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
                    >
                      <Card className={`flex flex-col justify-end rounded-[26px] border-2 p-4 ${style.ring} ${style.h}`}>
                        <div className="flex items-center justify-between">
                          <Badge variant="secondary" className="font-black">{style.label}</Badge>
                          <Trophy className="h-4 w-4 text-amber-600" />
                        </div>
                        <div className="mt-3 flex h-16 items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/40">
                          {it.image_url
                            ? <img src={it.image_url} alt={it.name} loading="lazy" className="h-full w-full rounded-2xl object-cover" />
                            : <Package className="h-6 w-6 text-muted-foreground" />}
                        </div>
                        <p className="mt-3 truncate text-sm font-black">{it.name}</p>
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          {it.mrp ? `Worth ${inr(Number(it.mrp))}` : 'Value TBA'} · {it.units_left}/{it.units_total} left
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {it.streak_required ? `${it.streak_required}-day streak` : 'Open to all'}
                        </p>
                        <Button
                          size="sm"
                          className="mt-3 rounded-2xl"
                          variant={eligible && !done ? 'default' : 'outline'}
                          disabled={!eligible || done || it.units_left <= 0 || busy === it.id}
                          onClick={() => void redeem(it)}
                        >
                          {busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" />
                            : done ? <><Check className="mr-1 h-4 w-4" /> Claimed</>
                            : eligible ? 'Claim'
                            : `${(it.streak_required ?? 0) - best} days to go`}
                        </Button>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Streak milestones */}
          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-tight">Streak milestones</h2>
            <div className="space-y-2">
              {MILESTONES.map((m) => {
                const done = claimedMilestone(m.days);
                const eligible = best >= m.days;
                return (
                  <Card key={m.days} className="flex items-center gap-3 rounded-2xl border-2 p-3">
                    <div className={`flex h-11 w-11 items-center justify-center rounded-xl text-sm font-black ${eligible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                      {m.days}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{m.reward}</div>
                      <div className="text-[11px] text-muted-foreground">{eligible ? 'Unlocked' : `${m.days - best} days to go`}</div>
                    </div>
                    <Button
                      size="sm"
                      variant={eligible && !done ? 'default' : 'outline'}
                      disabled={!eligible || done || busy === `m${m.days}`}
                      onClick={() => void claimMilestone(m.days, m.reward)}
                    >
                      {busy === `m${m.days}` ? <Loader2 className="h-4 w-4 animate-spin" />
                        : done ? 'Claimed' : eligible ? 'Claim' : <Lock className="h-4 w-4" />}
                    </Button>
                  </Card>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Merch and grand prizes are verified after claiming; the team confirms shipping details.
            </p>
          </section>

          {/* Points store */}
          <section className="space-y-2 pb-8">
            <h2 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight">
              <ShoppingBag className="h-4 w-4 text-primary" /> Points store
            </h2>
            {loading ? (
              <Card className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></Card>
            ) : store.length === 0 ? (
              <Card className="border-2 border-dashed p-6 text-center text-sm text-muted-foreground">Store items coming soon.</Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {store.map((it) => {
                  const cost = it.points_cost ?? 0;
                  const afford = points >= cost;
                  return (
                    <Card key={it.id} className="flex flex-col rounded-2xl border-2 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-black">{it.name}</div>
                        <Badge variant="secondary" className="font-black tabular-nums">{cost}</Badge>
                      </div>
                      <p className="mt-1 flex-1 text-xs text-muted-foreground">{it.description}</p>
                      <Button
                        size="sm"
                        variant={afford ? 'default' : 'outline'}
                        className="mt-3 rounded-2xl"
                        disabled={!afford || it.units_left <= 0 || busy === it.id}
                        onClick={() => void redeem(it)}
                      >
                        {busy === it.id ? <Loader2 className="h-4 w-4 animate-spin" />
                          : afford ? 'Redeem' : `${cost - points} points to go`}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
