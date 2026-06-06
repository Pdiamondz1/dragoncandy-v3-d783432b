# Outstand Account Recovery — Design Spec

> Date: 2026-06-06
> Status: Approved for planning
> Owner: Dame (CPO)
> Approach: **B** — operational recovery + reusable reconcile + in-app reconnect prompt
>
> **Planning refinement (2026-06-06):** the `business_outstand_accounts.status`
> CHECK already allows `'active' | 'revoked' | 'error'`, and `'error'` is
> currently unused. We reuse `'error'` to mark connections wiped upstream
> instead of adding a `revoked_reason` column — this removes the schema
> migration entirely. User-initiated disconnects keep using `'revoked'`, so the
> two cases remain distinguishable. The proxy is left unchanged.

## 1. Problem

DragonCandy's Outstand.so account was **partially wiped** following a monthly
billing discrepancy. The billing issue is now resolved, but the **connected
social accounts on Outstand's side are gone** (Instagram, YouTube, Facebook
links no longer exist upstream).

Our database is intact: `business_outstand_accounts` still holds the old
mapping rows. As of 2026-06-06 there are **6 rows across 3 users** — 4 with
`status='active'` (1 Facebook, 1 Instagram, 2 YouTube) and 2 already
`revoked`. The active rows now point at Outstand `social_account_id`s that no
longer resolve upstream.

### Symptom

The `outstand-proxy` edge function scopes every request to the caller's owned
account IDs (`listOwnedAccountIds`, reading `status != 'revoked'`). Because
those IDs are dead upstream, posting/analytics calls return empty or error and
the social feature silently fails. Worse, the Settings → Accounts UI
(`useLocationSocialAccounts`, which reads only `status='active'` rows) still
shows these as **"connected"** — so users see a connection that doesn't work
and get no signal that anything is wrong.

### Account ownership

The 3 affected users are a **mix of the founder's own/test accounts and real
organic users**. The founder can re-connect their own accounts directly; the
real users need an in-app signal telling them to reconnect.

### Verified findings (2026-06-06, read-only check with restored key)

A read-only `GET /social-accounts` with the new key confirmed:
- The key is **valid** and `OUTSTAND_BASE_URL` is correct (HTTP 200,
  `{"success":true,...}`).
- The Outstand live account list is **empty** (`data: [], count: 0,
  total: 0`) — every connected account was wiped upstream.
- Therefore **all 4 active local rows are dead** and need reconnection:
  `Crocodo`/facebook (`AdOv7`), `areyouaman`/instagram (`2RPLS`),
  `@bombasticity262`/youtube (`Wvxrz`), `@josephcastelo149`/youtube (`26KtS`).

This is exactly the **confirm-empty** scenario (§4.2): an empty live list with
active rows present. The guard prevents accidentally marking every connection
broken; in this case it is correct, so the operator intentionally passes
`confirm_empty=true`. The real data validates the design.

## 2. Goals / Non-Goals

**Goals**
- Restore a working Outstand API key.
- Stop the UI from presenting dead connections as live.
- Make affected users self-serve their reconnection through the existing flow.
- Make the *next* billing-induced wipe a one-command recovery, not a manual
  archaeology project.

**Non-Goals (YAGNI for this stage)**
- Automatic upstream-health detection in the proxy (401/404 self-revoke).
- Scheduled/periodic reconciliation.
- Any change to the OAuth connect flow itself — it already works.
- Migrating off the org-wide key model.

## 3. Architecture Recap (current state)

- **Secret-based auth.** `OUTSTAND_API_KEY` (org-wide bearer `ost_…`) lives in
  Supabase secrets, used only server-side by `supabase/functions/outstand-proxy`.
  The browser never sees it. `OUTSTAND_BASE_URL` defaults to
  `https://api.outstand.so/v1`.
- **Mapping table.** `business_outstand_accounts` maps `user_id` →
  `outstand_social_account_id` per `platform`, with a `status`
  (`active` / `revoked` / `error`) column. The proxy scopes all calls to a
  user's non-revoked rows.
- **OAuth connect flow (works).** `POST /social-networks/{network}/auth-url`
  → provider consent → `OutstandOAuthCallbackPage` → either the SDK
  `OAuthCallback` (`/social-accounts/pending/{token}/finalize`) or the
  one-step `__internal/record-connection` path → upsert into
  `business_outstand_accounts` (`onConflict: user_id,outstand_social_account_id`).
