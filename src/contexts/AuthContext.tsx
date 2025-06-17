
import React, { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

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
  signOut: () => Promise<void>;
  isAuthenticated: boolean;
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

  const fetchProfile = async (userId: string) => {
    try {
      // First get the basic profile
      const { data: basicProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) {
        console.error('Error fetching profile:', profileError);
        return null;
      }

      let extendedProfile = { ...basicProfile };

      // Then get role-specific profile data
      if (basicProfile.role === 'business_client') {
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('business_name')
          .eq('user_id', userId)
          .single();
        
        if (businessProfile) {
          extendedProfile.business_name = businessProfile.business_name;
        }
      } else if (basicProfile.role === 'content_creator') {
        const { data: creatorProfile } = await supabase
          .from('creator_profiles')
          .select('creator_name')
          .eq('user_id', userId)
          .single();
        
        if (creatorProfile) {
          extendedProfile.creator_name = creatorProfile.creator_name;
        }
      }

      return extendedProfile;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  };

  useEffect(() => {
    // Set up auth state listener first
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('Auth state changed:', event, session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch profile data when user signs in
          const profileData = await fetchProfile(session.user.id);
          setProfile(profileData);
        } else {
          setProfile(null);
        }
        
        setLoading(false);
      }
    );

    // Then check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('Initial session check:', session?.user?.email);
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const profileData = await fetchProfile(session.user.id);
        setProfile(profileData);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      console.log('Signing out user');
      await supabase.auth.signOut({ scope: 'global' });
      setProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const value: AuthContextType = {
    user,
    session,
    profile,
    loading,
    signOut,
    isAuthenticated: !!user
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
