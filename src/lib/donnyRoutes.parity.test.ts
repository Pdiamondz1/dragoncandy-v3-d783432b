import { describe, it, expect } from 'vitest';
import { ROUTE_TEMPLATES as CLIENT_ROUTES } from './donnyRoutes';
import { ROUTE_TEMPLATES as SERVER_ROUTES } from '../../supabase/functions/donny-orchestrator/routes.ts';

// The client mirror may legitimately hold routes the server list does not: the
// server list is what Donny may *generate*, and it must only ever emit the
// current path. These two legacy Crews URLs are served by App.tsx as redirects,
// so a route persisted in an old message is still valid to navigate to — but
// Donny should never emit them fresh. Any OTHER client-only route is a bug:
// somebody added a route to one mirror and forgot the other.
const ALLOWED_CLIENT_ONLY = [
  '/dashboard/business/groups',
  '/dashboard/business/groups/:id',
];

describe('route allow-list mirrors', () => {
  it('every server route exists in the client mirror', () => {
    // A server route missing from the client is invisible, not broken: the
    // client guard rejects it and DonnyMessage drops the pill entirely.
    const missing = SERVER_ROUTES.filter((r) => !CLIENT_ROUTES.includes(r));
    expect(missing, `server routes absent from src/lib/donnyRoutes.ts: ${missing.join(', ')}`).toEqual([]);
  });

  it('the only client-only routes are the documented legacy redirects', () => {
    const extra = CLIENT_ROUTES.filter(
      (r) => !SERVER_ROUTES.includes(r) && !ALLOWED_CLIENT_ONLY.includes(r)
    );
    expect(extra, `client routes absent from the server allow-list: ${extra.join(', ')}`).toEqual([]);
  });

  it('neither mirror contains duplicates', () => {
    expect(new Set(CLIENT_ROUTES).size).toBe(CLIENT_ROUTES.length);
    expect(new Set(SERVER_ROUTES).size).toBe(SERVER_ROUTES.length);
  });
});
