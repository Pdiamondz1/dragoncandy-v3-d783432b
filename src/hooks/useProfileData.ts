import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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

  const getPublicUrl = (filePath: string | null | undefined, width?: number): string | undefined => {
    if (!filePath) return undefined;

    // If it's already a full URL, return as is
    if (filePath.startsWith('http')) return filePath;

    // Use Supabase image transform when a target width is provided
    if (width) {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zocahiffooqdybdhguqv.supabase.co';
      return `${supabaseUrl}/storage/v1/render/image/public/profile-assets/${filePath}?width=${width}&height=${width}&resize=cover&quality=75`;
    }

    // Convert storage path to public URL
    const { data } = supabase.storage.from('profile-assets').getPublicUrl(filePath);
    return data.publicUrl;
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

        const avatarUrl = getPublicUrl(creatorProfile?.avatar_url, 72);
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

        const avatarUrl = getPublicUrl(businessProfile?.logo_url, 72);
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
  }, [user, profile]);

  return { ...profileData, refetch: fetchProfileData };
};