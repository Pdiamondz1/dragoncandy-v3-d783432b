import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export const useLogout = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { archiveConversation } = useDonnyContext();
  const queryClient = useQueryClient();

  const logout = async () => {
    try {
      await archiveConversation();
      await signOut();
      queryClient.clear();
      navigate('/landing');
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/landing');
    }
  };

  return logout;
};
