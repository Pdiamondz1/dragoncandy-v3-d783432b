import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { getSignedProfileUrl } from '@/hooks/useSignedUrl';

interface ProfileData {
  avatarUrl?: string;
  displayName?: string;
  loading: boolean;
}

// Cache to prevent flickering between page navigations
const profileCache = new Map<string, Omit<ProfileData, 'loading'>>();

export const useProfileData = () => {
  const { user, profile } = useAuth();
  const [profileData, setProfileData] = useState<ProfileData>(() => {
    // Initialize with cached data if available to prevent flickering
    if (user?.id) {
      const cached = profileCache.get(user.id);
      if (cached) {
        return { ...cached, loading: false };
      }
    }
    return { loading: true };
  });
  
  const hasFetchedRef = useRef(false);

  const resolveProfileUrl = async (filePath: string | null | undefined): Promise<string | undefined> => {
    return getSignedProfileUrl(filePath);
  };

  const fetchProfileData = useCallback(async (forceRefresh = false) => {
    if (!user || !profile) {
      setProfileData({ loading: false });
      return;
    }

    // Check cache first to prevent unnecessary fetches
    const cacheKey = user.id;
    const cached = profileCache.get(cacheKey);
    
    if (cached && !forceRefresh && hasFetchedRef.current) {
      setProfileData({ ...cached, loading: false });
      return;
    }

    try {
      // Only show loading if we don't have cached data
      if (!cached) {
        setProfileData(prev => ({ ...prev, loading: true }));
      }

      if (profile.role === 'content_creator') {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('avatar_url, creator_name')
          .eq('user_id', user.id)
          .single();

        const avatarUrl = await resolveProfileUrl(creatorProfile?.avatar_url);
        const newData = {
          avatarUrl,
          displayName: creatorProfile?.creator_name || profile.full_name,
        };

        // Cache the data
        profileCache.set(cacheKey, newData);
        setProfileData({ ...newData, loading: false });
        
      } else if (profile.role === 'business_client') {
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('logo_url, business_name')
          .eq('user_id', user.id)
          .single();

        const avatarUrl = await resolveProfileUrl(businessProfile?.logo_url);
        const newData = {
          avatarUrl,
          displayName: businessProfile?.business_name || profile.full_name,
        };

        // Cache the data
        profileCache.set(cacheKey, newData);
        setProfileData({ ...newData, loading: false });
      }
      
      hasFetchedRef.current = true;
    } catch (error) {
      console.error('Error fetching profile data:', error);
      const fallbackData = { 
        displayName: profile.full_name,
      };
      profileCache.set(cacheKey, fallbackData);
      setProfileData({ ...fallbackData, loading: false });
    }
  }, [user, profile]);

  useEffect(() => {
    fetchProfileData();
  }, [fetchProfileData]);

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
          // Refetch profile data when changes occur (force refresh to bypass cache)
          fetchProfileData(true);
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [user, profile, fetchProfileData]);

  return { ...profileData, refetch: fetchProfileData };
};

export function clearProfileCache(userId?: string): void {
  if (userId) {
    profileCache.delete(userId);
  } else {
    profileCache.clear();
  }
}