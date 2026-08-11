@docs/PROJECT_CONTEXT.md
@docs/DESIGN_SYSTEM.md
@docs/DATABASE_SCHEMA.md
@docs/KNOWLEDGE_WIKI.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Mission

DragonCandy is where real people build together: business owners and the talented
creators who become their social media team. It gives a business its own social
media department without hiring one, and turns a creator's craft into a real
business — real partnerships, not gig-app roulette or algorithms. People do the
work and make the calls that matter; **Donny**, DragonCandy's built-in AI, works
in the background (drafting, scheduling, researching) so everyone moves faster —
the assistant in everyone's toolbelt, never a replacement. Human-driven,
AI-assisted. People first, platform underneath. (Full narrative:
`docs/PROJECT_CONTEXT.md` §1 and `docs/dragoncandy-origin-story.md`; North Star,
§2 — less typing = more margin.)

## Commands

```bash
npm run dev          # Start dev server (http://127.0.0.1:8080)
npm run build        # Production build (vite build) — run before every push
npm run build:dev    # Development build (vite build --mode development)
npm run typecheck    # TypeScript check (tsc --noEmit -p tsconfig.app.json)
npm run lint         # ESLint (flat config, eslint.config.js)
npm run test         # Run tests once (vitest run)
npm run test:watch   # Run tests in watch mode (vitest)
npm run preview      # Preview production build locally
```

**Workflow:** One change → `npm run build` → verify → push. Always build before pushing to main.

## Tech Stack

React 18 + TypeScript (strict), Vite, Tailwind CSS, shadcn/ui (Radix). Supabase backend (Postgres, Auth, Edge Functions, Realtime, Storage). Stripe Connect (test mode). React Query for server state. Framer Motion (lazy-loaded). Outstand.so for social media integration (Instagram, TikTok, YouTube). Google Maps (geocoding). Claude API (Anthropic) for AI features — backend-only via 80 Deno edge functions. Hosted on Vercel → dragoncandy.io (cut over from Lovable hosting 2026-07-15; Lovable remains an optional AI-edit surface via GitHub sync — see `docs/runbooks/vercel-prod-cutover.md`). Fonts: Outfit (sans), Pacifico (script).

## Coding Conventions

* **TypeScript strict mode** — `tsconfig.app.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters`
* **Functional components only** — hooks over lifecycle methods
* **React Query** for all Supabase data fetching, mutations, and caching
* **Tailwind** for all styling — use `dc-*` color tokens (see `docs/DESIGN_SYSTEM.md`), follow existing class patterns
* **Path alias** — `@/` maps to `src/`
* Always add **error handling** for Supabase queries and mutations
* Always handle **loading and error states** in UI components
* Use **named exports** for components, **default exports** only for pages
* Match conventions used by **Lovable.dev** and **Supabase** (Supabase JS client v2, Vite, shadcn/ui)

### ESLint Rules

* `no-console` — only `console.error` and `console.warn` allowed
* `@typescript-eslint/no-explicit-any` — warning, fix when possible
* `@typescript-eslint/no-unused-vars` — warning, prefix unused with `_`
* Ignores: `dist/`, `.claude/**`, `.worktrees/**`, `supabase/**`

### React Query Conventions

* Hook naming: `use<Entity><Action>` (e.g. `useBrandAnalytics`, `useWithdrawApplication`)
* Query keys: `['entity-or-path', dependentId]`
* Always use `enabled: !!dependency` for conditional queries
* Mutations: use `useQueryClient()` to invalidate related queries on success

## Architecture

### Provider Hierarchy (App.tsx)

```
ErrorBoundary → ThemeProvider → QueryClientProvider → LazyMotion → AuthProvider
  → AnalyticsProvider
    ├─ ErrorBoundary (widget) → PerformanceMonitor  (isolated, silent failure)
    └─ TooltipProvider → Toaster + Sonner
        └─ BrowserRouter → AppLayout
            ├─ Public paths: AppShell directly
            └─ Authenticated paths: DonnyProviderWithAuth → AuthenticatedShell (3-hr inactivity timeout)
                → AppShell (SiteGateGuard → AnimatedRoutes + HelpBriefDrawer + DonnyDesktopPanel)
```

