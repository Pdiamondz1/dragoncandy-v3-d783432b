import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GuestOrderView {
  order: {
    id: string;
    order_status: string;
    escrow_status: string;
    content_status: string | null;
    content_submitted_at: string | null;
    revision_count: number;
    completed_at: string | null;
    created_at: string;
    price: number;
  };
  package: { title: string; turnaround_days: number | null; scope: Record<string, unknown> };
  intake: Record<string, unknown> | null;
}

/**
 * Read a guest's own order by its opaque bearer token (the URL credential) via the get_guest_order_by_token
 * SECURITY DEFINER RPC — returns a curated buyer-facing view (never the token or payout internals), or null.
 */
export const useGuestOrder = (token?: string) => {
  const query = useQuery({
    queryKey: ['guest-order', token],
    enabled: !!token,
    queryFn: async (): Promise<GuestOrderView | null> => {
      // RPC isn't in the generated types; the client is loosely typed so this cast is the codebase convention.
      const { data, error } = await (supabase as unknown as {
        rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
      }).rpc('get_guest_order_by_token', { p_token: token });
      if (error) throw error;
      return (data as GuestOrderView | null) ?? null;
    },
  });

  return { order: query.data ?? null, isLoading: query.isLoading, refetch: query.refetch };
};
