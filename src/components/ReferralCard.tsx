import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Gift, Copy, Check, Share2, Crown, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import ReferralService from "@/services/referralService";
import { toast } from "sonner";
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';

const ReferralCard = () => {
  const { user } = useAuth();
  const referralEnabled = useFeatureFlag('referral_system');
  const [stats, setStats] = useState<Awaited<ReturnType<typeof ReferralService.getReferralStats>> | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!referralEnabled || !user?.id) {
      return;
    }
    if (user?.id) {
      ReferralService.getReferralStats(user.id).then(setStats);
    }
  }, [referralEnabled, user?.id]);

  const handleCopy = async () => {
    if (!stats) return;
    try {
      await navigator.clipboard.writeText(stats.referralLink);
      setCopied(true);
      toast.success("Referral link copied! 🎉");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
  };

  const handleShare = async () => {
    if (!stats) return;
    const text = "Mere referral se JEEnie join kar — Pro/Pro+ lega toh mujhe bhi 30 din FREE Pro/Pro+ milega! 🚀";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join JEEnie — AI for JEE/NEET", text, url: stats.referralLink });
      } catch { /* cancelled */ }
    } else {
      handleCopy();
    }
  };

  if (!referralEnabled) return null;
  if (!stats) return null;

  return (
    <Card className="rounded-xl shadow-xs border border-amber-200 bg-linear-to-br from-amber-50/80 via-orange-50/60 to-yellow-50/80">
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 bg-linear-to-r from-amber-500 to-orange-500 rounded-lg shrink-0">
            <Gift className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-amber-900">Refer & Earn Pro/Pro+ 👑</h3>
            <p className="text-[11px] text-amber-700/80 leading-snug">
              Friend Pro lega → tu 30 din Pro FREE. Pro+ lega → tu 30 din Pro+ FREE.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-white/60 rounded-lg">
            <div className="text-lg font-bold text-amber-700">{stats.completedReferrals}</div>
            <div className="text-[10px] text-amber-600">Joined</div>
          </div>
          <div className="text-center p-2 bg-white/60 rounded-lg flex flex-col items-center">
            <div className="text-lg font-bold text-amber-700 flex items-center gap-0.5">
              <Sparkles className="h-3 w-3" />{stats.proRewards}
            </div>
            <div className="text-[10px] text-amber-600">Pro mo.</div>
          </div>
          <div className="text-center p-2 bg-white/60 rounded-lg flex flex-col items-center">
            <div className="text-lg font-bold text-amber-700 flex items-center gap-0.5">
              <Crown className="h-3 w-3" />{stats.proPlusRewards}
            </div>
            <div className="text-[10px] text-amber-600">Pro+ mo.</div>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-3 bg-white/70 rounded-lg p-2 border border-amber-200">
          <code className="flex-1 text-xs font-mono font-bold text-amber-800 truncate">
            {stats.referralCode}
          </code>
          <Button variant="ghost" size="sm" onClick={handleCopy} className="h-7 px-2 text-amber-700 hover:bg-amber-100">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          </Button>
        </div>

        <Button
          onClick={handleShare}
          className="w-full bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-semibold h-9"
        >
          <Share2 className="h-3.5 w-3.5 mr-1.5" />
          Share & Earn Pro/Pro+
        </Button>
      </CardContent>
    </Card>
  );
};

export default ReferralCard;
