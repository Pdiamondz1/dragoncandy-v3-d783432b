@docs/PROJECT_CONTEXT.md
@docs/DESIGN_SYSTEM.md
@docs/DATABASE_SCHEMA.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

React 18 + TypeScript (strict), Vite, Tailwind CSS, shadcn/ui (Radix). Supabase backend (Postgres, Auth, Edge Functions, Realtime, Storage). Stripe Connect (test mode). React Query for server state. Framer Motion (lazy-loaded). Hosted on Lovable.dev → dragoncandy.io. Fonts: Outfit (sans), Pacifico (script).

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
  → AnalyticsProvider → BrowserRouter → DonnyProviderWithAuth (non-public pages only)
    → AppShell (SiteGateGuard + AnimatedRoutes + DonnyDesktopPanel + HelpBriefDrawer)
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
* **Feature modules**: domain code in `src/features/` (donny, promotions, settings, etc.)
* **Edge functions**: ~60 Deno functions in `supabase/functions/`, shared utils in `_shared/` (cors, auth, model-routing, cost-ledger, platform-fee, anthropic-fetch, mcp-client)
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

## Important Rules

* **Never modify auth logic** without confirming first
* **Never drop or rename tables/columns** — always add new columns as nullable
* **Always use RLS-safe queries** — assume Row Level Security on all tables
* **Do not hardcode user IDs or secrets** — use `supabase.auth.getUser()`
* **Realtime features** (`messages`, `user_presence`) — preserve existing subscription patterns
* **Ask before refactoring** large shared components (auth flow, messaging UI, campaign listings)
* Always include **`.select()` field lists** in Supabase queries — avoid `select *`
* **Stripe test mode only** — never use live keys without explicit approval

## Session Continuity

Work spanning multiple sessions uses handoff documents in `.claude/handoffs/`.

**Resuming:** Check `.claude/handoffs/` for existing handoffs. If user continues prior work, load the freshest relevant handoff. If ambiguous, load and note it. If clearly unrelated, skip.

**Creating:** Invoke `session-handoff` skill when completing a plan phase with more work remaining, switching workstreams, or ending a session with pending work. Skip for small self-contained fixes or fully completed work.

| Layer | Purpose | Update cadence |
|-------|---------|----------------|
| Memory (`.claude/...memory/`) | Durable user/project facts, preferences | When new facts learned |
| PROJECT_CONTEXT.md | Project identity, strategy, stack | Monthly or at milestones |
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

Push to `main` on GitHub → Lovable auto-deploys to dragoncandy.io. Test locally with `npm run dev` before pushing. No staging environment.
