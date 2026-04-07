import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';

export const useLogout = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const logout = async () => {
    try {
      // Call the AuthProvider's signOut (which cleans up auth state)
      await signOut();
      
      // Navigate to landing page after auth cleanup
      navigate('/auth');
    } catch (error) {
      console.error('Logout failed:', error);
      // Still navigate to landing page even if logout fails
      navigate('/auth');
    }
  };

  return logout;
};