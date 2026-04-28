import { useNavigate } from 'react-router-dom';
import { useAuth } from './useAuth';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export const useLogout = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { clearChat } = useDonnyContext();

  const logout = async () => {
    try {
      await clearChat();
      await signOut();
      navigate('/landing');
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/landing');
    }
  };

  return logout;
};