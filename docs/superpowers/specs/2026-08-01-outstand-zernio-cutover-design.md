# Outstand → Zernio cutover — design

> **Status:** approved 2026-08-01; revised after spec review. Supersedes the lost 5-phase design
> (`~/.claude/plans/let-s-design-this-all-serene-yeti.md`, no longer on disk), of which only
> Phase 1 was ever built. Execution branch: `feat/zernio-cutover`.
>
> **Correction 2026-08-04:** earlier revisions of this spec said the seam was "unmerged". **It is
> merged** — `feat/social-provider-seam-zernio` landed on `main` as **PR #175**. What was true is
> that it is entirely *dark*: `social-proxy` is not deployed, the `provider` migration was never
> applied (verified: not in `schema_migrations`, column absent), and `ZERNIO_API_KEY` was never set.
> "Built but dark" was right; "unmerged" was not.

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
| `supabase/functions/outstand-reconcile/index.ts` | reconciliation — **not scheduled** (no pg_cron entry, no GH workflow); admin/externally invoked |
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

So **connect-and-revoke is the hinge**. Connect lands additively in Phase 2; the revoke is the first
step of Phase 3, atomic with the code that depends on it. Analytics and Donny tools follow both.

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

## Phase 2 — Connect flow + webhook (strictly additive; nothing flips yet)

Phase 2 makes Zernio *reachable* without changing which provider the app uses. The row set stays
mixed on purpose — mixed resolves to `'outstand'`, so provider resolution keeps pointing at the
live integration.

> **Caveat: three readers have no provider filter**, so the *added* row (a second row for a platform
> the founder already has) can confuse them until Phase 3: `DonnyProvider.tsx` passes **all**
> non-revoked ids to `outstand-proxy POST /posts/` (Outstand sees an unknown id);
> `confirm-posting-schedule` builds `platformAccountMap[platform]` last-row-wins;
> `useDraftPosts` uses `.maybeSingle()` on a `platform`-filtered query. **Run Phase 2 and Phase 3
> back-to-back**, or connect the second account at the top of Phase 3. Founder-only either way.
>
> **Pre-existing bug found while verifying this (fix in Phase 3, not caused by the cutover):**
> `useDraftPosts` already matches **2 rows** for both founders today (Dame: 2 `instagram`, Joe: 2
> `youtube` — one `active`, one `error` each), because the query filters `user_id` + `platform` with
> **no status filter**. `.maybeSingle()` errors on >1 row, the destructure discards `error`, so
> `data` is null and the code throws *"No active Outstand account … Connect your account in Settings
> > Social."* at users who **do** have an active account. Phase 3 must filter to the active,
> Zernio-provider row rather than reproducing this.

- **`Provider.tsx` changes additively.** Keep `DragonCandyOutstandProvider`, `useOutstandConfig` and
  `OUTSTAND_PROXY_BASE_URL` mounted — ~8 Tier-3 consumers plus `useSponsorshipAmplification` resolve
  through that SDK context and do not move until Phase 3. **Add** the `social-proxy` connect path
  alongside. Removing the SDK provider here would break the entire social UI for a whole phase.
- Rewrite `src/pages/OutstandOAuthCallbackPage.tsx` onto `recordConnection`, stamping
  `provider='zernio'`.
- **Connect is driven out-of-band this phase.** The in-app entry point is the SDK's
  `ConnectAccountButtonGroup`, used only in `AccountsTab.tsx` and `ConnectedAccountsList.tsx` —
  both Phase 3. So: call `getConnectUrl` by hand (console/curl), complete OAuth, and land on the
  rewritten callback so `recordConnection` writes the row. Connecting in the Zernio *dashboard*
  writes no DB row at all, which is the exact failure this phase exists to prevent.
- **Add the Zernio webhook handler now, not at deletion time.** It is the only thing that advances
  `donny_scheduled_posts` from `scheduled` → `published`/`failed`; if it lands after posting moves,
  every post scheduled in the gap sticks at `scheduled` forever. Mirror `outstand-webhook` exactly:
  `post.published`/`post.error` → patch `donny_scheduled_posts` + dedup-insert into
  `outstand_webhook_events` (`id = ${event}:${postId}`); `account.token_expired` → set
  `business_outstand_accounts.status='error'`. Register the URL in the Zernio dashboard and add a
  `verify_jwt = false` entry to `supabase/config.toml`, mirroring `[functions.outstand-webhook]`.
  `donny_scheduled_posts.metadata.outstand_post_id` stays the match key — at least four writers
  depend on it.
- **Delete `outstand-reconcile` in this phase**, not at 7a. It selects `status='active'` with **no
  provider filter** and flags every id absent from Outstand's live list as `status='error'`. The
  moment an active Zernio row exists, one invocation flips both founder accounts to `error`,
  breaking `useDraftPosts` (which hard-requires `status='active'`) and firing reconnect prompts. It
  is already slated for deletion without replacement, so pulling it forward costs nothing.

**Gate:** a real Zernio webhook is received, signature-verified, and returns 200 — `no_match` is the
**expected** result, since nothing creates a Zernio-backed `donny_scheduled_posts` row until Phase 3.

---

## Phase 3 — Flip to Zernio and move posting off the proxy

The flip and the code that depends on it ship together, so there is no window where revoked rows
face Outstand-only code paths.

- **First step: revoke every non-Zernio row.** Set all non-revoked `business_outstand_accounts` rows
  that aren't `provider='zernio'` to `status='revoked'`, so the set stops being mixed and resolution
  moves to Zernio. Doing this in Phase 2 would have taken founder posting down for the whole
  inter-phase window — `useDraftPosts` requires `status='active'`, and every posting path still
  routed through `outstand-proxy`, which would have handed Zernio ids to the Outstand API.
