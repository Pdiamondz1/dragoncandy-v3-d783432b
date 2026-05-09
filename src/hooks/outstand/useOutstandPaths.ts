import { useLocation } from 'react-router-dom';

interface OutstandPaths {
  base: string;
  accountsTab: string;
  oauthCallback: string;
}

// Centralized so the same Outstand surface can live under either
// `/dashboard/business/social` (restaurant) or `/dashboard/creator/social`
// (creator) without each subcomponent needing to know which.
export function useOutstandPaths(): OutstandPaths {
  const location = useLocation();
  const match = location.pathname.match(/^(\/dashboard\/(?:business|creator|brand)\/social)/);
  const base = match?.[1] ?? '/dashboard/business/social';
  return {
    base,
    accountsTab: `${base}?tab=accounts`,
    oauthCallback: `${base}/oauth-callback`,
  };
}
