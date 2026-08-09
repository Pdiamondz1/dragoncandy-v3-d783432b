import { type SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";

export interface PricingResult {
  amount: number;
  source: 'counter_offer' | 'application_rate' | 'fixed_price' | 'budget_max';
}

export async function resolvePayoutAmount(
  supabaseClient: SupabaseClient,
  campaignId: string,
): Promise<PricingResult | null> {
  const { data: acceptedApp } = await supabaseClient
    .from('campaign_applications')
    .select('id, proposed_rate')
    .eq('campaign_id', campaignId)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle();

  if (acceptedApp) {
    const { data: acceptedOffer } = await supabaseClient
      .from('application_counter_offers')
      .select('proposed_rate')
      .eq('application_id', acceptedApp.id)
      .eq('status', 'accepted')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (acceptedOffer?.proposed_rate && acceptedOffer.proposed_rate > 0) {
      return { amount: acceptedOffer.proposed_rate, source: 'counter_offer' };
    }

    if (acceptedApp.proposed_rate && acceptedApp.proposed_rate > 0) {
      return { amount: acceptedApp.proposed_rate, source: 'application_rate' };
    }
  }

  const { data: campaign } = await supabaseClient
    .from('campaigns')
    .select('fixed_price, budget_max, pricing_type')
    .eq('id', campaignId)
    .single();

  if (!campaign) return null;

  if (campaign.pricing_type === 'fixed' && campaign.fixed_price && campaign.fixed_price > 0) {
    return { amount: campaign.fixed_price, source: 'fixed_price' };
  }

  if (campaign.budget_max && campaign.budget_max > 0) {
    return { amount: campaign.budget_max, source: 'budget_max' };
  }

  return null;
}
