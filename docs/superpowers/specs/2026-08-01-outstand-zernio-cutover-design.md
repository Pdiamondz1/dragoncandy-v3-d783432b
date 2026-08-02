# Outstand → Zernio cutover — design

> **Status:** approved 2026-08-01. Supersedes the lost 5-phase design
> (`~/.claude/plans/let-s-design-this-all-serene-yeti.md`, no longer on disk), of which only
> Phase 1 was ever built — on `feat/social-provider-seam-zernio`, unmerged and undeployed.
> Execution branch: `feat/zernio-cutover`.

## Context

DragonCandy's social integration runs on Outstand.so ($67/mo). It has a hard ~7-connection
cap and effectively no analytics, which starves the one thing the platform is supposed to do:
let Donny tell a business what content drives traffic and what campaign to run next.

A replacement provider (Zernio, formerly Late/getlate.dev) was chosen in June 2026 and a
provider-agnostic seam was built on `feat/social-provider-seam-zernio` — then stalled. It is
**unmerged and undeployed**: `social-proxy` is not on prod, the `provider` column does not
exist, and `ZERNIO_API_KEY` was never set. No live Zernio call has ever been made.

Three facts shape this plan:

1. **There is nothing to migrate.** Prod holds 8 `business_outstand_accounts` rows across 3
   users, of which exactly **2 are active** — Joe's YouTube and Dame's Instagram, both founder
   accounts. `social_analytics_cache` is at 0 rows. So this is a code cutover with a
   five-minute manual reconnect, not a data migration. No dual-run, no per-user flag, no
   strangler. That window closes at launch.
2. **The Donny analytics brain already exists.** `content-performance-capture` →
   `content_performance` → `content-strategy-recommend` → `content_briefs` is built and wired.
   It is starved (9 rows), not missing. The goal is to **repoint two feed pipes**, not build a
   recommendation engine.
3. **Zernio is now cheaper and better than the notes claim.** Analytics is included free (not a
   $10/mo add-on) and the first 2 connected accounts are free. At current volume the cutover is
   **cash-positive from day one** (−$67/mo) and removes the connection cap.

**Outcome:** Outstand is gone; posting is at parity; `content_performance` and
`social_analytics_cache` fill with real numbers; Donny's `social_*` tools and
`content-strategy-recommend` run on live data.

---

## Verified integration surface

Only **5 call sites** actually talk to the Outstand API. Everything else is legacy *naming*.

| Site | Role |
|---|---|
| `supabase/functions/outstand-proxy/index.ts` | live gateway the frontend calls |
| `supabase/functions/outstand-reconcile/index.ts` | reconciliation cron |
| `supabase/functions/outstand-webhook/index.ts` | inbound post/account events |
| `supabase/functions/content-performance-capture/index.ts` | **Donny's analytics feed** |
| `supabase/functions/_shared/outstand-mcp.ts` | **Donny's social tools** (→ `donny-orchestrator`, `donny-auto-pilot`) |

The last two are **not covered by the existing branch** — that is the main gap.

Frontend: 38 files import `@outstand-so/ui`, but the runtime surface is small — `useOutstandApi`
(7), `useAccounts` (8), `usePosts` (3), `usePostMetrics` (1), and four components
(`OutstandProvider`, `ConnectAccountButtonGroup`, `AccountsList`, `OAuthCallback`, 1–2 each).
The remaining ~30 files import **types only** (`Post`, `SocialAccount`, `SocialNetwork`,
`PostMetrics`) — a mechanical re-point, not a rewrite.

`business_outstand_accounts`, `outstand_social_account_id` and `outstand_post_id` are legacy
names holding provider-opaque ids. CLAUDE.md forbids renames — **they stay as-is**. Cosmetic
debt, zero functional cost.

---

## Phase 0 — Prove the provider (do this before anything else)

The single largest risk is that `zernio-map.ts` was written from reading docs, not from captured
JSON — its own header hedges with "camelCase or snake_case across endpoints" fallback chains, and
the Phase 1 plan explicitly flagged its fixtures as guesses. Two assumptions are already suspect:
the base path may be `/api/v1` (the branch assumes `/v1`), and Zernio exposes a `/profiles`
"profile container" concept the contract does not model at all.

