# Session Extract: Weekly Sync — Outstand Webhook, Analytics RLS, Type Fixes

## Session Metadata
- Created: 2026-06-08
- Project: dragoncandy-v3-d783432b
- Branch: main (automated maintenance agent — wiki-sync/2026-06-08)
- Type: Documentation sync — synthesized from git commits 2026-06-07 → 2026-06-08,
  closing the gap since the 2026-06-07 Core Docs sync.

## Purpose

Capture three distinct workstreams that shipped after the last wiki ingest
(2026-06-07): the Outstand publish webhook closing the scheduled-post lifecycle,
an analytics RLS fix that was silently dropping anonymous flywheel data, and a
pair of database/type-safety patches.

## Codebase Scale (verified 2026-06-08)

- **63 pages**, **185 hooks**, **74 edge functions** (excluding `_shared/`).
- Prior docs claimed 60 pages / 183 hooks / 73 edge functions — corrected to above.
- New edge function since last sync: `outstand-webhook`.

---

## 1. Outstand Publish Webhook (PR #37, shipped)

**Problem:** `confirm-posting-schedule` queued content to Outstand and stored the
returned `outstand_post_id` in `donny_scheduled_posts.metadata`. Nothing ever
advanced the row past `scheduled` — there was no inbound webhook handler, and
`outstand-reconcile` only handled account state. `published`/`failed` statuses
and `published_at` were never written, so the schedule UI showed all posts as
pending forever and publish failures were invisible.

**Solution:** New edge function `supabase/functions/outstand-webhook/index.ts`
receives three Outstand events:
- `post.published` — advances `donny_scheduled_posts` → `published`, sets
  `published_at`, stores per-account `socialAccounts[]` results in `metadata.publish_result`.
- `post.error` — advances row → `failed`.
- `account.token_expired` — sets `business_outstand_accounts.status = 'error'`,
  reusing the existing reconnect-needed prompt flow.

**Auth:** HMAC-SHA256 over raw request body; header `X-Outstand-Signature: sha256=<hex>`;
secret in env var `OUTSTAND_WEBHOOK_SECRET`. Constant-time comparison to prevent timing attacks.
`verify_jwt = false` in `config.toml` (inbound webhook from Outstand, not from an
authenticated user).

**Idempotency:** guarded `neq("status", "published")` on all updates; audit row in new
`outstand_webhook_events` table with a unique `id = "<event>:<postId>"` (unique-violation ignored).

**Partial success:** Outstand fires `post.published` when ≥1 account succeeds. We map
this to `published` (not a partial state), and record the per-account results in metadata
for visibility.

**Shared lib:** `supabase/functions/_shared/outstand-webhook-lib.ts` — runtime-agnostic
HMAC verification + defensive event parser, unit-tested in
`supabase/functions/_shared/outstand-webhook-lib.test.ts`.

**UI:** `src/components/schedule/PostCard.tsx` updated to surface `published`/`failed`
status with appropriate badge; `PostCard.test.tsx` covers the new badge states.

**Flow diagram:** `docs/flows/campaign-lifecycle.md` updated to show the
`scheduled → published/failed` webhook leg.

**Runbook:** `docs/superpowers/runbooks/outstand-webhook.md` (one-time setup,
verify steps, project refs for staging + prod).

**Design spec:** `docs/superpowers/specs/2026-06-07-outstand-publish-webhook-design.md`

**Correlation mechanism:** webhook `postId` === `donny_scheduled_posts.metadata.outstand_post_id`
(already set by `confirm-posting-schedule` when queuing to Outstand).

## 2. Analytics RLS Fix — Anonymous Event Logging (PR #41, shipped)

**Problem:** `analytics_events` had INSERT policies only for `authenticated` and
`service_role` roles. Logged-out visitors (anon role) had their events rejected by
RLS — silently dropping flywheel data and flooding the Postgres error log. The
`useAnalyticsBatch` client hook already sent `user_id = null` for anonymous events,
but the DB wasn't accepting them.

**Fix:** New RLS policy `Anon can insert anonymous analytics events` on
`analytics_events` for the `anon` role, scoped to `user_id IS NULL`. Anon can log
anonymous events (user_id null); cannot attribute an event to a real user's ID.
Migration: `supabase/migrations/20260607140000_analytics_events_anon_insert.sql`.
Validated on both staging and prod.

**Also corrected in PROJECT_CONTEXT.md:** the carried-forward note about
`campaign_status` missing `in_progress` was stale — a prior commit already confirmed
no code writes that value to enum columns, and prod logs no longer show the error.
The note was updated from "should be resolved" to "already resolved".

## 3. Database / Type-Safety Patches (PRs #39, #40, shipped)

### 3a. `get_user_conversations` Enum Literal Fix (PR #39)

The `get_user_conversations` Postgres function referenced a `'withdrawn'` enum
literal that does not exist in the `campaign_status` enum. This caused runtime
errors for any conversation query involving a collaboration status filter.
Migration `20260607000000_fix_get_user_conversations_withdrawn_enum.sql` rewrites
the function (184 lines) to remove the invalid literal.

### 3b. Block/Report RPC Types (PR #40)

- `src/integrations/supabase/types.ts` — added proper types for the `block_user`
  and `report_user` RPCs (12 new lines).
- `src/hooks/useReportUser.ts` and `src/hooks/useUserBlocks.ts` — replaced `as never`
  casts with the new typed signatures.
- Migration timestamp deconflicted: `20260607131000` to avoid collision.

## 4. Test Config Fix

Vitest was picking up Supabase Deno function test files (e.g.
`supabase/functions/_shared/outstand-webhook-lib.test.ts`), which use Deno globals
(`Deno.env`) and fail in Node/jsdom. `vite.config.ts` updated to exclude
`supabase/**` from the Vitest test runner.

---

## Cross-Doc Sync Performed This Session

- `CLAUDE.md`: edge-function count 73 → 74 (two places).
- `PROJECT_CONTEXT.md`: scale date → 2026-06-08, counts updated to 63/185/74; §5
  Outstand workstream expanded (webhook section); §10 73 → 74.

## Related Resources

- Spec: `docs/superpowers/specs/2026-06-07-outstand-publish-webhook-design.md`
- Runbook: `docs/superpowers/runbooks/outstand-webhook.md`
- Campaign lifecycle flow: `docs/flows/campaign-lifecycle.md`
- Prior ingest: [[Core Docs Recent Updates Sync Session]] (2026-06-07)
- Related entity: [[Outstand]]

---

**Security Reminder**: No secret values recorded here — names and locations only.
