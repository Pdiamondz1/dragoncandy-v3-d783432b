import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface Promotion {
  id: string;
  user_id: string;
  business_id: string;
  title: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  currency: string | null;
  start_date: string;
  end_date: string;
  max_redemptions: number | null;
  current_redemptions: number | null;
  video_max_duration: number | null;
  terms_conditions: string | null;
  qr_code_url: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface PromotionSubmission {
  id: string;
  promotion_id: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  video_url: string;
  video_duration: number | null;
  marketing_rights_accepted: boolean;
  status: string;
  rejection_reason: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  promotion?: Promotion;
}

export interface DiscountCode {
  id: string;
  promotion_id: string;
  submission_id: string;
  code: string;
  customer_email: string;
  customer_phone: string;
  is_redeemed: boolean;
  redeemed_at: string | null;
  redeemed_by: string | null;
  expires_at: string | null;
  email_sent: boolean | null;
  sms_sent: boolean | null;
  created_at: string;
  promotion?: Promotion;
}

export interface CreatePromotionData {
  title: string;
  description?: string;
  discount_type: string;
  discount_value: number;
  currency?: string;
  start_date: string;
  end_date: string;
  max_redemptions?: number;
  video_max_duration?: number;
  accepted_content?: 'both' | 'video' | 'photo';
  terms_conditions?: string;
}

export interface UpdatePromotionData {
  title?: string;
  description?: string;
  discount_type?: string;
  discount_value?: number;
  end_date?: string;
  max_redemptions?: number | null;
  video_max_duration?: number;
  terms_conditions?: string;
}

export interface PromotionStats {
  totalSubmissions: number;
  approvedCount: number;
  rejectedCount: number;
  pendingCount: number;
  redemptionCount: number;
  totalCodes: number;
}

export const usePromotions = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch business profile for the current user
  const { data: businessProfile } = useQuery({
    queryKey: ['business-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from('business_profiles')
        .select('id, business_name')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch all promotions for the business
  const { data: promotions, isLoading: promotionsLoading, isError: promotionsError, refetch: refetchPromotions } = useQuery({
    queryKey: ['promotions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('promotions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as Promotion[];
    },
    enabled: !!user?.id,
  });

  // Fetch pending submissions for all promotions
  const { data: pendingSubmissions, isLoading: submissionsLoading } = useQuery({
    queryKey: ['pending-submissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('promotion_submissions')
        .select(`
          *,
          promotion:promotions(*)
        `)
        .eq('status', 'pending')
        .in('promotion_id', promotions?.map(p => p.id) || [])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as PromotionSubmission[];
    },
    enabled: !!user?.id && !!promotions?.length,
  });

  // Fetch approved submissions
  const { data: approvedSubmissions, isLoading: approvedLoading } = useQuery({
    queryKey: ['approved-submissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('promotion_submissions')
        .select(`
          *,
          promotion:promotions(*)
        `)
        .eq('status', 'approved')
        .in('promotion_id', promotions?.map(p => p.id) || [])
        .order('reviewed_at', { ascending: false });
      if (error) throw error;
      return data as PromotionSubmission[];
    },
    enabled: !!user?.id && !!promotions?.length,
  });

  // Fetch rejected submissions
  const { data: rejectedSubmissions, isLoading: rejectedLoading } = useQuery({
    queryKey: ['rejected-submissions', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('promotion_submissions')
        .select(`
          *,
          promotion:promotions(*)
        `)
        .eq('status', 'rejected')
        .in('promotion_id', promotions?.map(p => p.id) || [])
        .order('reviewed_at', { ascending: false });
      if (error) throw error;
      return data as PromotionSubmission[];
    },
    enabled: !!user?.id && !!promotions?.length,
  });

  // Fetch discount codes for verification
  const { data: discountCodes, isLoading: codesLoading } = useQuery({
    queryKey: ['discount-codes', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('discount_codes')
        .select(`
          *,
          promotion:promotions(*)
        `)
        .in('promotion_id', promotions?.map(p => p.id) || [])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as DiscountCode[];
    },
    enabled: !!user?.id && !!promotions?.length,
  });

  // Fetch all submissions for stats
  const { data: allSubmissions } = useQuery({
    queryKey: ['all-submissions', user?.id],
    queryFn: async () => {
      if (!user?.id || !promotions?.length) return [];
      const { data, error } = await supabase
        .from('promotion_submissions')
        .select('id, status, promotion_id')
        .in('promotion_id', promotions?.map(p => p.id) || []);
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && !!promotions?.length,
  });

  // Calculate stats
  const stats: PromotionStats = {
    totalSubmissions: allSubmissions?.length || 0,
    approvedCount: allSubmissions?.filter(s => s.status === 'approved').length || 0,
    rejectedCount: allSubmissions?.filter(s => s.status === 'rejected').length || 0,
    pendingCount: allSubmissions?.filter(s => s.status === 'pending').length || 0,
    redemptionCount: discountCodes?.filter(c => c.is_redeemed).length || 0,
    totalCodes: discountCodes?.length || 0,
  };

  // Create promotion mutation
  const createPromotion = useMutation({
    mutationFn: async (data: CreatePromotionData) => {
      if (!user?.id || !businessProfile?.id) throw new Error('Not authenticated');
      
      const { data: promotion, error } = await supabase
        .from('promotions')
        .insert({
          user_id: user.id,
          business_id: businessProfile.id,
          status: 'active', // Set to active by default so it appears immediately
          ...data,
        })
        .select()
        .single();
      
      if (error) throw error;
      return promotion;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion created successfully!');
    },
    onError: (error) => {
      console.error('Error creating promotion:', error);
      toast.error('Failed to create promotion');
    },
  });

  // Update promotion status
  const updatePromotionStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('promotions')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion status updated');
    },
  });

  // Update promotion details
  const updatePromotion = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePromotionData }) => {
      const { error } = await supabase
        .from('promotions')
        .update(data)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion updated successfully');
    },
    onError: (error) => {
      console.error('Error updating promotion:', error);
      toast.error('Failed to update promotion');
    },
  });

  // Delete promotion
  const deletePromotion = useMutation({
    mutationFn: async (id: string) => {
      // Delete discount codes first
      await supabase.from('discount_codes').delete().eq('promotion_id', id);
      // Delete submissions
      await supabase.from('promotion_submissions').delete().eq('promotion_id', id);
      // Delete promotion
      const { error } = await supabase.from('promotions').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      queryClient.invalidateQueries({ queryKey: ['pending-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success('Promotion deleted');
    },
    onError: (error) => {
      console.error('Error deleting promotion:', error);
      toast.error('Failed to delete promotion');
    },
  });

  // Review submission (approve/reject)
  const reviewSubmission = useMutation({
    mutationFn: async ({ 
      submissionId, 
      status, 
      rejectionReason 
    }: { 
      submissionId: string; 
      status: 'approved' | 'rejected'; 
      rejectionReason?: string;
    }) => {
      const submission = pendingSubmissions?.find(s => s.id === submissionId);
      if (!submission) throw new Error('Submission not found');

      // Update submission status
      const { error } = await supabase
        .from('promotion_submissions')
        .update({
          status,
          rejection_reason: rejectionReason || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user?.id,
        })
        .eq('id', submissionId);
      
      if (error) throw error;

      let discountCode: string | undefined;
      let codeExpiresAt: string | undefined;

      // If approved, generate discount code with retry on collision
      if (status === 'approved') {
        codeExpiresAt = submission.promotion?.end_date;

        const maxAttempts = 3;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          discountCode = generateDiscountCode();
          const { error: codeError } = await supabase
            .from('discount_codes')
            .insert({
              promotion_id: submission.promotion_id,
              submission_id: submissionId,
              code: discountCode,
              customer_email: submission.customer_email,
              customer_phone: submission.customer_phone,
              expires_at: codeExpiresAt,
            });
          if (!codeError) break;
          if (codeError.code === '23505' && attempt < maxAttempts - 1) continue;
          throw codeError;
        }
      }

      // Send notification via edge function
      try {
        const { data: notificationResult, error: notificationError } = await supabase.functions.invoke(
          'send-promotion-notification',
          {
            body: {
              type: status === 'approved' ? 'video_approved' : 'video_rejected',
              customerEmail: submission.customer_email,
              customerPhone: submission.customer_phone,
              customerName: submission.customer_name,
              discountCode,
              businessName: businessProfile?.business_name || 'Our Restaurant',
              discountType: submission.promotion?.discount_type || 'percentage',
              discountValue: submission.promotion?.discount_value || 0,
              expiresAt: codeExpiresAt,
              rejectionReason,
            },
          }
        );

        if (notificationError) {
          console.error('Notification error:', notificationError);
        } else {
          console.log('Notification sent:', notificationResult);
          
          // Update email_sent and sms_sent flags if we have a discount code
          if (status === 'approved' && discountCode) {
            await supabase
              .from('discount_codes')
              .update({
                email_sent: notificationResult?.emailSent || false,
                sms_sent: notificationResult?.smsSent || false,
              })
              .eq('code', discountCode);
          }
        }
      } catch (notifError) {
        console.error('Failed to send notification:', notifError);
        // Don't throw - the approval still succeeded
      }

      return { status, discountCode };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pending-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['approved-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['rejected-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      
      if (result.status === 'approved') {
        toast.success('Submission approved! Discount code sent to customer.');
      } else {
        toast.success('Submission rejected. Customer has been notified.');
      }
    },
    onError: (error) => {
      console.error('Error reviewing submission:', error);
      toast.error('Failed to review submission');
    },
  });

  // Verify/redeem discount code
  const redeemCode = useMutation({
    mutationFn: async (code: string) => {
      const { data: discountCode, error: fetchError } = await supabase
        .from('discount_codes')
        .select('*, promotion:promotions(*)')
        .eq('code', code.toUpperCase())
        .single();
      
      if (fetchError || !discountCode) throw new Error('Invalid discount code');
      if (discountCode.is_redeemed) throw new Error('Code already redeemed');
      if (discountCode.expires_at && new Date(discountCode.expires_at) < new Date()) {
        throw new Error('Code has expired');
      }
      
      const { error: updateError } = await supabase
        .from('discount_codes')
        .update({
          is_redeemed: true,
          redeemed_at: new Date().toISOString(),
          redeemed_by: user?.id,
        })
        .eq('id', discountCode.id);
      
      if (updateError) throw updateError;

      // Update promotion redemption count
      await supabase
        .from('promotions')
        .update({
          current_redemptions: (discountCode.promotion?.current_redemptions || 0) + 1,
        })
        .eq('id', discountCode.promotion_id);
      
      return discountCode;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success(`Code redeemed! Discount: ${data.promotion?.discount_type === 'percentage' 
        ? `${data.promotion.discount_value}%` 
        : `$${data.promotion?.discount_value}`} off`);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  return {
    promotions,
    pendingSubmissions,
    approvedSubmissions,
    rejectedSubmissions,
    discountCodes,
    businessProfile,
    stats,
    isLoading: promotionsLoading || submissionsLoading || codesLoading || approvedLoading || rejectedLoading,
    isError: promotionsError,
    refetch: refetchPromotions,
    createPromotion,
    updatePromotionStatus,
    updatePromotion,
    deletePromotion,
    reviewSubmission,
    redeemCode,
  };
};

// Helper function to generate alphanumeric discount code using crypto-safe randomness
function generateDiscountCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars (0,O,1,I)
  const randomValues = crypto.getRandomValues(new Uint8Array(8));
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(randomValues[i] % chars.length);
  }
  return code;
}
