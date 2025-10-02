import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

interface InitiatePaymentParams {
  sponsorshipId: string;
  amount: number;
}

export const useSponsorshipPayment = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const initiatePayment = useMutation({
    mutationFn: async ({ sponsorshipId, amount }: InitiatePaymentParams) => {
      // TODO: Integrate with Stripe API
      // For now, simulate payment initiation
      console.log('Initiating payment for sponsorship:', sponsorshipId, 'Amount:', amount);

      // Update payment status to 'pending'
      const { error } = await supabase
        .from('campaign_sponsorships')
        .update({ 
          payment_status: 'pending',
          payment_date: new Date().toISOString(),
        })
        .eq('id', sponsorshipId);

      if (error) throw error;

      // In a real implementation, you would:
      // 1. Create a Stripe PaymentIntent
      // 2. Store the payment_intent_id
      // 3. Return the client_secret for frontend confirmation
      
      return { success: true, sponsorshipId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sponsorship-proposals'] });
      queryClient.invalidateQueries({ queryKey: ['brand-sponsorship-status'] });
      toast({
        title: 'Payment Initiated',
        description: 'Your sponsorship payment is being processed.',
      });
    },
    onError: (error) => {
      console.error('Error initiating payment:', error);
      toast({
        title: 'Payment Error',
        description: 'Failed to initiate payment. Please try again.',
        variant: 'destructive',
      });
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
    confirmPayment,
  };
};
