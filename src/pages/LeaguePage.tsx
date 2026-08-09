// Weekly League — 30 students, ranked by XP earned this week.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy, ChevronUp, ChevronDown, Zap } from 'lucide-react';
import Header from '@/components/Header';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useXpStatus } from '@/hooks/useXpStatus';
import { logger } from '@/utils/logger';
import SEOHead from '@/components/SEOHead';

interface Row {
  league_id: string;
  tier: string;
  cycle_start: string;
  cycle_end: string;
  user_id: string;
  full_name: string;
  avatar_url: string | null;
  xp: number;
  rank: number;
  is_me: boolean;
}

const TIER_META: Record<string, { label: string; ring: string }> = {
  bronze: { label: 'Bronze League', ring: 'text-amber-700' },
  silver: { label: 'Silver League', ring: 'text-slate-400' },
  gold: { label: 'Gold League', ring: 'text-yellow-500' },
  diamond: { label: 'Diamond League', ring: 'text-cyan-400' },
};

const PROMOTE = 5;
const DEMOTE = 5;

const LeaguePage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { dailyXp, xpGoal } = useXpStatus();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      await supabase.rpc('join_current_league' as never);
      const { data, error } = await supabase.rpc('get_my_league' as never);
      if (error) throw error;
      setRows((data ?? []) as unknown as Row[]);
    } catch (e) {
      logger.error('league load failed', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const tier = rows[0]?.tier ?? 'bronze';
  const meta = TIER_META[tier] ?? TIER_META.bronze;
  const total = rows.length;
  const me = rows.find(r => r.is_me);
  const daysLeft = rows[0]
    ? Math.max(0, Math.ceil((new Date(rows[0].cycle_end).getTime() + 86400000 - Date.now()) / 86400000))
    : 0;

  return (
    <div className="min-h-screen bg-background">
      <SEOHead
        title="Weekly League | JEEnie"
        description="Har hafte 30 students ke saath XP race. Top 5 promote, bottom 5 demote."
      />
      <Header />
      <main className="container mx-auto max-w-2xl px-4 pb-24 pt-24">
        <div className="mb-6 text-center">
          <Trophy className={`mx-auto mb-2 h-10 w-10 ${meta.ring}`} />
          <h1 className="text-2xl font-bold text-foreground">{meta.label}</h1>
          <p className="text-sm text-muted-foreground">
            {daysLeft > 0 ? `${daysLeft} din baaki` : 'Aaj last day'} · Top {PROMOTE} promote, bottom {DEMOTE} demote
          </p>
        </div>

        <div className="mb-5 flex items-center justify-between rounded-xl border border-border bg-card p-4">
          <div>
            <p className="text-xs text-muted-foreground">Aaj ka XP</p>
            <p className="text-lg font-bold text-foreground">{dailyXp}<span className="text-sm font-normal text-muted-foreground">/{xpGoal}</span></p>
          </div>
          <Button size="sm" onClick={() => navigate('/practice')}>
            <Zap className="mr-1 h-4 w-4" /> XP kamao
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : total === 0 ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <p className="mb-3 text-sm text-muted-foreground">
              League abhi shuru nahi hui. Pehla question solve karte hi tum is hafte ki race mein aa jaoge.
            </p>
            <Button onClick={() => navigate('/practice')}>Practice shuru karo</Button>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-xl border border-border bg-card">
            {rows.map((r, i) => {
              const promoting = r.rank <= PROMOTE;
              const demoting = total > DEMOTE && i >= total - DEMOTE;
              return (
                <li
                  key={r.user_id}
                  className={`flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0 ${
                    r.is_me ? 'bg-primary/10' : ''
                  }`}
                >
                  <span className="w-6 text-sm font-bold text-muted-foreground">{r.rank}</span>
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-bold text-foreground">
                    {(r.full_name || 'S').charAt(0).toUpperCase()}
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">
                    {r.is_me ? 'Tum' : r.full_name}
                  </span>
                  {promoting && <ChevronUp className="h-4 w-4 text-emerald-500" />}
                  {demoting && !promoting && <ChevronDown className="h-4 w-4 text-destructive" />}
                  <span className="w-16 text-right text-sm font-bold text-foreground">{r.xp} XP</span>
                </li>
              );
            })}
          </ul>
        )}

        {me && (
          <p className="mt-4 text-center text-sm text-muted-foreground">
            Tum #{me.rank} pe ho.{' '}
            {me.rank > PROMOTE
              ? `Top ${PROMOTE} se ${Math.max(0, (rows[PROMOTE - 1]?.xp ?? 0) - me.xp) + 1} XP door.`
              : 'Promotion zone mein ho — bas bane raho.'}
          </p>
        )}
      </main>
    </div>
  );
};

export default LeaguePage;
