export type SubscriptionTier = 'free' | 'pro' | 'pro_plus';

export interface SubscriptionProfileFields {
  is_premium?: boolean | null;
  subscription_end_date?: string | null;
  subscription_plan?: string | null;
  subscription_status?: string | null;
  subscription_tier?: string | null;
}

const ACTIVE_STATUSES = new Set(['active', 'trialing', 'paid', 'completed', 'verified']);

export function isSubscriptionActive(profile?: SubscriptionProfileFields | null): boolean {
  if (!profile) return false;

  const status = String(profile.subscription_status || '').trim().toLowerCase();
  if (ACTIVE_STATUSES.has(status)) return true;

  if (profile.subscription_end_date) {
    const endDate = new Date(profile.subscription_end_date);
    if (!Number.isNaN(endDate.getTime()) && endDate > new Date()) {
      return true;
    }
  }

  const tier = String(profile.subscription_tier || '').trim().toLowerCase();
  const plan = String(profile.subscription_plan || '').trim().toLowerCase();
  if (tier === 'pro' || tier === 'pro_plus' || plan.includes('pro')) return true;

  return profile.is_premium === true;
}

export function resolveSubscriptionTier(profile?: SubscriptionProfileFields | null): SubscriptionTier {
  if (!isSubscriptionActive(profile)) return 'free';

  const tier = String(profile?.subscription_tier || '').trim().toLowerCase();
  const plan = String(profile?.subscription_plan || '').trim().toLowerCase();

  if (tier === 'pro_plus' || plan.includes('pro_plus')) return 'pro_plus';
  if (tier === 'pro' || plan.includes('pro')) return 'pro';

  if (profile?.is_premium === true) return 'pro';

  return 'pro';
}

export function buildSubscriptionPatch(input: {
  active: boolean;
  tier?: SubscriptionTier;
  planId?: string | null;
  expiresAt?: string | null;
}): SubscriptionProfileFields {
  if (!input.active) {
    return {
      is_premium: false,
      subscription_end_date: null,
      subscription_plan: null,
      subscription_status: 'inactive',
      subscription_tier: 'free',
    };
  }

  const tier = input.tier || 'pro';
  // prefer explicit planId from caller; caller should resolve canonical plan ids from DB
  const resolvedPlanId = input.planId ?? null;

  return {
    is_premium: true,
    subscription_end_date: input.expiresAt ?? null,
    subscription_plan: resolvedPlanId,
    subscription_status: 'active',
    subscription_tier: tier,
  };
}
