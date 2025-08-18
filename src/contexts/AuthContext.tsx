
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { cleanupAuthState } from '@/lib/authCleanup';
import { toast } from 'sonner';

interface Profile {
  id: string;
  email: string;
  role: 'business_client' | 'content_creator';
  full_name?: string;
  avatar_url?: string;
  business_name?: string;
  creator_name?: string;
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
    console.log('🔧 AuthProvider: Setting up 10-second timeout fallback');
    const timeout = setTimeout(() => {
      console.warn('⚠️ AuthProvider: Timeout reached, forcing loading to false');
      if (loading) {
        setLoading(false);
        setError('Authentication timeout - continuing without authentication');
      }
    }, 10000); // 10 second timeout

    return () => clearTimeout(timeout);
  }, [loading]);

  const createProfileFromMetadata = (user: User): Profile | null => {
    const role = user.user_metadata?.role;
    if (!role || !user.email) {
      console.warn('⚠️ AuthProvider: Missing role or email in user metadata');
      return null;
    }

    console.log('📋 AuthProvider: Creating profile from user metadata:', { role, email: user.email });
    
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
      console.log('🔍 AuthProvider: Fetching profile for user:', userId);
      
      // Test basic Supabase connection first
      console.log('🔧 AuthProvider: Testing Supabase connection...');
      const { data: testData, error: testError } = await supabase
        .from('profiles')
        .select('count', { count: 'exact', head: true });
      
      if (testError) {
        console.error('❌ AuthProvider: Supabase connection test failed:', testError);
        throw new Error(`Database connection failed: ${testError.message}`);
      }
      
      console.log('✅ AuthProvider: Supabase connection successful');

      // Get the basic profile first
      console.log('🔍 AuthProvider: Querying basic profile...');
      const { data: basicProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role, full_name, avatar_url')
        .eq('id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('❌ AuthProvider: Error fetching basic profile:', profileError);
        
        // If profile doesn't exist, this might be a new user
        if (profileError.code === 'PGRST116') {
          console.log('ℹ️ AuthProvider: No profile found - this might be a new user');
          return null;
        }
        
        throw new Error(`Profile fetch failed: ${profileError.message}`);
      }

      if (!basicProfile) {
        console.log('ℹ️ AuthProvider: No profile found in database');
        return null;
      }

      console.log('✅ AuthProvider: Basic profile fetched:', basicProfile);

      // Start with the basic profile
      let extendedProfile: Profile = {
        id: basicProfile.id,
        email: basicProfile.email,
        role: basicProfile.role,
        full_name: basicProfile.full_name,
        avatar_url: basicProfile.avatar_url,
      };

      // Fetch role-specific data with error handling
      try {
        if (basicProfile.role === 'business_client') {
          console.log('🔍 AuthProvider: Fetching business profile...');
          const { data: businessProfile, error: businessError } = await supabase
            .from('business_profiles')
            .select('business_name')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (businessError) {
            console.warn('⚠️ AuthProvider: Business profile fetch failed:', businessError);
          } else if (businessProfile) {
            extendedProfile.business_name = businessProfile.business_name;
            console.log('✅ AuthProvider: Business profile added');
          }
        } else if (basicProfile.role === 'content_creator') {
          console.log('🔍 AuthProvider: Fetching creator profile...');
          const { data: creatorProfile, error: creatorError } = await supabase
            .from('creator_profiles')
            .select('creator_name')
            .eq('user_id', userId)
            .maybeSingle();
          
          if (creatorError) {
            console.warn('⚠️ AuthProvider: Creator profile fetch failed:', creatorError);
          } else if (creatorProfile) {
            extendedProfile.creator_name = creatorProfile.creator_name;
            console.log('✅ AuthProvider: Creator profile added');
          }
        }
      } catch (roleError) {
        console.warn('⚠️ AuthProvider: Role-specific profile fetch failed, continuing with basic profile:', roleError);
      }

      console.log('✅ AuthProvider: Final extended profile:', extendedProfile);
      return extendedProfile;
    } catch (error) {
      console.error('❌ AuthProvider: Profile fetch failed:', error);
      setError(error instanceof Error ? error.message : 'Profile fetch failed');
      return null;
    }
  };

  useEffect(() => {
    console.log('🚀 AuthProvider: Initializing authentication...');
    
    // Set up auth state listener first
    console.log('🔧 AuthProvider: Setting up auth state listener...');
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔄 AuthProvider: Auth state changed:', event, session?.user?.email || 'no user');
        
        try {
          setSession(session);
          setUser(session?.user ?? null);
          setError(null);
          
          if (session?.user) {
            console.log('👤 AuthProvider: User authenticated, handling profile...');
            
            // Use setTimeout to prevent potential deadlocks
            setTimeout(async () => {
              try {
                let profileData = await fetchProfile(session.user.id);
                
                // If no profile in database but we have user metadata, create profile from metadata
                if (!profileData && session.user.user_metadata?.role) {
                  console.log('📋 AuthProvider: No database profile, using metadata');
                  profileData = createProfileFromMetadata(session.user);
                }
                
                setProfile(profileData);
              } catch (profileError) {
                console.error('❌ AuthProvider: Deferred profile fetch failed:', profileError);
                
                // Try to create profile from metadata as fallback
                if (session.user.user_metadata?.role) {
                  console.log('🔄 AuthProvider: Fallback to metadata profile');
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
            console.log('🚫 AuthProvider: No user, clearing profile...');
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

    // Then check for existing session
    console.log('🔍 AuthProvider: Checking for existing session...');
    supabase.auth.getSession().then(async ({ data: { session }, error: sessionError }) => {
      if (sessionError) {
        console.error('❌ AuthProvider: Session check failed:', sessionError);
        setError('Session check failed');
        setLoading(false);
        return;
      }

      console.log('🔍 AuthProvider: Initial session check result:', session?.user?.email || 'no session');
      
      try {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          console.log('👤 AuthProvider: Initial session found, fetching profile...');
          let profileData = await fetchProfile(session.user.id);
          
          // If no profile in database but we have user metadata, create profile from metadata
          if (!profileData && session.user.user_metadata?.role) {
            console.log('📋 AuthProvider: No database profile, using metadata');
            profileData = createProfileFromMetadata(session.user);
          }
          
          setProfile(profileData);
        }
      } catch (error) {
        console.error('❌ AuthProvider: Initial session processing failed:', error);
        
        // Try metadata fallback
        if (session?.user?.user_metadata?.role) {
          console.log('🔄 AuthProvider: Initial session error, trying metadata fallback');
          const metadataProfile = createProfileFromMetadata(session.user);
          setProfile(metadataProfile);
        } else {
          setError('Initial authentication failed');
        }
      } finally {
        setLoading(false);
      }
    }).catch((error) => {
      console.error('❌ AuthProvider: getSession promise failed:', error);
      setError('Session initialization failed');
      setLoading(false);
    });

    return () => {
      console.log('🧹 AuthProvider: Cleaning up auth subscription');
      subscription.unsubscribe();
    };
  }, []);

  const migrateCampaignData = async () => {
    try {
      console.log('🔄 AuthProvider: Migrating anonymous campaign data');
      
      const anonymousCampaignData = localStorage.getItem('anonymous_campaign_data');
      const finalCampaignData = localStorage.getItem('anonymous_campaign_final');

      // Nothing to migrate
      if (!anonymousCampaignData && !finalCampaignData) {
        return;
      }

      // Determine role from loaded profile or user metadata
      const userRole = profile?.role || (user?.user_metadata?.role as 'business_client' | 'content_creator' | undefined);

      if (!user || !userRole) {
        console.warn('⚠️ AuthProvider: Cannot migrate - missing user or role');
        return;
      }

      // If the user is a content creator, do NOT migrate campaigns
      if (userRole === 'content_creator') {
        console.log('ℹ️ AuthProvider: Creator account detected - clearing anonymous campaign data');
        localStorage.removeItem('anonymous_campaign_data');
        localStorage.removeItem('anonymous_campaign_final');
        toast.message('Campaign drafts are only for business clients.');
        return;
      }

      // Only business clients can have campaigns migrated
      if (anonymousCampaignData && finalCampaignData) {
        const campaignData = JSON.parse(anonymousCampaignData);
        const finalData = JSON.parse(finalCampaignData);
        
        console.log('📦 AuthProvider: Creating campaign from anonymous data');
        
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
        
        console.log('✅ AuthProvider: Campaign migration successful');
        toast.success('Your campaign has been saved to your account.');
      }
    } catch (error) {
      console.error('❌ AuthProvider: Campaign migration failed:', error);
    }
  };

  const signOut = async () => {
    try {
      console.log('🚪 AuthProvider: Signing out user');
      
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

  console.log('📊 AuthProvider: Current state:', {
    hasUser: !!user,
    hasSession: !!session,
    hasProfile: !!profile,
    loading,
    error
  });

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
