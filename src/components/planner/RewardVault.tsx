/**
 * RewardVault — daily vault card. Unlocks only when today's full mission
 * chain is complete. Rewards are virtual: JEEnie Points, Streak Freeze, Titles.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { Gift, Lock, Snowflake, Crown, Coins } from 'lucide-react';

interface VaultReward {
  reward_type: string;
  rarity: string;
  points: number;
  payload?: { label?: string; code?: string | null };
}

const RARITY_STYLE: Record<string, string> = {
  common: 'from-slate-500/20 to-slate-500/5 border-slate-400/40 text-slate-600',
  rare: 'from-blue-500/20 to-blue-500/5 border-blue-400/50 text-blue-600',
  epic: 'from-violet-500/20 to-violet-500/5 border-violet-400/50 text-violet-600',
  legendary: 'from-amber-500/25 to-amber-500/5 border-amber-400/60 text-amber-600',
};

function RewardIcon({ type }: { type: string }) {
  if (type === 'streak_freeze') return <Snowflake className="w-7 h-7" />;
  if (type === 'title') return <Crown className="w-7 h-7" />;
  return <Coins className="w-7 h-7" />;
}

export default function RewardVault({ unlocked }: { unlocked: boolean }) {
  const { user } = useAuth();
  const [reward, setReward] = useState<VaultReward | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [flipped, setFlipped] = useState(false);

  const loadExisting = useCallback(async () => {
    if (!user?.id) return;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { data } = await supabase
      .from('reward_vault_claims' as any)
      .select('reward_type, rarity, points_awarded, payload')
      .eq('user_id', user.id)
      .eq('claim_date', today)
      .maybeSingle();
    if (data) {
      const d = data as any;
      setReward({ reward_type: d.reward_type, rarity: d.rarity, points: d.points_awarded, payload: d.payload });
      setFlipped(true);
    }
  }, [user?.id]);

  useEffect(() => { void loadExisting(); }, [loadExisting]);

  const claim = async () => {
    setClaiming(true);
    const { data, error } = await (supabase as any).rpc('claim_daily_vault');
    setClaiming(false);
    if (error || !data?.ok) {
      toast.error(data?.error === 'chain_incomplete' ? 'Pehle poori chain complete karo' : 'Vault abhi nahi khula');
      return;
    }
    setReward({ reward_type: data.reward_type, rarity: data.rarity, points: data.points, payload: data.payload });
    setFlipped(true);
    toast.success(`${data.rarity.toUpperCase()} reward unlocked! 🎁`);
  };

  const style = RARITY_STYLE[reward?.rarity ?? 'common'];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      data-testid="reward-vault"
      className={`relative rounded-2xl border-2 p-4 bg-gradient-to-br ${
        flipped ? style : unlocked
          ? 'from-amber-500/20 to-amber-500/5 border-amber-400/60'
          : 'from-muted/60 to-muted/20 border-border/60'
      }`}
    >
      {flipped && reward ? (
        <motion.div
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 140, damping: 14 }}
          className="flex items-center gap-3"
        >
          <div className="shrink-0"><RewardIcon type={reward.reward_type} /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">{reward.rarity} reward</p>
            <p className="text-sm font-black truncate">{reward.payload?.label ?? `+${reward.points} JEEnie Points`}</p>
            {reward.reward_type !== 'points' && reward.points > 0 && (
              <p className="text-[10px] font-bold opacity-70">+{reward.points} JEEnie Points bhi mile</p>
            )}
          </div>
        </motion.div>
      ) : (
        <div className="flex items-center gap-3">
          <motion.div
            animate={unlocked ? { rotate: [0, -8, 8, -8, 0] } : {}}
            transition={{ repeat: Infinity, duration: 2.2 }}
            className={unlocked ? 'text-amber-600' : 'text-muted-foreground'}
          >
            {unlocked ? <Gift className="w-8 h-8" /> : <Lock className="w-7 h-7" />}
          </motion.div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-tight">Aaj ka Vault</p>
            <p className="text-[11px] text-muted-foreground font-semibold leading-snug">
              {unlocked ? 'Chain complete! Vault khol le.' : 'Poori chain complete karo — tabhi khulega.'}
            </p>
          </div>
          <Button data-testid="vault-open" size="sm" disabled={!unlocked || claiming} onClick={() => void claim()} className="shrink-0">
            {claiming ? 'Khul raha…' : 'Open'}
          </Button>
        </div>
      )}
    </motion.div>
  );
}
