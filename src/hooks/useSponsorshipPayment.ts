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
      console.log('Initiating Stripe checkout for sponsorship:', sponsorshipId, 'Amount:', amount);

      const { data, error } = await supabase.functions.invoke('create-sponsorship-checkout', {
        body: { sponsorshipId, amount, campaignTitle },
      });

      if (error) throw error;
      if (!data?.url) throw new Error('No checkout URL returned');

      // Open Stripe checkout in new tab
      window.open(data.url, '_blank');
      
      return { success: true, sponsorshipId, sessionId: data.sessionId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status'] });
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
      if (data?.verified) {
        toast({
          title: 'Payment Confirmed',
          description: 'Your sponsorship payment has been verified!',
        });
      }
    },
  });

  const confirmPayment = useMutation({
    mutationFn: async ({ sponsorshipId }: { sponsorshipId: string }) => {
      // Update payment status to 'paid'
      const { error } = await supabase
        .from('campaign_sponsorships')
        .update({ 
          payment_status: 'paid',
          payment_date: new Date().toISOString(),
        })
        .eq('id', sponsorshipId);

      if (error) throw error;
      
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status'] });
      toast({
        title: 'Payment Confirmed',
        description: 'Your sponsorship payment has been confirmed!',
      });
    },
    onError: (error) => {
      console.error('Error confirming payment:', error);
      toast({
        title: 'Payment Error',
        description: 'Failed to confirm payment.',
        variant: 'destructive',
      });
    },
  });

  return {
    initiatePayment,
    verifyPayment,
  };
};
