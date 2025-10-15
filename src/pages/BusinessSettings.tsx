
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { BusinessSettingsHeader } from '@/components/business-profile/BusinessSettingsHeader';
import { BusinessSettingsForm } from '@/components/business-profile/BusinessSettingsForm';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';

const BusinessSettings = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { submitProfile, loading } = useBusinessProfileSubmit();
  
  const {
    formData,
    logoFile,
    handleInputChange,
    setLogoFile,
    setFormDataFromProfile
  } = useBusinessProfileForm();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data: businessProfile } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', user.id)
          .maybeSingle();

        if (businessProfile) {
          setFormDataFromProfile(businessProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
  }, [user, navigate, setFormDataFromProfile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    const success = await submitProfile(formData, logoFile, user.id);
    if (success) {
      setLogoFile(null);
    }
  };

  return (
    <DashboardLayout userRole="business_client">
      <div className="flex-1 p-8">
        <div className="max-w-2xl">
          <BusinessSettingsHeader />
          <BusinessSettingsForm
            formData={formData}
            logoFile={logoFile}
            loading={loading}
            onInputChange={handleInputChange}
            onLogoChange={setLogoFile}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessSettings;