Retire this for ~a day of work before touching the 38-file UI swap.

1. **Founder prereqs — Claude drives this in the founder's Chrome.** Confirm/create the Zernio
   account, issue an API key, confirm the 2 free accounts cover Joe + Dame. Then set
   `ZERNIO_API_KEY` and `ZERNIO_WEBHOOK_SECRET` as Supabase secrets (neither exists today —
   verified). **Guardrails:** recon the page first, pause for explicit founder confirmation before
   each write, never type credentials or payment details — hand those steps back. If a signup
   requires payment info, stop and hand over.
2. **Connect one real account** (Dame's Instagram) via the Zernio dashboard, same guardrails.
3. **Capture real JSON** for: connect-URL flow, `accounts` list, `posts` create + get, post
   analytics, account analytics, comments/inbox, and each webhook payload. Record the true base
   path and settle whether `/profiles` is a required wrapper.
4. **Diff against `zernio-map.ts`** and fix the mappers and their tests to the captured shapes.

**Exit criterion:** a real post published to a real account through the corrected adapter, and
real analytics returned for it. If this fails, stop — everything downstream is built on it.

---

## Phase 1 — Land the corrected seam

- Rebase `feat/social-provider-seam-zernio` on `main`; apply Phase 0 corrections.
- **Renumber the migration.** It is stamped `20260624000000`, ~5 weeks stale, and migrations up to
  `20260726…` have since landed — renumber to a current timestamp before applying (known
  concurrent-worktree collision hazard).
- Apply the migration to prod, then deploy `social-proxy` — **in that order** (new column before
  code that reads it).
- Deploy bundling **all** transitive `_shared` files; the deploy bundle is the real Deno parse
  gate. Run the `careful` skill pre-flight first.
- Confirm the Outstand path through `social-proxy` still returns results identical to
  `outstand-proxy` before proceeding.

The gateway already implements 12 ops covering the full contract (`listAccounts`, `getConnectUrl`,
`recordConnection`, `disconnect`, `createPost`, `uploadMedia`, `getAccountAnalytics`, `getPost`,
`getPostAnalytics`, `deletePost`, `listComments`, `replyToComment`).

---

## Phase 2 — Account-level analytics (`social_analytics_cache`)

Wire the branch's `useSocialAnalytics` + `cache-map.ts` so AnalyticsTab finally populates. This
keys on **account**, so it works the moment the accounts are connected in Zernio — no dependency on
the posting path.

Preserve the live table contract exactly — `metric_type ∈ followers|engagement|reach|posts` (not
`engagement_rate`), FK column `outstand_account_id`, conflict key
`user_id,outstand_account_id,metric_type,period_start,period_end`. Emitting `engagement_rate` would
fail to conflict-match the existing rows.

> **Post-level analytics cannot land here.** `content-performance-capture` resolves analytics by
> `outstand_post_id` from `social_post_log` — those are Outstand ids, and Zernio cannot look them
> up. Post-level capture only works for posts *created through* Zernio, so it is sequenced after
> the UI swap, in Phase 5.

---

## Phase 3 — Give Donny the data

- Rewrite `_shared/outstand-mcp.ts` → `_shared/social-mcp.ts` against the gateway's `{op, args}`
  contract. The current bridge posts `{action, ...args}` with an `x-outstand-user-id` header to
  `outstand-proxy`; `social-proxy` takes a different shape, so this is a real rewrite, not a URL
  swap. Keep the `social_*` namespacing and the free-tier analytics-only filter.
- Update imports in `donny-orchestrator` and `donny-auto-pilot`.

Donny's tools split the same way as the analytics feeds: `get_account_metrics` /
`get_audience_insights` work from Phase 2, while `get_post_analytics` only returns real numbers
once Phase 5 lands.

---

## Phase 4 — Swap the UI

- Replace the 4 SDK hooks with the branch's headless hooks (`useSocialAccounts`, `useSocialPost`,
  `useSocialAnalytics`, `useSocialComments`) — built to match consumed shapes 1:1. Representative
  sites: `src/components/outstand/AccountsTab.tsx`, `ComposeTab.tsx`, `CalendarTab.tsx`,
  `EngagementTab.tsx`, `AnalyticsTab.tsx`.
