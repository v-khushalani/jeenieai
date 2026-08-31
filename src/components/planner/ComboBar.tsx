/**
 * ComboBar — live correct-answer combo (x1 → x5). Resets on a wrong answer.
 * Read-only: derived from today's most recent non-test attempts.
 */
import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

const MAX_COMBO = 5;

export function useCombo() {
  const { user } = useAuth();
  const [combo, setCombo] = useState(0);

  const refresh = useCallback(async () => {
    if (!user?.id) return;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('question_attempts')
      .select('is_correct, mode, attempted_at')
      .eq('user_id', user.id)
      .neq('mode', 'test')
      .gte('attempted_at', since)
      .order('attempted_at', { ascending: false })
      .limit(20);

    let streak = 0;
    for (const row of (data ?? []) as Array<{ is_correct: boolean | null }>) {
      if (row.is_correct) streak += 1;
      else break;
    }
    setCombo(Math.min(streak, MAX_COMBO));
  }, [user?.id]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { combo, refreshCombo: refresh };
}

export default function ComboBar({ combo }: { combo: number }) {
  const pct = (Math.min(combo, MAX_COMBO) / MAX_COMBO) * 100;
  const hot = combo >= 3;

  return (
    <div className="flex items-center gap-2" data-testid="combo-bar">
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-black tabular-nums ${
          hot ? 'text-orange-600' : 'text-muted-foreground'
        }`}
      >
        <Flame className={`w-3.5 h-3.5 ${hot ? 'animate-pulse' : ''}`} />×{Math.max(1, combo)}
      </span>
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${hot ? 'bg-orange-500' : 'bg-primary'}`}
          animate={{ width: `${pct}%` }}
          transition={{ type: 'spring', stiffness: 200, damping: 24 }}
        />
      </div>
      <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground shrink-0">
        {combo >= MAX_COMBO ? 'On fire' : combo === 0 ? 'Combo' : 'Combo live'}
      </span>
    </div>
  );
}
