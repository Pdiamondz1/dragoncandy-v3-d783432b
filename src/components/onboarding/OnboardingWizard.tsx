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
import { Button } from '@/components/ui/button';
import { AvatarCropModal } from '@/components/settings/AvatarCropModal';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { AppCard } from '@/components/app/AppCard';
import { OnboardingProgress } from './OnboardingProgress';
import { TapGrid } from './TapGrid';
import { CUISINE_ITEMS } from '@/lib/cuisines';
import { IdentityStep } from './steps/IdentityStep';
import { BioStep } from './steps/BioStep';
import { PhoneStep } from './steps/PhoneStep';
import { AddressStep } from './steps/AddressStep';
import { PaymentsStep } from './steps/PaymentsStep';
import { ReadyStep } from './steps/ReadyStep';
import { ROLE_STEPS, STEP_PHASE, lastCollectStep, coreFingerprint, type StepId } from './steps';
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
  /**
   * The in-flight hydration read. The collect→service boundary AWAITS this before saving.
   *
   * A boolean "did it fail" is not enough and was the round-3 finding: while the read is
   * still pending it is false, so a user moving quickly reaches `saveCore` before hydration
   * lands and overwrites a real profile with the blank/default values on screen — and with
   * a null avatar, since `hydratedAvatarPath` is not populated yet. Awaiting the promise
   * removes the race instead of adding a second thing to check, and costs nothing in the
   * normal case because the read finishes long before anyone crosses the boundary.
   *
   * A ref rather than state because `goNext` closes over the render it was created in, so a
   * state flag set during the await is invisible to the very call that needs it.
   */
  const hydration = useRef<Promise<{ ok: boolean }> | null>(null);
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
  /**
   * The avatar this account ALREADY has, read back during hydration. `saveCore` derives
   * `avatarUrl` from a freshly uploaded file only, so without this a returning user who
   * edits any collect field and continues would upsert `avatar_url: null` and delete the
   * picture still visible on screen. Codex P2, second review round.
   */
  const hydratedAvatarPath = useRef<string | null>(null);
  const advancing = useRef(false);

  const queryClient = useQueryClient();
  const { data: orgFromProfile, isError: orgError } = useOrgFromProfile();
  const { data: orgUnits = [], isLoading: orgUnitsLoading, isError: orgUnitsError } =
    useOrgUnits(orgFromProfile?.org?.id);
  const updateOrgUnit = useUpdateOrgUnit();
  const primaryUnit = orgUnits.find(u => u.is_primary) ?? orgUnits[0];

  /**
   * RESUME AFTER STRIPE. Hosted Connect onboarding is a full page navigation off-site and
   * back, so returning to `/profile/setup` remounts this component with every field at its
   * initial value and `currentIndex` at 0.
   *
   * That is not merely untidy, and it is why the return-path change could not ship alone.
   * The creator write is `upsert(..., { onConflict: 'user_id' })` with NO `ignoreDuplicates`,
   * so a user who came back to a blank slide 1 and pressed Continue would overwrite their
   * own name, bio and skills with empty strings. The bug this replaced merely ended
   * onboarding; this one would have destroyed data. Raised as a P1 by the Codex second
   * review and confirmed against both files before acting on it.
   *
   * So: rehydrate from the rows that already exist, then land on the slide the user left.
   * Runs at most once, and never overwrites something already on screen — if the user has
   * begun typing, their input wins.
   */
  const hydrated = useRef(false);
  useEffect(() => {
    if (hydrated.current || !user) return;
    hydrated.current = true;

    hydration.current = (async (): Promise<{ ok: boolean }> => {
      // Branched rather than a dynamic column string: the generated Supabase types can only
      // resolve a LITERAL select list, and a variable one silently degrades to a parser
      // error type. Two queries with real field lists also keep the repo's
      // "never select *" rule checkable.
      const { data, error } = role === 'content_creator'
        ? await supabase
            .from('creator_profiles')
            .select('creator_name, bio, skills, avatar_url, allow_portfolio_in_feed, is_completed')
            .eq('user_id', user.id)
            .maybeSingle()
        : await supabase
            .from('business_profiles')
            .select('business_name, industry, cuisines, logo_url, is_completed')
            .eq('user_id', user.id)
            .maybeSingle();


      // A FAILED READ AND AN ABSENT ROW ARE OPPOSITE CASES, and an earlier draft of this
      // block treated them the same — the comment here even justified it, reasoning about
      // the first-time user while the dangerous case is the returning one. If the read
      // errors we do not know whether a profile exists, so a blank form must not be allowed
      // to become an upsert over one. `maybeSingle` gives null for "no row", which IS the
      // ordinary new-signup case; an `error` is not. Codex P1, second review round.
      if (error) return { ok: false };
      if (!data) return { ok: true };
      const row = data as unknown as Record<string, unknown>;

      const str = (v: unknown) => (typeof v === 'string' ? v : '');
      const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);

      if (role === 'content_creator') {
        setName(prev => prev || str(row.creator_name));
        setBio(prev => prev || str(row.bio));
        setSkills(prev => (prev.length ? prev : arr(row.skills)));
        hydratedAvatarPath.current = str(row.avatar_url) || null;
        setAvatarPreview(prev => prev || str(row.avatar_url) || null);
        if (typeof row.allow_portfolio_in_feed === 'boolean') setShowInFeed(row.allow_portfolio_in_feed);
      } else {
        setName(prev => prev || str(row.business_name));
        setIndustry(prev => prev || str(row.industry));
        setCuisines(prev => (prev.length ? prev : arr(row.cuisines)));
        hydratedAvatarPath.current = str(row.logo_url) || null;
        setAvatarPreview(prev => prev || str(row.logo_url) || null);
      }

      // Only jump when Stripe actually sent them back AND the profile is complete — a
      // half-finished wizard must still start where the user left off, not at the end.
      // The query flag is deliberately NOT cleared here: `StripeConnectSetup` reads the
      // same flag to refresh its status and clears it itself, and clearing it first would
      // silently break that refresh.
      const params = new URLSearchParams(window.location.search);
      const backFromStripe =
        params.get('stripe_onboarding') === 'complete' || params.get('stripe_refresh') === 'true';

      // `?step=` is set by the post-login redirect, which has already worked out the first
      // slide with actionable work. Honoured only for a slide THIS role actually has, and
      // never `ready` — an untrusted value must not be able to skip the wizard to its end.
      const asked = params.get('step') as StepId | null;
      const askedIndex =
        asked && asked !== 'ready' ? steps.indexOf(asked) : -1;

      const target =
        askedIndex > -1 ? askedIndex
        : backFromStripe && row.is_completed === true ? steps.indexOf('payments')
        : -1;

      if (target > -1) {
        setDirection(1);
        setCurrentIndex(target);
      }
      return { ok: true };
    })();

    // NO cleanup cancellation, deliberately. `hydrated` already makes this run once, so
    // a cleanup would fire on every RE-RENDER that re-runs the effect (the deps include
    // `user`, whose identity is not guaranteed stable) and abort the single in-flight
    // read — which then resolved `{ ok: true }` having applied nothing, so the boundary
    // saved blank values and a null avatar over a real profile. That is the same data
    // loss the await was added to prevent, reached by a different route, and it was the
    // TEST for the pending-read race that exposed it. React 18 makes a state update
    // after unmount a no-op, so there is nothing left for a cleanup to protect here.
  }, [user, role, steps]);

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
        // Wait for the profile read, then refuse rather than guess. `saveCore`'s creator
        // upsert carries no `ignoreDuplicates`, so saving before we know what is already
        // there can write the blank values on screen over a real profile. Awaiting covers
        // the pending case; the result covers the failed one. Reload is the retry.
        const hydrated = await hydration.current;
        if (hydrated && !hydrated.ok) {
          toast.error("We couldn't load your profile. Reload the page before continuing so we don't overwrite it.");
          return;
        }
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
      let avatarUrl: string | null = uploadedAvatar.current?.path ?? hydratedAvatarPath.current ?? null;
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

  /**
   * Writes ONLY the three auto-detected columns, for the case where detection finishes
   * after the core save has already run — which the collect/service boundary made
   * possible, since detection waits out a geolocation timeout.
   *
   * Deliberately NOT `saveCore`. Reusing it here was wrong twice over. It writes the
   * whole profile from live form state, so detection landing while someone was mid-edit
   * on a collect slide would persist that half-finished value — an emptied name saved as
   * `full_name: ''` before they ever pressed Continue, bypassing the validation that
   * Continue enforces. And it reports failure by toast, which is right for a save the
   * user asked for and wrong for one they did not.
   */
  const saveDetectedLocation = useCallback(async (key: string) => {
    if (!user) return;
    const table = role === 'content_creator' ? 'creator_profiles' : 'business_profiles';
    // Recorded BEFORE the await and regardless of the outcome. `loading` is an effect
    // dependency, so leaving the key unchanged on failure meant the effect re-fired the
    // moment the flag came back down — an unbounded loop of requests against any
    // persistent network or permission failure. One attempt per detected value.
    setSavedLocationKey(key);
    const { error } = await supabase.from(table).update({
      city: autoDetect.city || null,
      country: autoDetect.country || null,
      timezone: autoDetect.timezone || null,
    }).eq('user_id', user.id);
    if (error) {
      // Silent by design: nobody asked for this write, and it costs them nothing to lose
      // — the address requirement stays visible on the checklist either way.
      console.error('Failed to save detected location:', error);
      return;
    }
    if (role === 'content_creator') {
      void requestCreatorAddressVerification({
        city: autoDetect.city || null, country: autoDetect.country || null,
      });
    }
  }, [user, role, autoDetect.city, autoDetect.country, autoDetect.timezone]);

  // Keyed on the DETECTED VALUES, not on the whole fingerprint. The first version
  // watched the fingerprint and fired on every keystroke, because a user can walk back
  // to a collect slide — a save per character, which the suite caught immediately.
  useEffect(() => {
    if (savedLocationKey === null) return;   // not saved yet — goNext owns the first save
    if (loading) return;                     // the core save is running; let it finish
    if (autoDetect.loading) return;          // detection has not settled
    if (currentLocationKey === savedLocationKey) return;
    void saveDetectedLocation(currentLocationKey);
  }, [savedLocationKey, currentLocationKey, loading, autoDetect.loading, saveDetectedLocation]);
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
    /*
     * The wizard renders on the AUTHENTICATED app's surface, not on `AuthShell`.
     *
     * `AuthShell` carries the marketing/entry identity — white paper, Instrument Sans,
     * a soft grape/pink/mint glow — which login, signup and the four password/invite
     * pages still use and which this deliberately no longer shares. Onboarding sits one
     * step from the dashboard, so it takes the dashboard's look: plain white, Outfit,
     * `dc-*` tokens, an `AppCard` panel on desktop.
     *
     * `min-h-[100dvh]`, never `vh` — see DESIGN_SYSTEM's shell rule. `100vh` is the
     * URL-bar-collapsed height on iOS Safari, which overhangs the body box and makes the
     * page scroll a gap that resizes mid-gesture.
     */
    <div className="min-h-[100dvh] w-full overflow-x-hidden bg-white text-dc-text flex items-center justify-center">
      <AppCard className="w-full md:max-w-lg md:my-8 border-0 shadow-none md:border md:shadow-dc-sm md:rounded-3xl p-0">
      {/*
        `pt-[calc(1.5rem+env(safe-area-inset-top))]` — the progress bar is the topmost
        thing on this screen, and `index.html` sets `viewport-fit=cover`, so the layout
        viewport runs UNDER the status bar and Dynamic Island. Without paying the inset
        back, the bar and its "Step N of M" label are drawn behind the island and simply
        are not there for the user. `md:` resets it: the desktop card is centred in the
        page and never touches the top of the viewport, so an inset there is just a gap.

        Found on an iPhone 17 Pro simulator, and it is only findable there — mobile
        Safari's URL bar occupies exactly this space, so the web is structurally incapable
        of showing it. Confirmed PRE-EXISTING by building the previous commit against the
        same shell: it clips identically, so this is not fallout from moving off AuthShell.
        Same class as the `MobileTopNav` / landing-header fixes in DESIGN_SYSTEM.md.
      */}
      <div className="flex flex-col min-h-[100dvh] md:min-h-[580px] max-w-md mx-auto px-5 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-6 md:pt-8 md:pb-8">
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
                className="w-10 h-10 rounded-full bg-white border border-dc-teal/15 flex items-center justify-center text-dc-text-muted hover:bg-dc-teal/[0.04] transition-colors"
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
                <h2 className="text-xl font-bold text-dc-text">{stepTitle()}</h2>
                <p className="text-sm text-dc-text-muted mt-0.5">{stepSubtitle()}</p>
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
              <h2 className="text-xl font-bold text-dc-text">
                {role === 'content_creator' ? "What should we call you?" : role === 'brand' ? "What's your brand?" : "What's your restaurant called?"}
              </h2>
              <p className="text-sm text-dc-text-muted mt-0.5">
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
                ? 'bg-dc-teal/12 text-dc-teal-btn'
                : 'bg-dc-pink/25 text-dc-pink-accent-btn'
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
            <Button
              onClick={goNext}
              disabled={!isStepValid() || loading}
              variant="dc-primary"
              className="w-full h-14 text-base disabled:opacity-60"
            >
              <span className="flex items-center gap-2">
                {/* A service slide the user has not completed is a SKIP, and says so.
                    Labelling it "Continue" would imply the step had been done — the
                    same class of lie as reporting a saved address as a verified one. */}
                {isSkippable ? 'Skip for now' : 'Continue'}
                <ArrowRight className="w-4 h-4" />
              </span>
            </Button>
            <p className="text-center text-xs text-dc-text-muted mt-3">
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
      </AppCard>
    </div>
  );
}
