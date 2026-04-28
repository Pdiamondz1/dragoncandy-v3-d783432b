import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface InitiatePaymentParams {
  sponsorshipId: string;
  amount: number;
  campaignTitle?: string;
}

interface VerifyPaymentParams {
  sponsorshipId: string;
}

export const useSponsorshipPayment = () => {
  const queryClient = useQueryClient();

  const initiatePayment = useMutation({
    mutationFn: async ({ sponsorshipId, amount, campaignTitle }: InitiatePaymentParams) => {
      // Pre-open blank tab synchronously to avoid pop-up blockers
      const stripeTab = window.open('about:blank', '_blank');

      const { data, error } = await supabase.functions.invoke('create-sponsorship-checkout', {
        body: { sponsorshipId, amount, campaignTitle },
      });

      if (error) {
        stripeTab?.close();
        throw error;
      }
      if (!data?.url) {
        stripeTab?.close();
        throw new Error('No checkout URL returned');
      }

      // Redirect the pre-opened tab to the Stripe checkout URL
      if (stripeTab) {
        stripeTab.location.href = data.url;
      } else {
        // Fallback: if pop-up was still blocked, redirect current window
        window.location.href = data.url;
      }
      
      return { success: true, sponsorshipId, sessionId: data.sessionId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      toast({
        title: 'Checkout Opened',
        description: 'Complete your payment in the new tab.',
      });
    },
    onError: (error) => {
      console.error('Error initiating payment:', error);
      toast({
        title: 'Payment Error',
        description: 'Failed to initiate checkout. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const verifyPayment = useMutation({
    mutationFn: async ({ sponsorshipId }: VerifyPaymentParams) => {
      const { data, error } = await supabase.functions.invoke('verify-sponsorship-payment', {
        body: { sponsorshipId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorships'] });
      if (data?.verified) {
        toast({
          title: 'Payment Confirmed',
          description: 'Your sponsorship payment has been verified!',
        });
      }
    },
  });

  return {
    initiatePayment,
    verifyPayment,
  };
};
