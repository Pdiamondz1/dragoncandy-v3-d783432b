
import { useAuthContext } from '@/contexts/AuthContext';

export const useAuth = () => {
  const context = useAuthContext();
  return context;
};
