/**
 * ReferralCard — user's referral code + WhatsApp share deep-link.
 * Uses the auto-generated `profiles.referral_code`. Falls back to a fetch if empty.
 */
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Gift, Copy, Check, Share2 } from 'lucide-react';
import { toast } from 'sonner';

interface Props { onTrackPercentile?: number; streakDays?: number; }

const APP_URL = (typeof window !== 'undefined' ? window.location.origin : 'https://jeenieai.lovable.app');

export default function ReferralCard({ onTrackPercentile, streakDays }: Props) {
  const { user } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase.from('profiles').select('referral_code').eq('id', user.id).maybeSingle();
    setCode(data?.referral_code ?? null);
  }, [user?.id]);

  useEffect(() => { void load(); }, [load]);

  if (!code) return null;

  const link = `${APP_URL}/?ref=${code}`;
  const message = [
    `Yaar, JEE/NEET prep ke liye ek AI coach mila — *JEEnie Bhai*.`,
    onTrackPercentile ? `Mera predicted percentile: *${onTrackPercentile}* 🎯` : null,
    streakDays && streakDays >= 3 ? `${streakDays}-day streak chal rahi hai 🔥` : null,
    ``,
    `Roz decide karta hai kya padhna hai — kaafi solid hai.`,
    `Try karo: ${link}`,
    ``,
    `(Sign up karte time mera code use karo: *${code}*)`,
  ].filter(Boolean).join('\n');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      toast.success('Link copy ho gaya');
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error('Copy nahi ho paya'); }
  };

  const share = async () => {
    const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void> };
    if (nav.share) {
      try {
        await nav.share({ title: 'JEEnie Bhai', text: message, url: link });
        return;
      } catch { /* fallthrough to whatsapp */ }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="rounded-xl border border-primary/25 bg-gradient-to-br from-primary/8 via-transparent to-transparent p-3.5 space-y-3">
      <div className="flex items-start gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
          <Gift className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">Invite a friend, get 1 month Pro</p>
          <p className="text-[11px] text-muted-foreground leading-snug">
            Jab woh sign up kare tumhare code se — dono ko free Pro milega.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-background/70">
        <span className="text-xs font-mono font-bold tracking-widest tabular-nums flex-1 truncate">{code}</span>
        <button
          onClick={copy}
          className="text-[11px] font-semibold text-primary hover:underline flex items-center gap-1"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <Button onClick={share} size="sm" className="w-full h-9">
        <Share2 className="w-3.5 h-3.5 mr-1.5" />
        Share on WhatsApp
      </Button>
    </div>
  );
}
