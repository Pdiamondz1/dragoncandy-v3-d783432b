
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useCreatorProfileLoad = (setFormDataFromProfile: (profile: any) => void) => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (creatorProfile) {
          setFormDataFromProfile(creatorProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
  }, [user, navigate, setFormDataFromProfile]);

  return { user };
};
