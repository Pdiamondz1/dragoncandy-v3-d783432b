import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface SubmissionData {
  promotionId: string;
  customerName?: string;
  customerEmail: string;
  customerPhone?: string;
  videoFile: File;
  marketingRightsAccepted: boolean;
  socialHandles?: Record<string, string>;
}

const isImageFile = (file: File): boolean => file.type.startsWith('image/');

// Read the true duration (seconds) from the video file's metadata. Resolves 0 if the
// browser can't decode it — never rejects, so a submission is never blocked on this.
const getVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(video.duration) ? Math.round(video.duration) : 0);
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      video.src = url;
    } catch {
      resolve(0);
    }
  });

export const usePromotionSubmission = () => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false);

  const checkExistingSubmission = async (promotionId: string, email: string) => {
    setIsCheckingDuplicate(true);
    try {
      const { data, error } = await supabase
        .from('promotion_submissions')
        .select('id')
        .eq('promotion_id', promotionId)
        .eq('customer_email', email)
        .in('status', ['pending', 'approved'])
        .maybeSingle();

      if (error) throw error;
      return !!data;
    } catch (error) {
      console.error('Error checking existing submission:', error);
      return false;
    } finally {
      setIsCheckingDuplicate(false);
    }
  };

  const submitPromotion = async (data: SubmissionData) => {
    setIsSubmitting(true);
    try {
      // Check for existing submission
      const hasExisting = await checkExistingSubmission(
        data.promotionId,
        data.customerEmail
      );

      if (hasExisting) {
        toast({
          title: "Already Submitted",
          description: "You have already submitted for this promotion.",
          variant: "destructive",
        });
        return { success: false, reason: 'duplicate' };
      }

      const isImage = isImageFile(data.videoFile);

      // Upload to storage - preserve original quality
      const fileExt = data.videoFile.name.split('.').pop() || (isImage ? 'jpg' : 'mp4');
      const fileName = `${data.promotionId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('promotion-videos')
        .upload(fileName, data.videoFile, {
          cacheControl: '3600',
          upsert: false,
          contentType: data.videoFile.type || (isImage ? 'image/jpeg' : 'video/mp4'),
        });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('promotion-videos')
        .getPublicUrl(fileName);

      // Read the real media duration — 0 for images
      const videoDuration = isImage ? 0 : await getVideoDuration(data.videoFile);

      // Create submission record
      const { error: insertError } = await supabase
        .from('promotion_submissions')
        .insert({
          promotion_id: data.promotionId,
          customer_name: data.customerName || null,
          customer_email: data.customerEmail,
          customer_phone: data.customerPhone || null,
          video_url: urlData.publicUrl,
          video_duration: videoDuration,
          marketing_rights_accepted: data.marketingRightsAccepted,
          social_handles: data.socialHandles || {},
          status: 'pending',
        });

      if (insertError) {
        // Roll back the orphaned upload so we don't leave dangling storage objects
        await supabase.storage.from('promotion-videos').remove([fileName]);
        // The (promotion_id, customer_email) unique constraint is the real guard against
        // the check-then-insert race — surface it as a friendly duplicate message.
        if (insertError.code === '23505') {
          toast({
            title: "Already Submitted",
            description: "You have already submitted for this promotion.",
            variant: "destructive",
          });
          return { success: false, reason: 'duplicate' };
        }
        throw insertError;
      }

      toast({
        title: "Submission Received!",
        description: `Your ${isImage ? 'photo' : 'video'} is now pending review. You'll receive your discount code soon!`,
      });

      return { success: true };
    } catch (error: unknown) {
      console.error('Error submitting promotion:', error);
      toast({
        title: "Submission Failed",
        description: error instanceof Error ? error.message : "Failed to submit. Please try again.",
        variant: "destructive",
      });
      return { success: false, reason: 'error' };
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    submitPromotion,
    checkExistingSubmission,
    isSubmitting,
    isCheckingDuplicate,
  };
};