- **Display.** `useLocationSocialAccounts(userId)` returns `status='active'`
  rows for the Settings → Accounts surface.

## 4. Design

### 4.1 Step 1 — Restore the API key (operational)

The existing Supabase secret value cannot be reliably read, so rather than
guess whether the old key survived the wipe, **generate a fresh key** and set
it.

1. In Outstand → API keys, generate a new key (`ost_…`) under the **same org**
   that owns these social accounts. (If the wipe moved/replaced the org,
   confirm the org identity first — accounts must be re-connected under the org
   whose key we configure.)
2. In Supabase, set the `OUTSTAND_API_KEY` secret to the new value and confirm
   `OUTSTAND_BASE_URL = https://api.outstand.so/v1`.
3. Secrets are read at function invocation — **no function redeploy required**;
   the next call picks up the new value (allow a short propagation window).

This is the only step that handles a live credential, so it is performed by the
founder via the Supabase/Outstand dashboards, not by the agent. Exact
click-paths to be captured in the implementation plan.

**Verification of the key:** a successful `outstand-reconcile` dry-run (§4.2)
that returns a 2xx live-account list confirms the key works; a 401 abort
confirms it does not.

### 4.2 Step 2 — `outstand-reconcile` edge function (reusable core)

A new server-side Deno edge function at
`supabase/functions/outstand-reconcile/index.ts`. It holds the org key and
performs the diff the agent cannot do externally.

**Behavior**
1. Fetch the **complete** live list of social accounts from Outstand
   (`GET /social-accounts`), **fully consuming pagination** before any decision
   is made. Collect the set of live `social_account_id`s (`liveIds`).
2. Load `business_outstand_accounts` rows with `status='active'`. (Default:
   all users. Optional `user_id` input narrows the sweep to one user.)
3. For each active row whose `outstand_social_account_id ∉ liveIds`: update to
   `status='error'`, `updated_at=now()`.
4. Return a summary: `{ live_count, live_ids, errored: [{id, user_id, platform,
   outstand_social_account_id}], kept: [...] }`.

**Safety rails (mandatory — a careless version could flag every connection)**
- **Abort on non-2xx.** If the live-list fetch returns any non-2xx (e.g. 401
  from a bad/absent key, or a 5xx), perform **zero writes** and return an error
  summary. Never write on an auth/transient failure.
- **Confirm-empty guard.** If the live list is a clean 2xx but **empty** while
  active rows exist, do **not** write unless the caller passes
  `confirm_empty=true`. This prevents a misconfigured-but-200 response (or a
  wrong-org key) from silently flagging everything. The default response in this
  case reports `would_error` counts and requires re-invocation with the flag.
- **Complete-list invariant.** Decisions are computed only after all pages are
  fetched. A partial list must never drive a write.
- **Idempotent.** A second run finds no `active` rows to change (the dead ones
  are already `error`), so it is a safe no-op.

**Auth / invocation.** Gated behind the existing `has_role('admin')`
security-definer check; also invokable with the service role for scripted/admin
use. It is a rare, manual administrative sweep — not user-facing.

**Pure diff helper.** The "given `liveIds` + active rows → which to mark error"
logic is extracted as a pure function so it can be unit-tested without network
or DB (see §6).

### 4.3 Step 3 — no schema change

The existing `status` CHECK on `business_outstand_accounts` already allows
`'active' | 'revoked' | 'error'` (see
`supabase/migrations/20260506140000_outstand_account_links.sql`). `'error'` is
currently unused and means exactly "exists in our records but broken upstream",
so no migration is needed. Semantics:
- `'error'` — set by `outstand-reconcile` when the connection vanished on
  Outstand's side. Drives the reconnect prompt.
- `'revoked'` — user-initiated disconnect via the existing `recordDisconnect`
  path (unchanged). Does **not** prompt reconnect.
- `'active'` — live, usable connection.

### 4.4 Step 4 — "Reconnect needed" prompt (frontend)

**New hook** `useReconnectNeeded(userId)` (in `src/hooks/outstand/`):
returns the list of platforms needing reconnection. A platform qualifies when,
for that `(user_id, platform)`, **at least one row** has `status='error'`,
**and** the user has **no** row with `status='active'` for that platform.
(Order/recency of rows does not matter — the presence of any active row clears
the platform; the presence of any `error` row with no active row triggers it.)
React Query conventions: `['reconnect-needed', userId]`, `enabled: !!userId`,
error + loading handled.

