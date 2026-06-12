// src/services/referralService.ts
// Referral now grants reward to referrer ONLY when the referred user PURCHASES
// a paid plan (Pro or Pro+). Reward tier MATCHES the purchased tier.
// The actual reward grant happens server-side inside the verify-payment edge fn.
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/utils/logger';

const REFERRAL_MAX_REWARDS = 10; // cap per referrer

export class ReferralService {
  static generateReferralCode(userId: string): string {
    return `JEE${userId.slice(0, 8).toUpperCase()}`;
  }

  static getReferralLink(userId: string): string {
    const code = this.generateReferralCode(userId);
    return `${window.location.origin}/signup?ref=${code}`;
  }

  /**
   * Called right after a new user signs up.
   * Just records the pending referral — NO reward is granted until the
   * referred user purchases a Pro or Pro+ plan (handled in verify-payment).
   */
  static async processReferralOnSignup(newUserId: string, referralCode: string): Promise<boolean> {
    if (!referralCode) return false;
    try {
      const { data: referrerProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('referral_code', referralCode.toUpperCase())
        .maybeSingle();

      if (!referrerProfile) {
        logger.info('Referral code not found:', referralCode);
        return false;
      }
      if (referrerProfile.id === newUserId) return false;

      const { data: existing } = await supabase
        .from('referrals')
        .select('id')
        .eq('referrer_id', referrerProfile.id)
        .eq('referred_id', newUserId)
        .maybeSingle();
      if (existing) return false;

      const { data: rpcResult, error: rpcErr } = await supabase
        .rpc('create_referral', { p_referral_code: referralCode.toUpperCase() });
      const result = rpcResult as Record<string, unknown> | null;
      if (rpcErr || !result?.success) {
        logger.error('Failed to create referral:', rpcErr || result?.error);
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Error processing referral on signup:', error);
      return false;
    }
  }

  static async getReferralStats(userId: string): Promise<{
    totalReferrals: number;
    completedReferrals: number;
    pendingReferrals: number;
    rewardsEarned: number;
    proRewards: number;
    proPlusRewards: number;
    referralCode: string;
    referralLink: string;
    maxRewards: number;
  }> {
    const { data: referrals } = await supabase
      .from('referrals_safe')
      .select('*')
      .eq('referrer_id', userId);


    const list = referrals || [];
    const completed = list.filter(r => r.status === 'completed');
    const pending = list.filter(r => r.status === 'pending');
    const rewarded = list.filter(r => r.reward_granted);

    // Tier breakdown read from referrals.status string ("completed_pro" | "completed_pro_plus")
    const proRewards = list.filter(r => r.status === 'completed_pro').length;
    const proPlusRewards = list.filter(r => r.status === 'completed_pro_plus').length;

    return {
      totalReferrals: list.length,
      completedReferrals: completed.length + proRewards + proPlusRewards,
      pendingReferrals: pending.length,
      rewardsEarned: rewarded.length,
      proRewards,
      proPlusRewards,
      referralCode: this.generateReferralCode(userId),
      referralLink: this.getReferralLink(userId),
      maxRewards: REFERRAL_MAX_REWARDS,
    };
  }
}

export default ReferralService;
