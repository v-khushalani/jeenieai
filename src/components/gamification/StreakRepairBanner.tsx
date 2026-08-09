// One-time-per-break offer: solve 10 questions today and the lost streak comes back.
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Flame } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useXpStatus, emitXpUpdate } from '@/hooks/useXpStatus';
import { logger } from '@/utils/logger';

const StreakRepairBanner: React.FC = () => {
  const navigate = useNavigate();
  const { repairAvailable, repairStreakValue, refresh } = useXpStatus();
  const [busy, setBusy] = useState(false);

  if (!repairAvailable || repairStreakValue <= 0) return null;

  const handleRepair = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc('repair_streak' as never);
      if (error) throw error;
      const d = (data ?? {}) as Record<string, unknown>;
      if (d.success) {
        toast.success(`Streak wapas! ${d.streak} din 🔥`);
        emitXpUpdate();
        await refresh();
      } else if (d.reason === 'not_enough') {
        toast.message(`Abhi ${Number(d.solved ?? 0)}/10 hue. ${10 - Number(d.solved ?? 0)} aur solve karo.`);
        navigate('/practice');
      } else {
        toast.error('Repair available nahi hai.');
      }
    } catch (e) {
      logger.error('repair_streak failed', e);
      toast.error('Kuch galat ho gaya.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto mb-4 flex max-w-3xl flex-col gap-2 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <Flame className="h-5 w-5 shrink-0 text-orange-500" />
        <p className="text-sm text-foreground">
          <span className="font-semibold">{repairStreakValue}-din ka streak toot gaya.</span>{' '}
          Aaj 10 questions solve karo — wapas mil jayega.
        </p>
      </div>
      <Button size="sm" onClick={handleRepair} disabled={busy} className="shrink-0">
        {busy ? 'Check kar rahe…' : 'Streak repair karo'}
      </Button>
    </div>
  );
};

export default StreakRepairBanner;
