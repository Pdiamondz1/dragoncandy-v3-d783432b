
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useEffect(() => {
    // If user is authenticated, redirect to appropriate dashboard
    if (user && !loading) {
      const redirectToDashboard = async () => {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single();

          if (profile?.role === 'business_client') {
            navigate('/dashboard/business');
          } else if (profile?.role === 'content_creator') {
            navigate('/dashboard/creator');
          }
        } catch (error) {
          console.error('Error checking user role:', error);
        }
      };
      
      redirectToDashboard();
    } else if (!loading && !user) {
      // Redirect unauthenticated users to landing page
      navigate('/landing');
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  // This should not render anything as users will be redirected
  return null;
}
