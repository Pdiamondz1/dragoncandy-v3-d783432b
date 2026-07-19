import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '@/lib/motion';
import { useAuth } from '@/hooks/useAuth';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { supabase } from '@/integrations/supabase/client';
import { uploadProfileAsset } from '@/lib/storage/uploadProfileAsset';
import { consumePendingBrief } from '@/lib/pendingBrief';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth/AuthShell';
import { LandingButton } from '@/components/landing/LandingButton';
import { AvatarCropModal } from '@/components/settings/AvatarCropModal';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { OnboardingProgress } from './OnboardingProgress';
import { TapGrid } from './TapGrid';
import { IdentityStep } from './steps/IdentityStep';
import { BioStep } from './steps/BioStep';
import { WelcomeStep } from './steps/WelcomeStep';
import type { Database } from '@/integrations/supabase/types';

type UserRole = 'business_client' | 'content_creator' | 'brand';
type CreatorSkill = Database['public']['Enums']['creator_skill'];
type IndustryType = Database['public']['Enums']['industry_type'];

type StepId = 'identity' | 'industry' | 'skills' | 'bio' | 'welcome';

const ROLE_STEPS: Record<UserRole, StepId[]> = {
  business_client: ['identity', 'industry', 'welcome'],
  content_creator: ['identity', 'skills', 'bio', 'welcome'],
  brand: ['identity', 'industry', 'welcome'],
};

const INDUSTRY_ITEMS = [
  { value: 'food', label: 'Food & Dining', icon: '🍕' },
  { value: 'fashion', label: 'Fashion', icon: '👗' },
  { value: 'beauty', label: 'Beauty', icon: '💄' },
  { value: 'fitness', label: 'Fitness', icon: '🏋️' },
  { value: 'technology', label: 'Technology', icon: '💻' },
  { value: 'travel', label: 'Travel', icon: '✈️' },
  { value: 'health', label: 'Health', icon: '🏥' },
  { value: 'entertainment', label: 'Entertainment', icon: '🎬' },
  { value: 'education', label: 'Education', icon: '📚' },
  { value: 'lifestyle', label: 'Lifestyle', icon: '🌿' },
  { value: 'finance', label: 'Finance', icon: '💰' },
  { value: 'automotive', label: 'Automotive', icon: '🚗' },
  { value: 'real_estate', label: 'Real Estate', icon: '🏘️' },
  { value: 'other', label: 'Other', icon: '✨' },
];

const SKILL_ITEMS = [
  { value: 'video_editing', label: 'Video', icon: '✂️' },
  { value: 'photography', label: 'Photo', icon: '📷' },
  { value: 'graphic_design', label: 'Design', icon: '🎨' },
  { value: 'copywriting', label: 'Copy', icon: '✍️' },
  { value: 'social_media_management', label: 'Social', icon: '📱' },
  { value: 'animation', label: 'Animation', icon: '🎞️' },
  { value: 'content_strategy', label: 'Strategy', icon: '📊' },
  { value: 'influencer_marketing', label: 'Influencer', icon: '🌟' },
  { value: 'other', label: 'Other', icon: '✨' },
];

const DASHBOARD_ROUTES: Record<UserRole, string> = {
  business_client: '/dashboard/business',
  content_creator: '/dashboard/creator',
  brand: '/dashboard/brand',
};

const slideVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? 280 : -280,
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction > 0 ? -280 : 280,
    opacity: 0,
  }),
};

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const autoDetect = useAutoDetect();

  const role = (user?.user_metadata?.role as UserRole) ?? 'content_creator';
  const steps = ROLE_STEPS[role];
  const inputSteps = steps.filter(s => s !== 'welcome');
  const accentColor = role === 'content_creator' ? 'teal' as const : 'pink' as const;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string>(role === 'business_client' ? 'food' : '');
  const [skills, setSkills] = useState<string[]>([]);
  const [bio, setBio] = useState('');

  const currentStep = steps[currentIndex];
  const isWelcome = currentStep === 'welcome';
  const isFirstInput = currentIndex === 0;

  const isStepValid = useCallback(() => {
    switch (currentStep) {
      case 'identity': return name.trim().length > 0;
      case 'industry': return industry !== '';
      case 'skills': return skills.length > 0;
      case 'bio': return bio.trim().length > 0;
      case 'welcome': return true;
      default: return false;
    }
  }, [currentStep, name, industry, skills, bio]);

  const goNext = () => {
    if (currentIndex < steps.length - 1) {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
    }
  };

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCropSrc(URL.createObjectURL(file));
  };

  const handleCropComplete = (croppedFile: File) => {
    setAvatarFile(croppedFile);
    setAvatarPreview(URL.createObjectURL(croppedFile));
    setCropSrc(null);
  };

  const toggleSkill = (value: string) => {
    setSkills(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    try {
      let avatarUrl: string | null = null;
      if (avatarFile) {
        const isCreator = role === 'content_creator';
        const result = await uploadProfileAsset({
          file: avatarFile,
          userId: user.id,
          kind: isCreator ? 'avatar' : 'logo',
        });
        avatarUrl = result.path;
      }

      const locationData = {
        city: autoDetect.city || null,
        country: autoDetect.country || null,
        timezone: autoDetect.timezone || null,
      };

      if (role === 'content_creator') {
        const { error } = await supabase.from('creator_profiles').upsert({
          user_id: user.id,
          creator_name: name.trim(),
          bio: bio.trim(),
          skills: skills as CreatorSkill[],
          avatar_url: avatarUrl,
          ...locationData,
          is_completed: true,
        }, { onConflict: 'user_id' });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('business_profiles').upsert({
          user_id: user.id,
          business_name: name.trim(),
          industry: industry as IndustryType,
          logo_url: avatarUrl,
          ...locationData,
          is_completed: true,
        }, { onConflict: 'user_id' });
        if (error) throw error;
      }

      toast.success('Profile created!');
      // Honor a guest's saved brief (landing "Save this brief — sign up free"):
      // business/brand → straight into the campaign builder pre-filled; else dashboard.
      const pending = consumePendingBrief(role);
      navigate(pending?.redirectTo ?? DASHBOARD_ROUTES[role]);
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const stepTitle = () => {
    switch (currentStep) {
      case 'industry':
        return role === 'business_client' ? "What kind of food?" : "What's your industry?";
      case 'skills': return "What do you create?";
      case 'bio': return "Describe yourself";
      default: return '';
    }
  };

  const stepSubtitle = () => {
    switch (currentStep) {
      case 'industry': return 'Tap to select';
      case 'skills': return 'Pick all that apply';
      case 'bio': return 'One catchy line about you';
      default: return '';
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'identity':
        return (
          <IdentityStep
            name={name}
            onNameChange={setName}
            avatarPreview={avatarPreview}
            onAvatarChange={handleAvatarChange}
            role={role}
          />
        );

      case 'industry':
        return (
          <TapGrid
            items={INDUSTRY_ITEMS}
            selected={industry ? [industry] : []}
            onToggle={(val) => setIndustry(val)}
            mode="single"
            accentColor={accentColor}
          />
        );

      case 'skills':
        return (
          <TapGrid
            items={SKILL_ITEMS}
            selected={skills}
            onToggle={toggleSkill}
            mode="multi"
            accentColor={accentColor}
          />
        );

      case 'bio':
        return <BioStep bio={bio} onBioChange={setBio} />;

      case 'welcome':
        return (
          <WelcomeStep
            name={name}
            role={role}
            onContinue={handleSubmit}
            loading={loading}
          />
        );

      default:
        return null;
    }
  };

  return (
    <AuthShell className="flex items-center justify-center">
      <div className="w-full md:max-w-lg md:bg-white md:border-2 md:border-landing-line md:rounded-3xl md:shadow-[0_14px_30px_rgba(36,19,50,0.08)] md:my-8">
      <div className="flex flex-col min-h-[100dvh] md:min-h-[580px] max-w-md mx-auto px-5 py-6 md:py-8">
        {/* Header */}
        {!isWelcome && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-6"
          >
            {!isFirstInput ? (
              <motion.button
                type="button"
                onClick={goBack}
                whileTap={{ scale: 0.9 }}
                className="w-10 h-10 rounded-full bg-white border border-landing-line flex items-center justify-center text-landing-ink-soft hover:bg-landing-lilac transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </motion.button>
            ) : (
              <div className="w-10" />
            )}

            <OnboardingProgress
              currentStep={currentIndex}
              totalSteps={inputSteps.length}
              accentColor={accentColor}
            />

            <div className="w-10" />
          </motion.div>
        )}

        {/* Step title */}
        {!isWelcome && currentStep !== 'identity' && (
          <div className="text-center mb-5">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentStep}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                <h2 className="font-display text-xl font-bold text-landing-ink">{stepTitle()}</h2>
                <p className="text-sm text-landing-ink-soft mt-0.5">{stepSubtitle()}</p>
              </motion.div>
            </AnimatePresence>
          </div>
        )}

        {/* Identity step has its own titles inside the component */}
        {currentStep === 'identity' && (
          <div className="text-center mb-5">
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="font-display text-xl font-bold text-landing-ink">
                {role === 'content_creator' ? "What should we call you?" : role === 'brand' ? "What's your brand?" : "What's your restaurant called?"}
              </h2>
              <p className="text-sm text-landing-ink-soft mt-0.5">
                {role === 'content_creator' ? "Your creative name or real name" : "This is how others will find you"}
              </p>
            </motion.div>
          </div>
        )}

        {/* Step content */}
        <div className="flex-1 flex flex-col justify-center overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={currentStep}
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Auto-detected location badge */}
        {!isWelcome && !autoDetect.loading && (autoDetect.city || autoDetect.country) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className={`rounded-full px-4 py-2 mb-4 text-xs flex items-center justify-center gap-1.5 ${
              accentColor === 'teal'
                ? 'bg-landing-mint-soft text-landing-mint-ink'
                : 'bg-landing-pink-soft text-landing-pink-ink'
            }`}
          >
            <MapPin className="w-3 h-3" />
            {[autoDetect.city, autoDetect.country].filter(Boolean).join(', ')}
          </motion.div>
        )}

        {/* Next button */}
        {!isWelcome && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <LandingButton
              onClick={goNext}
              disabled={!isStepValid()}
              variant="pink"
              className="w-full h-14 text-base disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                Continue
                <ArrowRight className="w-4 h-4" />
              </span>
            </LandingButton>
            <p className="text-center text-xs text-landing-ink-soft mt-3">
              {currentStep === 'identity' && 'You can change this later in settings'}
              {currentStep === 'industry' && 'This helps us match you with the right people'}
              {currentStep === 'skills' && 'Brands filter by these to find you'}
              {currentStep === 'bio' && 'Keep it short — you can edit anytime'}
            </p>
          </motion.div>
        )}
      </div>

      {/* Avatar crop modal */}
      {cropSrc && (
        <AvatarCropModal
          open
          imageSrc={cropSrc}
          cropShape={role === 'content_creator' ? 'round' : 'rect'}
          onComplete={handleCropComplete}
          onCancel={() => setCropSrc(null)}
        />
      )}
      </div>
    </AuthShell>
  );
}