- Remove the SDK provider from `Provider.tsx` and swap the 4 SDK hooks for the branch's headless
  hooks (`useSocialAccounts`, `useSocialPost`, `useSocialAnalytics`, `useSocialComments`) — built to
  match consumed shapes 1:1.
- Re-point the ~30 type-only imports to `src/integrations/social/contract.ts`.
- Rewrite `DonnyProvider.tsx`, `useSponsorshipAmplification.ts`, `useDraftPosts.ts`,
  `AccountsTab.tsx`, `ConnectedAccountsList.tsx` (including the 4 `ConnectAccountButtonGroup`
  usages), and `confirm-posting-schedule/index.ts`. Note `confirm-posting-schedule` builds
  `platformAccountMap[platform]` last-row-wins — verify it behaves on a single-provider row set.

**Gates:** (a) `select distinct provider from business_outstand_accounts where status <> 'revoked'`
returns only `zernio`; (b) a post published from the app produces a **fresh `social_post_log` row
carrying a Zernio post id** — without this, Phase 6 has no input; (c) that post reaches `published`
via the Zernio webhook.

Gate (a) also closes the deferred `(user_id, outstand_social_account_id)` unique-constraint TODO in
`social-proxy/index.ts` — no cross-provider id collision is possible, so **no constraint change is
needed**.

**Revert path:** redeploy the previous frontend commit. Legacy rows were revoked, not deleted, so
un-revoking them plus the retained `OUTSTAND_API_KEY` returns to the old provider.

---

## Phase 4 — Account-level analytics (`social_analytics_cache`)

Phase 3 already swaps `useSocialAnalytics` in. **This phase is table-contract preservation and
verification only** — no new wiring.

Preserve the live contract exactly — `metric_type ∈ followers|engagement|reach|posts` (**not**
`engagement_rate`), FK column `outstand_account_id`, conflict key
`user_id,outstand_account_id,metric_type,period_start,period_end`. Emitting `engagement_rate` would
fail to conflict-match existing rows.

The table is written **client-side** on AnalyticsTab render. Post-cutover the writer is
`src/integrations/social/hooks/useSocialAnalytics.ts` (not the legacy `useAccountMetrics.ts`).
Nothing cron-driven writes it — verify by opening the tab, not by waiting for a cron.

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
| `get_optimal_times`, `get_audience_insights`, `list_scheduled` | **no backing op exists — DROP all three.** At 2 accounts none earns a new provider op. `list_scheduled` can later be served from `donny_scheduled_posts` with no provider call at all. Do not claim they work. |

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

- Delete `outstand-proxy`, `outstand-webhook`, the Outstand adapter wiring, and the
  `@outstand-so/ui` dependency. (`outstand-reconcile` already went in Phase 2.)
- **DO NOT delete `_shared/outstand-webhook-lib.ts`.** An earlier revision listed it as orphaned by
  the `outstand-webhook` deletion — that is **wrong**, and verified so: `adapters/zernio.ts:11`
  imports `verifyOutstandSignature` from it, and the Zernio adapter is being kept. Removing it
  breaks the surviving adapter. Either keep the file as-is, or rename the helper to a
  provider-neutral module in a separate, test-covered step — not as part of a deletion sweep.
- **Retain `OUTSTAND_*` secrets and the subscription.** Note this alone does not preserve the revert:
  7a deletes the functions the revert needs, so post-7a the path is "redeploy the deleted functions
  from the pre-7a commit + un-revoke rows + retained `OUTSTAND_API_KEY`."
- **Close the stray-row hole.** Both `outstand-proxy` upserts omit `provider`, so the migration's
  `DEFAULT 'outstand'` applies — until the proxy is gone, any connection recorded through it
  (reachable directly with a user JWT) re-creates an **active** `provider='outstand'` row and
  silently re-mixes the set. Deleting the proxy removes the writer; then
  `ALTER TABLE business_outstand_accounts ALTER COLUMN provider SET DEFAULT 'zernio'` (additive,
  allowed under the never-rename rule) so a future omitted-provider insert cannot recreate it.
- **Pre-delete gates:** `rg "outstand-proxy|@outstand-so" src supabase/functions`,
  `rg "OUTSTAND_API_KEY|api\.outstand\.so" src supabase/functions`, and
  `rg -l outstand supabase/functions/_shared` all return nothing outside the files being deleted;
  and the distinct-provider query still returns only `zernio`.
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
- **Phase 2 gate:** a real Zernio webhook received, signature-verified, 200 (`no_match` expected).
- **Phase 3 gates:** `select distinct provider from business_outstand_accounts where status <>
  'revoked'` → only `zernio`; a fresh `social_post_log` row carrying a Zernio post id; that post
  reaches `published` via the Zernio webhook.
- **Provider-set invariant:** re-run the distinct-provider query at Phase 3, at 7a, and post-deploy
  — it is a point-in-time check, not an invariant, until the proxy is deleted and the column default
  is flipped.
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
- **Mixed-provider rows fail silently**, resolving to Outstand rather than erroring. The **Phase 3**
  revoke-all step is what prevents this; verify it rather than assuming it, and re-verify at 7a and
  post-deploy (see the provider-set invariant under Verification).
- **Queries lacking a provider/status filter** are the recurring hazard class — `useDraftPosts`,
  `DonnyProvider`, and `confirm-posting-schedule` all read `business_outstand_accounts` without one,
  and one of them is already failing on prod today. Audit for this pattern during Phase 3 rather
  than porting it forward.
