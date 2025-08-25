
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles } from 'lucide-react';

const ProfileOnboarding = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [redirecting, setRedirecting] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    console.log('🔄 ProfileOnboarding: Component mounted', { user: !!user, loading });
    
    if (!loading && !user) {
      console.log('🚫 ProfileOnboarding: No user, redirecting to auth');
      navigate('/auth');
      return;
    }

    const handleUserRedirect = async () => {
      if (!user || loading || redirecting) return;

      console.log('👤 ProfileOnboarding: Handling user redirect for:', user.email);
      setRedirecting(true);

      try {
        // First, check user metadata for role (set during signup)
        const userRole = user.user_metadata?.role;
        console.log('📋 ProfileOnboarding: User metadata role:', userRole);
        setDebugInfo(`User metadata role: ${userRole}`);

        if (userRole) {
          // If we have role from metadata, redirect immediately
          if (userRole === 'business_client') {
            console.log('🏢 ProfileOnboarding: Redirecting to business profile setup');
            navigate('/profile/business');
            return;
          } else if (userRole === 'content_creator') {
            console.log('🎨 ProfileOnboarding: Redirecting to creator profile setup');
            navigate('/profile/creator');
            return;
          }
        }

        // Fallback: check database profile
        console.log('🔍 ProfileOnboarding: Checking database profile...');
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

        if (error) {
          console.error('❌ ProfileOnboarding: Error fetching profile:', error);
          setDebugInfo(`Database error: ${error.message}`);
          
          // For authenticated users, redirect to auth to restart the flow
          console.log('🔄 ProfileOnboarding: Profile fetch failed, redirecting to auth');
          navigate('/auth');
          return;
        }

        if (profile?.role) {
          console.log('📋 ProfileOnboarding: Database role found:', profile.role);
          setDebugInfo(`Database role: ${profile.role}`);
          
          if (profile.role === 'business_client') {
            console.log('🏢 ProfileOnboarding: Redirecting to business profile setup');
            navigate('/profile/business');
          } else if (profile.role === 'content_creator') {
            console.log('🎨 ProfileOnboarding: Redirecting to creator profile setup');
            navigate('/profile/creator');
          }
        } else {
          // No role found anywhere - this shouldn't happen
          console.error('❌ ProfileOnboarding: No role found in metadata or database');
          setDebugInfo('No role found - redirecting to auth');
          navigate('/auth');
        }
      } catch (error) {
        console.error('❌ ProfileOnboarding: Unexpected error:', error);
        setDebugInfo(`Unexpected error: ${error}`);
        // Fallback to auth page
        navigate('/auth');
      } finally {
        setRedirecting(false);
      }
    };

    // Add a small delay to ensure auth state is settled
    const timer = setTimeout(() => {
      handleUserRedirect();
    }, 100);

    return () => clearTimeout(timer);
  }, [user, loading, navigate, redirecting]);

  // Show loading state
  if (loading || redirecting) {
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname.includes('lovable');
    
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="text-center max-w-md">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <div className="rounded-full bg-pink-100 p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
            <Sparkles className="text-pink-600 w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Welcome to DragonCandy!
          </h1>
          <p className="text-gray-600 mb-4">
            {loading ? 'Loading your account...' : 'Redirecting you to complete your profile setup...'}
          </p>
          
          {isDevelopment && debugInfo && (
            <div className="mt-4 p-3 bg-gray-100 rounded-lg text-sm text-gray-600">
              <div className="font-medium mb-1">Debug Info:</div>
              <div>{debugInfo}</div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // This should rarely render since we redirect in useEffect
  return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50">
      <div className="text-center">
        <div className="rounded-full bg-pink-100 p-3 mx-auto mb-4 w-16 h-16 flex items-center justify-center">
          <Sparkles className="text-pink-600 w-8 h-8" />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          Welcome to DragonCandy!
        </h1>
        <p className="text-gray-600">
          Setting up your profile...
        </p>
      </div>
    </div>
  );
};

export default ProfileOnboarding;
