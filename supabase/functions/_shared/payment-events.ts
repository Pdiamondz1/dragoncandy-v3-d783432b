import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface PaymentEvent {
  event_type: string;
  entity_type: 'collaboration' | 'sponsorship' | 'rush';
  entity_id: string;
  campaign_id: string | null;
  actor_id?: string;
  actor_role: 'business' | 'creator' | 'brand' | 'system' | 'stripe';
  amount_cents?: number;
  currency?: string;
  stripe_id?: string;
  metadata?: Record<string, unknown>;
}

export async function writePaymentEvent(
  supabase: SupabaseClient,
  event: PaymentEvent,
  logPrefix: string = '[PAYMENT-EVENT]'
): Promise<void> {
  const { error } = await supabase
    .from('payment_events')
    .insert({
      ...event,
      currency: event.currency ?? 'usd',
      metadata: event.metadata ?? {},
    });

  if (error) {
    console.error(`${logPrefix} Failed to write ${event.event_type} for ${event.entity_type}/${event.entity_id}: ${error.message}`);
    // Fire-and-forget: don't throw. Reconciliation cron catches gaps.
  } else {
    console.log(`${logPrefix} Wrote ${event.event_type} for ${event.entity_type}/${event.entity_id}`);
  }
}
