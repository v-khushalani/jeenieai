import { useState, useEffect } from 'react';
import { X, Crown, Check, Zap, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FREE_LIMITS } from '@/config/subscriptionPlans';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';

type LimitType = 'daily_limit' | 'daily_limit_reached' | 'test_limit' | 'ai_doubt_locked' | 'study_planner_blocked' | 'almost_there';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  limitType?: LimitType;
  userStats?: Record<string, unknown>;
  /** When set to 'pro_plus', the modal upsells Pro+ instead of Pro. Used when a
   *  Pro user clicks a Pro+-only feature so we don't tell them to "upgrade to Pro". */
  requiredTier?: 'pro' | 'pro_plus';
}

const PricingModal: React.FC<PricingModalProps> = ({
  isOpen,
  onClose,
  limitType = 'daily_limit',
  requiredTier = 'pro',
}) => {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const limitMessages = {
    daily_limit: {
      badge: "JEEnie Pro",
      title: "Choose a plan",
      subtitle: "Compare plans and choose what fits your preparation."
    },
    daily_limit_reached: {
      badge: "Daily practice",
      title: "Choose a plan",
      subtitle: "Paid plans include unlimited question practice."
    },
    test_limit: {
      badge: "Mock tests",
      title: "Choose a plan",
      subtitle: "Paid plans include unlimited mock tests."
    },
    ai_doubt_locked: {
      badge: "JEEnie AI",
      title: "Unlock JEEnie AI",
      subtitle: "Get a higher daily AI doubt allowance."
    },
    study_planner_blocked: {
      badge: "Study Planner",
      title: "Unlock Study Planner",
      subtitle: "Available with JEEnie Pro and Pro+."
    },
    almost_there: {
      badge: "Plan options",
      title: "Compare plans",
      subtitle: "See the limits and features included in each plan."
    }
  };

  const isProPlusUpsell = requiredTier === 'pro_plus';
  const message = isProPlusUpsell
    ? {
        badge: 'JEEnie Pro+',
        title: 'Unlock with JEEnie Pro+',
        subtitle: 'Pro+ adds extended PYQs, Smart Notes and higher AI limits.',
      }
    : (limitMessages[limitType] || limitMessages.daily_limit);

  const { data: plans } = useSubscriptionPlans();
  const targetTier = isProPlusUpsell ? 'pro_plus' : 'pro';

  const monthlyPlan = plans?.find((p) => p.duration_days < 365 && p.tier === targetTier);
  const yearlyPlan = plans?.find((p) => p.duration_days >= 365 && p.tier === targetTier);

  type DisplayPrice = {
    price: number;
    originalPrice?: number;
    savings?: number;
  };

  const defaultPricing: Record<'monthly' | 'yearly', DisplayPrice> = isProPlusUpsell
    ? {
        monthly: { price: 249 },
        yearly: { price: 1999 },
      }
    : {
        monthly: { price: 99 },
        yearly: { price: 499 },
      };

  const pricing: Record<'monthly' | 'yearly', DisplayPrice> = {
    monthly: monthlyPlan
      ? {
          price: monthlyPlan.price,
          originalPrice: monthlyPlan.mrp_price && monthlyPlan.mrp_price > monthlyPlan.price
            ? monthlyPlan.mrp_price
            : undefined,
          savings: monthlyPlan.mrp_price && monthlyPlan.mrp_price > monthlyPlan.price
            ? monthlyPlan.mrp_price - monthlyPlan.price
            : undefined,
        }
      : defaultPricing.monthly,
    yearly: yearlyPlan
      ? {
          price: yearlyPlan.price,
          originalPrice: yearlyPlan.mrp_price && yearlyPlan.mrp_price > yearlyPlan.price
            ? yearlyPlan.mrp_price
            : undefined,
          savings: yearlyPlan.mrp_price && yearlyPlan.mrp_price > yearlyPlan.price
            ? yearlyPlan.mrp_price - yearlyPlan.price
            : undefined,
        }
      : defaultPricing.yearly,
  };

  const comparison = isProPlusUpsell
    ? [
        { feature: 'JEEnie AI doubts/day', free: '20', pro: '50' },
        { feature: 'Previous-Year Qs', free: false, pro: true },
        { feature: 'Smart Notes (save AI replies)', free: false, pro: true },
        { feature: 'Deep / Master mode', free: 'Limited', pro: '✓' },
        { feature: 'Educator PPTs & sims', free: false, pro: true },
      ]
    : [
        { feature: 'Questions/Day', free: FREE_LIMITS.questionsPerDay.toString(), pro: '∞' },
        { feature: 'Mock Tests', free: `${FREE_LIMITS.testsPerMonth}/mo`, pro: '∞' },
        { feature: 'JEEnie AI doubts/day', free: '5', pro: '20 (Pro) • 50 (Pro+)' },
        { feature: 'Previous-Year Qs', free: `${FREE_LIMITS.pyqYears} recent yrs`, pro: '5 yrs (Pro) • 10 yrs (Pro+)' },
        { feature: 'Study Planner', free: false, pro: true },
        { feature: 'Analytics', free: false, pro: true },
      ];

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, limitType]);

  const handleUpgrade = () => {
    onClose();
    navigate(isProPlusUpsell ? '/subscription-plans?highlight=pro_plus' : '/subscription-plans');
  };


  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-300"
      onClick={onClose}
    >
      <div 
        className="bg-linear-to-b from-background to-card rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in duration-200 max-h-[90vh] overflow-y-auto relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition p-2 rounded-full hover:bg-muted/50 z-20"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="text-center pt-6 pb-4 px-6 relative">
          <span className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-bold px-3 py-1 rounded-full mb-3">
            {message.badge}
          </span>
          <h2 className="text-2xl font-bold text-foreground mb-1">
            {message.title}
          </h2>
          <p className="text-muted-foreground text-sm">{message.subtitle}</p>
        </div>

        {/* Billing Toggle */}
        <div className="flex justify-center px-6 mb-4">
          <div className="inline-flex items-center gap-1 bg-muted p-1 rounded-lg border border-border">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-5 py-2 rounded-md text-sm font-medium transition-all relative ${
                billingCycle === 'yearly'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Yearly
            </button>
          </div>
        </div>

        {/* Price Display */}
        <div className="text-center px-6 mb-4">
          <div className="flex items-baseline justify-center gap-2">
            {pricing[billingCycle].originalPrice && (
              <span className="text-muted-foreground line-through text-lg">
                ₹{pricing[billingCycle].originalPrice}
              </span>
            )}
            <span className="text-4xl font-bold text-primary">
              ₹{pricing[billingCycle].price}
            </span>
            <span className="text-muted-foreground">
              /{billingCycle === 'yearly' ? 'yr' : 'mo'}
            </span>
          </div>
          {pricing[billingCycle].savings && (
            <p className="text-sm font-medium mt-1 text-primary">
              ₹{pricing[billingCycle].savings} less than the listed MRP
            </p>
          )}
        </div>

        {/* Comparison Table */}
        <div className="mx-6 mb-4 rounded-xl border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-3 bg-muted/30 border-b border-border">
            <div className="p-3 text-xs font-semibold text-muted-foreground">Feature</div>
            <div className="p-3 text-xs font-semibold text-muted-foreground text-center">{isProPlusUpsell ? 'Pro' : 'Free'}</div>
            <div className="p-3 text-xs font-semibold text-center flex items-center justify-center gap-1">
              <Crown className="w-3 h-3 text-primary" />
              <span className="text-foreground">{isProPlusUpsell ? 'Pro+' : 'Paid'}</span>
            </div>
          </div>
          {comparison.map((item, idx) => (
            <div key={idx} className="grid grid-cols-3 border-b border-border/50 last:border-0">
              <div className="p-3 text-sm text-foreground">{item.feature}</div>
              <div className="p-3 text-center">
                {typeof item.free === 'boolean' ? (
                  item.free ? (
                    <Check className="w-4 h-4 text-primary mx-auto" />
                  ) : (
                    <X className="w-4 h-4 text-destructive mx-auto" />
                  )
                ) : (
                  <span className="text-sm text-muted-foreground">{item.free}</span>
                )}
              </div>
              <div className="p-3 text-center bg-primary/5">
                {typeof item.pro === 'boolean' ? (
                  <Check className="w-4 h-4 text-primary mx-auto" />
                ) : (
                  <span className="text-sm font-medium text-foreground">{item.pro}</span>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* CTA Button */}
        <div className="px-6 pb-4">
          <button
            onClick={handleUpgrade}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold py-3.5 rounded-xl text-base shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
          >
            <Zap className="w-5 h-5" />
            View Plans
          </button>
        </div>

        {/* Referral Banner */}
        <div className="mx-6 mb-4 bg-primary/5 border border-primary/20 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              🎁
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Get 1 week FREE!</p>
              <p className="text-xs text-muted-foreground">Refer friends & both get 1 week Pro free (max 4 referrals)</p>
            </div>
          </div>
          <button 
            onClick={() => {
              const text = `Hey! Check out JEEnie - the best JEE/NEET prep app! Use my referral link for a FREE week of Pro! 🚀`;
              const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
              window.open(url, '_blank');
            }}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold px-3 py-2 rounded-lg flex items-center gap-1 whitespace-nowrap"
          >
            <Share2 className="w-3 h-3" />
            Share
          </button>
        </div>

        {/* Continue Free */}
        <div className="px-6 pb-6 text-center">
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-sm underline transition-all"
          >
            Continue with Free Plan →
          </button>
        </div>
      </div>
    </div>
  );
};

export default PricingModal;
