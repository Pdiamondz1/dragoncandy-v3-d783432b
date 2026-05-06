# Toast Edge Function Deployment + "Coming Soon" UI

**Date:** 2026-04-11
**Status:** Approved
**Scope:** Deploy Toast edge functions, add env-var guards, update frontend error state

---

## Problem

The "Connect Toast" button on the Business Settings page fails with:
> "Connection failed — Failed to send a request to the Edge Function"

**Root cause:** The 6 Toast edge functions exist in the repo (`supabase/functions/`) but were never deployed to Supabase. The `toast-oauth-start` function returns 404 when invoked. Additionally, Toast API credentials (client ID, OAuth URLs) have not been obtained yet — DragonCandy's Toast partner application is pending.

## Solution: Approach 1 — Edge function env-var guard + frontend error mapping

### Part B: Deploy Edge Functions + Env-var Guards

#### 1. Deploy all 6 Toast edge functions

| Function | Purpose |
|---|---|
| `toast-oauth-start` | Initiates OAuth flow, returns redirect URL |
| `toast-oauth-callback` | Handles OAuth callback, exchanges code for tokens |
| `toast-token-refresh` | Refreshes expired tokens (also used by "Test Connection") |
| `toast-discount-push` | Pushes promotion discount codes to Toast POS |
| `toast-redemption-webhook` | Receives redemption events from Toast |
| `donny-toast-context` | Gives Donny AI access to Toast sales data |

All deployed with `verify_jwt: false` (matching existing pattern — auth handled internally via Authorization header).

#### 2. Add env-var guards to 3 functions

Functions that require Toast-specific env vars (`toast-oauth-start`, `toast-oauth-callback`, `toast-token-refresh`) get a guard at the top of the handler, after CORS preflight.

Required env vars checked:
- `TOAST_OAUTH_AUTHORIZE_URL`
- `TOAST_CLIENT_ID`
- `TOAST_OAUTH_REDIRECT_URI`

If any are missing, return immediately:
```json
{
  "error": "toast_not_configured",
  "message": "Toast API credentials are not configured yet."
}
```
Status code: **503** (Service Unavailable).

The existing code uses `Deno.env.get(...)!` with non-null assertions at the module top level — these move inside the handler and get checked gracefully instead of crashing.

The other 3 functions (`toast-discount-push`, `toast-redemption-webhook`, `donny-toast-context`) only need Supabase env vars which are always present — no guard needed.

### Part A: Frontend "Coming Soon" State

#### 3. Update `ToastConnectionCard.tsx`

**New state:** Add a `notConfigured` boolean state (default `false`).

**`handleConnect` change:** When `supabase.functions.invoke` returns a non-2xx status, it sets `error` as a `FunctionsHttpError`. The current code throws `error` and catches `err.message`. Update to: check if `data?.error === "toast_not_configured"` (Supabase functions.invoke puts the JSON body in `data` even on non-2xx when the function returns valid JSON). If matched, set `notConfigured = true` instead of showing the red toast notification. Fallback: also check `error?.message` or `error?.context?.json()` for the error code.

**`handleTest` change:** Same detection — show a friendlier message instead of "Could not reach Toast."

**UI change when `notConfigured` is true:** In the `not_connected` status block, instead of rendering the GUID input + Connect button, render:
- An info banner (teal-tinted, not red) with text: **"Toast integration coming soon — we're finalizing our partnership with Toast POS. You'll be able to connect here once it's ready."**
- No connect button, no GUID input

**Unchanged behavior:**
- Status badge stays "Not Connected" (accurate)
- Any other error from the edge function still triggers the existing red toast notification
- Connected/expired/error states work as before

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/toast-oauth-start/index.ts` | Move env reads inside handler, add guard |
| `supabase/functions/toast-oauth-callback/index.ts` | Move env reads inside handler, add guard |
| `supabase/functions/toast-token-refresh/index.ts` | Move env reads inside handler, add guard |
| `src/features/settings/ToastConnectionCard.tsx` | Add `notConfigured` state, detect error, show "coming soon" UI |

## Out of Scope

- Toast API credential acquisition (pending partner application)
- Database migration changes (Toast tables already exist)
- Changes to `toast-discount-push`, `toast-redemption-webhook`, `donny-toast-context` function code
