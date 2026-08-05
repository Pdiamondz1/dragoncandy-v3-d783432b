import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Buyer-side order actions, all via the guest-capable edge functions (the anon key is auto-attached; the
 * guest bearer token in the body authorizes the buyer):
 *  - verify:  confirm the Stripe payment on return and flip escrow to held
 *  - approve: release the held escrow to the creator (only valid once the creator has delivered)
 *  - cancel:  refund the held escrow to the buyer (pre-delivery, before any payout)
 */
export const usePackageOrderActions = () => {
  const verify = useMutation({
    mutationFn: async ({ orderId, sessionId }: { orderId: string; sessionId: string }) => {
      const { data, error } = await supabase.functions.invoke('verify-package-order-escrow', { body: { orderId, sessionId } });
      if (error) throw error;
      return data as { success?: boolean; status?: string; refunded?: boolean; message?: string };
    },
  });

  const approve = useMutation({
    mutationFn: async ({ orderId, guestToken }: { orderId: string; guestToken: string }) => {
      const { data, error } = await supabase.functions.invoke('release-package-payout', { body: { orderId, guestToken } });
      if (error) throw error;
      return data as { success?: boolean; error?: string };
    },
  });

  const cancel = useMutation({
    mutationFn: async ({ orderId, guestToken }: { orderId: string; guestToken: string }) => {
      const { data, error } = await supabase.functions.invoke('refund-package-order', { body: { orderId, guestToken } });
      if (error) throw error;
      return data as { success?: boolean; error?: string };
    },
  });

  return { verify, approve, cancel };
};
