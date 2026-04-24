import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import SiteGate, { isSiteUnlocked, isPublicPath } from '@/pages/SiteGate';

/**
 * Global site-wide password gate. Renders the SiteGate page in place of any
 * route until the user enters the correct password. Access persists for 1 hour
 * via localStorage. A small allowlist of public paths (e.g. /promo/:id) bypass
 * the gate so QR-based public flows continue to work.
 */
export default function SiteGateGuard({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();

  if (isSiteUnlocked() || isPublicPath(pathname)) {
    return <>{children}</>;
  }

  // Remember the originally requested path (including query/hash) so we can
  // restore it after a successful unlock.
  try {
    const full = pathname + window.location.search + window.location.hash;
    if (full && full !== '/') {
      sessionStorage.setItem('dc_gate_redirect', full);
    }
  } catch {
    /* ignore */
  }

  return <SiteGate />;
}
