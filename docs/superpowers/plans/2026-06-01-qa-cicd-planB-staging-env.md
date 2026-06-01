# QA/CICD — Plan B: Staging Environment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Stand up an isolated staging environment — a separate staging Supabase project plus per-PR Vercel preview deploys wired to it — so QA and (Plan C) e2e run against staging, never production. Production (Lovable) is unchanged.

**Architecture:** Make the Supabase client env-configurable (prod values as fallback), so a Vercel preview build pointed at staging env vars talks to a separate staging Supabase project. Lovable prod leaves the env vars unset and falls back to the current prod project — zero prod behavior change.

**Tech Stack:** Supabase (2nd project, free tier), Vercel (free tier, per-PR previews), Vite `import.meta.env`, existing GitHub repo.

**Spec:** `docs/superpowers/specs/2026-06-01-qa-staging-cicd-design.md`. **Decision:** Vercel (not Netlify), human ship gate, separate staging Supabase.

---

## Investigation findings (resolved the blocker)

- `src/integrations/supabase/client.ts` hardcodes the **prod** URL + anon key and ignores env vars — so previews could not reach staging. **Fix:** make it env-aware with prod fallback. Safe because: client.ts is rarely changed (7 commits ever, manual edits persisted — Lovable doesn't aggressively regenerate it); `import.meta.env` is already used across the app; `.env.example` already documents the `VITE_SUPABASE_*` vars.
- Supabase branching integration is installed but **dormant/skipped** (needs paid Pro plan) → not used; we use a separate free staging project.
- CSP `connect-src` already allows `https://*.supabase.co` (wildcard) → **covers staging, no CSP change, no prod impact.**

---

## Task split

- **[AGENT]** = doable in-repo now (code/config/docs).
- **[USER]** = requires your Supabase / Vercel account auth; agent provides exact steps and verifies after.

This plan should run in its **own worktree off updated `main`** (post Plan A), per Worktree Discipline.

---

## File Structure

| File | Responsibility | Action | Owner |
|---|---|---|---|
| `src/integrations/supabase/client.ts` | Read `VITE_SUPABASE_*` with prod fallback | Modify | AGENT |
| `src/integrations/supabase/client.env.test.ts` | Test fallback + override behavior | Create | AGENT |
| `src/components/StagingBanner.tsx` | Visible "STAGING" indicator when not on prod project | Create | AGENT |
| `vercel.json` | Vercel build/output config (`dist`, SPA rewrites) | Create | AGENT |
| `docs/runbooks/staging-environment.md` | Staging Supabase + Vercel setup/secrets/sync runbook | Create | AGENT |
| Staging Supabase project | Migrations + functions + seed + secrets | Create | USER |
| Vercel project + env vars | Link repo, per-PR previews, staging env | Create | USER |

---

## Task 1 [AGENT]: Make the Supabase client env-aware (TDD)

> ⚠️ This edits a Lovable-"auto-generated" + auth-adjacent file. Per CLAUDE.md, confirm with the user before executing (already discussed). The change is behavior-preserving for prod (fallback = current hardcoded values).

**Files:** Modify `src/integrations/supabase/client.ts`; Create `src/integrations/supabase/client.env.test.ts`

- [ ] **Step 1: Failing test** — create `client.env.test.ts` that imports a pure helper `resolveSupabaseConfig(env)` and asserts: (a) with empty env → returns the prod fallback URL/key; (b) with `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` set → returns those. (Extract a testable pure function rather than testing the singleton.)

```ts
import { describe, it, expect } from 'vitest';
import { resolveSupabaseConfig, PROD_FALLBACK } from './client';

describe('resolveSupabaseConfig', () => {
  it('falls back to prod when env is unset', () => {
    const c = resolveSupabaseConfig({});
    expect(c.url).toBe(PROD_FALLBACK.url);
    expect(c.key).toBe(PROD_FALLBACK.key);
  });
  it('uses env overrides when present (e.g. staging on a preview)', () => {
    const c = resolveSupabaseConfig({
      VITE_SUPABASE_URL: 'https://staging.supabase.co',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'staging-key',
    });
    expect(c.url).toBe('https://staging.supabase.co');
    expect(c.key).toBe('staging-key');
  });
});
```

- [ ] **Step 2: Run, verify it fails** (`npx vitest run src/integrations/supabase/client.env.test.ts` → FAIL, no export).

- [ ] **Step 3: Implement.** In `client.ts`, keep the hardcoded values as `PROD_FALLBACK`, add `resolveSupabaseConfig`, and use `import.meta.env` at the call site:
```ts
export const PROD_FALLBACK = {
  url: "https://zocahiffooqdybdhguqv.supabase.co",
  key: "<existing anon key>",
};
export function resolveSupabaseConfig(env: Record<string, string | undefined>) {
  return {
    url: env.VITE_SUPABASE_URL || PROD_FALLBACK.url,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY || PROD_FALLBACK.key,
  };
}
const { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY } = resolveSupabaseConfig(import.meta.env as Record<string, string | undefined>);
export { SUPABASE_URL };
```
Keep the existing `createClient(...)` call and loose typing unchanged.

- [ ] **Step 4: Verify** — test passes; `npm run typecheck`, `npm run build`, `npm run lint` green; `npm run test` green.
- [ ] **Step 5: Commit.**

---

## Task 2 [AGENT]: Non-prod guardrail banner (fail-safe)

Prevents the dangerous silent-fallback case (a preview that forgot to set staging env would talk to prod and look normal). The banner must **fail safe**: it shows on *anything that is not the canonical prod host*, so even a misconfigured preview that fell back to prod still shows a warning. It also displays the active backend so you can SEE if a preview wrongly hit prod.

**Files:** Create `src/components/StagingBanner.tsx`; mount in `App.tsx`.

- [ ] Render a small fixed banner whenever NOT on the prod host. Logic:
```tsx
import { SUPABASE_URL, PROD_FALLBACK } from '@/integrations/supabase/client';
const PROD_HOST = 'dragoncandy.io';
const isProdHost = typeof window !== 'undefined' && window.location.hostname === PROD_HOST;
const ref = SUPABASE_URL.replace('https://', '').split('.')[0];
const onProdBackend = SUPABASE_URL === PROD_FALLBACK.url;
// Show on every non-prod host. If a non-prod host is on the PROD backend, make it RED (danger).
if (isProdHost) return null;
return <Banner danger={onProdBackend} text={`⚠ NON-PROD · backend: ${ref}${onProdBackend ? ' (PROD! check env)' : ''}`} />;
```
This way prod (`dragoncandy.io`) shows nothing; previews/localhost always show the banner; and a preview that silently fell back to prod shows a RED danger banner instead of being invisible. Build/lint/typecheck green. Commit.

---

## Task 3 [USER]: Create the staging Supabase project

Agent provides commands; user runs them (needs Supabase auth).

- [ ] Create a new Supabase project (free tier), e.g. `dragoncandy-staging`.
- [ ] Link + push schema: `supabase link --project-ref <staging-ref>` then `supabase db push` (applies `supabase/migrations/`).
- [ ] Deploy edge functions: `supabase functions deploy --project-ref <staging-ref>` (~71 functions — the Lovable deploy path does NOT cover these).
- [ ] Seed test data (test accounts + `supabase/seed/donny-knowledge-seed.ts`; the transactional-data-reset migration supports clean resets).
- [ ] Set function secrets on staging: Anthropic key (with the **AI-spend guard** — see below), Stripe **test** keys, etc.
- [ ] Record the staging URL + anon key for Task 4.

**AI-spend guard (decide + set):** a hard low cap for staging — simplest: a dedicated low-limit Anthropic key for staging, OR a `STAGING_AI_DAILY_CAP` secret read by the existing model-routing/cost-ledger layer. Decide before e2e (Plan C) runs against real keys.

---

## Task 4 [USER + AGENT]: Vercel per-PR previews

- [ ] **[AGENT]** Add `vercel.json` (framework: vite, output `dist`, SPA rewrite to `/index.html`). Commit.
- [ ] **[USER]** Create a Vercel project linked to the GitHub repo; set **Preview** environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (staging), `VITE_STRIPE_PUBLISHABLE_KEY` (test), `VITE_GOOGLE_MAPS_API_KEY` (a referrer-restricted/staging key). Leave **Production** env unset (or also staging — production Vercel is not used; Lovable owns prod).

> ⚠️ **Exact name match is critical.** The code (Task 1) reads `VITE_SUPABASE_PUBLISHABLE_KEY` — the same name as `.env.example` and the existing hardcoded var. Do **not** use `VITE_SUPABASE_ANON_KEY` (the spec's prose says "anon key" descriptively, but that is NOT the variable name). A name mismatch makes the override silently fail and the preview falls back to **prod** — the exact danger the Task 2 banner is designed to catch.
- [ ] **[USER]** Open a throwaway PR; confirm Vercel posts a preview URL.
- [ ] **[AGENT]** Verify the preview loads, shows the STAGING banner, and network calls hit the **staging** Supabase (not prod). Confirm no CSP console errors (wildcard should cover it).

---

## Task 5 [AGENT]: Runbook + docs

**Files:** Create `docs/runbooks/staging-environment.md`.

- [ ] Document: staging Supabase setup, the migrations+functions+seed sync step (and that it must be re-run when schema/functions change — drift risk), Vercel env var list (with the exact `VITE_SUPABASE_PUBLISHABLE_KEY` name caution), the AI-spend guard, and how to tell staging vs prod (the banner). Also note explicitly:
  - **No CSP edit needed** — `index.html` `connect-src` already has `https://*.supabase.co` (wildcard covers any staging subdomain). The spec's "add staging origins to CSP" line is stale; do NOT add redundant entries.
  - **Known minor caveat:** `index.html` has a hardcoded `<link rel="preconnect" href="https://zocahiffooqdybdhguqv.supabase.co">` (prod). On staging previews this preconnect still points at prod — harmless (a perf hint, not a data connection; the actual client uses the env-configured URL), but worth knowing. Leave as-is for v1.
  Commit.

---

## Plan B Definition of Done
- [ ] `client.ts` is env-aware (prod fallback); tests + build + lint + typecheck green; prod behavior unchanged.
- [ ] A staging Supabase project exists with schema + functions + seed.
- [ ] Each PR gets a Vercel preview URL backed by **staging** Supabase (verified via the banner + network calls), with no prod data touched.
- [ ] Runbook committed.

## Open items carried from spec
- Staging Maps key (new restricted vs reuse) — decide in Task 4.
- Edge-function drift detection — manual sync runbook for v1; automate later.
- Staging data refresh cadence.

## Next (not in this plan)
- **Plan C — e2e on staging + gate wiring:** point Playwright `baseURL` at the preview URL, triage debug specs to a non-gating folder, add the e2e job to branch protection.
