
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Sparkles } from 'lucide-react';

const ProfileOnboarding = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/auth');
      return;
    }

    const fetchUserRole = async () => {
      if (!user) return;

      try {
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching user role:', error);
          return;
        }

        setUserRole(profile.role);
        
        // Redirect to appropriate profile setup
        if (profile.role === 'business_client') {
          navigate('/profile/business');
        } else if (profile.role === 'content_creator') {
          navigate('/profile/creator');
        }
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setRoleLoading(false);
      }
    };

    if (user) {
      fetchUserRole();
    }
  }, [user, loading, navigate]);

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-pink-600 mx-auto mb-4"></div>
          <p className="text-pink-600 font-medium">Setting up your profile...</p>
        </div>
      </div>
    );
  }

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
          Redirecting you to complete your profile setup...
        </p>
      </div>
    </div>
  );
};

export default ProfileOnboarding;