### Three User Roles

| Role | `profiles.role` | Route guard | Dashboard |
|-|-|-|-|
| Restaurant/Business | `business_client` | `BusinessRoute` (`account_type === 'restaurant'`) | `/dashboard/business` |
| Content Creator | `content_creator` | `ProtectedRoute` | `/dashboard/creator` |
| Brand/Sponsor | `brand` | `BrandRoute` (`account_type === 'brand'`) | `/dashboard/brand` |

### Route Guards

* **`ProtectedRoute`** — requires authenticated session, redirects to `/auth`
* **`VerifiedRoute`** — requires authentication + email verification
* **`BusinessRoute`** — requires `business_profiles.account_type === 'restaurant'`
* **`BrandRoute`** — requires `business_profiles.account_type === 'brand'`

### Key Modules

* **Supabase client**: single instance at `src/integrations/supabase/client.ts`
* **Feature modules**: domain code in `src/features/` (donny, promotions, settings)
* **Edge functions**: 80 Deno functions in `supabase/functions/`, shared utils in `_shared/` (cors, auth, model-routing, cost-ledger, platform-fee, anthropic-fetch, mcp-client)
* **Autoresearch + Donny RAG**: the `/autoresearch` skill (`.claude/skills/autoresearch/`) grows the wiki and, via `sync-donny`, syncs verified wiki pages into Donny's RAG store (`donny_knowledge`) through the `donny-knowledge-sync` edge function (OpenAI embeddings, idempotent). See `docs/wiki/concepts/self-improving-app.md`.
* **Outstand integration**: `src/integrations/outstand/Provider.tsx` + 17 hooks in `src/hooks/outstand/` — social media account linking, delegated posting, analytics
* **Auth system**: app-level loading guard in `AppLayout`, 3-hour global inactivity timeout in `AuthenticatedShell` (both defined in `src/App.tsx`)
* **ErrorBoundary** levels: `'page'` (default), `'section'`, `'widget'`. Pass `fallback={null}` for silent widget errors.

## Testing

* **Vitest** with `@testing-library/react` and `jest-dom` — globals enabled
* Tests co-located with source (e.g. `src/lib/donnyMatching.test.ts`)
* E2E tests in `tests/e2e/`
* Single test: `npx vitest run src/lib/donnyMatching.test.ts`

## Code Review Standards

After completing any implementation, review for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage (replace with real types)
- Components with more than 3 props that could be grouped
- Missing error handling on async operations

Run /simplify before presenting code to the user.

### Codex second review (required)

Codex is a **mandatory independent second reviewer** of Claude's code. After Claude's
own reviews pass (subagent spec + code-quality reviews, or `/code-review`) and before
finishing a development branch / opening a PR, run an independent Codex pass and act
on its findings:

```bash
codex review --base main --title "<short title>"   # run from the worktree
```

(Other modes: `--uncommitted` for staged/unstaged/untracked changes, `--commit <sha>`
for a single commit.) If Codex flags real issues, Claude fixes them and Codex is
re-run until clean. Relay Codex's summary verdict to the user. Codex's sandbox may
reject some of its own shell commands ("blocked by policy") — it still completes a
full diff pass; that is expected, not a failure. This complements, never replaces,
Claude's own reviews — the point is two independent models. (Distinct from
`/code-review ultra`, the user-triggered, billed multi-agent cloud review.)

## Important Rules

* **Never modify auth logic** without confirming first
* **Never drop or rename tables/columns** — always add new columns as nullable
* **Always use RLS-safe queries** — assume Row Level Security on all tables
* **Do not hardcode user IDs or secrets** — use `supabase.auth.getUser()`
* **Realtime features** (`messages`, `user_presence`) — preserve existing subscription patterns
* **Ask before refactoring** large shared components (auth flow, messaging UI, campaign listings)
* Always include **`.select()` field lists** in Supabase queries — avoid `select *`
* **Stripe test mode only** — never use live keys without explicit approval

