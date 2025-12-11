import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { VideoUploader } from '@/components/promotions/VideoUploader';
import { CustomerInfoForm, CustomerInfoFormData } from '@/components/promotions/CustomerInfoForm';
import { usePromotionSubmission } from '@/hooks/usePromotionSubmission';
import { Gift, Video, User, CheckCircle, AlertCircle, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';

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
  
  const { submitPromotion, isSubmitting } = usePromotionSubmission();

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
    });

    if (result.success) {
      setStep('success');
    } else if (result.reason === 'duplicate') {
      setError('You have already submitted a video for this promotion');
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
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading promotion...</p>
        </div>
      </div>
    );
  }

  if (error || step === 'error') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertCircle className="w-16 h-16 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Oops!</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!promotion) return null;

  const businessName = promotion.business_profiles?.business_name || 'This Business';

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 to-background">
      <div className="max-w-md mx-auto p-4 pb-8">
        {/* Header */}
        <div className="text-center py-6">
          {promotion.business_profiles?.logo_url ? (
            <img
              src={promotion.business_profiles.logo_url}
              alt={businessName}
              className="w-20 h-20 rounded-full object-cover mx-auto mb-4 border-4 border-background shadow-lg"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 border-4 border-background shadow-lg">
              <Gift className="w-10 h-10 text-primary" />
            </div>
          )}
          <h1 className="text-xl font-bold">{businessName}</h1>
          <Badge variant="secondary" className="mt-2 text-lg px-4 py-1">
            {formatDiscount()}
          </Badge>
        </div>

        {/* Step Content */}
        {step === 'welcome' && (
          <Card>
            <CardHeader>
              <CardTitle className="text-center">{promotion.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {promotion.description && (
                <p className="text-muted-foreground text-center">{promotion.description}</p>
              )}
              
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Video className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Record a short video</p>
                    <p className="text-sm text-muted-foreground">
                      {promotion.video_max_duration || 30} seconds or less
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <User className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Enter your details</p>
                    <p className="text-sm text-muted-foreground">
                      We'll send your discount code via email & SMS
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg">
                  <Gift className="w-5 h-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">Get your discount</p>
                    <p className="text-sm text-muted-foreground">
                      Show the code to redeem {formatDiscount()}
                    </p>
                  </div>
                </div>
              </div>

              <Button 
                className="w-full" 
                size="lg"
                onClick={() => setStep('video')}
              >
                Let's Start
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 'video' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('welcome')}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Record Your Video</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Create a {promotion.video_max_duration || 30}-second video about your experience
                </p>
              </CardHeader>
              <CardContent>
                <VideoUploader
                  onVideoSelected={handleVideoSelected}
                  maxDuration={promotion.video_max_duration || 30}
                  maxSizeMB={50}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'info' && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setStep('video')}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Almost Done!</CardTitle>
                <p className="text-sm text-muted-foreground">
                  Enter your details to receive your discount code
                </p>
              </CardHeader>
              <CardContent>
                <CustomerInfoForm
                  onSubmit={handleInfoSubmit}
                  isSubmitting={isSubmitting}
                  businessName={businessName}
                />
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'success' && (
          <Card>
            <CardContent className="pt-6 text-center space-y-4">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mx-auto">
                <CheckCircle className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <h2 className="text-xl font-semibold">Video Submitted!</h2>
              <p className="text-muted-foreground">
                Your video is now pending review. Once approved, you'll receive 
                your discount code via email and SMS.
              </p>
              <div className="pt-4 p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium">What happens next?</p>
                <ul className="text-sm text-muted-foreground mt-2 space-y-1 text-left">
                  <li>• {businessName} will review your video</li>
                  <li>• You'll receive your unique discount code</li>
                  <li>• Show the code when you visit to redeem</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
