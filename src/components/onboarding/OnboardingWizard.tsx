import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from '@/lib/motion';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useAutoDetect } from '@/hooks/useAutoDetect';
import { supabase } from '@/integrations/supabase/client';
import { uploadProfileAsset } from '@/lib/storage/uploadProfileAsset';
import { requestCreatorAddressVerification } from '@/lib/verifyAddress';
import { toast } from 'sonner';
import { AuthShell } from '@/components/auth/AuthShell';
import { LandingButton } from '@/components/landing/LandingButton';
import { AvatarCropModal } from '@/components/settings/AvatarCropModal';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { OnboardingProgress } from './OnboardingProgress';
import { TapGrid } from './TapGrid';
import { CUISINE_ITEMS } from '@/lib/cuisines';
import { IdentityStep } from './steps/IdentityStep';
import { BioStep } from './steps/BioStep';
import { PhoneStep } from './steps/PhoneStep';
import { AddressStep } from './steps/AddressStep';
import { PaymentsStep } from './steps/PaymentsStep';
import { ReadyStep } from './steps/ReadyStep';
import { ROLE_STEPS, STEP_PHASE, lastCollectStep, coreFingerprint } from './steps';
import { useOrgFromProfile, useOrgUnits, useUpdateOrgUnit, KEYS } from '@/hooks/useOrgData';
import type { Database } from '@/integrations/supabase/types';

