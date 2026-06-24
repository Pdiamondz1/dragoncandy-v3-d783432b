# Social Provider Seam + Zernio Core (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a provider-agnostic `SocialProvider` seam — a shared contract, a generalized `social-proxy` edge function with Outstand + Zernio adapters, an additive `provider` DB column, and first-party headless hooks — so the app can talk social through one interface, with nothing user-facing changed yet.

**Architecture:** One shared TypeScript contract (duplicated for the Deno runtime since edge functions can't import from `src/`). Provider differences live in two server-side adapters built from **pure, dependency-free mapping modules** (mirroring the existing `supabase/functions/outstand-reconcile/reconcile.ts` pattern) wrapped by thin I/O adapters. A new `social-proxy` edge function copies the proven JWT + tenant-scoping + default-deny logic from `outstand-proxy` verbatim and dispatches to an adapter chosen by the caller's `provider`. The frontend gets headless hooks that return the exact shapes today's UI consumes — wired in during later phases.

**Tech Stack:** TypeScript (strict), Deno edge functions (Supabase), Vitest (co-located `.test.ts`), React Query, Supabase JS v2. No new frontend deps. New secrets `ZERNIO_API_KEY` / `ZERNIO_WEBHOOK_SECRET` (founder-set, not committed).

**Spec:** `C:\Users\dwill\.claude\plans\let-s-design-this-all-serene-yeti.md` (approved design, all 5 phases). This plan is **Phase 1 only**.

---

## Scope (Phase 1 only)

In scope: the contract, the two pure mapping modules + tests, `resolve-provider`, the `social-proxy` gateway, the additive migration, the frontend client + four headless hooks (none wired into UI). Out of scope (later phases): replacing the `@outstand-so/ui` UI components, the Zernio webhook handler, analytics surfaces, the MCP bridge, and the cutover flag rollout.

**Key invariants:**
- **Behavior-preserving for Outstand.** Existing `outstand-proxy` stays untouched and live; `social-proxy` is additive. Outstand-provider users must be byte-for-byte unaffected.
- **Additive DB only.** `ADD COLUMN ... DEFAULT 'outstand'`. No renames/drops. RLS unchanged.
- **Pure mapping modules carry the tests.** All provider field-mapping lives in `*-map.ts` files with zero I/O, exactly like `reconcile.ts`. I/O adapters stay thin.
- **Edge can't import `src/`.** The contract types are duplicated in `_shared/social-contract.ts`; keep the two files in sync (documented at the top of each).

---

## File Structure

**Shared contract (types only):**
- Create `src/integrations/social/contract.ts` — frontend contract types.
- Create `supabase/functions/_shared/social-contract.ts` — Deno copy of the same types (sync-by-hand; header comment on both points at the other).

**Pure mapping modules (the tested meat — no I/O):**
- Create `supabase/functions/social-proxy/adapters/zernio-map.ts` (+ `.test.ts`).
- Create `supabase/functions/social-proxy/adapters/outstand-map.ts` (+ `.test.ts`).
- Create `supabase/functions/social-proxy/resolve-provider.ts` (+ `.test.ts`).

**Thin I/O adapters + gateway:**
- Create `supabase/functions/social-proxy/adapters/zernio.ts` — `SocialProvider` over `fetch` + `zernio-map`.
- Create `supabase/functions/social-proxy/adapters/outstand.ts` — same logic the current `outstand-proxy` forwards, behind the contract.
- Create `supabase/functions/social-proxy/index.ts` — gateway: copy `outstand-proxy/index.ts` scoping verbatim, then dispatch via `resolve-provider`.

**DB:**
- Create `supabase/migrations/20260624000000_add_provider_to_business_outstand_accounts.sql`.
- Regen `src/integrations/supabase/types.ts` (add the `provider` column type).

**Frontend headless hooks (not wired into UI):**
- Create `src/integrations/social/client.ts` — fetch wrapper to `social-proxy`.
- Create `src/integrations/social/hooks/useSocialAccounts.ts`, `useSocialPost.ts`, `useSocialAnalytics.ts`, `useSocialComments.ts`.
- Create `src/integrations/social/hooks/cache-map.ts` (+ `.test.ts`) — pure helper mapping `AccountAnalytics` → `social_analytics_cache` rows (reused from `useAccountMetrics` logic).

**Reference (read, don't modify in Phase 1):** `supabase/functions/outstand-proxy/index.ts`, `supabase/functions/outstand-reconcile/reconcile.ts` (+test), `src/hooks/outstand/useCrossPost.ts`, `useAccountMetrics.ts`, `usePostComments.ts`, `src/lib/outstandUtils.ts`.

---

## Pre-flight

- [ ] **Step 0a: Confirm the worktree + branch.** Run: `git branch --show-current` → expect `feat/social-provider-seam-zernio`.
- [ ] **Step 0b: Read the references.** Read `outstand-proxy/index.ts`, `reconcile.ts`, `reconcile.test.ts`, `useCrossPost.ts`, `useAccountMetrics.ts`, `usePostComments.ts`, `outstandUtils.ts` to internalize the exact payload/return shapes the contract must satisfy.
- [ ] **Step 0c: Pull the Zernio endpoint shapes.** Read `docs.zernio.com` API reference + OpenAPI for: `GET /v1/connect/{platform}`, `GET/DELETE /v1/accounts`, `POST/GET/DELETE /v1/posts`, `/v1/analytics/*`, the Inbox/comments endpoints, `/v1/media`, and webhook event payloads. Record the exact request/response JSON next to each `zernio-map` function as a comment. **The illustrative fixtures in Task 2's example tests (`_id`, `platform:'twitter'`, `profilePicture`) are guesses — REPLACE them with the real captured JSON before trusting Task 2's tests**, or the mapper will pass against invented shapes and fail live.

---

## Task 1: Shared contract types

**Files:**
- Create: `src/integrations/social/contract.ts`
- Create: `supabase/functions/_shared/social-contract.ts`

- [ ] **Step 1: Write `src/integrations/social/contract.ts`** with the contract from the spec: `Platform`, `ProviderId`, `SocialAccount`, `PostInput`, `PostResult`, `PostSocialAccount`, `ProviderPost`, `PostAnalytics`, `AccountAnalytics`, `Comment`, `NormalizedEvent`, `TenantCtx`, `MediaUploadInput`, and the `SocialProvider` interface. Top comment: "Sibling: supabase/functions/_shared/social-contract.ts — keep in sync (edge can't import from src/)."

- [ ] **Step 2: Copy to `supabase/functions/_shared/social-contract.ts`** — identical types, Deno import style (no `@/` alias). Top comment points back at the src/ sibling.

- [ ] **Step 3: Typecheck.** Run: `npm run typecheck`. Expected: PASS (types only, no consumers yet).

- [ ] **Step 4: Commit.**
```bash
git add src/integrations/social/contract.ts supabase/functions/_shared/social-contract.ts
git commit -m "feat(social): add provider-agnostic SocialProvider contract types"
```

---

## Task 2: Zernio pure mapping module (TDD)

The keystone. Pure functions mapping contract ⇄ Zernio JSON, no I/O. Mirror `reconcile.ts` purity.

**Files:**
- Create: `supabase/functions/social-proxy/adapters/zernio-map.ts`
- Test: `supabase/functions/social-proxy/adapters/zernio-map.test.ts`

- [ ] **Step 1: Write failing tests** for each mapper, using real Zernio JSON captured in Step 0c as fixtures:
  - `toZernioCreatePost(input: PostInput)` → Zernio `POST /v1/posts` body (accounts, content, media, `scheduledFor`).
  - `fromZernioAccount(raw)` → `SocialAccount` (id, provider:'zernio', platform, handle, profilePictureUrl, status). Assert platform normalization (e.g. `twitter`→`x`).
  - `fromZernioPostResult(raw)` → `PostResult` (providerPostId + perAccount statuses).
  - `fromZernioPostAnalytics(raw)` / `fromZernioAccountAnalytics(raw)` → contract analytics (default missing numerics to 0).
  - `fromZernioComment(raw)` → `Comment` (isReply from parentId presence).
  - `normalizeZernioWebhook(body)` → `NormalizedEvent | null` (post.published / post.error / account.token_expired; null for unknown).

```ts
import { describe, it, expect } from 'vitest';
import { toZernioCreatePost, fromZernioAccount } from './zernio-map';

describe('toZernioCreatePost', () => {
  it('maps PostInput to Zernio body with scheduledFor when scheduled', () => {
    const body = toZernioCreatePost({
      accountIds: ['a1', 'a2'], content: 'hi', mediaUrls: ['https://x/y.jpg'],
      scheduledAt: '2026-07-01T10:00:00Z',
    });
    expect(body).toMatchObject({ accounts: ['a1', 'a2'], content: 'hi', scheduledFor: '2026-07-01T10:00:00Z' });
    expect(body.mediaItems?.length).toBe(1);
  });
  it('omits scheduledFor for immediate posts', () => {
    const body = toZernioCreatePost({ accountIds: ['a1'], content: 'now', mediaUrls: [] });
    expect('scheduledFor' in body).toBe(false);
  });
});

describe('fromZernioAccount', () => {
  it('normalizes twitter network to x and maps fields', () => {
    const acct = fromZernioAccount({ _id: 'z1', platform: 'twitter', username: 'joe', profilePicture: 'u' });
    expect(acct).toMatchObject({ id: 'z1', provider: 'zernio', platform: 'x', handle: 'joe', status: 'active' });
  });
});
```

- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run supabase/functions/social-proxy/adapters/zernio-map.test.ts`. Expected: FAIL (module not found).

- [ ] **Step 3: Implement `zernio-map.ts`** — pure functions only; top comment mirrors `reconcile.ts` ("no Deno/Node/Supabase/I/O"). Include a `PLATFORM_ALIASES` map (`twitter→x`, etc.). Define the account `status` rule explicitly: default `'active'` unless Zernio signals an error/expired/revoked state (don't hard-code `active`).

- [ ] **Step 4: Run, verify pass.** Same command. Expected: PASS.

- [ ] **Step 5: Commit.**
```bash
git add supabase/functions/social-proxy/adapters/zernio-map.ts supabase/functions/social-proxy/adapters/zernio-map.test.ts
git commit -m "feat(social): add pure Zernio contract mapping module + tests"
```

---

## Task 3: Outstand pure mapping module (TDD, behavior-preserving)

Capture the exact shapes the current proxy uses (`containers:[{content,media}]`, `accounts`, `scheduledAt`; account/comment/analytics responses) so the Outstand adapter routes through the contract without behavior change.

**Files:**
- Create: `supabase/functions/social-proxy/adapters/outstand-map.ts`
- Test: `supabase/functions/social-proxy/adapters/outstand-map.test.ts`

- [ ] **Step 1: Write failing tests** asserting `toOutstandCreatePost(PostInput)` produces the exact body in `useCrossPost.ts` today (`{ accounts, containers:[{content, media:[{id,url,filename}]}], scheduledAt? }`), and `fromOutstandAccount` / `fromOutstandPost` reproduce `outstandUtils` semantics (`isScheduled`, `postOutcome`).
- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run supabase/functions/social-proxy/adapters/outstand-map.test.ts` → FAIL.
- [ ] **Step 3: Implement `outstand-map.ts`** (pure; lift logic from `useCrossPost.ts` + `outstandUtils.ts`).
- [ ] **Step 4: Run, verify pass.** → PASS.
- [ ] **Step 5: Commit.**
```bash
git add supabase/functions/social-proxy/adapters/outstand-map.ts supabase/functions/social-proxy/adapters/outstand-map.test.ts
git commit -m "feat(social): add pure Outstand contract mapping module + tests"
```

---

## Task 4: Provider resolution (TDD)

**Files:**
- Create: `supabase/functions/social-proxy/resolve-provider.ts`
- Test: `supabase/functions/social-proxy/resolve-provider.test.ts`

- [ ] **Step 1: Write failing tests:** `resolveProviderId(ctx)` returns `ctx.provider` when set to a known id; defaults to `'outstand'` when null/unknown (back-compat for un-stamped rows); rejects garbage.
```ts
import { describe, it, expect } from 'vitest';
import { resolveProviderId } from './resolve-provider';
describe('resolveProviderId', () => {
  it('defaults to outstand when unset', () => { expect(resolveProviderId(null)).toBe('outstand'); });
  it('honors zernio', () => { expect(resolveProviderId('zernio')).toBe('zernio'); });
  it('falls back to outstand on unknown', () => { expect(resolveProviderId('myspace')).toBe('outstand'); });
});
```
- [ ] **Step 2: Run, verify fail.** Run: `npx vitest run supabase/functions/social-proxy/resolve-provider.test.ts` → FAIL.
- [ ] **Step 3: Implement `resolve-provider.ts`** (pure switch). Export `KNOWN_PROVIDERS`.
- [ ] **Step 4: Run, verify pass.** → PASS.
- [ ] **Step 5: Commit.**
```bash
git add supabase/functions/social-proxy/resolve-provider.ts supabase/functions/social-proxy/resolve-provider.test.ts
git commit -m "feat(social): add provider resolution with outstand fallback + tests"
```

---

## Task 5: Additive DB migration (`provider` column)

**Files:**
- Create: `supabase/migrations/20260624000000_add_provider_to_business_outstand_accounts.sql`

- [ ] **Step 1: Write the migration** (additive only):
```sql
-- Provider discriminator for the SocialProvider seam. Existing rows are Outstand.
-- Reuses business_outstand_accounts (no rename, per the never-rename rule); the
-- outstand_social_account_id column is treated as an opaque provider-agnostic id.
ALTER TABLE public.business_outstand_accounts
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'outstand';

COMMENT ON COLUMN public.business_outstand_accounts.provider IS
  'Social provider for this connection: outstand | zernio. Default outstand for legacy rows.';
```
- [ ] **Step 2: Apply the migration** via the project's Supabase MCP/CLI `apply_migration` (per "deploy ordering" memory: migration BEFORE any code that depends on the column). Target **staging** (ref `mhffqrawgizhprbobcta`) for the build/round-trip smoke; applying to **prod** (ref `zocahiffooqdybdhguqv`) is a founder go-live step. Phase 1 is safe either way since `social-proxy` defaults to `outstand` when the column is absent/null, but the Task 7 round-trip smoke must hit a DB that has the column. Verify: `select provider, count(*) from business_outstand_accounts group by 1;` → all existing rows `outstand`.
- [ ] **Step 3: Regenerate types** into `src/integrations/supabase/types.ts` (add `provider: string` to the `business_outstand_accounts` Row/Insert/Update). Run: `npm run typecheck` → PASS.
- [ ] **Step 4: Commit.**
```bash
git add supabase/migrations/20260624000000_add_provider_to_business_outstand_accounts.sql src/integrations/supabase/types.ts
git commit -m "feat(social): add nullable provider column to business_outstand_accounts (additive)"
```

---

## Task 6: Thin I/O adapters

Wrap the pure maps with `fetch`. Keep them thin — no mapping logic here.

**Files:**
- Create: `supabase/functions/social-proxy/adapters/zernio.ts`
- Create: `supabase/functions/social-proxy/adapters/outstand.ts`

- [ ] **Step 1: Implement `outstand.ts`** — a `SocialProvider` that forwards to `OUTSTAND_BASE_URL` with `OUTSTAND_API_KEY` exactly as `outstand-proxy` does today, translating via `outstand-map`. Lift the forwarding/normalization helpers from `outstand-proxy/index.ts` (e.g. the `data`-wrapping normalization).
- [ ] **Step 2: Implement `zernio.ts`** — a `SocialProvider` hitting `ZERNIO_BASE_URL` (default `https://api.zernio.com/v1`) with `Authorization: Bearer ${ZERNIO_API_KEY}`, translating via `zernio-map`. Each method ≤ ~15 lines (fetch → map). Guard missing key with a 503-style throw.
- [ ] **Step 3: Typecheck both against the contract.** Both must `implements SocialProvider` (structurally). Run: `npm run typecheck` → PASS.
- [ ] **Step 4: Commit.**
```bash
git add supabase/functions/social-proxy/adapters/zernio.ts supabase/functions/social-proxy/adapters/outstand.ts
git commit -m "feat(social): add thin Zernio + Outstand IO adapters over the contract"
```

---

## Task 7: `social-proxy` gateway

**Files:**
- Create: `supabase/functions/social-proxy/index.ts`

- [ ] **Step 1: Copy `outstand-proxy/index.ts` verbatim** into `social-proxy/index.ts` — keep the OPTIONS/CORS, JWT validation (`resolveTenant`), `business_outstand_accounts` tenant scoping (`listOwnedAccountIds`/`listOwnedPlatforms`), `enforceScope` default-deny, `filterListBody`, and `__internal/record-connection` (now also writing `provider`).
- [ ] **Step 2: Add provider dispatch** — after `resolveTenant`, determine the caller's `provider`. **Add `provider` to the `.select()` in `listOwnedAccountIds`/`listOwnedPlatforms`** (one extra column, no extra round-trip) so the rows already carry it. Dispatch rule for Phase 1: if all owned rows share one provider use it; if mixed or none, default `outstand` (via `resolveProviderId`). Then select `zernioAdapter` or `outstandAdapter` and route the SDK-shaped paths through the chosen adapter's contract methods. For `provider='outstand'` the path is the existing forward (behavior-preserving).
- [ ] **Step 3: Local boot/parse sanity.** Run: `npm run build` (frontend unaffected, must stay green) then deploy via the project's edge-fn deploy path (Supabase MCP `deploy_edge_function` bundling ALL transitive `_shared` files, or `npx supabase functions deploy social-proxy`). **The deploy bundle is the real Deno parse check** (per the template-literal-backticks memory — order build → deploy, not build → merge). Expected: deploys, boots, returns 503 `zernio_not_configured` only when a Zernio call is attempted without the key.
- [ ] **Step 4: Smoke the Outstand path** with a test JWT for an existing Outstand user against `social-proxy` (GET `/social-accounts`) → identical result to `outstand-proxy`. Confirms behavior preservation.
- [ ] **Step 5: Commit.**
```bash
git add supabase/functions/social-proxy/index.ts
git commit -m "feat(social): add social-proxy gateway dispatching to provider adapters"
```

---

## Task 8: Frontend client + headless hooks

**Files:**
- Create: `src/integrations/social/client.ts`
- Create: `src/integrations/social/hooks/cache-map.ts` (+ `.test.ts`)
- Create: `src/integrations/social/hooks/useSocialAccounts.ts`, `useSocialPost.ts`, `useSocialAnalytics.ts`, `useSocialComments.ts`

- [ ] **Step 1: Implement `client.ts`** — a small fetch wrapper: `SUPABASE_URL + /functions/v1/social-proxy`, `Authorization: Bearer ${session.access_token}`, `x-org-unit-id` header (mirror `useOutstandConfig`). Methods `get/post/delete`.

- [ ] **Step 2 (TDD): `cache-map.ts`** — write failing test for `accountAnalyticsToCacheRows(userId, account, analytics, period)` producing `social_analytics_cache` rows. **Use the EXACT live table contract from `useAccountMetrics.ts` (lines ~162-170), not guesses:** `metric_type` values are `followers | engagement | reach | posts` (NOT `engagement_rate`), the FK column is `outstand_account_id` (the opaque provider account id), and the upsert `onConflict` key is `user_id,outstand_account_id,metric_type,period_start,period_end`. Emitting `engagement_rate` would fail to conflict-match the existing `engagement` rows and silently break Phase 4's prior-period delta reads. Run `npx vitest run src/integrations/social/hooks/cache-map.test.ts` → FAIL → implement → PASS.

- [ ] **Step 3: Implement `useSocialAccounts.ts`** — React Query hook returning `{ accounts: SocialAccount[], isLoading, error, refetch, disconnect }`, matching the consumed shape of the SDK's `useAccounts`. Query key `['social-accounts', userId, orgUnitId]`, `enabled: !!session`.

- [ ] **Step 4: Implement `useSocialPost.ts`, `useSocialAnalytics.ts`, `useSocialComments.ts`** following the same pattern (mutation for post/reply; queries for analytics/comments using `cache-map` for analytics). Return shapes match what `useCrossPost` / `useAccountMetrics` / `usePostComments` consume today so later phases can swap imports 1:1. **Note:** the contract `Comment` deliberately omits `postCaption` / `postPublishedAt` (those are post-context, not provider data). `useSocialComments` MUST reattach `postCaption` (first ~60 chars of the post's container content) and `postPublishedAt` from the post list it queries, so the shape matches `usePostComments`'s `Comment` exactly — otherwise the Phase 3 import swap is not 1:1.

- [ ] **Step 5: Typecheck + targeted tests.** Run: `npm run typecheck` (PASS) and `npx vitest run src/integrations/social/hooks/cache-map.test.ts` (PASS). Note: full `npm run test` exits 1 from pre-existing Playwright e2e files — trust "Tests N passed, 0 failed" (per the vitest-preexisting-failures memory).

- [ ] **Step 6: Commit.**
```bash
git add src/integrations/social/client.ts src/integrations/social/hooks
git commit -m "feat(social): add headless social hooks over social-proxy (not yet wired into UI)"
```

---

## Verification (end of Phase 1)

- [ ] **Unit tests green:** `npx vitest run supabase/functions/social-proxy src/integrations/social` → all PASS, 0 failed.
- [ ] **Typecheck + build:** `npm run typecheck` and `npm run build` both PASS.
- [ ] **Edge deploy is the parse gate:** `social-proxy` deploys and boots (build → deploy ordering).
- [ ] **Behavior preserved:** an existing Outstand user gets identical `/social-accounts` results from `social-proxy` vs `outstand-proxy`; `outstand-proxy` itself is untouched and still serves the live app.
- [ ] **Zernio round-trip (needs founder prereqs):** with `ZERNIO_API_KEY` set + Analytics add-on enabled, a Zernio sandbox account connects, posts, and returns analytics through `social-proxy`. If the key isn't ready, this step is deferred to founder go-live; the rest of Phase 1 still merges.
- [ ] **Codex second pass:** run `codex review --base main` from the worktree; fix findings; re-run until clean (mandatory before PR, per CLAUDE.md).
- [ ] **Knowledge sync on branch finish:** run the `knowledge-sync` skill (wiki source + ingest + core-doc refresh; concept page `social-provider-seam.md`).

---

## Founder prerequisites (parallel to coding; gate only the live round-trip)
- Create a Zernio account + API key; enable the **$10/mo Analytics add-on**.
- Set Supabase secrets `ZERNIO_API_KEY` (and `ZERNIO_WEBHOOK_SECRET` for Phase 3).
- (Phase 3) register the Zernio webhook URL.

## Notes / gotchas
- Edge functions cannot import `src/` — the contract lives in two synced files; a drift is a maintenance risk, flagged by header comments on both.
- Confirm exact Zernio request/response JSON in Step 0c before writing `zernio-map`; the marketing pages confirm the *capabilities* (connect, posts, analytics add-on, Inbox comments, webhooks) but not field names.
- Keep `outstand-proxy` and `@outstand-so/ui` fully intact this phase; the seam is purely additive.
