import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { OrderDeliverable } from '@/types/packages';

// The package RPCs aren't in the generated Supabase types (the client is intentionally loosely typed); this is
// the same rpc cast the rest of the package hooks use (see useGuestOrder).
const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  }).rpc(fn, args);

/**
 * The creator delivers their work: submit_package_deliverables flips the order to content_status='submitted',
 * which arms the buyer's Approve (and the auto-approve cron). Valid from in_progress OR revision_requested, so
 * the same hook powers the first delivery and every re-delivery after a revision. Guarded server-side to the
 * order's own creator.
 */
export const usePackageOrderDelivery = (orderId: string) => {
  const queryClient = useQueryClient();

  const submit = useMutation({
    mutationFn: async ({ deliverables, note }: { deliverables: OrderDeliverable[]; note?: string }) => {
      const { data, error } = await rpc('submit_package_deliverables', {
        p_order_id: orderId,
        p_deliverables: deliverables,
        p_note: note?.trim() ? note.trim() : null,
      });
      if (error) throw error;
      return data as { order_id: string; content_status: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creator-order', orderId] });
      queryClient.invalidateQueries({ queryKey: ['creator-orders'] });
    },
  });

  return { submit };
};
