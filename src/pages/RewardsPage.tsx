/**
 * RewardsPage — JEEnie ka reward hub.
 * Weekly loop (3/5/7 active days) -> Monthly draw -> Streak milestones -> Points store.
 * Sab kuch JEEnie Points par chalta hai; koi naya currency nahi.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Gift, Flame, Ticket, ShoppingBag, Trophy, Lock, Check, Loader2 } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type StoreItem = {
  code: string;
  label: string;
  description: string | null;
  item_type: string;
  cost_points: number;
  min_tier: string;
  sort_order: number;
};

type Claim = { claim_kind: string; claim_key: string; reward_label: string };

const WEEKLY_TIERS = [
  { days: 3, label: '3 din active', reward: '+100 JEEnie Points', icon: Flame },
  { days: 5, label: '5 din active', reward: 'Streak Shield', icon: Gift },
  { days: 7, label: 'Poora hafta', reward: 'Monthly Draw entry', icon: Ticket },
];

const MILESTONES = [
  { days: 7, reward: 'Consistency badge' },
  { days: 30, reward: '1 month Pro free' },
  { days: 100, reward: 'Merch: stickers + notebook' },
  { days: 180, reward: 'Premium merch box' },
  { days: 365, reward: '5x Grand Draw entries (iPad / Laptop)' },
];

// Untyped tables until the rewards SQL is applied on the project.
const db = supabase as any;

const cycleMonth = () => new Date().toISOString().slice(0, 7);

export default function RewardsPage() {
  const { user, profile, refreshProfile } = useAuth() as any;
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<StoreItem[]>([]);
  const [claims, setClaims] = useState<Claim[]>([]);
  const [activeDays, setActiveDays] = useState(0);
  const [tickets, setTickets] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [ready, setReady] = useState(true);

  const points = Number(profile?.total_points ?? 0);
  const streak = Number(profile?.current_streak ?? 0);
  const best = Math.max(Number(profile?.longest_streak ?? 0), streak);

  const weekStart = useMemo(() => {
    const d = new Date();
    const day = (d.getDay() + 6) % 7; // Monday-first
    d.setDate(d.getDate() - day);
    return d.toISOString().slice(0, 10);
  }, []);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    const [store, claimRows, progress, draws] = await Promise.all([
      db.from('reward_store_items').select('*').eq('is_active', true).order('sort_order'),
      db.from('reward_claims').select('claim_kind, claim_key, reward_label').eq('user_id', user.id),
      db
        .from('daily_progress')
        .select('date, questions_attempted')
        .eq('user_id', user.id)
        .gte('date', weekStart),
      db.from('draw_entries').select('tickets').eq('user_id', user.id).eq('cycle_month', cycleMonth()),
    ]);

    if (store.error) setReady(false);
    setItems(store.data ?? []);
    setClaims(claimRows.data ?? []);
    setActiveDays((progress.data ?? []).filter((r: any) => (r.questions_attempted ?? 0) > 0).length);
    setTickets((draws.data ?? []).reduce((s: number, r: any) => s + (r.tickets ?? 1), 0));
    setLoading(false);
  }, [user?.id, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const hasClaim = (kind: string, key: string) =>
    claims.some((c) => c.claim_kind === kind && c.claim_key === key);

  const runRpc = async (fn: string, args: Record<string, unknown>, tag: string) => {
    setBusy(tag);
    const { data, error } = await db.rpc(fn, args);
    setBusy(null);
    if (error || !data?.ok) {
      const code = data?.error ?? error?.message ?? 'failed';
      const msg: Record<string, string> = {
        not_eligible: 'Abhi eligible nahi — thoda aur consistency chahiye.',
        already_claimed: 'Yeh already claim ho chuka hai.',
        not_enough_points: 'Points kam pad rahe hain.',
        tier_locked: 'Yeh item Pro users ke liye hai.',
      };
      toast.error(msg[code] ?? 'Kuch gadbad ho gayi, dobara try karo.');
      return;
    }
    toast.success(`Mil gaya: ${data.label ?? data.item}`);
    await Promise.all([load(), refreshProfile?.()]);
  };

  return (
    <div className="mobile-app-shell bg-background flex flex-col overflow-hidden">
      <Header />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="container mx-auto px-3 sm:px-4 lg:px-8 max-w-4xl py-4 space-y-4">
          <header className="space-y-1">
            <h1 className="text-2xl font-black tracking-tighter flex items-center gap-2">
              <Gift className="w-6 h-6 text-primary" /> Rewards
            </h1>
            <p className="text-sm text-muted-foreground">
              Roz padho, points kamao, aur asli inaam tak pahucho.
            </p>
          </header>

          <Card className="p-4 flex items-center justify-between border-2">
            <div>
              <div className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                JEEnie Points
              </div>
              <div className="text-3xl font-black tabular-nums">{points}</div>
            </div>
            <div className="text-right space-y-1">
              <div className="text-xs font-bold flex items-center gap-1 justify-end">
                <Flame className="w-4 h-4 text-orange-500" /> {streak} din streak
              </div>
              <div className="text-xs font-bold flex items-center gap-1 justify-end">
                <Ticket className="w-4 h-4 text-primary" /> {tickets} draw entries
              </div>
            </div>
          </Card>

          {!ready && (
            <Card className="p-4 border-2 border-dashed text-sm text-muted-foreground">
              Rewards backend abhi setup nahi hua. `supabase/manual/rewards_system.sql` ko SQL editor
              mein run karte hi yeh page live ho jayega.
            </Card>
          )}

          {/* Weekly loop */}
          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-tighter">Is hafte ka loop</h2>
            <p className="text-xs text-muted-foreground">
              {activeDays}/7 din active. Har active din ek step aage.
            </p>
            <div className="grid gap-2 sm:grid-cols-3">
              {WEEKLY_TIERS.map((t) => {
                const claimed = hasClaim('weekly', `${weekStart}:${t.days}`);
                const eligible = activeDays >= t.days;
                const Icon = t.icon;
                return (
                  <motion.div key={t.days} whileHover={{ scale: eligible && !claimed ? 1.02 : 1 }}>
                    <Card
                      className={`p-3 h-full border-2 ${
                        claimed ? 'opacity-60' : eligible ? 'border-primary' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-tighter">
                        <Icon className="w-4 h-4 text-primary" /> {t.label}
                      </div>
                      <div className="mt-1 text-sm font-bold">{t.reward}</div>
                      <Button
                        size="sm"
                        className="w-full mt-3"
                        disabled={!eligible || claimed || busy === `w${t.days}`}
                        onClick={() => runRpc('claim_weekly_reward', { p_days: t.days }, `w${t.days}`)}
                      >
                        {busy === `w${t.days}` ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : claimed ? (
                          <>
                            <Check className="w-4 h-4 mr-1" /> Claimed
                          </>
                        ) : eligible ? (
                          'Claim'
                        ) : (
                          `${t.days - activeDays} din baaki`
                        )}
                      </Button>
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </section>

          {/* Streak milestones */}
          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-tighter">Streak milestones</h2>
            <div className="space-y-2">
              {MILESTONES.map((m) => {
                const claimed = hasClaim('milestone', String(m.days));
                const eligible = best >= m.days;
                return (
                  <Card key={m.days} className="p-3 flex items-center gap-3 border-2">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-black text-sm ${
                        eligible ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {m.days}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold truncate">{m.reward}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {eligible ? 'Unlocked' : `${m.days - best} din aur`}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant={eligible && !claimed ? 'default' : 'outline'}
                      disabled={!eligible || claimed || busy === `m${m.days}`}
                      onClick={() => runRpc('claim_streak_milestone', { p_days: m.days }, `m${m.days}`)}
                    >
                      {busy === `m${m.days}` ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : claimed ? (
                        'Claimed'
                      ) : eligible ? (
                        'Claim'
                      ) : (
                        <Lock className="w-4 h-4" />
                      )}
                    </Button>
                  </Card>
                );
              })}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Merch aur grand prizes claim ke baad verify hote hain; shipping details team confirm karegi.
            </p>
          </section>

          {/* Points store */}
          <section className="space-y-2 pb-8">
            <h2 className="text-sm font-black uppercase tracking-tighter flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-primary" /> Points Store
            </h2>
            {loading ? (
              <Card className="p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              </Card>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {items.map((it) => {
                  const afford = points >= it.cost_points;
                  return (
                    <Card key={it.code} className="p-3 border-2 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-sm font-black">{it.label}</div>
                        <Badge variant="secondary" className="font-black tabular-nums">
                          {it.cost_points}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 flex-1">{it.description}</p>
                      <Button
                        size="sm"
                        variant={afford ? 'default' : 'outline'}
                        className="mt-3"
                        disabled={!afford || busy === it.code}
                        onClick={() => runRpc('purchase_store_item', { p_item_code: it.code }, it.code)}
                      >
                        {busy === it.code ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : afford ? (
                          'Redeem'
                        ) : (
                          `${it.cost_points - points} points aur`
                        )}
                      </Button>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <Card className="p-4 border-2 border-primary/40 bg-primary/5 flex items-start gap-3">
            <Trophy className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div className="text-xs">
              <div className="font-black">Pro = tez progress</div>
              Pro par points 1.5x, Pro+ par 2x — matlab rewards tak double speed se.
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
