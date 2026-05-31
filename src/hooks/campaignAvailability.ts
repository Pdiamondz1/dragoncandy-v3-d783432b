/**
 * Helpers for filtering out campaigns that are already taken by a creator.
 *
 * The list of "unavailable" campaign IDs comes from the SECURITY DEFINER RPC
 * `get_unavailable_campaign_ids` (accepted applications + active/completed
 * collaborations). These helpers normalize that result into the shape the
 * browse queries need, and are shared by usePublicCampaigns (creator Browse)
 * and useSponsorshipCampaigns (brand Discover).
 */

/** A row returned by the get_unavailable_campaign_ids RPC. */
export interface UnavailableCampaignRow {
  campaign_id: string;
}

/** Deduplicate the RPC rows into a flat array of campaign IDs. */
export const toExcludedCampaignIds = (
  rows: UnavailableCampaignRow[] | null | undefined,
): string[] => [...new Set((rows || []).map(row => row.campaign_id))];

/**
 * Build the value for a PostgREST `.not('id', 'in', ...)` filter, or null when
 * there is nothing to exclude (so the caller can skip applying the filter).
 */
export const buildExcludedIdsFilter = (ids: string[]): string | null =>
  ids.length > 0 ? `(${ids.join(',')})` : null;
