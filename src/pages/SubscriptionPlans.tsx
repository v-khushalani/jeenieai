import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlag } from '@/contexts/FeatureFlagContext';
import { REFERRAL_CONFIG } from '@/config/subscriptionPlans';
import { useSubscriptionPlans, DBSubscriptionPlan } from '@/hooks/useSubscriptionPlans';
import { initializePayment } from '@/utils/razorpay';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, Crown, Share2, Gift, Sparkles, Tag, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import Header from '@/components/Header';
import ReferralService from '@/services/referralService';
import { logger } from '@/utils/logger';
import SEOHead from '@/components/SEOHead';
import { toast } from 'sonner';

type Cell = boolean | string;
interface ComparisonRow { feature: string; free: Cell; pro: Cell; proPlus: Cell; }

const COMPARISON: ComparisonRow[] = [
  { feature: 'Daily practice questions', free: '15/day', pro: 'Unlimited', proPlus: 'Unlimited' },
  { feature: 'Mock tests', free: '2/month', pro: 'Unlimited', proPlus: 'Unlimited' },
  { feature: 'AI Doubt Solver', free: false, pro: 'Limited access', proPlus: 'Unlimited access' },
  { feature: 'AI Study Planner', free: false, pro: true, proPlus: 'Adaptive' },
  { feature: 'AI Rank Predictor', free: false, pro: false, proPlus: true },
  { feature: 'Performance analytics', free: 'Basic', pro: 'Advanced', proPlus: 'AI-powered' },
  { feature: 'Educator PPTs', free: false, pro: false, proPlus: true },
  { feature: 'Interactive Animations', free: false, pro: false, proPlus: true },
  { feature: 'Leaderboard & badges', free: true, pro: true, proPlus: true },
  { feature: 'Create group tests', free: '2/month', pro: 'Unlimited', proPlus: 'Unlimited' },
];

interface PerPlanResult {
  valid: boolean;
  discount_type?: string;
  discount_value?: number;
  discount_applied?: number;
  original_price?: number;
  final_price?: number;
  reason?: string;
}
interface PromoState {
  code: string;
  applied: null | {
    code: string;
    results: Record<string, PerPlanResult>; // planId -> result
    summary: { discount_type: string; discount_value: number };
  };
  error: string | null;
  loading: boolean;
}

