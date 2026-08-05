import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

export interface PaymentEvent {
  event_type: string;
  // Mirrors payment_events.entity_type CHECK (20260804120200_payment_events_package_order.sql adds
  // 'package_order' to the DB constraint). The shared wallet-first payout core keys its config on this
  // union, so the package-order money rail requires the value here to type-check.
  entity_type: 'collaboration' | 'sponsorship' | 'rush' | 'package_order';
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
    throw new Error(`${logPrefix} Failed to write ${event.event_type} for ${event.entity_type}/${event.entity_id}: ${error.message}`);
  } else {
    console.warn(`${logPrefix} Wrote ${event.event_type} for ${event.entity_type}/${event.entity_id}`);
  }
}
