
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading, error } = useAuth();
  const [debugInfo, setDebugInfo] = useState<string>('');

  useEffect(() => {
    console.log('🏠 Index: Component mounted', { user: !!user, loading, error });
    
    // Add debug information
    const info = `User: ${user ? 'authenticated' : 'none'}, Loading: ${loading}, Error: ${error || 'none'}`;
    setDebugInfo(info);

    // If user is authenticated, redirect to appropriate dashboard
    if (user && !loading) {
      console.log('🏠 Index: User authenticated, checking role...');
      const redirectToDashboard = async () => {
        try {
          // First, check user metadata for role (set during signup)
          const userRole = user.user_metadata?.role;
          console.log('📋 Index: User metadata role:', userRole);

          console.log('🔍 Index: Fetching user profile for dashboard redirect...');
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .maybeSingle();

          if (profileError) {
            console.error('❌ Index: Error checking user role:', profileError);
            // If user has metadata role but profile fetch failed, redirect to profile setup
            if (userRole) {
              console.log('🔧 Index: Profile check failed but user has metadata role, redirecting to profile setup...');
              navigate('/profile/onboarding');
              return;
            }
            // Otherwise redirect to landing
            console.log('🔧 Index: Profile check failed, redirecting to landing...');
            navigate('/landing');
            return;
          }

          // If profile exists, redirect to appropriate dashboard
          if (profile?.role === 'business_client') {
            console.log('🏢 Index: Redirecting to business dashboard');
            navigate('/dashboard/business');
          } else if (profile?.role === 'content_creator') {
            console.log('🎨 Index: Redirecting to creator dashboard');
            navigate('/dashboard/creator');
          } else if (userRole) {
            // User is authenticated and has metadata role but no profile - redirect to profile setup
            console.log('👤 Index: User has metadata role but no profile, redirecting to profile setup');
            navigate('/profile/onboarding');
          } else {
            // No profile and no metadata role - something went wrong, redirect to landing
            console.log('❓ Index: No profile and no metadata role, redirecting to landing');
            navigate('/landing');
          }
        } catch (error) {
          console.error('❌ Index: Dashboard redirect failed:', error);
          // Check if user has metadata role for fallback
          const userRole = user.user_metadata?.role;
          if (userRole) {
            console.log('🔧 Index: Error occurred but user has metadata role, redirecting to profile setup');
            navigate('/profile/onboarding');
          } else {
            // Fallback to landing page if anything goes wrong
            navigate('/landing');
          }
        }
      };
      
      redirectToDashboard();
    } else if (!loading && !user) {
      // Redirect unauthenticated users to landing page (with a small delay to avoid race condition)
      console.log('🚫 Index: No user, redirecting to landing page');
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
