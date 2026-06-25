import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';
import { Sparkles, AlertTriangle, TrendingDown } from 'lucide-react';

/**
 * Admin-only "JEEnie cost" panel. Reads ai_request_log directly (RLS limits
 * non-admins to their own rows; admins see everything via service-side queries
 * — for now we just SELECT and the RLS policy is permissive for the panel.
 *
 * Surfaces:
 *   - Total spend (7d/30d)
 *   - Cost per tier · per mode
 *   - p50 / p95 latency
 *   - Fallback rate (Gateway → Gemini → OpenAI)
 *   - Tier-scrub rate (>2% means the prompt is leaking — tune it)
 *   - Margin tracker vs effective yearly pricing (₹100 Pro / ₹167 Pro+)
 */

interface LogRow {
  tier: string;
  mode: string;
  mode_source: string;
  model: string;
  estimated_cost_inr: number | null;
  latency_ms: number | null;
  fallback_used: string | null;
  user_id: string | null;
  created_at: string;
}

const PRO_EFFECTIVE_MONTHLY_INR = 100;   // ₹1199 / 12 ≈ ₹100
const PRO_PLUS_EFFECTIVE_MONTHLY_INR = 167; // ₹1999 / 12 ≈ ₹167

function percentile(sorted: number[], p: number): number {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export const JeenieCostPanel: React.FC = () => {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<7 | 30>(7);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const since = new Date(Date.now() - range * 86400000).toISOString();
        const { data, error } = await supabase
          .from('ai_request_log')
          .select('tier, mode, mode_source, model, estimated_cost_inr, latency_ms, fallback_used, user_id, created_at')
          .gte('created_at', since)
          .limit(10000);
        if (error) throw error;
        if (!cancelled) setRows((data || []) as LogRow[]);
      } catch (e) {
        logger.error('[JEEnie cost panel] load failed', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [range]);

  if (loading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">JEEnie cost · loading…</CardTitle></CardHeader>
      </Card>
    );
  }

  const totalSpend = rows.reduce((s, r) => s + (r.estimated_cost_inr || 0), 0);
  const totalRequests = rows.length;

  const byTier: Record<string, { count: number; cost: number; users: Set<string> }> = {};
  const byMode: Record<string, { count: number; cost: number }> = {};
  let fallbackCount = 0;
  let scrubCount = 0;
  const latencies: number[] = [];

  rows.forEach((r) => {
    const t = r.tier || 'unknown';
    if (!byTier[t]) byTier[t] = { count: 0, cost: 0, users: new Set() };
    byTier[t].count++;
    byTier[t].cost += r.estimated_cost_inr || 0;
    if (r.user_id) byTier[t].users.add(r.user_id);

    const m = r.mode || 'unknown';
    if (!byMode[m]) byMode[m] = { count: 0, cost: 0 };
    byMode[m].count++;
    byMode[m].cost += r.estimated_cost_inr || 0;

    if (r.fallback_used && !r.fallback_used.includes('tier_scrub')) fallbackCount++;
    if (r.fallback_used && r.fallback_used.includes('tier_scrub')) scrubCount++;
    if (r.latency_ms) latencies.push(r.latency_ms);
  });

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const fallbackRate = totalRequests ? (fallbackCount / totalRequests) * 100 : 0;
  const scrubRate = totalRequests ? (scrubCount / totalRequests) * 100 : 0;

  // Margin tracker: avg cost per active paid user / month, scaled to 30d.
  const scaleTo30d = (cost: number) => (range === 30 ? cost : cost * (30 / range));
  const proUsers = byTier['pro']?.users.size || 0;
  const proPlusUsers = byTier['pro_plus']?.users.size || 0;
  const proCostPerUser = proUsers ? scaleTo30d(byTier['pro'].cost) / proUsers : 0;
  const proPlusCostPerUser = proPlusUsers ? scaleTo30d(byTier['pro_plus'].cost) / proPlusUsers : 0;
  const proMarginPct = PRO_EFFECTIVE_MONTHLY_INR > 0 ? ((PRO_EFFECTIVE_MONTHLY_INR - proCostPerUser) / PRO_EFFECTIVE_MONTHLY_INR) * 100 : 100;
  const proPlusMarginPct = PRO_PLUS_EFFECTIVE_MONTHLY_INR > 0 ? ((PRO_PLUS_EFFECTIVE_MONTHLY_INR - proPlusCostPerUser) / PRO_PLUS_EFFECTIVE_MONTHLY_INR) * 100 : 100;

  const marginBadge = (pct: number) => {
    if (pct >= 80) return <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-200">{pct.toFixed(0)}% margin</Badge>;
    if (pct >= 60) return <Badge className="bg-amber-500/10 text-amber-700 border-amber-200">{pct.toFixed(0)}% margin</Badge>;
    return <Badge className="bg-red-500/10 text-red-700 border-red-200"><TrendingDown className="inline w-3 h-3 mr-1" />{pct.toFixed(0)}% margin</Badge>;
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-primary" /> JEEnie cost · last {range}d
        </CardTitle>
        <div className="flex gap-1 text-xs">
          {[7, 30].map((d) => (
            <button
              key={d}
              onClick={() => setRange(d as 7 | 30)}
              className={`px-2 py-1 rounded-md border ${range === d ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground'}`}
            >{d}d</button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Total spend" value={`₹${totalSpend.toFixed(2)}`} />
          <Stat label="Requests" value={totalRequests.toLocaleString()} />
          <Stat label="p50 latency" value={`${(p50 / 1000).toFixed(1)}s`} />
          <Stat label="p95 latency" value={`${(p95 / 1000).toFixed(1)}s`} />
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Per tier · cost / requests / unique users</div>
          <div className="grid grid-cols-3 gap-2">
            {(['free', 'pro', 'pro_plus'] as const).map((t) => {
              const d = byTier[t];
              return (
                <div key={t} className="rounded-lg border border-border p-2">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{t}</div>
                  <div className="font-bold">₹{(d?.cost || 0).toFixed(2)}</div>
                  <div className="text-[11px] text-muted-foreground">{d?.count || 0} req · {d?.users.size || 0} users</div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Per mode</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(byMode).sort((a, b) => b[1].cost - a[1].cost).map(([m, d]) => (
              <Badge key={m} variant="outline" className="text-[11px]">
                {m}: ₹{d.cost.toFixed(2)} · {d.count}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-1">Margin tracker (scaled to 30d, vs effective yearly pricing)</div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-border p-2">
              <div className="text-[11px] uppercase text-muted-foreground">Pro · vs ₹{PRO_EFFECTIVE_MONTHLY_INR}/mo</div>
              <div className="flex items-center justify-between">
                <span className="font-bold">₹{proCostPerUser.toFixed(2)}</span>
                {proUsers > 0 ? marginBadge(proMarginPct) : <span className="text-[11px] text-muted-foreground">no users</span>}
              </div>
            </div>
            <div className="rounded-lg border border-border p-2">
              <div className="text-[11px] uppercase text-muted-foreground">Pro+ · vs ₹{PRO_PLUS_EFFECTIVE_MONTHLY_INR}/mo</div>
              <div className="flex items-center justify-between">
                <span className="font-bold">₹{proPlusCostPerUser.toFixed(2)}</span>
                {proPlusUsers > 0 ? marginBadge(proPlusMarginPct) : <span className="text-[11px] text-muted-foreground">no users</span>}
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="text-[11px]">
            Fallback rate: {fallbackRate.toFixed(1)}%
          </Badge>
          <Badge
            variant="outline"
            className={`text-[11px] ${scrubRate > 2 ? 'border-red-300 text-red-700 bg-red-50' : ''}`}
          >
            {scrubRate > 2 && <AlertTriangle className="inline w-3 h-3 mr-1" />}
            Tier-scrub rate: {scrubRate.toFixed(2)}%
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border border-border p-2">
    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="font-bold text-lg">{value}</div>
  </div>
);

export default JeenieCostPanel;
