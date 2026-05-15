import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { QuickChip } from '@/types/donnyNudge';
import type { UserRole } from '@/types/user';

const MAX_CHIPS = 5;

// Page-level default chips per role
const PAGE_CHIPS: Record<string, Record<string, QuickChip[]>> = {
  '/dashboard/business': {
    business_client: [
      { label: '\ud83d\udcca Campaign stats', message: 'Show me my campaign stats', variant: 'teal', requiresChat: true },
      { label: '\u2728 Create campaign', message: 'Help me create a new campaign', variant: 'pink', requiresChat: true },
      { label: '\ud83d\udc65 Top creators', message: 'Show me top creators for my campaigns', variant: 'teal', requiresChat: true },
    ],
  },
  '/dashboard/creator': {
    content_creator: [
      { label: '\ud83d\udd0d Find campaigns', message: 'Show me campaigns I should apply to', variant: 'teal', requiresChat: true },
      { label: '\ud83d\udcb0 Earnings summary', message: 'Show me my earnings summary', variant: 'pink', requiresChat: false },
      { label: '\ud83d\udcc8 My performance', message: 'How am I performing?', variant: 'teal', requiresChat: true },
    ],
  },
  '/dashboard/brand': {
    brand: [
      { label: '\ud83d\udcca Campaign stats', message: 'Show me my sponsorship stats', variant: 'teal', requiresChat: true },
      { label: '\ud83d\udd0d Find creators', message: 'Help me find creators', variant: 'pink', requiresChat: true },
      { label: '\ud83e\udd1d Active collabs', message: 'Show me active collaborations', variant: 'teal', requiresChat: true },
    ],
  },
  // Messages pages — all roles
  messages: {
    _default: [
      { label: '\ud83d\udce8 Unread summary', message: 'Summarize my unread messages', variant: 'teal', requiresChat: true },
      { label: '\u26a1 Quick replies', message: 'Help me draft quick replies', variant: 'pink', requiresChat: true },
    ],
  },
  // Campaigns pages — all roles
  campaigns: {
    _default: [
      { label: '\ud83d\udc40 View applicants', message: 'Show me recent applicants', variant: 'teal', requiresChat: true },
      { label: '\ud83d\ude80 Boost campaign', message: 'How can I boost my campaign performance?', variant: 'pink', requiresChat: true },
    ],
  },
};

function matchPage(pathname: string, userRole: UserRole): QuickChip[] | undefined {
  // Exact match first, then look up by role or _default
  const exactRole = PAGE_CHIPS[pathname];
  if (exactRole) {
    const chips = exactRole[userRole] ?? exactRole._default;
    if (chips) return chips;
  }
  // Partial match (e.g., /dashboard/business/messages -> messages)
  if (pathname.includes('/messages')) return PAGE_CHIPS.messages?._default;
  if (pathname.includes('/campaigns')) return PAGE_CHIPS.campaigns?._default;
  return undefined;
}

export function useDonnyQuickChips(userRole: UserRole) {
  const location = useLocation();
  const { user } = useAuth();

  // Fetch state-aware data for override chips
  const { data: stateData } = useQuery({
    queryKey: ['donny-chip-state', user?.id, userRole],
    queryFn: async () => {
      if (!user?.id) return { pendingApplications: 0, hasNoCampaigns: false };

      const results: { pendingApplications: number; hasNoCampaigns: boolean } = {
        pendingApplications: 0,
        hasNoCampaigns: false,
      };

      if (userRole === 'business_client' || userRole === 'brand') {
        const { count } = await supabase
          .from('campaign_applications')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending');
        results.pendingApplications = count ?? 0;
      }

      if (userRole === 'business_client') {
        const { count } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'published');
        results.hasNoCampaigns = (count ?? 0) === 0;
      }

      return results;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  const chips = useMemo(() => {
    const stateChips: QuickChip[] = [];

    // State-aware overrides (highest priority)
    if (stateData?.pendingApplications && stateData.pendingApplications > 0) {
      stateChips.push({
        label: `\ud83d\udccb Review ${stateData.pendingApplications} applicant${stateData.pendingApplications > 1 ? 's' : ''}`,
        message: 'Show me pending applications to review',
        variant: 'teal',
        requiresChat: true,
      });
    }

    if (stateData?.hasNoCampaigns) {
      stateChips.push({
        label: '\u2728 Create your first campaign',
        message: 'Help me create my first campaign',
        variant: 'pink',
        requiresChat: true,
      });
    }

    // Page-level defaults
    const pageChips = matchPage(location.pathname, userRole) ?? [];

    // Merge: state chips first, then fill with page chips up to MAX_CHIPS
    const remaining = MAX_CHIPS - stateChips.length;
    return [...stateChips, ...pageChips.slice(0, remaining)];
  }, [location.pathname, stateData, userRole]);

  return chips;
}
