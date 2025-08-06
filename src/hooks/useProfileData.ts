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

  const getPublicUrl = (filePath: string | null | undefined): string | undefined => {
    if (!filePath) return undefined;
    
    // If it's already a full URL, return as is
    if (filePath.startsWith('http')) return filePath;
    
    // Convert storage path to public URL
    const { data } = supabase.storage.from('profile-assets').getPublicUrl(filePath);
    return data.publicUrl;
  };

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

        const avatarUrl = getPublicUrl(creatorProfile?.avatar_url);
        console.log('Creator avatar URL:', { raw: creatorProfile?.avatar_url, public: avatarUrl });

        setProfileData({
          avatarUrl,
          displayName: creatorProfile?.creator_name || profile.full_name,
          loading: false
        });
      } else if (profile.role === 'business_client') {
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('logo_url, business_name')
          .eq('user_id', user.id)
          .single();

        const avatarUrl = getPublicUrl(businessProfile?.logo_url);
        console.log('Business logo URL:', { raw: businessProfile?.logo_url, public: avatarUrl });

        setProfileData({
          avatarUrl,
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