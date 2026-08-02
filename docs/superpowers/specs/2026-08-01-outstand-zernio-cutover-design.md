# Outstand → Zernio cutover — design

> **Status:** approved 2026-08-01; revised after spec review. Supersedes the lost 5-phase design
> (`~/.claude/plans/let-s-design-this-all-serene-yeti.md`, no longer on disk), of which only
> Phase 1 was ever built — on `feat/social-provider-seam-zernio`, unmerged and undeployed.
> Execution branch: `feat/zernio-cutover`.

## Context

DragonCandy's social integration runs on Outstand.so ($67/mo). It has a hard ~7-connection cap
and effectively no analytics, which starves the one thing the platform is supposed to do: let
Donny tell a business what content drives traffic and what campaign to run next.

A replacement provider (Zernio, formerly Late/getlate.dev) was chosen in June 2026 and a
provider-agnostic seam was built, then stalled. It is **unmerged and undeployed**: `social-proxy`
is not on prod, the `provider` column does not exist, and `ZERNIO_API_KEY` was never set. No live
Zernio call has ever been made.

Three facts shape this plan:

1. **There is nothing to migrate.** Prod holds 8 `business_outstand_accounts` rows across 3 users,
   of which exactly **2 are active** — Joe's YouTube and Dame's Instagram, both founder accounts.
   `social_analytics_cache` is at 0 rows. This is a code cutover with a five-minute manual
   reconnect: no dual-run, no per-user flag, no strangler. That window closes at launch.
2. **The Donny analytics brain already exists.** `content-performance-capture` →
   `content_performance` → `content-strategy-recommend` → `content_briefs` is built and wired. It
   is starved (9 rows), not missing. The work is **repointing feed pipes**, not building a
   recommendation engine.
3. **Zernio is cheaper and better than the original notes claim.** Analytics is included free (not
   a $10/mo add-on) and the first 2 connected accounts are free. At current volume the cutover is
   **cash-positive from day one** (−$67/mo) and removes the connection cap.

**Outcome:** Outstand is gone; posting is at parity; `content_performance` and
`social_analytics_cache` fill with real numbers; Donny's `social_*` tools and
`content-strategy-recommend` run on live data.

---

## Integration surface

Outstand is reached two ways. An earlier draft of this spec counted only the first tier and
wrongly concluded the rest was cosmetic; the proxy tier below is the larger share of the work.

**Tier 1 — direct Outstand API callers (`api.outstand.so` / `OUTSTAND_API_KEY`):**

| Site | Role |
|---|---|
| `supabase/functions/outstand-proxy/index.ts` | the gateway everything else calls |
| `supabase/functions/outstand-reconcile/index.ts` | reconciliation cron |
| `supabase/functions/outstand-webhook/index.ts` | inbound post/account events |
| `supabase/functions/content-performance-capture/index.ts` | Donny's analytics feed |
| `supabase/functions/_shared/outstand-mcp.ts` | Donny's social tools (→ `donny-orchestrator`, `donny-auto-pilot`) |

**Tier 2 — callers that reach Outstand *through* `outstand-proxy`.** Each uses a different request
shape, none of which is `social-proxy`'s `{op, args}`. Deleting `outstand-proxy` breaks all of them:

| Site | Call |
|---|---|
| `src/integrations/outstand/Provider.tsx` | defines `OUTSTAND_PROXY_BASE_URL` + SDK `baseUrl` — the hub |
| `src/pages/OutstandOAuthCallbackPage.tsx` | `POST /__internal/record-connection` |
| `src/components/outstand/AccountsTab.tsx` | `DELETE /social-accounts/{id}` |
| `src/components/outstand/ConnectedAccountsList.tsx` | `DELETE /social-accounts/{id}` |
| `src/contexts/DonnyProvider.tsx` | `POST /posts/` — **writes `social_post_log`** |
| `src/hooks/outstand/useSponsorshipAmplification.ts` | `POST /posts` — **writes `social_post_log`** |
| `src/hooks/useDraftPosts.ts` | `functions.invoke('outstand-proxy')` |
| `supabase/functions/confirm-posting-schedule/index.ts` | `POST /outstand-proxy/v1/posts` |

