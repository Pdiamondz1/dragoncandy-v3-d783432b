import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { CreatePromotionData, UpdatePromotionData } from '@/hooks/usePromotions';
import { useAuth } from '@/hooks/useAuth';

export type ToastSyncStatus =
  | 'synced'
  | 'pending'
  | 'failed'
  | 'tier_unavailable'
  | 'not_connected';

interface DiscountPushResult {
  sync_status: ToastSyncStatus;
  message: string;
}

/**
 * Fire-and-forget call to toast-discount-push.
 * Never throws — sync failures should not block the promotion mutation.
 */
async function pushToToast(
  promotionId: string,
  action: 'publish' | 'update' | 'end',
  payload?: Record<string, unknown>,
): Promise<DiscountPushResult> {
  try {
    const { data, error } = await supabase.functions.invoke('toast-discount-push', {
      body: { promotion_id: promotionId, action, payload },
    });
    if (error) {
      console.warn('toast-discount-push invoke error:', error);
      return { sync_status: 'failed', message: error.message };
    }
    return data as DiscountPushResult;
  } catch (err: unknown) {
    console.warn('toast-discount-push network error:', err);
    return { sync_status: 'failed', message: (err as Error)?.message || 'Network error' };
  }
}

/**
 * Wraps existing promotion mutations with post-mutation Toast sync.
 * Import alongside `usePromotions` — this hook adds Toast awareness
 * without modifying the original hook.
 */
export const usePromotionMutations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // --- Create + push ---
  const createAndSync = useMutation({
    mutationFn: async (data: CreatePromotionData) => {
      // Fetch business profile for insert
      const { data: biz, error: bizError } = await supabase
        .from('business_profiles')
        .select('id')
        .eq('user_id', user!.id)
        .single();
      if (bizError || !biz) throw new Error('Business profile not found');

      const { data: promotion, error } = await supabase
        .from('promotions')
        .insert({ user_id: user!.id, business_id: biz.id, status: 'active', ...data })
        .select('id, title, discount_type, discount_value, start_date, end_date, status')
        .single();
      if (error) throw error;

      // Post-mutation Toast sync (fire-and-forget)
      const syncResult = await pushToToast(promotion.id, 'publish', {
        title: data.title,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        start_date: data.start_date,
        end_date: data.end_date,
      });

      return { promotion, syncResult };
    },
    onSuccess: ({ syncResult }) => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion created!');
      if (syncResult.sync_status === 'tier_unavailable') {
        toast.info('Toast sync: partner tier required. Codes generated internally.');
      } else if (syncResult.sync_status === 'failed') {
        toast.warning('Toast sync failed — promotion saved locally.');
      }
    },
    onError: (error) => {
      console.error('Error creating promotion:', error);
      toast.error('Failed to create promotion');
    },
  });

  // --- Update + push ---
  const updateAndSync = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePromotionData }) => {
      const { error } = await supabase
        .from('promotions')
        .update(data)
        .eq('id', id);
      if (error) throw error;

      const syncResult = await pushToToast(id, 'update', data as Record<string, unknown>);
      return { syncResult };
    },
    onSuccess: ({ syncResult }) => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion updated!');
      if (syncResult.sync_status === 'tier_unavailable') {
        toast.info('Toast sync: partner tier required.');
      }
    },
    onError: (error) => {
      console.error('Error updating promotion:', error);
      toast.error('Failed to update promotion');
    },
  });

  // --- End (pause/expire) + push ---
  const endAndSync = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from('promotions')
        .update({ status })
        .eq('id', id);
      if (error) throw error;

      // Only push to Toast when ending/pausing (not when resuming)
      if (status === 'paused' || status === 'expired' || status === 'completed') {
        const syncResult = await pushToToast(id, 'end', { new_status: status });
        return { syncResult };
      }
      return { syncResult: { sync_status: 'synced' as const, message: 'No sync needed' } };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['promotions'] });
      toast.success('Promotion status updated');
    },
    onError: (error) => {
      console.error('Error updating promotion status:', error);
      toast.error('Failed to update status');
    },
  });

  return {
    createAndSync,
    updateAndSync,
    endAndSync,
    pushToToast,
  };
};
