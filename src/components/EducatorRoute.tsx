import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { ShieldAlert, Clock, Mail } from 'lucide-react';
import { logger } from '@/utils/logger';

interface EducatorRouteProps {
  children: React.ReactNode;
}

const EducatorRoute: React.FC<EducatorRouteProps> = ({ children }) => {
  const { isAuthenticated, isLoading, userRole, user, signOut } = useAuth();
  const [approvalStatus, setApprovalStatus] = useState<'loading' | 'approved' | 'pending' | 'error'>('loading');

  useEffect(() => {
    if (!user || !isAuthenticated) return;
    if (userRole !== 'educator') {
      // Admin/super_admin bypass approval check
      if (userRole === 'admin' || userRole === 'super_admin') {
        setApprovalStatus('approved');
      }
      return;
    }

    // Check educator_approved field in profiles
    const checkApproval = async () => {
      try {
        const { data, error } = await (supabase as any)
          .from('profiles')
          .select('educator_approved')
          .eq('id', user.id)
          .single();

        if (error) {
          // Fail CLOSED on error — we cannot tell if this educator is approved.
          // Better to show "pending" than to grant unverified access to premium
          // teaching materials.
          logger.warn('educator_approved check failed:', error.message);
          setApprovalStatus('pending');
          return;
        }

        // Must be explicitly approved (true). null / false → pending.
        setApprovalStatus(data?.educator_approved === true ? 'approved' : 'pending');
      } catch {
        setApprovalStatus('pending'); // fail closed
      }
    };

    checkApproval();
  }, [user, isAuthenticated, userRole]);

  if (isLoading || approvalStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Admins can also access educator portal
  const allowed =
    userRole === 'educator' ||
    userRole === 'admin' ||
    userRole === 'super_admin';

  if (!allowed) {
    return <Navigate to="/dashboard" replace />;
  }

  // Educator account pending approval
  if (approvalStatus === 'pending') {
    return (
      <div className="min-h-screen bg-linear-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center space-y-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-slate-900">Approval Pending</h1>
            <p className="text-slate-600 text-sm leading-relaxed">
              Your educator account has been submitted for review. Our team will verify your credentials and approve your access shortly.
            </p>
          </div>

          <div className="bg-blue-50 rounded-xl p-4 text-left space-y-2">
            <div className="flex items-center gap-2 text-blue-800 font-medium text-sm">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <span>Why do we require approval?</span>
            </div>
            <p className="text-blue-700 text-xs leading-relaxed">
              The Educator Portal contains exclusive teaching resources (PPTs, virtual lab content) intended only for verified educators. Manual approval ensures content security and exclusivity.
            </p>
          </div>

          <div className="flex items-center gap-2 justify-center text-slate-500 text-xs">
            <Mail className="h-3.5 w-3.5" />
            <span>You'll receive an email once approved</span>
          </div>

          <button
            onClick={() => {
              signOut();
            }}
            className="w-full py-2.5 px-4 bg-primary text-primary-foreground rounded-lg font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default EducatorRoute;
