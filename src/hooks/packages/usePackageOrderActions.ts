import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// The package RPCs aren't in the generated Supabase types (the client is intentionally loosely typed); same
// rpc cast the other package hooks use (see useGuestOrder).
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc(fn, args);

/**
 * Buyer-side order actions. verify/approve/cancel go via the guest-capable edge functions (the anon key is
 * auto-attached; the guest bearer token in the body authorizes the buyer). requestRevision goes via the
 * request_package_revision SECURITY DEFINER RPC (also guest-token authorized):
 *  - verify:          confirm the Stripe payment on return and flip escrow to held
 *  - approve:         release the held escrow to the creator (only valid once the creator has delivered)
 *  - cancel:          refund the held escrow to the buyer (pre-delivery, before any payout)
 *  - requestRevision: send submitted work back for one more pass (order → revision_requested)
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

  const requestRevision = useMutation({
    mutationFn: async ({ orderId, guestToken, note }: { orderId: string; guestToken: string; note: string }) => {
      const { data, error } = await rpc('request_package_revision', {
        p_order_id: orderId,
        p_note: note.trim(),
        p_guest_token: guestToken,
      });
      if (error) throw error;
      return data as { order_id: string; order_status: string };
    },
  });

  return { verify, approve, cancel, requestRevision };
};
