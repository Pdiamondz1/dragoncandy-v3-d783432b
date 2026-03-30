import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { BrandProfileSetupForm } from '@/components/brand-profile/BrandProfileSetupForm';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';
import { supabase } from '@/integrations/supabase/client';

const BrandProfileSetup = () => {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { formData, logoFile, handleInputChange, setLogoFile } = useBusinessProfileForm();
  const { handleSubmit, loading } = useBusinessProfileSubmit();

  const onSubmit = handleSubmit(() => navigate('/dashboard/brand'), true);

  // Redirect if not a brand user
  React.useEffect(() => {
    if (profile && profile.role !== 'brand') {
      navigate('/');
    }
  }, [profile, navigate]);

  // Check if brand profile is already completed
  React.useEffect(() => {
    const checkProfileCompletion = async () => {
      if (user && profile?.role === 'brand') {
        const { data: brandProfile } = await supabase
          .from('business_profiles')
          .select('is_completed')
          .eq('user_id', user.id)
          .eq('account_type', 'brand')
          .maybeSingle();

        if (brandProfile?.is_completed) {
          console.log('Brand profile already completed, redirecting to dashboard');
          navigate('/dashboard/brand');
        }
      }
    };

    checkProfileCompletion();
  }, [user, profile, navigate]);

  if (!user || !profile) {
    return null;
  }

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Template C Header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
        <button
          onClick={() => navigate(-1)}
          className="text-dc-pink-accent text-lg p-1"
          aria-label="Go back"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-center font-sans text-base font-bold text-gray-900 uppercase tracking-wide">
          Brand Profile Setup
        </h1>
        <div className="w-7" />
      </div>

      {/* Form Content */}
      <div className="px-4 py-6 pb-24 md:pb-0 max-w-4xl mx-auto">
        <p className="text-sm text-gray-500 mb-6">
          Set up your brand profile to start sponsoring campaigns and partnering with creators.
        </p>

        <div>
          <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
            Brand Information
          </p>
          <BrandProfileSetupForm
            formData={formData}
            logoFile={logoFile}
            loading={loading}
            onInputChange={handleInputChange}
            onLogoChange={setLogoFile}
            onSubmit={(e) => onSubmit(e, formData, logoFile, user.id)}
          />
        </div>
      </div>
    </div>
  );
};

export default BrandProfileSetup;
