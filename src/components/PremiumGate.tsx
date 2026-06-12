import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PremiumGateProps {
  children: React.ReactNode;
  featureName?: string;
}

const PremiumGate: React.FC<PremiumGateProps> = ({ children, featureName = 'This feature' }) => {
  const { subscriptionTier } = useAuth();
  const navigate = useNavigate();

  if (subscriptionTier !== 'free') return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md space-y-6">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-linear-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg">
          <Crown className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Premium Feature</h2>
          <p className="text-muted-foreground">
            {featureName} is available for premium members. Upgrade to unlock full analytics, AI study planner, and more.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button 
            size="lg" 
            className="bg-linear-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
            onClick={() => navigate('/subscription-plans')}
          >
            <Lock className="w-4 h-4 mr-2" />
            Upgrade to Premium
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default PremiumGate;
