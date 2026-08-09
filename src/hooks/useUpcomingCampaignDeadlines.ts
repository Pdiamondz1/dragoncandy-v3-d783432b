// src/hooks/useUpcomingCampaignDeadlines.ts
//
// Dedicated "due soon" query for the Donny-first dashboard's attention list.
//
// Deliberately NOT a widened useBusinessActiveCampaigns: that hook orders by
// `created_at DESC LIMIT 5` for the recent-activity widget it was built for
// (still used as-is by BusinessOverview.tsx). Reusing it here would mean an
// older campaign due tomorrow silently drops off the list once a business has
// more than 5 non-cancelled campaigns — recency and due-soon are different
// questions and need different queries. See buildDonnyProposals.ts's
// deadlineProposals() for how these rows get turned into "due today/tomorrow"
// signals.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { DEADLINE_SOON_DAYS } from '@/lib/donny/buildDonnyProposals';
import type { ActiveCampaignItem } from '@/hooks/useBusinessActiveCampaigns';

/**
 * Format a Date as its LOCAL calendar day, "YYYY-MM-DD".
 *
 * `campaigns.deadline` is a Postgres `date` column, so it compares as a
 * calendar day. `Date#toISOString()` would format the UTC calendar day
 * instead, which is a different day for part of every 24 hours in any
 * timezone behind or ahead of UTC — the exact off-by-one class documented at
 * length in buildDonnyProposals.ts's startOfDeadlineDay(). Reading the local
 * getters (getFullYear/getMonth/getDate) instead of the UTC ones avoids it.
 */
function toLocalDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Campaigns (published/active, not cancelled or completed) whose deadline
 * falls within [today, today + DEADLINE_SOON_DAYS] local calendar days,
 * soonest first. Feeds buildDonnyProposals()'s campaigns input — same
 * ActiveCampaignItem shape it already consumes, so the pure function needs no
 * changes. `displayStatus`/`creatorName` are not read by buildDonnyProposals
 * (only id/title/status/deadline are), so they're populated minimally here
 * rather than paying for the collaboration join useBusinessActiveCampaigns
 * does for its own, different, display needs.
 */
export function useUpcomingCampaignDeadlines(orgUnitId?: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['upcoming_campaign_deadlines', user?.id, orgUnitId ?? 'all'],
    queryFn: async (): Promise<ActiveCampaignItem[]> => {
      if (!user) throw new Error('User not authenticated');

      const now = new Date();
      const windowEnd = new Date(now);
      windowEnd.setDate(windowEnd.getDate() + DEADLINE_SOON_DAYS);

      let campaignQuery = supabase
        .from('campaigns')
        .select('id, title, status, deadline')
        .eq('user_id', user.id)
        // A draft has nobody working on it; a completed one is done — neither
        // is a "needs you" item. Cancelled is excluded by omission.
        .in('status', ['published', 'active'])
        .gte('deadline', toLocalDateString(now))
        .lte('deadline', toLocalDateString(windowEnd));

      if (orgUnitId) {
        campaignQuery = campaignQuery.eq('org_unit_id', orgUnitId);
      }

      const { data, error } = await campaignQuery
        .order('deadline', { ascending: true })
        // Safety bound, not an expected count — the attention list caps at
        // PROPOSAL_CAP (3) long before this. Hitting 20 would mean a business
        // has 20+ campaigns due inside the DEADLINE_SOON_DAYS window, which is
        // its own signal worth investigating, not a case this hook needs to
        // serve in full.
        .limit(20);

      if (error) throw error;

      return (data ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        status: c.status as ActiveCampaignItem['status'],
        displayStatus: c.status,
        deadline: c.deadline,
        creatorName: null,
      }));
    },
    enabled: !!user,
    staleTime: 60_000,
  });
}
