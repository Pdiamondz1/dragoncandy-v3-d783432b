
import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { BusinessSettingsHeader } from '@/components/business-profile/BusinessSettingsHeader';
import { BusinessSettingsForm } from '@/components/business-profile/BusinessSettingsForm';
import { RestaurantPaymentSettings } from '@/components/business-profile/RestaurantPaymentSettings';
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
        const { data: businessProfile, error } = await supabase
          .from('business_profiles')
          .select('*')
          .eq('user_id', user.id)
          .eq('account_type', 'restaurant')
          .maybeSingle();

        if (error) {
          console.error('Error loading profile:', error);
          return;
        }

        if (businessProfile) {
          setFormDataFromProfile(businessProfile);
        }
      } catch (error) {
        console.error('Error loading profile:', error);
      }
    };

    loadProfile();
  }, [user?.id, navigate, setFormDataFromProfile]);

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
      <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
        <div className="max-w-2xl space-y-6">
          <BusinessSettingsHeader />
          <RestaurantPaymentSettings />
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
