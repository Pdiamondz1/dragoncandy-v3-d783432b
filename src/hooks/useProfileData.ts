import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface ProfileData {
  avatarUrl?: string;
  displayName?: string;
  loading: boolean;
}

export const useProfileData = () => {
  const { user, profile } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData>({ loading: true });

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user || !profile) {
        setProfileData({ loading: false });
        return;
      }

      try {
        setProfileData({ loading: true });

        if (profile.role === 'content_creator') {
          const { data: creatorProfile } = await supabase
            .from('creator_profiles')
            .select('avatar_url, creator_name')
            .eq('user_id', user.id)
            .single();

          setProfileData({
            avatarUrl: creatorProfile?.avatar_url,
            displayName: creatorProfile?.creator_name || profile.full_name,
            loading: false
          });
        } else if (profile.role === 'business_client') {
          const { data: businessProfile } = await supabase
            .from('business_profiles')
            .select('logo_url, business_name')
            .eq('user_id', user.id)
            .single();

          setProfileData({
            avatarUrl: businessProfile?.logo_url,
            displayName: businessProfile?.business_name || profile.full_name,
            loading: false
          });
        }
      } catch (error) {
        console.error('Error fetching profile data:', error);
        setProfileData({ 
          displayName: profile.full_name,
          loading: false 
        });
      }
    };

    fetchProfileData();
  }, [user, profile]);

  return profileData;
};