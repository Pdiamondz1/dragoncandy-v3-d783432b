import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { BusinessSettingsSections } from '@/components/settings/BusinessSettingsSections';
import { LocationSettingsSections } from '@/components/settings/LocationSettingsSections';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';
import { useLocationProfileForm } from '@/hooks/useLocationProfileForm';
import { useLocationProfileSubmit } from '@/hooks/useLocationProfileSubmit';
import {
  calculateBusinessCompletion,
  calculateLocationCompletion,
} from '@/hooks/useProfileCompletion';
import { useLocationSocialAccounts } from '@/hooks/outstand/useLocationSocialAccounts';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { DeleteOrgSheet } from '@/components/org/DeleteOrgSheet';
import { LeaveOrgSheet } from '@/components/org/LeaveOrgSheet';
import { DeleteUserSheet } from '@/components/org/DeleteUserSheet';
import { Coachmark } from '@/components/guidance/Coachmark';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { PageHeader } from '@/components/ui/PageHeader';

const BusinessSettings = () => {
  const { user, activeOrg, activeOrgUnit } = useAuth();
  const navigate = useNavigate();
  const { submitProfile: submitBusinessProfile } = useBusinessProfileSubmit();
  const { submitProfile: submitLocationProfile } = useLocationProfileSubmit();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<string | undefined>(
    searchParams.get('section') ?? undefined
  );
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
  const [leaveOrgOpen, setLeaveOrgOpen] = useState(false);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const isOwner = myRole?.role === 'owner';

  const isBrand = user?.user_metadata?.role === 'brand';
  const isLocationMode = !!activeOrgUnit;

  const {
    formData: businessFormData,
    logoFile: businessLogoFile,
    handleInputChange: handleBusinessInputChange,
    setLogoFile: setBusinessLogoFile,
    setFormDataFromProfile,
  } = useBusinessProfileForm();

  const {
    formData: locationFormData,
    logoFile: locationLogoFile,
    handleInputChange: handleLocationInputChange,
    setLogoFile: setLocationLogoFile,
    isLoading: locationLoading,
  } = useLocationProfileForm(activeOrgUnit?.id);

  const { data: locationSocialAccounts } = useLocationSocialAccounts(
    user?.id,
    activeOrgUnit?.id
  );

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('business_profiles')
          .select('business_name, industry, website_url, location, postal_code, city, country, description, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, x_url, other_social_url, logo_url, company_size, founded_year, employee_count_range, budget_range, preferred_collaboration_style, timezone, profile_visibility')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading profile:', error);
          return;
        }

        if (data) {
          setFormDataFromProfile(data);
        }
      } catch (err) {
        console.error('Error loading profile:', err);
      }
    };

    loadProfile();
  }, [user?.id, user, navigate, setFormDataFromProfile]);

  const handleBusinessFieldBlur = async () => {
    if (!user) return;
    const success = await submitBusinessProfile(businessFormData, businessLogoFile, user.id, isBrand);
    if (success) {
      setBusinessLogoFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  const handleLocationFieldBlur = async () => {
    if (!user || !activeOrgUnit) return;
    const success = await submitLocationProfile(
      activeOrgUnit.id,
      locationFormData,
      locationLogoFile,
      user.id,
    );
    if (success) {
      setLocationLogoFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  const hasSocialPresence = !!(
    (locationSocialAccounts && locationSocialAccounts.length > 0) ||
    locationFormData.instagram_url ||
    locationFormData.tiktok_url ||
    locationFormData.youtube_url ||
    locationFormData.facebook_url ||
    locationFormData.linkedin_url ||
    locationFormData.x_url ||
    locationFormData.other_social_url
  );

  const completion = isLocationMode
    ? calculateLocationCompletion({
        name: locationFormData.name || undefined,
        logo_url: locationFormData.logo_url || null,
        description: locationFormData.description || null,
        has_social_presence: hasSocialPresence,
        stripe_onboarding_complete: activeOrgUnit?.stripe_onboarding_complete ?? null,
      })
    : calculateBusinessCompletion({
        business_name: businessFormData.business_name || undefined,
        industry: businessFormData.industry || null,
        logo_url: businessFormData.logo_url || null,
        description: businessFormData.description || null,
        sample_content_urls: null,
        instagram_url: businessFormData.instagram_url || null,
        tiktok_url: businessFormData.tiktok_url || null,
        youtube_url: businessFormData.youtube_url || null,
        facebook_url: businessFormData.facebook_url || null,
        linkedin_url: businessFormData.linkedin_url || null,
        x_url: businessFormData.x_url || null,
        other_social_url: businessFormData.other_social_url || null,
        budget_range: businessFormData.budget_range || null,
      });

  const handleNudgeClick = () => {
    if (completion.nextSection) {
      setActiveSection(completion.nextSection);
    }
  };

  const roleLabel = isBrand ? 'Brand' : 'Business';
  const displayName = isLocationMode
    ? (locationFormData.name || activeOrgUnit?.name || 'Location')
    : (businessFormData.business_name || roleLabel);

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageHeader>
          <div className="max-w-lg mx-auto">
            <ProfileCompletionBar
              avatarUrl={isLocationMode ? (locationFormData.logo_url || null) : (businessFormData.logo_url || null)}
              displayName={displayName}
              roleLabel={roleLabel}
              completion={completion}
              isCreator={false}
              onNudgeClick={handleNudgeClick}
              isLocation={isLocationMode}
              parentName={activeOrg?.name}
            />
          </div>
        </PageHeader>
        <div className="max-w-lg mx-auto p-4">
          {isLocationMode ? (
            <>
              <div className="mb-2">
                <p className="text-[10px] font-bold text-teal-500 uppercase tracking-wider px-1 mb-2">
                  📍 {locationFormData.name || activeOrgUnit?.name} Settings
                </p>
              </div>

              {locationLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">Loading location...</div>
              ) : (
                <LocationSettingsSections
                  formData={locationFormData}
                  logoFile={locationLogoFile}
                  onInputChange={handleLocationInputChange}
                  onLogoChange={setLocationLogoFile}
                  onFieldBlur={handleLocationFieldBlur}
                  defaultSection={activeSection}
                />
              )}

              <div className="my-6 border-t-2 border-dashed border-gray-200" />

              <div className="mb-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1 mb-2">
                  🏢 {activeOrg?.name || roleLabel} · Business-Wide
                </p>
              </div>

              <BusinessSettingsSections
                formData={businessFormData}
                logoFile={businessLogoFile}
                completion={completion}
                onInputChange={handleBusinessInputChange}
                onLogoChange={setBusinessLogoFile}
                onFieldBlur={handleBusinessFieldBlur}
                defaultSection={undefined}
                locationMode
              />
            </>
          ) : (
            <BusinessSettingsSections
              formData={businessFormData}
              logoFile={businessLogoFile}
              completion={completion}
              onInputChange={handleBusinessInputChange}
              onLogoChange={setBusinessLogoFile}
              onFieldBlur={handleBusinessFieldBlur}
              defaultSection={activeSection}
            />
          )}

          <Accordion type="single" collapsible className="mt-6">
            <AccordionItem value="danger" className="border-red-200">
              <AccordionTrigger className="text-red-600 hover:text-red-700">
                <Coachmark coachmarkKey="delete_org_danger" title="Destructive actions" body="Read carefully. Deletion is permanent after 30 days.">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4" />
                    Danger Zone
                  </div>
                </Coachmark>
              </AccordionTrigger>
              <AccordionContent className="space-y-4">
                {isOwner ? (
                  <Button
                    variant="outline"
                    onClick={() => setDeleteOrgOpen(true)}
                    className="w-full justify-start gap-2 border-red-300 text-red-600 hover:bg-red-50 rounded-full"
                  >
                    <Trash2 className="h-4 w-4" />
                    Delete this organization
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => setLeaveOrgOpen(true)}
                    className="w-full justify-start gap-2 rounded-full"
                  >
                    <LogOut className="h-4 w-4" />
                    Leave this organization
                  </Button>
                )}
                <button
                  onClick={() => setDeleteUserOpen(true)}
                  className="text-sm text-red-500 hover:text-red-700 underline"
                >
                  Delete my user account
                </button>
                <div className="flex items-center gap-1">
                  <a
                    href="mailto:support@dragoncandy.io?subject=GDPR%20Data%20Erasure%20Request"
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Request full data erasure (GDPR/CCPA)
                  </a>
                  <WhyExpander expanderKey="soft_delete_vs_gdpr" title="What's the difference?" body="Soft delete preserves your data for 30 days in case you change your mind. GDPR erasure permanently removes everything." />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DeleteOrgSheet open={deleteOrgOpen} onOpenChange={setDeleteOrgOpen} />
          <LeaveOrgSheet open={leaveOrgOpen} onOpenChange={setLeaveOrgOpen} />
          <DeleteUserSheet open={deleteUserOpen} onOpenChange={setDeleteUserOpen} />
        </div>
      </div>
    </DashboardLayout>
  );
};

export default BusinessSettings;