## Rigor & Context Management

* **Ask until 95% confident** — before starting any task, ask clarifying questions until you understand exactly what's needed. Don't make assumptions.
* **95% complete before moving on** — don't move to the next task until the current one is complete, correct, and passes.
* **Compact proactively** — after reading 10+ files or spanning multiple major tasks, run /compact to preserve context for productive work.

## Session Discipline

* **Compact early** — run `/compact` proactively when context usage reaches ~55%. Don't wait for automatic compression; compress early to preserve working memory for the current task.
* **Verify production after deploy** — after every push to main (auto-deployed via Vercel, ~1–3 min), verify at dragoncandy.io: screenshot the affected pages, open Chrome DevTools, check for console errors. Test both desktop and mobile viewports. Test account credentials are stored in the project memory system.
* **Desktop/Mobile viewport separation** — frontend changes must target the correct viewport. Changes meant for desktop use `lg:` / `xl:` prefixed Tailwind classes. Changes meant for mobile use base (unprefixed) classes. Never apply mobile-targeted changes to desktop or vice versa. Test both viewports after any UI change.

## Session Continuity

Work spanning multiple sessions uses handoff documents in `.claude/handoffs/`.

**Resuming:** Check `.claude/handoffs/` for existing handoffs. If user continues prior work, load the freshest relevant handoff. If ambiguous, load and note it. If clearly unrelated, skip.

**Creating:** Invoke `session-handoff` skill when completing a plan phase with more work remaining, switching workstreams, or ending a session with pending work. Skip for small self-contained fixes or fully completed work. After writing the handoff to `.claude/handoffs/`, also copy it to `docs/wiki/raw/sessions/` and run `/wiki-ops ingest` on the raw session file to synthesize it into the wiki.

**Knowledge update on branch finish (required).** Finishing a worktree branch is not done until the knowledge layer reflects what shipped. As a standard step of `finishing-a-development-branch`, run the **`knowledge-sync`** skill: write a `docs/wiki/raw/sessions/` source, `/wiki-ops ingest` it, prepend the session's full entry to `docs/SHIPPED_LOG.md` (**not** `PROJECT_CONTEXT.md` §5 — that section is a one-line-per-entry index, and detail there is loaded into every future session), refresh the affected core docs (`PROJECT_CONTEXT.md` §5 index line + §4 Current State, plus `DATABASE_SCHEMA.md` / `DESIGN_SYSTEM.md` / this file only if schema / design / a workflow rule changed), include those changes in the PR (reviewed like any code, through the Codex second pass), and after merge sync Donny's RAG (`donny_knowledge`). Skip only for trivial mechanical changes (typo/format/dep bumps). The daily 3am AIOS `knowledge-freshness-agent` *flags* a missing wiki ingest on `/internal/findings` (and self-heals the mechanical RAG-sync case) — it is not a substitute for doing this per session.

| Layer | Purpose | Update cadence |
|-------|---------|----------------|
| Memory (`.claude/...memory/`) | Durable user/project facts, preferences | When new facts learned |
| PROJECT_CONTEXT.md | Project identity, strategy, stack | Monthly or at milestones |
| Wiki (`docs/wiki/`) + Donny RAG (`donny_knowledge`) | Synthesized knowledge for humans + retrieval | Per worktree session, via `knowledge-sync` |
| Handoffs (`.claude/handoffs/`) | In-flight execution state, next steps | Per work session |
| Git log | What changed and why | Per commit |

## Environment Variables

```
VITE_SUPABASE_URL=https://zocahiffooqdybdhguqv.supabase.co
VITE_SUPABASE_ANON_KEY=
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_51SkFixJi7lqzzhdMKFYEBrKqmG0GhI1tBleC4Hw5x2doJL532AvXc3u1wPfFowtLUO8bPvmZme91hrMQthYkiEqQ00MxRx41yB
```

Never commit actual values. Reference `.env.local` locally.

## Deployment