This condition deliberately excludes:
- brand-new users who never connected (no `error` row at all), and
- users who chose to disconnect (those rows are `'revoked'`, not `'error'`).

**Banner** rendered in the Settings → Accounts surface (the area backed by
`useLocationSocialAccounts`). For each platform returned by
`useReconnectNeeded`, show a row explaining the provider disconnected the
account and a reconnect button. The button routes into the **existing** OAuth
connect flow for that platform (`auth-url` → `OutstandOAuthCallbackPage` →
upsert). When a fresh `active` row lands for the platform, the
"no active row" condition fails and the banner row disappears on the next
query invalidation.

**Design-system constraints**: brand-adjacent colors only (teal/pink/warm
neutrals — never gray), `rounded-2xl` card / pill buttons, mobile-first base
classes with separate `lg:` desktop treatment, tested on both viewports.

## 5. Data Flow (end to end)

```
Founder restores key (Supabase secret)
        │
        ▼
Admin invokes outstand-reconcile
        │  fetch live accounts (paginated, abort-on-error)
        │  diff vs active rows
        ▼
Dead rows → status='error'
        │
        ▼
Affected user opens Settings → Accounts
        │  useReconnectNeeded() → ["instagram", ...]
        ▼
"Reconnect needed" banner → click → existing OAuth flow
        │
        ▼
New active row upserted → banner row clears
```

## 6. Testing

**Unit (Vitest, co-located)**
- Pure diff helper: active rows + `liveIds` → correct error set.
- Abort-on-error: non-2xx live fetch → zero writes.
- Confirm-empty guard: empty live list + active rows + no flag → zero writes,
  `would_error` reported; with `confirm_empty=true` → writes.
- Idempotency: second run changes nothing.
- `useReconnectNeeded` show/hide conditions: error-with-no-active → shown;
  user-disconnect (`revoked`) → hidden; never-connected → hidden;
  reconnected (active exists) → hidden.

**Manual / production (per CLAUDE.md)**
- After key restore: run reconcile, confirm the expected dead rows flip to
  `error` and any genuinely-live ones are kept.
- Reconnect a real platform through the banner; confirm a new active row
  appears and the banner row clears.
- Verify on dragoncandy.io on **both** desktop and mobile viewports; check
  console for errors.

## 7. Rollout

1. No schema migration (reusing the existing `'error'` status).
2. Deploy `outstand-reconcile` edge function (Supabase — separate from the
   Lovable frontend deploy; edge functions deploy via MCP/CLI).
3. ~~Founder restores the API key secret.~~ **Done 2026-06-06** —
   `OUTSTAND_API_KEY` set in Supabase and verified working (HTTP 200).
4. Run `outstand-reconcile` (the default no-flag call reports `would_error`
   to confirm; re-invoke with `confirm_empty=true` to perform the write —
   required here because the live list is empty).
5. Ship the frontend banner + hook (Lovable deploy from `main`).
6. Founder reconnects own accounts; real users self-serve via the banner.
7. Verify in production on both viewports.

## 8. Risks & Mitigations

- **Mass-flag from a bad key.** Mitigated by abort-on-non-2xx and the
  confirm-empty guard.
- **Partial pagination flag.** Mitigated by the complete-list invariant.
- **Wrong-org key.** Reconnecting accounts must happen under the same org the
  key belongs to; §4.1 calls for confirming org identity. A wrong-org key would
  return a live list that doesn't include our accounts — the confirm-empty
  guard and a sanity check on `live_count` surface this before any revoke.
- **Edge-function secret propagation.** Allow a short window after setting the
  secret before the first reconcile call.

## 9. Musk's-Algorithm Summary

- **Deletes:** the dead mapping rows masquerading as live connections, and the
  manual "what changed on Outstand?" investigation on every recurrence.
- **Simplifies:** recovery collapses to *set key → run one function →
  users click reconnect*.
- **Automates:** the diff-and-flag sweep (reusable for the next wipe) and the
  user-facing reconnect signal (no manual outreach needed).
- **Keystrokes removed:** affected users go from "social is broken, file a
  support request" (unbounded) to a **single tap** on the reconnect button.