**Tier 3 — SDK surface.** 38 files import `@outstand-so/ui`, but only ~8 use runtime
hooks/components (`useOutstandApi` 7, `useAccounts` 8, `usePosts` 3, `usePostMetrics` 1, plus
`OutstandProvider`, `ConnectAccountButtonGroup`, `AccountsList`, `OAuthCallback`). The other ~30
import **types only** — a mechanical re-point to the contract.

`business_outstand_accounts`, `outstand_social_account_id` and `outstand_post_id` are legacy
*names* holding provider-opaque ids. CLAUDE.md forbids renames — **they stay**. Cosmetic debt only.

### The provider-resolution hinge

`social-proxy` derives the provider from DB rows: `resolveProviderFromRows` returns a provider only
when **every** non-revoked row agrees, and falls back to `'outstand'` on an empty **or mixed** set
(`resolve-provider.ts`). Ownership gating reads the same rows. Two consequences drive the phase
order below:

- Until `provider='zernio'` rows exist, every Zernio call resolves to Outstand and 403s.
- Adding Zernio rows *alongside* the 2 live Outstand rows yields a mixed set, which silently pins
  the gateway to Outstand — and 503s once `OUTSTAND_API_KEY` is deleted.

So **connect-and-revoke is the hinge**, and it must land before analytics, Donny tools, or posting.

---

## Phase 0 — Prove the provider

The largest risk is that `zernio-map.ts` was written from reading docs, not captured JSON — its
header hedges with "camelCase or snake_case across endpoints" fallbacks, and the original plan
flagged its fixtures as guesses. Two assumptions are already suspect: the base path may be
`/api/v1` (the branch assumes `/v1`), and Zernio exposes a `/profiles` container the contract does
not model.

1. **Zernio account + API key** (Claude drives the founder's Chrome; founder performs any sign-in
   or payment step — Claude never enters credentials). Confirm the free tier covers both accounts.
   Set `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` Supabase secrets (neither exists today).
2. **Connect one real account** (Dame's Instagram) in the Zernio dashboard.
3. **Capture real JSON** for connect-URL, accounts, posts create+get, post analytics, account
   analytics, comments/inbox, **and every webhook payload**. Record the true base path; settle
   whether `/profiles` is a required wrapper.
4. **Diff against `zernio-map.ts`**; fix the mappers and their tests to the captured shapes.

**Gate:** a real post published to a real account through the corrected adapter, and real analytics
returned for it. If this fails, stop — everything downstream rests on it.

---

## Phase 1 — Land the corrected seam

- Rebase on `main`; apply Phase 0 corrections.
- **Renumber the migration** — stamped `20260624000000`, ~5 weeks stale, with migrations up to
  `20260726…` since landed (known concurrent-worktree collision hazard).
- Apply the migration to prod, **then** deploy `social-proxy` (new column before code reading it).
- Deploy bundling all transitive `_shared` files — the bundle is the real Deno parse gate. Run the
  `careful` pre-flight and the `edge-function-reviewer` subagent first.

The gateway implements 12 ops: `listAccounts`, `getConnectUrl`, `recordConnection`, `disconnect`,
`createPost`, `uploadMedia`, `getAccountAnalytics`, `getPost`, `getPostAnalytics`, `deletePost`,
`listComments`, `replyToComment`.

> **Expected divergence, not a regression:** `social-proxy` deliberately omits `outstand-proxy`'s
> post-ownership fallbacks (platform + `donny_scheduled_posts`). Do not read the difference as a bug.

---

## Phase 2 — Connect flow, webhook, and reconnect (the hinge)

- Rewrite `src/integrations/outstand/Provider.tsx` and `src/pages/OutstandOAuthCallbackPage.tsx`
  onto `social-proxy`'s `getConnectUrl` / `recordConnection` ops, writing `provider='zernio'`.
- **Add the Zernio webhook handler now, not at deletion time.** It is the only thing that advances
  `donny_scheduled_posts` from `scheduled` → `published`/`failed`; if it lands after posting moves,
  every post scheduled in the gap sticks at `scheduled` forever. Mirror `outstand-webhook` exactly:
  `post.published`/`post.error` → patch `donny_scheduled_posts` + dedup-insert into
  `outstand_webhook_events` (`id = ${event}:${postId}`); `account.token_expired` → set
  `business_outstand_accounts.status='error'`. Register the URL in the Zernio dashboard and add a
  `verify_jwt = false` entry to `supabase/config.toml`, mirroring `[functions.outstand-webhook]`.
  `donny_scheduled_posts.metadata.outstand_post_id` stays the match key — at least four writers
  depend on it.
- **Reconnect both founder accounts, and revoke every legacy row in the same step.** Set all
  non-revoked `business_outstand_accounts` rows to `status='revoked'` so the set is never mixed.

**Gate:** `select distinct provider from business_outstand_accounts where status <> 'revoked'`
returns only `zernio`. This also closes the deferred `(user_id, outstand_social_account_id)`
unique-constraint TODO in `social-proxy/index.ts` — revoking legacy rows means no cross-provider
id collision, so **no constraint change is needed**.

---

## Phase 3 — Move posting off the proxy

Rewrite every Tier-2 caller onto `social-proxy`, plus the Tier-3 runtime SDK surface:

- Swap the 4 SDK hooks for the branch's headless hooks (`useSocialAccounts`, `useSocialPost`,
  `useSocialAnalytics`, `useSocialComments`) — built to match consumed shapes 1:1.