const SubscriptionPlansPage = () => {
  const { user } = useAuth();
  const referralEnabled = useFeatureFlag('referral_system');
  const navigate = useNavigate();
  const { data: plans = [], isLoading } = useSubscriptionPlans();
  const [loading, setLoading] = useState<string | null>(null);
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('yearly');
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoState>({ code: '', applied: null, error: null, loading: false });

  const proPlan = useMemo(() => plans.find(p => p.tier === 'pro' && (billing === 'yearly' ? p.duration_days >= 365 : p.duration_days < 365)), [plans, billing]);
  const proPlusPlan = useMemo(() => plans.find(p => p.tier === 'pro_plus' && (billing === 'yearly' ? p.duration_days >= 365 : p.duration_days < 365)), [plans, billing]);

  const handleApplyPromo = async () => {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    if (!user) {
      navigate('/login?redirect=/subscription-plans');
      return;
    }
    if (plans.length === 0) return;
    setPromo(p => ({ ...p, loading: true, error: null }));
    try {
      // Validate against every visible plan so a code restricted to one tier still applies on its card
      const validations = await Promise.all(
        plans.map(async (pl) => {
          const { data, error } = await supabase.functions.invoke('validate-promo-code', {
            body: { code, planId: pl.id },
          });
          if (error) return [pl.id, { valid: false, reason: error.message }] as const;
          return [pl.id, data as PerPlanResult] as const;
        })
      );
      const results: Record<string, PerPlanResult> = {};
      let anyValid: PerPlanResult | null = null;
      let lastReason = 'Invalid code';
      for (const [pid, res] of validations) {
        results[pid] = res;
        if (res?.valid && !anyValid) anyValid = res;
        if (res?.reason) lastReason = res.reason;
      }
      if (!anyValid) {
        setPromo({ code: '', applied: null, error: lastReason, loading: false });
        return;
      }
      setPromo({
        code,
        applied: {
          code,
          results,
          summary: {
            discount_type: anyValid.discount_type || 'percent',
            discount_value: Number(anyValid.discount_value || 0),
          },
        },
        error: null,
        loading: false,
      });
      toast.success(`🎉 ${code} applied!`);
    } catch (e: any) {
      setPromo({ code: '', applied: null, error: e?.message || 'Failed to apply', loading: false });
    }
  };

  const clearPromo = () => {
    setPromo({ code: '', applied: null, error: null, loading: false });
    setPromoInput('');
  };

  const computeFinal = (plan: DBSubscriptionPlan): { price: number; discount: number } => {
    const base = Number(plan.price);
    const r = promo.applied?.results[plan.id];
    if (!r?.valid) return { price: base, discount: 0 };
    const discount = Number(r.discount_applied || 0);
    const final = r.final_price != null ? Number(r.final_price) : Math.max(base - discount, 1);
    return { price: final, discount };
  };

  const handleSelectPlan = async (planId: string) => {
    if (!user) {
      navigate('/login?redirect=/subscription-plans');
      return;
    }
    try {
      setLoading(planId);
      await initializePayment(
        planId,
        user.id,
        user.email || '',
        user.user_metadata?.name || 'Student',
        promo.applied?.code,
      );
    } catch (error: any) {
      logger.error('Payment error:', error);
      toast.error(typeof error?.message === 'string' ? error.message : 'Failed to initiate payment.');
    } finally {
      setLoading(null);
    }
  };

  const handleWhatsAppShare = () => {
    if (!user) { navigate('/login?redirect=/subscription-plans'); return; }
    const referralCode = ReferralService.generateReferralCode(user.id);
    const referralLink = `${window.location.origin}/signup?ref=${referralCode}`;
    const message = `🎯 Hey! I'm using *JEEnie* for JEE/NEET prep — it's a game changer! 🚀\n\n✨ Use my code: *${referralCode}*\n📚 Sign up: ${referralLink}\n\n🎁 You + me both get 1 week FREE Pro!`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const renderCell = (val: Cell) => {
    if (typeof val === 'boolean') {
      return val
        ? <Check className="w-4 h-4 text-green-500 mx-auto" />
        : <X className="w-4 h-4 text-muted-foreground/40 mx-auto" />;
    }
    return <span className="text-xs sm:text-sm text-foreground">{val}</span>;
  };

  const renderPlanCard = (plan: DBSubscriptionPlan | undefined, opts: { highlight?: boolean; ctaLabel: string; outline?: boolean; tier?: 'pro' | 'pro_plus' }) => {
    if (!plan) return (
      <div className="rounded-2xl border border-border bg-card p-6 animate-pulse h-64" />
    );
    const { price, discount } = computeFinal(plan);
    const mrp = plan.mrp_price ? Number(plan.mrp_price) : null;
    const monthly = plan.duration_days >= 365 ? Math.round(price / 12) : null;
    return (
      <div className={`rounded-2xl ${opts.highlight ? 'border-2 border-primary shadow-lg' : 'border border-border'} bg-card p-6 relative`}>
        {opts.highlight && (
          <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground">
            Most Popular
          </Badge>
        )}
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-foreground">{plan.name}</h2>
          {opts.tier === 'pro_plus' && <Crown className="w-4 h-4 text-amber-500" />}
        </div>
        {plan.tagline && (
          <p className="text-xs italic text-primary/80 font-medium mt-1 mb-4 min-h-[16px]">
            ✨ {plan.tagline}
          </p>
        )}

        {mrp && mrp > price && (
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-muted-foreground line-through">₹{mrp}</span>
            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 bg-green-500/10 text-green-700 border-0">
              {Math.round((1 - price / mrp) * 100)}% OFF
            </Badge>
          </div>
        )}
        <div className="flex items-baseline gap-1 mb-1">
          <span className={`text-4xl font-bold ${opts.highlight ? 'text-primary' : 'text-foreground'}`}>₹{price}</span>
          <span className="text-sm text-muted-foreground">/{plan.duration_days >= 365 ? 'yr' : 'mo'}</span>
        </div>
        {discount > 0 && mrp && (
          <div className="text-xs font-semibold text-green-600 mb-1">
            Total savings: ₹{mrp - price} (incl. {promo.applied?.code})
          </div>
        )}
        {discount > 0 && !mrp && (
          <div className="text-xs font-semibold text-green-600 mb-1">You save ₹{discount} with {promo.applied?.code}</div>
        )}
        {monthly && <p className="text-xs text-muted-foreground mb-4">≈ ₹{monthly}/month</p>}
        {!monthly && <div className="mb-4" />}

        <ul className="space-y-1.5 mb-5 min-h-[120px]">
          {plan.features.slice(0, 6).map((f, i) => (
            <li key={i} className="text-xs text-foreground flex items-start gap-1.5">
              <Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> <span>{f}</span>
            </li>
          ))}
        </ul>

        <Button
          onClick={() => handleSelectPlan(plan.id)}
          disabled={loading === plan.id}
          variant={opts.outline ? 'outline' : 'default'}
          className="w-full h-10 text-sm font-semibold"
        >
          {loading === plan.id ? 'Processing…' : opts.ctaLabel}
        </Button>
      </div>
    );
  };

  return (
    <div className="mobile-app-shell bg-background">
      <SEOHead
        title="Subscription Plans"
        description="JEEnie AI premium plans and pricing — compare Free, Pro, and Pro+."
        canonical="https://www.jeenie.website/subscription-plans"
        noIndex
      />
      <Header />
      <div className="mobile-app-shell-content px-4 sm:px-6">
        <div className="w-full max-w-5xl py-8 mx-auto">
          {/* Hero */}
          <div className="text-center mb-8">
            <Badge className="bg-primary/10 text-primary border-primary/20 mb-3 font-medium">
              <Sparkles className="w-3 h-3 mr-1" /> Limited launch pricing
            </Badge>
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">
              Pick your JEEnie plan
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
              Got a promo code? Apply it below for an extra discount. Cancel anytime.
            </p>
          </div>

          {/* Promo input */}
          <div className="max-w-md mx-auto mb-6">
            {promo.applied ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-green-500/30 bg-green-500/5 px-3 py-2">
                <div className="flex items-center gap-2 text-sm">
                  <Tag className="w-4 h-4 text-green-600" />
                  <span className="font-semibold text-foreground">{promo.applied.code}</span>
                  <span className="text-xs text-muted-foreground">
                    {promo.applied.summary.discount_type === 'percent'
                      ? `${promo.applied.summary.discount_value}% off`
                      : `₹${promo.applied.summary.discount_value} off`}
                  </span>
                </div>
                <Button size="sm" variant="ghost" onClick={clearPromo} className="h-7 text-xs">Remove</Button>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter promo code (e.g. FOUNDER50)"
                    value={promoInput}
                    onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
                    className="h-10 text-sm uppercase"
                    maxLength={32}
                  />
                  <Button onClick={handleApplyPromo} disabled={promo.loading || !promoInput.trim()} className="h-10">
                    {promo.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply'}
                  </Button>
                </div>
                {promo.error && <p className="text-xs text-destructive">{promo.error}</p>}
              </div>
            )}
          </div>

          {/* Billing toggle */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center bg-muted/50 rounded-lg p-1 border border-border">
              <button
                onClick={() => setBilling('monthly')}
                className={`px-5 py-2 text-sm font-semibold rounded-md transition-all ${
                  billing === 'monthly' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling('yearly')}
                className={`px-5 py-2 text-sm font-semibold rounded-md transition-all flex items-center gap-2 ${
                  billing === 'yearly' ? 'bg-background text-foreground shadow-xs' : 'text-muted-foreground'
                }`}
              >
                Yearly
                <span className="text-[10px] font-bold text-green-600 bg-green-500/10 px-1.5 py-0.5 rounded">SAVE 40%</span>
              </button>
            </div>
          </div>

          {/* 3 plan cards */}
          {isLoading ? (
            <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
              {/* Free */}
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-foreground">Free</h2>
                <p className="text-xs text-muted-foreground mt-1 mb-4">Try JEEnie before upgrading.</p>
                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-4xl font-bold text-foreground">₹0</span>
                  <span className="text-sm text-muted-foreground">forever</span>
                </div>
                <ul className="space-y-1.5 mb-5 min-h-[120px]">
                  <li className="text-xs text-foreground flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> 15 questions/day</li>
                  <li className="text-xs text-foreground flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> 2 mock tests/month</li>
                  <li className="text-xs text-foreground flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> Leaderboard & badges</li>
                  <li className="text-xs text-foreground flex items-start gap-1.5"><Check className="w-3.5 h-3.5 text-green-500 shrink-0 mt-0.5" /> Basic analytics</li>
                </ul>
                <Button variant="outline" onClick={() => navigate('/dashboard')} className="w-full h-10 text-sm font-semibold">
                  Continue Free
                </Button>
              </div>
              {renderPlanCard(proPlan, { highlight: true, ctaLabel: 'Choose Pro' })}
              {renderPlanCard(proPlusPlan, { outline: true, ctaLabel: 'Choose Pro+', tier: 'pro_plus' })}
            </div>
          )}

          {/* Comparison table */}
          <div className="rounded-2xl border border-border bg-card overflow-hidden mb-8">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-base font-semibold text-foreground">Compare features</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Everything you get on each plan.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-muted/30 border-b border-border">
                    <th className="text-left text-xs font-semibold text-muted-foreground px-4 py-3 min-w-[180px]">Feature</th>
                    <th className="text-center text-xs font-semibold text-muted-foreground px-4 py-3 w-[20%]">Free</th>
                    <th className="text-center text-xs font-semibold text-primary px-4 py-3 w-[20%]">Pro</th>
                    <th className="text-center text-xs font-semibold text-foreground px-4 py-3 w-[20%]">
                      <span className="inline-flex items-center gap-1">Pro+ <Crown className="w-3 h-3 text-amber-500" /></span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARISON.map((row, idx) => (
                    <tr key={idx} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-3 text-sm text-foreground">{row.feature}</td>
                      <td className="px-4 py-3 text-center">{renderCell(row.free)}</td>
                      <td className="px-4 py-3 text-center bg-primary/5">{renderCell(row.pro)}</td>
                      <td className="px-4 py-3 text-center">{renderCell(row.proPlus)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {referralEnabled && (
            <div className="rounded-2xl border border-green-500/20 bg-linear-to-r from-green-500/5 to-emerald-500/5 p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500/15 flex items-center justify-center shrink-0">
                  <Gift className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Refer & get 1 week Pro free</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Per friend who signs up · max {REFERRAL_CONFIG.maxRewards} rewards
                  </p>
                </div>
              </div>
              <Button onClick={handleWhatsAppShare} className="bg-green-600 hover:bg-green-700 text-white h-9 text-sm font-semibold w-full sm:w-auto">
                <Share2 className="w-3.5 h-3.5 mr-2" /> Share on WhatsApp
              </Button>
            </div>
          )}

          <p className="text-center text-xs text-muted-foreground mt-6">
            All prices in INR · GST included · Secure payments by Razorpay
          </p>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionPlansPage;
