
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { cleanupAuthState } from '@/lib/authCleanup';
import { toast } from 'sonner';

interface Profile {
  id: string;
  email: string;
  role: 'business_client' | 'content_creator' | 'brand';
  full_name?: string;
  avatar_url?: string;
  business_name?: string;
  creator_name?: string;
  email_verified?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
  migrateCampaignData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: React.ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Timeout mechanism to prevent infinite loading
  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) {
          setError('Authentication timeout - continuing without authentication');
          return false;
        }
        return prev;
      });
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, []);

  const createProfileFromMetadata = (user: User): Profile | null => {
    const role = user.user_metadata?.role;
    if (!role || !user.email) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: role as 'business_client' | 'content_creator',
      full_name: user.user_metadata?.full_name || null,
      avatar_url: user.user_metadata?.avatar_url || null,
    };
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data: testData, error: testError } = await supabase
        .from('profiles')
        .select('count', { count: 'exact', head: true });
      
      if (testError) {
        console.error('❌ AuthProvider: Supabase connection test failed:', testError);
        throw new Error(`Database connection failed: ${testError.message}`);
      }

      // Get the basic profile first
      const { data: basicProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, full_name, avatar_url, email_verified')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('❌ AuthProvider: Error fetching basic profile:', profileError);

        // If profile doesn't exist, this might be a new user
        if (profileError.code === 'PGRST116') {
          return null;
        }

        throw new Error(`Profile fetch failed: ${profileError.message}`);
      }

      if (!basicProfile) {
        return null;
      }

      // Start with the basic profile
      let extendedProfile: Profile = {
        id: basicProfile.id,
        email: basicProfile.email,
        role: basicProfile.role,
        full_name: basicProfile.full_name,
        avatar_url: basicProfile.avatar_url,
        email_verified: basicProfile.email_verified,
      };

      // Fetch role-specific data with error handling
      try {
        if (basicProfile.role === 'business_client') {
          const { data: businessProfile, error: businessError } = await supabase
            .from('business_profiles')
            .select('business_name')
            .eq('user_id', userId)
            .maybeSingle();

          if (!businessError && businessProfile) {
            extendedProfile.business_name = businessProfile.business_name;
          }
        } else if (basicProfile.role === 'content_creator') {
          const { data: creatorProfile, error: creatorError } = await supabase
            .from('creator_profiles')
            .select('creator_name')
            .eq('user_id', userId)
            .maybeSingle();

          if (!creatorError && creatorProfile) {
            extendedProfile.creator_name = creatorProfile.creator_name;
          }
        }
      } catch (roleError) {
        // Role-specific profile fetch failed, continue with basic profile
      }

      return extendedProfile;
    } catch (error) {
      console.error('❌ AuthProvider: Profile fetch failed:', error);
      setError(error instanceof Error ? error.message : 'Profile fetch failed');
      return null;
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        try {
          setSession(session);
          setUser(session?.user ?? null);
          setError(null);

          if (session?.user) {
            // Use setTimeout to prevent potential deadlocks
            setTimeout(async () => {
              try {
                let profileData = await fetchProfile(session.user.id);

                // If no profile in database but we have user metadata, create profile from metadata
                if (!profileData && session.user.user_metadata?.role) {
                  profileData = createProfileFromMetadata(session.user);
                }

                setProfile(profileData);
              } catch (profileError) {
                console.error('❌ AuthProvider: Deferred profile fetch failed:', profileError);

                // Try to create profile from metadata as fallback
                if (session.user.user_metadata?.role) {
                  const metadataProfile = createProfileFromMetadata(session.user);
                  setProfile(metadataProfile);
                } else {
                  setError('Failed to load profile');
                }
              } finally {
                setLoading(false);
              }
            }, 0);
          } else {
            setProfile(null);
            setLoading(false);
          }
        } catch (error) {
          console.error('❌ AuthProvider: Auth state change handler failed:', error);
          setError('Authentication failed');
          setLoading(false);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const migrateCampaignData = async () => {
    try {
      const anonymousCampaignData = localStorage.getItem('anonymous_campaign_data');
      const finalCampaignData = localStorage.getItem('anonymous_campaign_final');

      // Nothing to migrate
      if (!anonymousCampaignData && !finalCampaignData) {
        return;
      }

      // Determine role from loaded profile or user metadata
      const userRole = profile?.role || (user?.user_metadata?.role as 'business_client' | 'content_creator' | undefined);

      if (!user || !userRole) {
        return;
      }

      // If the user is a content creator, do NOT migrate campaigns
      if (userRole === 'content_creator') {
        localStorage.removeItem('anonymous_campaign_data');
        localStorage.removeItem('anonymous_campaign_final');
        toast.message('Campaign drafts are only for business clients.');
        return;
      }

      // Only business clients can have campaigns migrated
      if (anonymousCampaignData && finalCampaignData) {
        let campaignData: ReturnType<typeof JSON.parse>;
        let finalData: ReturnType<typeof JSON.parse>;
        try {
          campaignData = JSON.parse(anonymousCampaignData);
          finalData = JSON.parse(finalCampaignData);
        } catch {
          console.error('❌ AuthProvider: Invalid campaign data in localStorage, clearing');
          localStorage.removeItem('anonymous_campaign_data');
          localStorage.removeItem('anonymous_campaign_final');
          return;
        }

        const { error } = await supabase
          .from('campaigns')
          .insert({
            user_id: user.id,
            title: finalData.title,
            description: finalData.description,
            goals: campaignData.goal,
            deliverables: campaignData.customizedData?.content_types || [],
            platforms: campaignData.customizedData?.platforms || [],
            style: campaignData.customizedData?.style || '',
            tone: campaignData.customizedData?.tone || '',
            budget_min: finalData.budgetMin,
            budget_max: finalData.budgetMax,
            deadline: finalData.deadline,
            status: finalData.publishImmediately ? 'published' : 'draft',
          });
        
        if (error) {
          console.error('❌ AuthProvider: Campaign migration failed:', error);
          toast.error('Failed to save your campaign. Please try again.');
          throw error;
        }
        
        // Clear the anonymous data
        localStorage.removeItem('anonymous_campaign_data');
        localStorage.removeItem('anonymous_campaign_final');

        toast.success('Your campaign has been saved to your account.');
      }
    } catch (error) {
      console.error('❌ AuthProvider: Campaign migration failed:', error);
    }
  };

  const signOut = async () => {
    try {
      // Clean up auth state first
      cleanupAuthState();
      
      // Sign out from Supabase
      await supabase.auth.signOut({ scope: 'global' });
      
      // Clear local state
      setProfile(null);
      setError(null);
      setUser(null);
      setSession(null);
      
    } catch (error) {
      console.error('❌ AuthProvider: Sign out failed:', error);
      
      // Clean up auth state even if sign out fails
      cleanupAuthState();
      setProfile(null);
      setError(null);
      setUser(null);
      setSession(null);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    error,
    signOut,
    isAuthenticated: !!user,
    migrateCampaignData
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