- Re-point the ~30 type-only imports to `src/integrations/social/contract.ts`.
- Rewrite `DonnyProvider.tsx`, `useSponsorshipAmplification.ts`, `useDraftPosts.ts`,
  `AccountsTab.tsx`, `ConnectedAccountsList.tsx`, and `confirm-posting-schedule/index.ts`.
  Note `confirm-posting-schedule` builds `platformAccountMap[platform]` last-row-wins — verify it
  behaves with a single-provider row set.

**Gate:** a post published from the app produces a **fresh `social_post_log` row carrying a Zernio
post id**. Without this, Phase 6 has no input.

**Revert path:** redeploy the previous frontend commit. Legacy rows were revoked, not deleted, so
un-revoking them plus restoring `OUTSTAND_API_KEY` returns to the old provider.

---

## Phase 4 — Account-level analytics (`social_analytics_cache`)

Wire `useSocialAnalytics` + `cache-map.ts` so AnalyticsTab populates. Preserve the live table
contract exactly — `metric_type ∈ followers|engagement|reach|posts` (**not** `engagement_rate`), FK
column `outstand_account_id`, conflict key
`user_id,outstand_account_id,metric_type,period_start,period_end`. Emitting `engagement_rate` would
fail to conflict-match existing rows.

This table is written **client-side** on AnalyticsTab render (`useAccountMetrics.ts`); nothing
cron-driven writes it. Verify by opening the tab, not by waiting for a cron.

---

## Phase 5 — Donny's social tools

Rewrite `_shared/outstand-mcp.ts` → `_shared/social-mcp.ts` against the `{op, args}` contract (the
current bridge posts `{action, ...args}` with an `x-outstand-user-id` header — a real rewrite, not a
URL swap). Keep `social_*` namespacing and the free-tier analytics-only filter. Drop the
`OUTSTAND_MCP_URL` MCP-client branch.

Three of the seven current tools have **no backing gateway op** — decide explicitly per tool:

| Tool | Disposition |
|---|---|
| `create_post`, `schedule_post` | → `createPost` (with/without `scheduledAt`) |
| `get_account_metrics` | → `getAccountAnalytics` |
| `get_post_analytics` | → resolve posts via `social_post_log`, then `getPostAnalytics(id)`. **Signature mismatch:** `donny-auto-pilot` calls it account-scoped as `{days: 7}`; the op takes a post id. Fix the call site. |
| `get_optimal_times`, `get_audience_insights`, `list_scheduled` | **no op exists** — drop, or add ops. Do not claim they work. |

Update imports in `donny-orchestrator` and `donny-auto-pilot`.

---

## Phase 6 — Post-level analytics (`content_performance`)

