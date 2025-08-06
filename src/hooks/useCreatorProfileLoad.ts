
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

export const useCreatorProfileLoad = (setFormDataFromProfile: (profile: any) => void) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const hasLoaded = useRef(false);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    if (hasLoaded.current) return; // Prevent reloading

    const loadProfile = async () => {
      try {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('*')
          .eq('user_id', user.id)
          .single();

        if (creatorProfile) {
          setFormDataFromProfile(creatorProfile);
          hasLoaded.current = true;
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
  }, [user, navigate]); // Removed setFormDataFromProfile from dependencies

  return { user };
};
