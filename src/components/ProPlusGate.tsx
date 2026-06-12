import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Lock, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ProPlusGateProps {
  children: React.ReactNode;
  featureName?: string;
}

const ProPlusGate: React.FC<ProPlusGateProps> = ({ children, featureName = 'This feature' }) => {
  const { subscriptionTier } = useAuth();
  const navigate = useNavigate();

  if (subscriptionTier === 'pro_plus') return <>{children}</>;

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="text-center max-w-md space-y-6">
        <div className="w-20 h-20 mx-auto rounded-2xl bg-linear-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg">
          <Crown className="w-10 h-10 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">JEEnie Pro+ Feature</h2>
          <p className="text-muted-foreground">
            {featureName} is available in JEEnie Pro+. Upgrade to unlock educator PPT viewing and interactive simulations.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="bg-linear-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white font-semibold"
            onClick={() => navigate('/subscription-plans')}
          >
            <Lock className="w-4 h-4 mr-2" />
            Upgrade to JEEnie Pro+
          </Button>
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProPlusGate;
