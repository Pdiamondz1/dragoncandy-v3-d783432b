import React from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { BrandProfileSetupForm } from '@/components/brand-profile/BrandProfileSetupForm';
import { BrandProfileSetupHeader } from '@/components/brand-profile/BrandProfileSetupHeader';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';

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