type UserRole = 'business_client' | 'content_creator' | 'brand';
type CreatorSkill = Database['public']['Enums']['creator_skill'];
type IndustryType = Database['public']['Enums']['industry_type'];

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
  const { user, refreshProfile } = useAuth();
  const autoDetect = useAutoDetect();

  const role = (user?.user_metadata?.role as UserRole) ?? 'content_creator';
  const steps = ROLE_STEPS[role];
  const inputSteps = steps.filter(s => s !== 'ready');
  const accentColor = role === 'content_creator' ? 'teal' as const : 'pink' as const;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [industry, setIndustry] = useState<string>('');
  const [cuisines, setCuisines] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  // Defaults on, but the creator SEES it on the bio step and can turn it off before finishing —
  // a visible choice, not a silent database default. Nothing back-fills existing creators.
  const [showInFeed, setShowInFeed] = useState(true);

  // Service-slide state. The saved fingerprint is the gate: everything after the last
  // collect slide needs the profile rows to exist, AND needs them to match what is on
  // screen. A plain "have we saved once" boolean did the first job and not the second —
  // going back, correcting a field and continuing left the edit visible and unsaved.
  const [savedFingerprint, setSavedFingerprint] = useState<string | null>(null);
  const [savedLocationKey, setSavedLocationKey] = useState<string | null>(null);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [address, setAddress] = useState('');
  const [addressSaving, setAddressSaving] = useState(false);
  const [addressSaved, setAddressSaved] = useState(false);

  // Recomputed every render and compared by value — see coreFingerprint.
  const currentFingerprint = coreFingerprint({
    name, industry, cuisines, skills, bio, showInFeed, avatarFile,
    city: autoDetect.city, country: autoDetect.country, timezone: autoDetect.timezone,
  });
  // The detected half on its own — what the re-save effect below watches.
  const currentLocationKey = JSON.stringify([
    autoDetect.city || null, autoDetect.country || null, autoDetect.timezone || null,
  ]);
  const uploadedAvatar = useRef<{ file: File; path: string } | null>(null);
  const advancing = useRef(false);

  const queryClient = useQueryClient();
  const { data: orgFromProfile, isError: orgError } = useOrgFromProfile();
  const { data: orgUnits = [], isLoading: orgUnitsLoading, isError: orgUnitsError } =
    useOrgUnits(orgFromProfile?.org?.id);
  const updateOrgUnit = useUpdateOrgUnit();
  const primaryUnit = orgUnits.find(u => u.is_primary) ?? orgUnits[0];

  const currentStep = steps[currentIndex];
  const isReady = currentStep === 'ready';
  // True when the current slide is a service slide whose work is not done, so the
  // forward button is honestly a skip rather than a completion.
  // `payments` is deliberately absent: Stripe's status lives inside StripeConnectSetup
  // and reading it again here would be a second answer to "is this account payable".
  // Since the wizard cannot tell, its button stays the neutral "Continue" — calling it
  // "Skip for now" would be false for a user who just finished Connect.
  const stepDone =
    currentStep === 'phone' ? phoneVerified :
    currentStep === 'address' ? !!primaryUnit?.address_verified_at :
    true;
  const isSkippable = STEP_PHASE[currentStep] === 'service' && !stepDone;
  const isFirstInput = currentIndex === 0;

  const isStepValid = useCallback(() => {
    switch (currentStep) {
      case 'identity': return name.trim().length > 0;
      case 'industry': return industry !== '';
      case 'cuisine': return cuisines.length > 0;
      case 'skills': return skills.length > 0;
      case 'bio': return bio.trim().length > 0;
      // Service slides never block. Each calls a live service, and a user who cannot
      // finish one — no signal, a Stripe outage, a number they would rather not give —
      // must still reach a working dashboard. The readiness engine records them as
      // unmet, which is the honest outcome; a locked door is not.
      case 'phone':
      case 'address':
      case 'payments':
      case 'ready': return true;
      default: return false;
    }
  }, [currentStep, name, industry, cuisines, skills, bio]);

  const goNext = async () => {
    // The core save runs when the LAST COLLECT slide is left, not at the end of the
    // wizard. Every slide after it acts on rows that must already exist: verify-address
    // reads the stored address back rather than trusting the client, and Stripe Connect
    // needs a profile to attach an account to. It also fixes an abandonment bug — a user
    // who quits on the payments slide now has a complete profile and a working
    // dashboard instead of an account that captured nothing.
    // `goNext` became async the moment the core save moved into it, so a second call
    // arriving during that await runs a second save AND a second
    // `setCurrentIndex(prev => prev + 1)` — advancing TWO slides, so a double-tap skips
    // phone verification without ever showing it, and uploads the avatar twice.
    //
    // Two controls, and the test proves the PAIR, not each half: disabling the button
    // while `loading` is true is what actually stops a double click (removing the ref
    // alone leaves the test green), and this ref is the backstop for the paths a disabled
    // attribute does not cover — a programmatic call, or a repeat arriving before React
    // has re-rendered. A ref rather than state, because state set in this tick is not
    // visible to the call that arrives in it. Do not remove either half on the grounds
    // that the suite still passes.
    if (advancing.current) return;
    advancing.current = true;
    try {
      if (currentStep === lastCollectStep(role) && currentFingerprint !== savedFingerprint) {
        const ok = await saveCore();
        if (!ok) return;
      }
      if (currentIndex < steps.length - 1) {
        setDirection(1);
        setCurrentIndex(prev => prev + 1);
      }
    } finally {
      advancing.current = false;
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

  const toggleCuisine = (value: string) => {
    setCuisines(prev =>
      prev.includes(value) ? prev.filter(c => c !== value) : [...prev, value]
    );
  };

  const saveCore = async (): Promise<boolean> => {
    if (!user) return false;
    // Read once, at the start: comparing the fingerprint captured here against the one
    // stored on success means a field edited WHILE the save is in flight stays dirty and
    // gets saved again, rather than being marked clean by a save that never saw it.
    const fingerprintAtSave = currentFingerprint;
    const locationKeyAtSave = currentLocationKey;
    setLoading(true);

    try {
      // Reuse the path from a previous save rather than uploading the same picture twice.
      // Only the FILE changing is worth another upload; a second save triggered by an
      // edited name would otherwise leave an orphaned object in storage every time.
      let avatarUrl: string | null = uploadedAvatar.current?.path ?? null;
      if (avatarFile && uploadedAvatar.current?.file !== avatarFile) {
        const isCreator = role === 'content_creator';
        const result = await uploadProfileAsset({
          file: avatarFile,
          userId: user.id,
          kind: isCreator ? 'avatar' : 'logo',
        });
        avatarUrl = result.path;
        uploadedAvatar.current = { file: avatarFile, path: result.path };
      }

      const locationData = {
        city: autoDetect.city || null,
        country: autoDetect.country || null,
        timezone: autoDetect.timezone || null,
      };

      // Guarantee the core profile row exists. handle_new_user normally creates it
      // at signup, but it deliberately skips account_scope='internal' accounts, so
      // those reach onboarding without one — and every route guard keys off
      // profiles.role. ignoreDuplicates keeps this purely additive: an existing
      // row is never touched, so a real email_verified=false can't be overwritten.
      const { error: profileError } = await supabase.from('profiles').upsert({
        id: user.id,
        email: user.email ?? '',
        role,
        full_name: name.trim(),
        email_verified: !!user.email_confirmed_at,
      }, { onConflict: 'id', ignoreDuplicates: true });
      if (profileError) throw profileError;

      if (role === 'content_creator') {
        // Read the address as stored BEFORE this write (Finding A, task-7 fix round 2):
        // this path is not onboarding-only — /profile/setup is gated only by
        // VerifiedRoute (email verification), with no is_completed check, and
        // LeaveOrgSheet.tsx navigates an existing business/creator user straight back
        // to it. So a RETURNING creator whose address has NOT changed can hit this
        // upsert, and firing verify-address unconditionally would let a transient
        // geocode failure strip a real, still-true stamp for a reason unrelated to
        // their address — the same bug Finding 2 (fix round 1) closed in
        // useCreatorProfileSubmit.ts. A failed pre-read is treated as UNCHANGED (skip
        // re-verification), never as CHANGED — never guess in the direction that risks
        // stripping a true stamp.
        const { data: existingCreator, error: existingCreatorError } = await supabase
          .from('creator_profiles')
          .select('city, country')
          .eq('user_id', user.id)
          .maybeSingle();
        if (existingCreatorError) {
          console.error('Error reading existing creator address before save:', existingCreatorError);
        }

        const { error } = await supabase.from('creator_profiles').upsert({
          user_id: user.id,
          creator_name: name.trim(),
          bio: bio.trim(),
          skills: skills as CreatorSkill[],
          avatar_url: avatarUrl,
          // Written explicitly: this wizard upserts creator_profiles directly and never goes
          // through useCreatorProfileForm, so that hook's default does not reach onboarding.
          allow_portfolio_in_feed: showInFeed,
          ...locationData,
          is_completed: true,
        }, { onConflict: 'user_id' });
        if (error) throw error;

        // A read ERROR must resolve to "unchanged" (skip) — never to "no existing row"
        // (which would fire). `.maybeSingle()` returns `data: null, error: null` for a
        // genuine "no row found" (a real first-time creator, correctly counted as
        // changed) and `data: null, error: <PostgrestError>` for a failed read — those
        // two null-data cases must NOT be conflated, or a transient read failure would
        // fire speculatively, exactly the bug this guard exists to close.
        const addressChanged = existingCreatorError
          ? false
          : !existingCreator
            ? true
            : (existingCreator.city ?? null) !== locationData.city ||
              (existingCreator.country ?? null) !== locationData.country;

        // Best-effort, fire-and-forget: never block or fail onboarding on a geocode
        // outcome. See src/lib/verifyAddress.ts. Fired AFTER the upsert above, which is
        // load-bearing: the edge function reads the STORED row, so calling first would
        // verify the previous address.
        //
        // Onboarding has no postal code field, and this wizard's upsert therefore leaves
        // any postal code a returning creator already saved through the full profile
        // editor untouched. That used to matter: the client sent postalCode: null, the
        // function matched `.is('postal_code', null)`, the stored '07030' did not match,
        // and the account became silently and permanently unverifiable. The function now
        // reads and matches the row's own postal code, so an omission here cannot
        // desynchronise anything.
        if (addressChanged) {
          void requestCreatorAddressVerification({
            city: locationData.city,
            country: locationData.country,
          });
        }
      } else {
        const { error } = await supabase.from('business_profiles').upsert({
          user_id: user.id,
          business_name: name.trim(),
          // Explicit: the column defaults to 'restaurant', which would strand a
          // brand user in BrandRoute when onboarding is the provisioning path.
          account_type: role === 'brand' ? 'brand' : 'restaurant',
          industry: (role === 'brand' ? industry : 'food') as IndustryType,
          cuisines: role === 'business_client' ? cuisines : [],
          logo_url: avatarUrl,
          ...locationData,
          is_completed: true,
        }, { onConflict: 'user_id' });
        if (error) throw error;
      }

      // The provisioning path above can have created the profile row that
      // AuthContext already resolved as null; without this the dashboards we
      // navigate to next would read a stale null profile and hang on their
      // loading state until a full page reload.
      await refreshProfile();
      // The org query is a SEPARATE React Query cache from AuthContext's profile, and
      // `refreshProfile` does not touch it. For a new business the upsert above is what
      // fires `trg_auto_create_org`, so the cached `{ org: null }` this component read on
      // mount is stale the instant that insert lands — leaving `useOrgUnits` disabled,
      // `primaryUnit` undefined, and the address slide unable to save at all. Refetched
      // rather than merely invalidated, and awaited, so the org id is resolved BEFORE the
      // slide that needs it can be reached.
      await queryClient.refetchQueries({ queryKey: KEYS.orgFromProfile(user.id) });
      setSavedFingerprint(fingerprintAtSave);
      setSavedLocationKey(locationKeyAtSave);
      return true;
    } catch (err) {
      console.error(err);
      toast.error('Something went wrong. Please try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // Auto-detection can finish AFTER the core save, because that save moved to the
  // collect/service boundary and detection waits out a geolocation timeout. Left alone,
  // a creator who tapped through quickly saved nulls and nothing ever asked again.
  //
  // Keyed on the DETECTED VALUES, not on the whole fingerprint. The first version
  // watched the fingerprint and fired on every keystroke, because a user can walk back
  // to a collect slide — a save per character, which the suite caught immediately.
  //
  // Through a ref so the effect need not list `saveCore`: a new closure every render
  // would re-run it every render.
  const saveCoreRef = useRef(saveCore);
  saveCoreRef.current = saveCore;
  useEffect(() => {
    if (savedLocationKey === null) return;   // not saved yet — goNext owns the first save
    if (loading) return;                     // a save is already running
    if (autoDetect.loading) return;          // detection has not settled
    if (currentLocationKey === savedLocationKey) return;
    void saveCoreRef.current();
  }, [savedLocationKey, currentLocationKey, loading, autoDetect.loading]);
  /** The address slide writes through the same mutation the settings UI uses, so the
   *  re-verification rules in useUpdateOrgUnit (which fire verify-address only when the
   *  stored address actually changed) apply here too rather than being re-derived. */
  const handleAddressSave = async () => {
    if (!primaryUnit) {
      // Reached only when the units query has SETTLED with nothing. While it is still in
      // flight the button is disabled instead (see `locationLoading` below), because for
      // a brand-new business the location is created by a trigger during the core save
      // and is genuinely a moment behind — telling someone their location does not exist
      // while it is on its way would be false, and it is the common case, not the rare one.
      toast.error('We could not find your location yet — you can add it in settings.');
      return;
    }
    setAddressSaving(true);
    try {
      await updateOrgUnit.mutateAsync({ id: primaryUnit.id, address: address.trim() });
      setAddressSaved(true);
    } catch (err) {
      console.error(err);
      toast.error('Could not save that address. Please try again.');
    } finally {
      setAddressSaving(false);
    }
  };

  const handleFinish = () => navigate(DASHBOARD_ROUTES[role]);

  const stepTitle = () => {
    switch (currentStep) {
      case 'industry':
        return "What's your industry?";
      case 'cuisine':
        return "What kind of food do you serve?";
      case 'skills': return "What do you create?";
      case 'bio': return "Describe yourself";
      case 'phone': return "What's your number?";
      case 'address': return "Where are you based?";
      case 'payments': return "Set up payments";
      default: return '';
    }
  };

  const stepSubtitle = () => {
    switch (currentStep) {
      case 'industry': return 'Tap to select';
      case 'cuisine': return 'Pick all that apply';
      case 'skills': return 'Pick all that apply';
      case 'bio': return 'One catchy line about you';
      case 'phone': return 'We text a code to confirm it';
      case 'address': return 'Your main location';
      case 'payments': return 'Takes about a minute with Stripe';
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

      case 'cuisine':
        return (
          <TapGrid
            items={CUISINE_ITEMS}
            selected={cuisines}
            onToggle={toggleCuisine}
            mode="multi"
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
        return (
          <BioStep
            bio={bio}
            onBioChange={setBio}
            showInFeed={showInFeed}
            onShowInFeedChange={setShowInFeed}
          />
        );

      case 'phone':
        return <PhoneStep verified={phoneVerified} onVerified={() => setPhoneVerified(true)} />;

      case 'address':
        return (
          <AddressStep
            address={address}
            onAddressChange={setAddress}
            onSave={handleAddressSave}
            saving={addressSaving}
            // Loading and failed are different answers and must not be folded together:
            // a failed query is not "still setting up", and reporting it as such leaves the
            // button disabled forever under a message about progress that is not happening.
            locationLoading={!orgError && !orgUnitsError && (orgUnitsLoading || !orgFromProfile?.org?.id)}
            locationError={orgError || orgUnitsError}
            verified={!!primaryUnit?.address_verified_at}
            pending={addressSaved}
          />
        );

      case 'payments':
        return <PaymentsStep role={role} />;

      case 'ready':
        return (
          <ReadyStep
            name={name}
            role={role}
            onContinue={handleFinish}
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
        {!isReady && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-between mb-6"
          >
            {!isFirstInput ? (
              <motion.button
                type="button"
                onClick={goBack}
                aria-label="Go back"
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
        {!isReady && currentStep !== 'identity' && (
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
        {!isReady && !autoDetect.loading && (autoDetect.city || autoDetect.country) && (
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
        {!isReady && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <LandingButton
              onClick={goNext}
              disabled={!isStepValid() || loading}
              variant="pink"
              className="w-full h-14 text-base disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                {/* A service slide the user has not completed is a SKIP, and says so.
                    Labelling it "Continue" would imply the step had been done — the
                    same class of lie as reporting a saved address as a verified one. */}
                {isSkippable ? 'Skip for now' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
              </span>
            </LandingButton>
            <p className="text-center text-xs text-landing-ink-soft mt-3">
              {currentStep === 'identity' && 'You can change this later in settings'}
              {currentStep === 'industry' && 'This helps us match you with the right people'}
              {currentStep === 'cuisine' && 'This helps us match you with the right creators'}
              {currentStep === 'skills' && 'Brands filter by these to find you'}
              {currentStep === 'bio' && 'Keep it short — you can edit anytime'}
              {currentStep === 'phone' && 'Optional — it is how we reach you about live work'}
              {currentStep === 'address' && 'You can add more locations later'}
              {currentStep === 'payments' && 'You can do this later, but you cannot be paid until it is done'}
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
