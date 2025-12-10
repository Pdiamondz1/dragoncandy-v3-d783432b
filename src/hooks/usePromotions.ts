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
  terms_conditions?: string;
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
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Fetch all promotions for the business
  const { data: promotions, isLoading: promotionsLoading } = useQuery({
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

  // Create promotion mutation
  const createPromotion = useMutation({
    mutationFn: async (data: CreatePromotionData) => {
      if (!user?.id || !businessProfile?.id) throw new Error('Not authenticated');
      
      const { data: promotion, error } = await supabase
        .from('promotions')
        .insert({
          user_id: user.id,
          business_id: businessProfile.id,
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
      
      // If approved, generate discount code (this will be handled by edge function later)
      if (status === 'approved') {
        const submission = pendingSubmissions?.find(s => s.id === submissionId);
        if (submission) {
          const code = generateDiscountCode();
          const { error: codeError } = await supabase
            .from('discount_codes')
            .insert({
              promotion_id: submission.promotion_id,
              submission_id: submissionId,
              code,
              customer_email: submission.customer_email,
              customer_phone: submission.customer_phone,
            });
          if (codeError) throw codeError;
        }
      }
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['pending-submissions'] });
      queryClient.invalidateQueries({ queryKey: ['discount-codes'] });
      toast.success(variables.status === 'approved' 
        ? 'Submission approved! Discount code generated.' 
        : 'Submission rejected.');
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
    discountCodes,
    businessProfile,
    isLoading: promotionsLoading || submissionsLoading || codesLoading,
    createPromotion,
    updatePromotionStatus,
    reviewSubmission,
    redeemCode,
  };
};

// Helper function to generate alphanumeric discount code
function generateDiscountCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding similar chars (0,O,1,I)
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