Push to `main` on GitHub → Vercel auto-deploys to dragoncandy.io (~1–3 min; cut over from Lovable hosting 2026-07-15 — `docs/runbooks/vercel-prod-cutover.md`). Test locally with `npm run dev` before pushing. Vercel env-var scopes are load-bearing: **Production** scope = prod Supabase, **Preview** scope = staging Supabase (the QA-gate previews).

### Worktree workflow — refresh local main after every merge

Work happens in **git worktrees** under `.claude/worktrees/` (30+ of them). A worktree is a
**separate working directory** with its own branch; edits there reach `origin/main` only via PR
merge. **The local `main` checkout (`C:\GIT\dragoncandy-v3-d783432b`) does NOT auto-update** — so the
files you browse there go stale (they can drift 100+ commits behind `origin/main`). Vercel deploys
from **GitHub `origin/main`**, not the local checkout, so prod stays current even when local main is stale.

**This refresh is AUTOMATIC — do not hand-run the raw git commands.** Two hooks in
`.claude/settings.json` run `.claude/scripts/refresh-main.ps1`: `PostToolUse` gated on
`Bash(gh pr merge *)`, and `SessionStart` as a catch-up for web-UI merges. Both are `async`, and
the script always exits 0, so it can never block a turn or a merge. Every run is logged to
`<git-common-dir>/refresh-main.log` — **read that log before concluding it did or didn't act.**

**Never automate the bare `merge --ff-only origin/main`.** It does not check which branch the main
checkout is on: if that checkout sits on a feature branch strictly *behind* `origin/main`, it
fast-forwards **that feature branch** onto main and silently moves its pointer. A *diverged* branch
is refused, which makes the flaw look safe — that is luck, not a guard. The script asserts the
branch first, and handles three states: a **worktree holding `main`** (skip — git refuses to update
a checked-out branch from elsewhere), the **main checkout on `main`** (fetch + `--ff-only`, the only
path that updates files and fires the `post-merge` RAG sync; skipped when the tree is dirty), and
the **main checkout on another branch** (`git fetch origin main:main` advances the *ref* only —
files and RAG deliberately untouched, and the log says so).

When a run skips, the log names the blocker; the **`refresh-main`** skill documents the fix for each.
Core files (`CLAUDE.md`, `docs/PROJECT_CONTEXT.md`, `docs/wiki/`) appearing stale in the local folder
almost always means a refresh was skipped — not that the change was lost.

**Donny's RAG auto-syncs on this refresh.** A committed `post-merge` git hook (source:
`scripts/hooks/post-merge`, installed into the common `.git/hooks/` on `npm install` via the
`prepare` → `scripts/install-hooks.mjs` step) watches the refresh above: when the **main** checkout
fast-forwards and `docs/` changed, it runs `npm run sync:internal` + `npm run sync:wiki` in the
background (log: `.git/knowledge-sync.log`), so `/internal/strategy` + Donny's `donny_knowledge` RAG
stay current with no manual sync — **but only on the fast-forward path above.** When the refresh took
the ref-only path (main checkout busy on another branch) no merge happened, so this hook never fires
and a `docs/` change needs a hand-run `npm run sync:internal`. It self-guards to the main checkout (skips worktrees) and never
blocks the merge. The hook reads the key via `supabase/scripts/with-env.mjs` (a `SUPABASE_SECRET_KEY`
env var wins, else the **gitignored** `supabase/scripts/.env.sync.local`) — so the key file (or a
`setx`'d var) must exist locally for the auto-sync to fire. To sync by hand from the main checkout:
`npm run sync:internal` (strategy/internal) or `npm run sync:wiki` (consumer RAG).

**Recurring worktree routines are skills — use them, don't re-derive:** `refresh-main` (the
fast-forward above), `worktree-cleanup` (remove merged worktrees + branches, safety-gated),
`codex-review` (the mandatory Codex second pass before a PR), `verify-prod` (post-deploy
both-viewport + console-error check), and `knowledge-sync` (the per-session knowledge update
described under Session Continuity).
