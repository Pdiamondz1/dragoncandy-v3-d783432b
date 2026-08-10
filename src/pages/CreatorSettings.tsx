import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ShieldAlert } from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { useFirstRunMissions } from '@/hooks/useFirstRunMissions';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { CreatorSettingsSections } from '@/components/settings/CreatorSettingsSections';
import { useCreatorProfileForm } from '@/hooks/useCreatorProfileForm';
import { useCreatorProfileLoad } from '@/hooks/useCreatorProfileLoad';
import { useCreatorProfileSubmit } from '@/hooks/useCreatorProfileSubmit';
import { calculateCreatorCompletion } from '@/hooks/useProfileCompletion';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { NotificationPreferencesSection } from '@/components/settings/NotificationPreferencesSection';
import { SUPPORT_EMAIL, mailtoHref } from '@/lib/contactAddresses';
import { DeleteUserSheet } from '@/components/org/DeleteUserSheet';
import { Coachmark } from '@/components/guidance/Coachmark';
import { WhyExpander } from '@/components/guidance/WhyExpander';
import { PageHeader } from '@/components/ui/PageHeader';
import { PageBody } from '@/components/app/PageBody';

const CreatorSettings = () => {
  const { submitProfile } = useCreatorProfileSubmit();
  const { completeMission } = useFirstRunMissions();
  const [searchParams] = useSearchParams();
  const [activeSection, setActiveSection] = useState<string | undefined>(
    searchParams.get('section') ?? undefined
  );
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);

  const {
    formData,
    avatarFile,
    portfolioPaths,
    selectedSkills,
    handleInputChange,
    handleSkillChange,
    setAvatarFile,
    setPortfolioPaths,
    setFormDataFromProfile,
  } = useCreatorProfileForm();

  useCreatorProfileLoad(setFormDataFromProfile);

  const handleFieldBlur = async () => {
    const success = await submitProfile(formData, selectedSkills, avatarFile, portfolioPaths, true);
    if (success) {
      setAvatarFile(null);
      toast.success('Saved', { duration: 1500 });
      if (portfolioPaths.length > 0) completeMission('add_portfolio');
    }
  };

  const handleNudgeClick = () => {
    if (completion.nextSection) {
      setActiveSection(completion.nextSection);
    }
  };

  const completion = calculateCreatorCompletion({
    creator_name: formData.creator_name,
    bio: formData.bio,
    skills: selectedSkills,
    avatar_url: formData.avatar_url || null,
    base_rate_per_hour: formData.base_rate_per_hour ? parseFloat(formData.base_rate_per_hour) : null,
    portfolio_urls: portfolioPaths.length > 0 ? portfolioPaths : null,
    instagram_url: formData.instagram_url || null,
    tiktok_url: formData.tiktok_url || null,
    youtube_url: formData.youtube_url || null,
    facebook_url: formData.facebook_url || null,
    linkedin_url: formData.linkedin_url || null,
    x_url: formData.x_url || null,
    other_social_url: formData.other_social_url || null,
    website_url: formData.website_url || null,
    city: formData.city || null,
    country: formData.country || null,
  });

  return (
    <DashboardLayout userRole="content_creator">
      <div className="min-h-screen bg-white overflow-x-hidden">
        <PageBody className="space-y-0">
        <PageHeader>
          <div className="max-w-lg mx-auto">
            <ProfileCompletionBar
              avatarUrl={formData.avatar_url || null}
              displayName={formData.creator_name || 'Creator'}
              roleLabel="Content Creator"
              completion={completion}
              isCreator={true}
              onNudgeClick={handleNudgeClick}
            />
          </div>
        </PageHeader>
        <div className="max-w-lg mx-auto p-4">
          <CreatorSettingsSections
            formData={formData}
            selectedSkills={selectedSkills}
            avatarFile={avatarFile}
            portfolioPaths={portfolioPaths}
            completion={completion}
            onInputChange={handleInputChange}
            onSkillChange={handleSkillChange}
            onAvatarFileChange={setAvatarFile}
            onPortfolioPathsChange={setPortfolioPaths}
            onFieldBlur={handleFieldBlur}
            defaultSection={activeSection}
          />

          <Accordion type="single" collapsible className="mt-3">
            <NotificationPreferencesSection />
          </Accordion>

          <Accordion type="single" collapsible className="mt-3">
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
                <button
                  onClick={() => setDeleteUserOpen(true)}
                  className="text-sm text-red-500 hover:text-red-700 underline"
                >
                  Delete my user account
                </button>
                <div className="flex items-center gap-1">
                  <a
                    href={mailtoHref(SUPPORT_EMAIL, 'GDPR Data Erasure Request')}
                    className="text-sm text-muted-foreground hover:text-foreground underline"
                  >
                    Request full data erasure (GDPR/CCPA)
                  </a>
                  <WhyExpander expanderKey="soft_delete_vs_gdpr" title="What's the difference?" body="Soft delete preserves your data for 30 days in case you change your mind. GDPR erasure permanently removes everything." />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DeleteUserSheet open={deleteUserOpen} onOpenChange={setDeleteUserOpen} />
        </div>
        </PageBody>
      </div>
    </DashboardLayout>
  );
};

export default CreatorSettings;
