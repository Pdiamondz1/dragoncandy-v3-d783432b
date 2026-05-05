
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type CreatorProfileRow = Database['public']['Tables']['creator_profiles']['Row'];

export const useCreatorProfileLoad = (setFormDataFromProfile: (profile: Partial<CreatorProfileRow>) => void) => {
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
          .select('id, user_id, creator_name, avatar_url, bio, skills, portfolio_urls, location, city, country, postal_code, availability, base_rate_per_hour, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, website_url, profile_slug, is_completed')
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
