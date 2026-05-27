import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { VideoUploader } from '@/components/promotions/VideoUploader';
import { usePromotionSubmission } from '@/hooks/usePromotionSubmission';
import { Gift, Video, Mail, CheckCircle, AlertCircle, ArrowLeft, Loader2, ChevronDown } from 'lucide-react';
import { SocialHandleFields, useSocialHandles } from '@/features/promotions/submission/SubmissionForm';
import { SEO } from '@/components/SEO';
import { PageHeader } from '@/components/ui/PageHeader';
import { PrerequisiteGate } from '@/components/PrerequisiteGate';
import { useResolvedLogoUrl } from '@/hooks/useSignedUrl';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';

type Step = 'welcome' | 'capture' | 'email' | 'success' | 'error';

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  currency: string | null;
  start_date: string;
  end_date: string;
  status: string;
  video_max_duration: number | null;
  max_redemptions: number | null;
  current_redemptions: number | null;
  business_profiles: {
    business_name: string;
    logo_url: string | null;
  } | null;
}

export default function PromotionSubmissionPage() {
  const { promotionId } = useParams<{ promotionId: string }>();
  const [step, setStep] = useState<Step>('welcome');
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const isPhoto = videoFile?.type.startsWith('image/') ?? false;

  // Inline form state
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [consent, setConsent] = useState(false); // Must default to false — legal compliance

  const { submitPromotion, isSubmitting } = usePromotionSubmission();
  const { handles, setHandles, getSanitized } = useSocialHandles();
  const resolvedLogoUrl = useResolvedLogoUrl(promotion?.business_profiles?.logo_url);
  const { toast } = useToast();

  useEffect(() => {
    const fetchPromotion = async () => {
      if (!promotionId) {
        setError('Invalid promotion link');
        setLoading(false);
        return;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('promotions')
          .select(`
            id,
            title,
            description,
            discount_type,
            discount_value,
            currency,
            start_date,
            end_date,
            status,
            video_max_duration,
            max_redemptions,
            current_redemptions,
            business_profiles (
              business_name,
              logo_url
            )
          `)
          .eq('id', promotionId)
          .single();

        if (fetchError) throw fetchError;
        if (!data) throw new Error('Promotion not found');

        // Check if promotion is active
        const now = new Date();
        const startDate = new Date(data.start_date);
        const endDate = new Date(data.end_date);

        if (data.status !== 'active') {
          setError('This promotion is no longer active');
        } else if (now < startDate) {
          setError(`This promotion starts on ${startDate.toLocaleDateString()}`);
        } else if (now > endDate) {
          setError('This promotion has ended');
        } else if (data.max_redemptions && (data.current_redemptions || 0) >= data.max_redemptions) {
          setError('This promotion has reached its maximum number of redemptions');
        } else {
          setPromotion(data as unknown as Promotion);
        }
      } catch (err: unknown) {
        console.error('Error fetching promotion:', err);
        setError('Unable to load promotion details');
      } finally {
        setLoading(false);
      }
    };

    fetchPromotion();
  }, [promotionId]);

  const handleVideoSelected = (file: File) => {
    setVideoFile(file);
    setStep('email');
  };

  const handleSubmit = async () => {
    if (!videoFile || !promotionId || !email) return;

    const result = await submitPromotion({
      promotionId,
      customerName: name || undefined,
      customerEmail: email,
      customerPhone: phone || undefined,
      videoFile,
      marketingRightsAccepted: consent,
      socialHandles: getSanitized(),
    });

    if (result.success) {
      setStep('success');
    } else if (result.reason === 'duplicate') {
      setError('You have already submitted for this promotion');
      setStep('error');
    } else {
      setError('Something went wrong. Please try again.');
      setStep('error');
    }
  };

  const formatDiscount = () => {
    if (!promotion) return '';
    if (promotion.discount_type === 'percentage') {
      return `${promotion.discount_value}% OFF`;
    }
    return `${promotion.currency || '$'}${promotion.discount_value} OFF`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-dc-teal" />
          <p className="text-dc-text-muted text-sm">Loading promotion...</p>
        </div>
      </div>
    );
  }

  if (error || step === 'error') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md border-2 border-dc-teal rounded-2xl p-6 text-center">
          <AlertCircle className="w-16 h-16 text-dc-pink-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-dc-text mb-2">Oops!</h2>
          <p className="text-dc-text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!promotion) return null;

  const businessName = promotion.business_profiles?.business_name || 'This Business';

  return (
    <PrerequisiteGate feature="submit a promotion">
    <div className="min-h-screen bg-white overflow-x-hidden pb-8">
      <SEO
        title={`${promotion.title} - Submit on DragonCandy`}
        description={`Submit content for ${promotion.business_profiles?.business_name ?? 'a business'}'s promotion on DragonCandy.`}
        path={`/promo/${promotionId}`}
      />
      {/* Template C header */}
      <PageHeader>
        <div className="flex-1 text-center">
          <h1 className="font-sans text-base font-bold text-dc-text uppercase tracking-wide">Promotion</h1>
        </div>
      </PageHeader>

      <div className="max-w-md mx-auto p-4">
        {/* Business identity */}
        <div className="text-center py-6">
          {resolvedLogoUrl ? (
            <img
              src={resolvedLogoUrl}
              alt={businessName}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-4 ring-2 ring-dc-teal"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-dc-teal/10 flex items-center justify-center mx-auto mb-4 ring-2 ring-dc-teal">
              <Gift className="w-10 h-10 text-dc-teal" />
            </div>
          )}
          <h2 className="text-lg font-bold text-dc-text">{businessName}</h2>
          <Badge className="mt-2 text-base px-4 py-1 bg-dc-teal-btn text-white rounded-full">
            {formatDiscount()}
          </Badge>
        </div>

        {/* Step Content */}
        {step === 'welcome' && (
          <div className="space-y-4">
            <div className="text-center">
              <h3 className="text-xl font-bold text-dc-text">
                Record your experience → Get {formatDiscount()}
              </h3>
            </div>

            <button
              onClick={() => setStep('capture')}
              className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-4 flex items-center justify-center gap-2 hover:bg-dc-teal-btn-hover transition-colors text-lg"
            >
              <Video className="w-5 h-5" />
              Record
            </button>

            <p className="text-center text-dc-text-muted text-sm">
              <button
                onClick={() => setStep('capture')}
                className="underline text-dc-pink-accent hover:text-dc-pink-accent/80 transition-colors"
              >
                Upload a photo/video instead
              </button>
            </p>

            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-1 text-dc-text-muted text-sm mx-auto w-full justify-center">
                Details
                <ChevronDown className="w-4 h-4" />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="mt-3 p-4 border border-dc-teal/30 rounded-2xl space-y-2">
                  <h4 className="font-semibold text-dc-text text-sm">{promotion.title}</h4>
                  {promotion.description && (
                    <p className="text-dc-text-muted text-xs">{promotion.description}</p>
                  )}
                  <p className="text-dc-text-muted text-xs">
                    Video: {promotion.video_max_duration || 30}s max · Photo: JPG, PNG, HEIC
                  </p>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {step === 'capture' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('welcome')}
              className="flex items-center gap-1 text-dc-pink-accent text-lg font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-dc-text-muted mb-1">Share Your Experience</p>
              <p className="text-xs text-dc-text-muted mb-4">
                Record a {promotion.video_max_duration || 30}-second video or upload a photo
              </p>
              <VideoUploader
                onVideoSelected={handleVideoSelected}
                maxDuration={promotion.video_max_duration || 30}
                maxSizeMB={50}
              />
            </div>
          </div>
        )}

        {step === 'email' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('capture')}
              className="flex items-center gap-1 text-dc-pink-accent text-lg font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-4">
              <div>
                <p className="font-sans text-xs font-semibold uppercase tracking-wider text-dc-text-muted mb-1">Almost Done!</p>
                <p className="text-xs text-dc-text-muted">Enter your email to receive your discount code</p>
              </div>

              {/* Email — required */}
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dc-teal" />
                <Input
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-9 rounded-full border-dc-teal/50 focus:border-dc-teal"
                  required
                />
              </div>

              {/* Optional details collapsible */}
              <Collapsible>
                <CollapsibleTrigger className="flex items-center gap-1 text-dc-text-muted text-sm">
                  Add more details (optional)
                  <ChevronDown className="w-4 h-4" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="mt-3 space-y-3">
                    <Input
                      type="text"
                      placeholder="Your name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="rounded-full border-dc-teal/50 focus:border-dc-teal"
                    />
                    <Input
                      type="tel"
                      placeholder="Phone number (optional)"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="rounded-full border-dc-teal/50 focus:border-dc-teal"
                    />
                  </div>
                </CollapsibleContent>
              </Collapsible>

              {/* Marketing consent — must default to unchecked */}
              <label className="flex items-start gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-dc-teal shrink-0"
                />
                <span className="text-xs text-dc-text-muted">
                  I agree to let {businessName} use my content on social media
                </span>
              </label>

              <button
                onClick={handleSubmit}
                disabled={!email || isSubmitting}
                className="w-full rounded-full bg-dc-teal-btn text-white font-bold py-3 flex items-center justify-center gap-2 hover:bg-dc-teal-btn-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  'Submit & Get Your Discount'
                )}
              </button>
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-dc-teal/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-dc-teal" />
            </div>
            <h2 className="text-xl font-bold text-dc-text">Submission Received!</h2>
            <p className="text-dc-text-muted text-sm">
              Your {isPhoto ? 'photo' : 'video'} is now pending review. Once approved, you'll receive your discount code via email.
            </p>
            <div className="p-4 bg-dc-teal/5 rounded-xl text-left">
              <p className="text-sm font-semibold text-dc-text">What happens next?</p>
              <ul className="text-xs text-dc-text-muted mt-2 space-y-1">
                <li>• {businessName} will review your submission</li>
                <li>• You'll receive your unique discount code</li>
                <li>• Show the code when you visit to redeem</li>
              </ul>
            </div>

            <div className="mt-6 p-4 bg-dc-teal/5 rounded-2xl text-left">
              <p className="text-sm font-medium text-dc-text mb-2">
                Want to be featured on {businessName}'s social media?
              </p>
              <SocialHandleFields value={handles} onChange={setHandles} />
              <button
                onClick={() => {
                  const sanitized = getSanitized();
                  if (Object.values(sanitized).some(v => v)) {
                    toast({ title: 'Social handles saved!' });
                  }
                }}
                className="mt-2 rounded-full bg-dc-teal-btn text-white text-sm font-semibold px-4 py-2 hover:bg-dc-teal-btn-hover transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
    </PrerequisiteGate>
  );
}
