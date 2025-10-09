import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { BrandProfileSetupForm } from '@/components/brand-profile/BrandProfileSetupForm';
import { BrandProfileSetupHeader } from '@/components/brand-profile/BrandProfileSetupHeader';
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
          console.log('🎯 Brand profile already completed, redirecting to dashboard');
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
    <DashboardLayout userRole={profile.role}>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <BrandProfileSetupHeader />
        
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Brand Profile Setup</CardTitle>
          </CardHeader>
          <CardContent>
            <BrandProfileSetupForm
              formData={formData}
              logoFile={logoFile}
              loading={loading}
              onInputChange={handleInputChange}
              onLogoChange={setLogoFile}
              onSubmit={(e) => onSubmit(e, formData, logoFile, user.id)}
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default BrandProfileSetup;
