import { useAuth } from '@/contexts/AuthContext';

export const useAdminAuth = () => {
  const { userRole, isLoading } = useAuth();
  
  // Reuse the role already fetched by AuthContext.checkPremiumStatus()
  // instead of making a duplicate query to user_roles on every page load.
  return {
    isAdmin: userRole === 'admin' || userRole === 'super_admin',
    loading: isLoading,
  };
};