- Re-point the ~30 type-only imports to `src/integrations/social/contract.ts`.
- Rebuild the 4 SDK components — `src/integrations/outstand/Provider.tsx`,
  `ConnectAccountButtonGroup`, `AccountsList`, `OAuthCallback`. **The connect flow is the only
  genuinely new UI**; everything else is a re-point.
- Reconnect Joe's YouTube and Dame's Instagram by hand.

---

## Phase 5 — Post-level analytics (`content_performance`) — Donny's brain

Now that posts are created through Zernio, repoint `content-performance-capture`
(`index.ts` + `capture.ts`): swap the fetch to Zernio and extend `normalizeAnalytics` with Zernio's
key candidates.

**Do not route this through the contract's `PostAnalytics`** — the contract exposes
`impressions/likes/comments/shares/clicks` while `content_performance` stores
`views/likes/comments/shares/saves/reach/engagement_rate`; passing through the narrower type
silently drops four metrics. Keep `milestonesDue`, the `raw` payload column, and the
`outstand_post_id,milestone` conflict key untouched — all provider-agnostic and already tested.

Accept that the 3 pre-cutover `social_post_log` rows stop maturing; their 9 `content_performance`
rows are kept as-is. Not worth a backfill.

`content-strategy-recommend` needs no change — it reads `content_performance`, which this refills.

---

## Phase 6 — Delete Outstand

- Add the Zernio webhook handler, mirroring `outstand-webhook`'s three behaviours exactly:
  `post.published`/`post.error` → patch `donny_scheduled_posts` + dedup-insert the event row;
  `account.token_expired` → set `business_outstand_accounts.status='error'`; ignore the rest. The
  contract's `NormalizedEvent` already covers all three.
- Remove the `@outstand-so/ui` dependency; delete `outstand-proxy`, `outstand-reconcile`,
  `outstand-webhook`, the Outstand adapter wiring, and the `OUTSTAND_*` secrets; cancel the
  subscription.
- **Keep the contract and the seam.** They are the real insurance for the next swap. A "fallback to
  Outstand" is not real once the subscription is cancelled, so do not carry dead dual-provider code.
- Legacy table/column names stay.

---

## Verification

- **Phase 0 gate:** real post published + real analytics returned through the corrected adapter.
- **Parity:** connect, compose, schedule, publish, calendar, engagement/reply all work on Zernio for
  both founder accounts, desktop **and** mobile viewports, console clean.
- **Analytics live:** `select count(*) from content_performance` and `from social_analytics_cache`
  both climb after a cron run; AnalyticsTab renders non-empty.
- **Donny:** a `social_*` tool call returns real data, and `content-strategy-recommend` produces a
  brief citing actual post performance.
- **Regression:** `npm run typecheck`, `npm run build`, `npx vitest run supabase/functions/social-proxy
  src/integrations/social` (trust "N passed, 0 failed", not the exit code — pre-existing e2e files
  fail).
- **Reviews:** `data-exposure-reviewer` on the gateway/webhook changes, then `codex review --base main`
  until clean (mandatory before PR).
- **Post-deploy:** `verify-prod` on dragoncandy.io, then `knowledge-sync` (wiki concept page
  `social-provider-seam.md`, SHIPPED_LOG, PROJECT_CONTEXT §5, DATABASE_SCHEMA for the `provider`
  column).

## Risks

- **Mappers unvalidated against the live API** — the reason Phase 0 exists and gates everything.
- **The 5-phase design doc is gone** (`~/.claude/plans/let-s-design-this-all-serene-yeti.md` no longer
  exists). Phases 2–5 are re-decided here, not recovered. Commit this plan as a spec under
  `docs/superpowers/specs/` as the first execution step.
- **Contract narrows Zernio to 5 platforms** (`facebook|instagram|tiktok|x|youtube`). Zernio supports
  ~15. Fine for parity scope, but LinkedIn/Threads/Google Business — the last notably relevant to
  restaurants — need a contract change later.
- **`_shared` contract duplication** (`src/integrations/social/contract.ts` ↔
  `supabase/functions/_shared/social-contract.ts`) is hand-synced and can drift.
