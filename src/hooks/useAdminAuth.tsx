import { useAuth } from '@/contexts/AuthContext';

export const useAdminAuth = () => {
  const { userRole, isLoading, isAuthenticated } = useAuth();

  // Reuse the role already fetched by AuthContext.checkPremiumStatus()
  // instead of making a duplicate query to user_roles on every page load.
  // Treat "authenticated but role not yet resolved" as still-loading so
  // AdminRoute doesn't briefly redirect admins to /dashboard on hard reload
  // (which then bounces to /admin and loses any subpath like /admin/users).
  const roleResolved = userRole !== null;
  return {
    isAdmin: userRole === 'admin' || userRole === 'super_admin',
    loading: isLoading || (isAuthenticated && !roleResolved),
  };
};

