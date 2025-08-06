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

  const fetchProfileData = async () => {
    if (!user || !profile) {
      setProfileData({ loading: false });
      return;
    }

    try {
      setProfileData(prev => ({ ...prev, loading: true }));

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

  useEffect(() => {
    fetchProfileData();
  }, [user, profile]);

  // Set up real-time subscription for profile changes
  useEffect(() => {
    if (!user || !profile) return;

    const tableName = profile.role === 'content_creator' ? 'creator_profiles' : 'business_profiles';
    
    const subscription = supabase
      .channel(`profile_changes_${user.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: tableName,
          filter: `user_id=eq.${user.id}`
        }, 
        () => {
          // Refetch profile data when changes occur
          fetchProfileData();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, profile]);

  return { ...profileData, refetch: fetchProfileData };
};