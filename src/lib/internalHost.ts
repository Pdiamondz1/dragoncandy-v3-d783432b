/**
 * Host detection for the internal AIOS surface (internal.dragoncandy.io).
 * Routes-first design: /internal/* works on every host; the internal host
 * additionally blocks consumer routes (see AnimatedRoutes in App.tsx).
 */

/** Paths that remain reachable on the internal host. Everything else redirects to /internal. */
const INTERNAL_ALLOWED_PREFIXES = ['/internal', '/auth', '/verify-email'];

export function isInternalHost(hostname: string = window.location.hostname): boolean {
  return hostname.startsWith('internal.');
}

export function isAllowedOnInternalHost(pathname: string): boolean {
  return INTERNAL_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}
