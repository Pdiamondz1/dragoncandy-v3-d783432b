import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { isSiteUnlocked, isPublicPath } from '@/lib/siteGate';
import SiteGate from '@/pages/SiteGate';

/**
 * Global site-wide password gate. Renders the SiteGate page in place of any
 * route until the user enters the correct password. Access persists for 1 hour
 * via localStorage. A small allowlist of public paths (e.g. /promo/:id) bypass
 * the gate so QR-based public flows continue to work.
 */
export function SiteGateGuard({ children }: { children: ReactNode }) {
  // Site password gate disabled — app is now publicly accessible.
  // To re-enable, restore the original logic below.
  // const { pathname } = useLocation();
  // if (isSiteUnlocked() || isPublicPath(pathname)) {
  //   return <>{children}</>;
  // }
  // try {
  //   const full = pathname + window.location.search + window.location.hash;
  //   if (full && full !== '/') {
  //     sessionStorage.setItem('dc_gate_redirect', full);
  //   }
  // } catch {
  //   /* ignore */
  // }
  // return <SiteGate />;
  return <>{children}</>;
}

// Suppress unused import warnings while gate is disabled.
void useLocation;
void SiteGate;
void isSiteUnlocked;
void isPublicPath;
