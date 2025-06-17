
import { useAuthContext } from '@/contexts/AuthContext';

export const useAuth = () => {
  const context = useAuthContext();
  
  // Add some debugging to help identify issues
  console.log('🔧 useAuth: Hook called with context:', {
    hasUser: !!context.user,
    hasSession: !!context.session,
    hasProfile: !!context.profile,
    loading: context.loading,
    error: context.error,
    isAuthenticated: context.isAuthenticated
  });
  
  return context;
};