Now that posts carry Zernio ids, repoint `content-performance-capture` (`index.ts` + `capture.ts`):
swap the fetch to Zernio and extend `normalizeAnalytics` with Zernio's key candidates.

**Do not route through the contract's `PostAnalytics`** — it exposes
`impressions/likes/comments/shares/clicks` while `content_performance` stores
`views/likes/comments/shares/saves/reach/engagement_rate`; the narrower type silently drops four
metrics. Keep `milestonesDue`, the `raw` column, and the `outstand_post_id,milestone` conflict key.

Accept that the 3 pre-cutover `social_post_log` rows stop maturing; their 9 `content_performance`
rows stay as-is. Not worth a backfill. `content-strategy-recommend` needs no change.

---

## Phase 7a — Remove Outstand code (reversible)

- Delete `outstand-proxy`, `outstand-reconcile`, `outstand-webhook`, the Outstand adapter wiring,
  and the `@outstand-so/ui` dependency.
- **Retain `OUTSTAND_*` secrets and the subscription** so Phase 3's revert path stays live.
- **Pre-delete gate:** `rg "outstand-proxy|@outstand-so" src supabase/functions` returns nothing
  outside the files being deleted.
- `outstand-reconcile` is dropped **without replacement** — detecting silently-dropped accounts is
  not covered by `account.token_expired`. With 2 accounts this is deliberate YAGNI, not an oversight.

## Phase 7b — Remove secrets + cancel (irreversible)

Gated on a soak: **7 days** of clean Zernio publishes with non-zero `content_performance` inserts
and no `status='error'` accounts. Then delete the `OUTSTAND_*` secrets and cancel the subscription.

**Keep the contract and the seam** — they are the real insurance for the next swap. A "fallback to
Outstand" is not real once the subscription is cancelled, so carry no dead dual-provider code.

---

## Verification

- **Phase 0 gate:** real post published + real analytics returned through the corrected adapter.
- **Phase 2 gate:** `select distinct provider from business_outstand_accounts where status <>
  'revoked'` → only `zernio`. A scheduled post reaches `published` via the Zernio webhook.
- **Phase 3 gate:** a fresh `social_post_log` row carrying a Zernio post id.
- **Parity:** connect, compose, schedule, publish, calendar, engagement/reply work for both founder
  accounts on desktop **and** mobile, console clean.
- **Account analytics:** open AnalyticsTab as each founder → expect 4 rows per account per 7-day
  period in `social_analytics_cache` with `metric_type ∈ followers|engagement|reach|posts`.
  (Client-side write — not a cron check.)
- **Post analytics:** `select count(*) from content_performance` climbs after a
  `content-performance-capture` cron run.
- **Donny:** a `social_*` tool returns real data, and `content-strategy-recommend` produces a brief
  citing actual post performance.
- **Regression:** `npm run typecheck`, `npm run build`, `npx vitest run supabase/functions/social-proxy
  src/integrations/social` (trust "N passed, 0 failed", not the exit code — pre-existing e2e files fail).
- **Reviews:** `data-exposure-reviewer` on gateway/webhook changes, `edge-function-reviewer` before
  each deploy, then `codex review --base main` until clean (mandatory before PR).
- **Post-deploy:** `verify-prod`, then `knowledge-sync` (wiki concept page `social-provider-seam.md`,
  SHIPPED_LOG, PROJECT_CONTEXT §5, DATABASE_SCHEMA for the `provider` column).

## Risks

- **Mappers unvalidated against the live API** — the reason Phase 0 exists and gates everything.
- **The original 5-phase design doc is gone.** Phases beyond the seam are re-decided here, not
  recovered.
- **Contract narrows Zernio to 5 platforms** (`facebook|instagram|tiktok|x|youtube`); Zernio supports
  ~15. Fine for parity scope, but LinkedIn/Threads/Google Business — the last notably relevant to
  restaurants — need a contract change later.
- **`_shared` contract duplication** (`src/integrations/social/contract.ts` ↔
  `supabase/functions/_shared/social-contract.ts`) is hand-synced and can drift.
- **Mixed-provider rows fail silently**, resolving to Outstand rather than erroring. The Phase 2
  revoke-all step is what prevents this; verify it rather than assuming it.
