import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { VideoUploader } from '@/components/promotions/VideoUploader';
import { CustomerInfoForm, CustomerInfoFormData } from '@/components/promotions/CustomerInfoForm';
import { usePromotionSubmission } from '@/hooks/usePromotionSubmission';
import { Gift, Video, ImagePlus, User, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { SocialHandleFields, useSocialHandles } from '@/features/promotions/submission/SubmissionForm';

type Step = 'welcome' | 'video' | 'info' | 'success' | 'error';

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
  
  const { submitPromotion, isSubmitting } = usePromotionSubmission();
  const { handles, setHandles, getSanitized } = useSocialHandles();

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
          setPromotion(data);
        }
      } catch (err: any) {
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
    setStep('info');
  };

  const handleInfoSubmit = async (data: CustomerInfoFormData) => {
    if (!videoFile || !promotionId) return;

    const result = await submitPromotion({
      promotionId,
      customerName: data.customerName,
      customerEmail: data.customerEmail,
      customerPhone: data.customerPhone,
      videoFile,
      marketingRightsAccepted: data.marketingRightsAccepted,
      socialHandles: getSanitized(),
    });

    if (result.success) {
      setStep('success');
    } else if (result.reason === 'duplicate') {
      setError('You have already submitted for this promotion');
      setStep('error');
    } else {
      setError('Something went wrong with your submission. Please try again.');
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
          <p className="text-gray-500 text-sm">Loading promotion...</p>
        </div>
      </div>
    );
  }

  if (error || step === 'error') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="w-full max-w-md border-2 border-dc-teal rounded-2xl p-6 text-center">
          <AlertCircle className="w-16 h-16 text-dc-pink-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Oops!</h2>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!promotion) return null;

  const businessName = promotion.business_profiles?.business_name || 'This Business';

  return (
    <div className="min-h-screen bg-white overflow-x-hidden pb-8">
      {/* Template C header */}
      <div className="bg-white border-b border-gray-100 px-4 py-3 flex items-center">
        <div className="flex-1 text-center">
          <h1 className="font-sans text-base font-bold text-gray-900 uppercase tracking-wide">Promotion</h1>
        </div>
      </div>

      <div className="max-w-md mx-auto p-4">
        {/* Business identity */}
        <div className="text-center py-6">
          {promotion.business_profiles?.logo_url ? (
            <img
              src={promotion.business_profiles.logo_url}
              alt={businessName}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-4 ring-2 ring-dc-teal"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-dc-teal/10 flex items-center justify-center mx-auto mb-4 ring-2 ring-dc-teal">
              <Gift className="w-10 h-10 text-dc-teal" />
            </div>
          )}
          <h2 className="text-lg font-bold text-gray-900">{businessName}</h2>
          <Badge className="mt-2 text-base px-4 py-1 bg-dc-teal text-white rounded-full">
            {formatDiscount()}
          </Badge>
        </div>

        {/* Step Content */}
        {step === 'welcome' && (
          <div className="border-2 border-dc-teal rounded-2xl p-4 space-y-4">
            <h3 className="font-bold text-gray-900 text-center">{promotion.title}</h3>
            {promotion.description && (
              <p className="text-gray-500 text-sm text-center">{promotion.description}</p>
            )}

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-3 bg-dc-teal/5 rounded-xl">
                <Video className="w-5 h-5 text-dc-teal mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Record a video or snap a photo</p>
                  <p className="text-xs text-gray-500">Video: {promotion.video_max_duration || 30}s max • Photo: JPG, PNG, HEIC</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-dc-teal/5 rounded-xl">
                <User className="w-5 h-5 text-dc-teal mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Enter your details</p>
                  <p className="text-xs text-gray-500">We'll send your discount code via email & SMS</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 bg-dc-teal/5 rounded-xl">
                <Gift className="w-5 h-5 text-dc-teal mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-gray-900 text-sm">Get your discount</p>
                  <p className="text-xs text-gray-500">Show the code to redeem {formatDiscount()}</p>
                </div>
              </div>
            </div>

            <button
              onClick={() => setStep('video')}
              className="w-full rounded-full bg-dc-teal text-white font-bold py-3 flex items-center justify-center gap-2 hover:bg-dc-teal/90 transition-colors"
            >
              Let's Start
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'video' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('welcome')}
              className="flex items-center gap-1 text-dc-pink-accent text-lg font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Share Your Experience</p>
              <p className="text-xs text-gray-500 mb-4">
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

        {step === 'info' && (
          <div className="space-y-4">
            <button
              onClick={() => setStep('video')}
              className="flex items-center gap-1 text-dc-pink-accent text-lg font-medium"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
            <div className="border-2 border-dc-teal rounded-2xl p-4">
              <p className="font-sans text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Almost Done!</p>
              <p className="text-xs text-gray-500 mb-4">Enter your details to receive your discount code</p>
              <div className="mb-5">
                <SocialHandleFields value={handles} onChange={setHandles} />
              </div>
              <CustomerInfoForm
                onSubmit={handleInfoSubmit}
                isSubmitting={isSubmitting}
                businessName={businessName}
              />
            </div>
          </div>
        )}

        {step === 'success' && (
          <div className="border-2 border-dc-teal rounded-2xl p-6 text-center space-y-4">
            <div className="w-20 h-20 rounded-full bg-dc-teal/10 flex items-center justify-center mx-auto">
              <CheckCircle className="w-10 h-10 text-dc-teal" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Submission Received!</h2>
            <p className="text-gray-500 text-sm">
              Your {isPhoto ? 'photo' : 'video'} is now pending review. Once approved, you'll receive your discount code via email and SMS.
            </p>
            <div className="p-4 bg-dc-teal/5 rounded-xl text-left">
              <p className="text-sm font-semibold text-gray-900">What happens next?</p>
              <ul className="text-xs text-gray-500 mt-2 space-y-1">
                <li>• {businessName} will review your submission</li>
                <li>• You'll receive your unique discount code</li>
                <li>• Show the code when you visit to redeem</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
