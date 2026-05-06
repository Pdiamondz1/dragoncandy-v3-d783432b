import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { useDonnyContext } from '@/contexts/DonnyProvider';

export const useLogout = () => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { clearChat } = useDonnyContext();
  const queryClient = useQueryClient();

  const logout = async () => {
    try {
      await clearChat();
      queryClient.removeQueries({
        predicate: (query) =>
          typeof query.queryKey[0] === 'string' &&
          query.queryKey[0].startsWith('donny'),
      });
      await signOut();
      navigate('/landing');
    } catch (error) {
      console.error('Logout failed:', error);
      navigate('/landing');
    }
  };

  return logout;
};
