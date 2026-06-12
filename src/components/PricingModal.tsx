import { useState, useEffect } from 'react';
import { X, Crown, Check, Zap, Flame, Share2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { FREE_LIMITS } from '@/config/subscriptionPlans';
import { useSubscriptionPlans } from '@/hooks/useSubscriptionPlans';

type LimitType = 'daily_limit' | 'daily_limit_reached' | 'test_limit' | 'ai_doubt_locked' | 'study_planner_blocked' | 'almost_there';

interface PricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  limitType?: LimitType;
  userStats?: Record<string, unknown>;
}

const PricingModal: React.FC<PricingModalProps> = ({ 
  isOpen, 
  onClose, 
  limitType = 'daily_limit'
}) => {
  const navigate = useNavigate();
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('yearly');

  const limitMessages = {
    daily_limit: {
      badge: "🔥 STEAL DEAL",
      title: "Choose a plan",
      subtitle: "Unlimited access to everything!"
    },
    daily_limit_reached: {
      badge: "⏰ LIMIT REACHED",
      title: "Choose a plan",
      subtitle: "Continue practicing without limits!"
    },
    test_limit: {
      badge: "📝 TEST LIMIT",
      title: "Choose a plan",
      subtitle: "Unlimited mock tests await!"
    },
    ai_doubt_locked: {
      badge: "🤖 AI FEATURE",
      title: "Unlock JEEnie AI",
      subtitle: "Your personal AI tutor 24/7"
    },
    study_planner_blocked: {
      badge: "📅 AI FEATURE",
      title: "Unlock Study Planner",
      subtitle: "Smart planning for better results"
    },
    almost_there: {
      badge: "⚡ 80% USED",
      title: "Running Low!",
      subtitle: "Get unlimited access now"
    }
  };

  const message = limitMessages[limitType] || limitMessages.daily_limit;
  
  const { data: plans } = useSubscriptionPlans();

  const monthlyPlan = plans?.find((p) => p.duration_days < 365 && p.tier === 'pro');
  const yearlyPlan = plans?.find((p) => p.duration_days >= 365 && p.tier === 'pro');

  const pricing = {
    monthly: monthlyPlan
      ? {
          price: monthlyPlan.price,
          originalPrice: monthlyPlan.mrp_price ?? monthlyPlan.price,
          perDay: `₹${Math.round(monthlyPlan.price / 30)}`,
        }
      : { price: 99, originalPrice: 149, perDay: '₹3.3' },
    yearly: yearlyPlan
      ? {
          price: yearlyPlan.price,
          originalPrice: yearlyPlan.mrp_price ?? yearlyPlan.price,
          perDay: `₹${Math.round(yearlyPlan.price / 365)}`,
          savings: (yearlyPlan.mrp_price ?? yearlyPlan.price) - yearlyPlan.price,
        }
      : { price: 499, originalPrice: 1188, perDay: '₹1.37', savings: 689 },
  };

  const comparison = [
    { feature: 'Questions/Day', free: FREE_LIMITS.questionsPerDay.toString(), pro: '∞' },
    { feature: 'Mock Tests', free: `${FREE_LIMITS.testsPerMonth}/mo`, pro: '∞' },
    { feature: 'JEEnie AI', free: false, pro: true },
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
    navigate('/subscription-plans');
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
            <Flame className="w-3 h-3" />
            {message.badge}
          </span>
          <h2 className="text-2xl font-bold text-foreground mb-1">
            {message.title}
          </h2>
          <p className="text-muted-foreground text-sm">
            {billingCycle === 'yearly' 
              ? `Just ${pricing.yearly.perDay}/day — Cheaper than a samosa!` 
              : `Just ${pricing.monthly.perDay}/day — Less than a chai!`}
          </p>
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
              <span className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded font-bold">
                58%
              </span>
            </button>
          </div>
        </div>

        {/* Price Display */}
        <div className="text-center px-6 mb-4">
          <div className="flex items-baseline justify-center gap-2">
            <span className="text-muted-foreground line-through text-lg">
              ₹{pricing[billingCycle].originalPrice}
            </span>
            <span className="text-4xl font-bold text-primary">
              ₹{pricing[billingCycle].price}
            </span>
            <span className="text-muted-foreground">
              /{billingCycle === 'yearly' ? 'yr' : 'mo'}
            </span>
          </div>
          {billingCycle === 'yearly' && (
            <p className="text-sm font-medium mt-1 text-primary">
              Save ₹{pricing.yearly.savings}
            </p>
          )}
        </div>

        {/* Comparison Table */}
        <div className="mx-6 mb-4 rounded-xl border border-border overflow-hidden bg-card">
          <div className="grid grid-cols-3 bg-muted/30 border-b border-border">
            <div className="p-3 text-xs font-semibold text-muted-foreground">Feature</div>
            <div className="p-3 text-xs font-semibold text-muted-foreground text-center">Free</div>
            <div className="p-3 text-xs font-semibold text-center flex items-center justify-center gap-1">
              <Crown className="w-3 h-3 text-primary" />
              <span className="text-foreground">Paid</span>
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
