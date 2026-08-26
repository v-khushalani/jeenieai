/**
 * ContractStrip — weekly "Rank Contract".
 * Student signs a target (questions + accuracy). Strip shows ahead/behind
 * pacing and days left. Reward on completion = JEEnie Points (server-side).
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { CalendarClock, PenLine, Target, TrendingDown, TrendingUp } from 'lucide-react';

export interface ContractStatus {
  id: string;
  target_questions: number;
  target_accuracy: number;
  reward_points: number;
  starts_on: string;
  ends_on: string;
  status: string;
  attempted: number;
  accuracy: number;
  expected_by_now: number;
  days_left: number;
}

const PRESETS = [
  { label: 'Chill', questions: 100, accuracy: 55, days: 7, note: '~15 Q/day' },
  { label: 'Serious', questions: 210, accuracy: 65, days: 7, note: '~30 Q/day' },
  { label: 'Beast', questions: 350, accuracy: 75, days: 7, note: '~50 Q/day' },
];

export default function ContractStrip() {
  const [contract, setContract] = useState<ContractStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [signing, setSigning] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await (supabase as any).rpc('get_contract_status');
    if (!error && data?.ok) setContract((data.contract as ContractStatus) ?? null);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const sign = async (p: typeof PRESETS[number]) => {
    setSigning(p.label);
    const { data, error } = await (supabase as any).rpc('sign_contract', {
      p_target_questions: p.questions,
      p_target_accuracy: p.accuracy,
      p_days: p.days,
    });
    setSigning(null);
    if (error || !data?.ok) {
      toast.error('Contract sign nahi hua — dobara try karo');
      return;
    }
    toast.success(`${p.label} contract signed. Ab peeche mat hatna 🤝`);
    void load();
  };

  if (loading) return null;

  if (!contract) {
    return (
      <div data-testid="contract-sign" className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <PenLine className="w-4 h-4 text-primary" />
          <p className="text-sm font-black uppercase tracking-tight">Apna contract sign karo</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">
          7 din ka target choose karo. Poora kiya toh bada points bonus, adhoora chhoda toh dobara sign karna padega.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => void sign(p)}
              disabled={!!signing}
              className="rounded-xl border-2 border-border bg-card p-2.5 text-left transition hover:border-primary hover:bg-primary/5 disabled:opacity-60"
            >
              <p className="text-xs font-black uppercase tracking-tight">{p.label}</p>
              <p className="text-[10px] text-muted-foreground font-semibold">{p.questions} Q · {p.accuracy}%</p>
              <p className="text-[10px] text-primary font-bold mt-0.5">{p.note}</p>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((contract.attempted / Math.max(1, contract.target_questions)) * 100));
  const delta = contract.attempted - contract.expected_by_now;
  const ahead = delta >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="contract-strip"
      className="rounded-2xl border-2 border-border/60 bg-card p-3 space-y-2"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <Target className="w-3.5 h-3.5 text-primary shrink-0" />
          <p className="text-[11px] font-black uppercase tracking-tight truncate">
            Contract · {contract.target_questions} Q @ {contract.target_accuracy}%
          </p>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted-foreground shrink-0">
          <CalendarClock className="w-3 h-3" />{contract.days_left}d left
        </span>
      </div>

      <Progress value={pct} className="h-2" />

      <div className="flex items-center justify-between text-[10px] font-bold">
        <span className="tabular-nums text-muted-foreground">
          {contract.attempted}/{contract.target_questions} Q · {contract.accuracy}% acc
        </span>
        <span className={`inline-flex items-center gap-1 ${ahead ? 'text-emerald-600' : 'text-rose-600'}`}>
          {ahead ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {ahead ? `${delta} ahead` : `${Math.abs(delta)} behind`}
        </span>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Complete karoge toh <span className="font-black text-amber-600">+{contract.reward_points} JEEnie Points</span>.
      </p>
    </motion.div>
  );
}
