import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { CreatorOrder } from '@/types/packages';

// Columns the creator is allowed to act on. Deliberately NOT selected: buyer_guest_token (a bearer secret),
// payout_executed_at / stripe_transfer_id (money internals the buyer/cron own). RLS ("Order participants can
// view their package orders") already scopes rows to creator_id = auth.uid(); the column list is defence in
// depth so a token can never reach the creator's client.
const ORDER_COLUMNS =
  'id, package_id, buyer_email, buyer_user_id, price_snapshot, platform_fee_snapshot, ' +
  'turnaround_days_snapshot, scope_snapshot, escrow_status, order_status, content_status, ' +
  'content_submitted_at, revision_count, revision_note, delivery_note, deliverables, completed_at, created_at';

// PostgREST embeds a 1:1 reverse relationship (intake.order_id is its PK) as an object, but has historically
// returned an array in some versions — normalise so callers always see a single intake or null.
const normalizeIntake = (raw: unknown): CreatorOrder['intake'] => {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  return row as CreatorOrder['intake'];
};

const normalizePackage = (raw: unknown): CreatorOrder['package'] => {
  const row = Array.isArray(raw) ? raw[0] : raw;
  if (!row || typeof row !== 'object') return null;
  return row as CreatorOrder['package'];
};

const shape = (row: Record<string, unknown>): CreatorOrder => ({
  ...(row as unknown as CreatorOrder),
  deliverables: Array.isArray(row.deliverables) ? (row.deliverables as CreatorOrder['deliverables']) : [],
  package: normalizePackage(row.package),
  intake: normalizeIntake(row.intake),
});

/**
 * Every order placed against the signed-in creator's packages, newest first, with the buyer's package title +
 * intake answers embedded. Paid, in-flight orders (in_progress / revision_requested / submitted) are what the
 * creator acts on; pending_payment orders (checkout never completed) are filtered out as noise.
 */
export const useCreatorOrders = () => {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['creator-orders', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<CreatorOrder[]> => {
      const { data, error } = await supabase
        .from('package_orders')
        .select(`${ORDER_COLUMNS}, package:creator_packages(title, slug), intake:package_order_intake(answers, schema_version)`)
        .eq('creator_id', user!.id)
        .neq('order_status', 'pending_payment')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return ((data ?? []) as Record<string, unknown>[]).map(shape);
    },
  });

  return { orders: data ?? [], isLoading, refetch };
};

/** A single order by id (same shape/columns), for the creator order-detail surface. */
export const useCreatorOrder = (orderId?: string) => {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['creator-order', orderId, user?.id],
    enabled: !!user && !!orderId,
    queryFn: async (): Promise<CreatorOrder | null> => {
      const { data, error } = await supabase
        .from('package_orders')
        .select(`${ORDER_COLUMNS}, package:creator_packages(title, slug), intake:package_order_intake(answers, schema_version)`)
        .eq('id', orderId!)
        .eq('creator_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data ? shape(data as Record<string, unknown>) : null;
    },
  });

  return { order: data ?? null, isLoading, refetch };
};
