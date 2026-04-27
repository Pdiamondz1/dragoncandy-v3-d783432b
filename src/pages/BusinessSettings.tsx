
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Trash2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import DashboardLayout from '@/components/DashboardLayout';
import { ProfileCompletionBar } from '@/components/settings/ProfileCompletionBar';
import { BusinessSettingsSections } from '@/components/settings/BusinessSettingsSections';
import { useBusinessProfileForm } from '@/hooks/useBusinessProfileForm';
import { useBusinessProfileSubmit } from '@/hooks/useBusinessProfileSubmit';
import { calculateBusinessCompletion } from '@/hooks/useProfileCompletion';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useMyOrgRole } from '@/hooks/useOrgData';
import { DeleteOrgSheet } from '@/components/org/DeleteOrgSheet';
import { LeaveOrgSheet } from '@/components/org/LeaveOrgSheet';
import { DeleteUserSheet } from '@/components/org/DeleteUserSheet';
import { Coachmark } from '@/components/guidance/Coachmark';
import { WhyExpander } from '@/components/guidance/WhyExpander';

const BusinessSettings = () => {
  const { user, activeOrg } = useAuth();
  const navigate = useNavigate();
  const { submitProfile } = useBusinessProfileSubmit();
  const [activeSection, setActiveSection] = useState<string | undefined>(undefined);
  const { data: myRole } = useMyOrgRole(activeOrg?.id);
  const [deleteOrgOpen, setDeleteOrgOpen] = useState(false);
  const [leaveOrgOpen, setLeaveOrgOpen] = useState(false);
  const [deleteUserOpen, setDeleteUserOpen] = useState(false);
  const isOwner = myRole?.role === 'owner';

  const isBrand = user?.user_metadata?.role === 'brand';

  const {
    formData,
    logoFile,
    handleInputChange,
    setLogoFile,
    setFormDataFromProfile,
  } = useBusinessProfileForm();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    const loadProfile = async () => {
      try {
        const { data, error } = await supabase
          .from('business_profiles')
          .select('*')
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
  }, [user?.id, navigate, setFormDataFromProfile]);

  const handleFieldBlur = async () => {
    if (!user) return;
    const success = await submitProfile(formData, logoFile, user.id, isBrand);
    if (success) {
      setLogoFile(null);
      toast.success('Saved', { duration: 1500 });
    }
  };

  const completion = calculateBusinessCompletion({
    business_name: formData.business_name || undefined,
    industry: formData.industry || null,
    logo_url: formData.logo_url || null,
    description: formData.description || null,
    sample_content_urls: null,
    instagram_url: formData.instagram_url || null,
    tiktok_url: formData.tiktok_url || null,
    youtube_url: formData.youtube_url || null,
    facebook_url: formData.facebook_url || null,
    linkedin_url: formData.linkedin_url || null,
    x_url: formData.x_url || null,
    other_social_url: formData.other_social_url || null,
    budget_range: formData.budget_range || null,
  });

  const handleNudgeClick = () => {
    if (completion.nextSection) {
      setActiveSection(completion.nextSection);
    }
  };

  const roleLabel = isBrand ? 'Brand' : 'Business';
  const displayName = formData.business_name || roleLabel;

  return (
    <DashboardLayout userRole="business_client">
      <div className="min-h-screen bg-white p-4">
        <div className="max-w-lg mx-auto">
          <ProfileCompletionBar
            avatarUrl={formData.logo_url || null}
            displayName={displayName}
            roleLabel={roleLabel}
            completion={completion}
            isCreator={false}
            onNudgeClick={handleNudgeClick}
          />
          <BusinessSettingsSections
            formData={formData}
            logoFile={logoFile}
            completion={completion}
            onInputChange={handleInputChange}
            onLogoChange={setLogoFile}
            onFieldBlur={handleFieldBlur}
            defaultSection={activeSection}
          />

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
