
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading, error } = useAuth();
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    // Add debug information
    const info = `User: ${user ? 'authenticated' : 'none'}, Loading: ${loading}, Error: ${error || 'none'}`;
    setDebugInfo(info);

    // If user is authenticated, redirect to appropriate dashboard
    if (user && !loading) {
      const redirectToDashboard = async () => {
        try {
          // First, check user metadata for role (set during signup)
          const userRole = user.user_metadata?.role;

          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error('❌ Index: Error checking user role:', profileError);
            navigate('/profile/onboarding');
            return;
          }

          // If profile exists, check role-specific profile completion before redirect
          if (profile?.role === 'business_client') {
            const { data: businessProfile, error: bpError } = await supabase
              .from('business_profiles')
              .select('is_completed')
              .eq('user_id', user.id)
              .maybeSingle();

            if (bpError) {
              console.error('❌ Index: Error fetching business profile:', bpError);
              navigate('/profile/onboarding');
              return;
            }

            if (businessProfile?.is_completed) {
              navigate('/dashboard/business');
            } else {
              navigate('/profile/onboarding');
            }
          } else if (profile?.role === 'content_creator') {
            const { data: creatorProfile, error: cpError } = await supabase
              .from('creator_profiles')
              .select('is_completed')
              .eq('user_id', user.id)
              .maybeSingle();

            if (cpError) {
              console.error('❌ Index: Error fetching creator profile:', cpError);
              navigate('/profile/onboarding');
              return;
            }

            if (creatorProfile?.is_completed) {
              navigate('/dashboard/creator');
            } else {
              navigate('/profile/onboarding');
            }
          } else if (profile?.role === 'brand') {
            const { data: brandProfile, error: brandError } = await supabase
              .from('business_profiles')
              .select('is_completed')
              .eq('user_id', user.id)
              .eq('account_type', 'brand')
              .maybeSingle();

            if (brandError) {
              console.error('❌ Index: Error fetching brand profile:', brandError);
              navigate('/profile/onboarding');
              return;
            }

            if (brandProfile?.is_completed) {
              navigate('/dashboard/brand');
            } else {
              navigate('/profile/onboarding');
            }
          } else {
            // No profile or metadata role found - redirect to profile setup
            navigate('/profile/onboarding');
          }
        } catch (error) {
          console.error('❌ Index: Dashboard redirect failed:', error);
          navigate('/profile/onboarding');
        }
      };

      redirectToDashboard();
    } else if (!loading && !user) {
      // Redirect unauthenticated users to landing page (with a small delay to avoid race condition)
      setTimeout(() => navigate('/landing'), 100);
    } else if (error && !loading) {
      // If there's an authentication error, still redirect to landing
      console.error('❌ Index: Authentication error, redirecting to landing:', error);
      setTimeout(() => navigate('/landing'), 100);
    }
  }, [user, loading, error, navigate]);

  // Show loading with debug info in development
  if (loading) {
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname.includes('lovable');
    
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600 mx-auto"></div>
          <div className="text-lg font-medium text-gray-900">Loading DragonCandy...</div>
          {isDevelopment && (
            <div className="mt-8 p-4 bg-gray-100 rounded-lg text-sm text-gray-600 max-w-md">
              <div className="font-medium mb-2">Debug Info:</div>
              <div>{debugInfo}</div>
              {error && (
                <div className="mt-2 text-red-600">Error: {error}</div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show error state with fallback option
  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="text-center space-y-4 max-w-md">
          <div className="text-xl font-medium text-red-600">Something went wrong</div>
          <div className="text-gray-600">{error}</div>
          <button
            onClick={() => navigate('/landing')}
            className="px-4 py-2 bg-pink-600 text-white rounded-lg hover:bg-pink-700 transition-colors"
          >
            Continue to DragonCandy
          </button>
        </div>
      </div>
    );
  }

  // This should not render anything as users will be redirected
  return null;
}
