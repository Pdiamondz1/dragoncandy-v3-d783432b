@docs/PROJECT_CONTEXT.md
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DragonCandy (dragoncandy.io) is a marketplace platform for social media content delivery,
connecting brands/businesses with content creators. Buyers (brands) post campaigns,
creators apply and deliver content, with payments and real-time communication in between.
Donny AI, aka "Donny", is the super AI agent that will trascend the platform into plugins, extensions,
and APIs into an assortment of devices and wearables. We want to optimize the DragonCandy experience by
doing more with users typing LESS. The LESS typing for content delivery the better.

\---

## Elon Musk Algorithm

What exactly is the Algorithm? A series of deceptively simple steps DragonCandy development abides by:
Question every requirement.
Delete every possible step in a process (or part).
Simplify and optimize.
Accelerate cycle time.
Automate.

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

* **Frontend:** React 18 + TypeScript (strict), Vite, hosted on Lovable.dev → dragoncandy.io
* **Backend:** Supabase (Postgres, Auth, Edge Functions, Realtime, Storage)
* **Payments:** Stripe Connect (currently using Stripe test mode)
* **Repo:** GitHub (auto-syncs with Lovable on push)
* **UI Components:** shadcn/ui (Radix primitives) — configured in `components.json`, components in `src/components/ui/`
* **Styling:** Tailwind CSS only — no custom CSS unless absolutely necessary. Font: Outfit (sans), Pacifico (script)
* **Data Fetching:** React Query (TanStack Query) for all server state
* **Animations:** Framer Motion (lazy-loaded via `LazyMotion`)
* **Components:** Functional components only — no class components

\---

## Coding Conventions

* **TypeScript strict mode** — `tsconfig.app.json` has `strict: true`, `noUnusedLocals`, `noUnusedParameters`
* **Functional components only** — hooks over lifecycle methods
* **React Query** for all Supabase data fetching, mutations, and caching
* **Tailwind** for all styling — use `dc-*` color tokens (see Design System), follow existing class patterns
* **Path alias** — `@/` maps to `src/` (e.g. `import { supabase } from "@/integrations/supabase/client"`)
* Match the conventions and tooling used by **Lovable.dev** and **Supabase** (e.g. Supabase JS client v2, Vite, shadcn/ui)
* Always add **error handling** for Supabase queries and mutations
* Always handle **loading and error states** in UI components
* Use **named exports** for components, **default exports** only for pages

### ESLint Rules

* `no-console` — only `console.error` and `console.warn` allowed (no `console.log` in committed code)
* `@typescript-eslint/no-explicit-any` — warning level, fix when possible
* `@typescript-eslint/no-unused-vars` — warning, prefix unused args/vars with `_`
* ESLint ignores: `dist/`, `.claude/**`, `.worktrees/**`, `supabase/**`

### React Query Conventions

* Hook naming: `use<Entity><Action>` (e.g. `useBrandAnalytics`, `useWithdrawApplication`)
* Query keys: `['entity-or-path', dependentId]` (e.g. `['campaign-detail', campaignId]`)
* Always use `enabled: !!dependency` for conditional queries
* Mutations: use `useQueryClient()` to invalidate related queries on success

## Code Review Standards
After completing any implementation, review the code for:
- Functions longer than 30 lines (likely doing too much)
- Logic duplicated more than twice (extract to utility)
- Any `any` type usage in TypeScript (replace with real types)
- Components with more than 3 props that could be grouped into an object
- Missing error handling on async operations

Run /simplify before presenting code to the user.

\---

## Architecture

### Provider Hierarchy (App.tsx)

```
ErrorBoundary → ThemeProvider → QueryClientProvider → LazyMotion → AuthProvider
  → AnalyticsProvider → BrowserRouter → DonnyProviderWithAuth (non-public pages only)
    → AppShell (SiteGateGuard + AnimatedRoutes + DonnyDesktopPanel + HelpBriefDrawer)
```

### Three User Roles

| Role | `profiles.role` value | Route guard | Dashboard path |
|-|-|-|-|
| Restaurant/Business | `business_client` | `BusinessRoute` (checks `account_type === 'restaurant'`) | `/dashboard/business` |
| Content Creator | `content_creator` | `ProtectedRoute` only | `/dashboard/creator` |
| Brand/Sponsor | `brand` | `BrandRoute` (checks `account_type === 'brand'`) | `/dashboard/brand` |

### Route Guards

* **`ProtectedRoute`** — requires authenticated session, redirects to `/auth`
* **`VerifiedRoute`** — requires authentication + email verification
* **`BusinessRoute`** — requires `business_profiles.account_type === 'restaurant'`
* **`BrandRoute`** — requires `business_profiles.account_type === 'brand'`

### ErrorBoundary Levels

`ErrorBoundary` accepts a `level` prop: `'page'` (default, full-height with logo), `'section'` (min-h-200), `'widget'` (min-h-200, used to isolate optional UI like Donny). Pass `fallback={null}` to silently swallow widget errors.

### Supabase Client

Single client instance at `src/integrations/supabase/client.ts`. Types are auto-generated at `src/integrations/supabase/types.ts` but may lag behind migrations — typed as `SupabaseClient<any, "public", any>` to accommodate.

### Feature Modules

Domain-specific code lives in `src/features/` (e.g. `features/donny/`, `features/promotions/`, `features/settings/`), each with its own components, hooks, and utilities. Prefer this pattern for self-contained feature code.

### Edge Functions

~60 Deno edge functions in `supabase/functions/`. Shared utilities in `supabase/functions/_shared/`:
* `cors.ts` — origin allowlist (dragoncandy.io + preview), standard CORS headers
* `auth.ts` — Donny OAuth token validation (not Supabase JWT), scope checking
* `model-routing.ts` — AI model selection (Claude Sonnet/Haiku routing by task)
* `cost-ledger.ts` — AI usage cost tracking per-request
* `platform-fee.ts` / `dragonshare-fee.ts` — fee calculation
* `anthropic-fetch.ts` — shared Claude API client
* `outstand-mcp.ts` / `mcp-client.ts` — MCP integration for social posting

\---

## Testing

* **Framework:** Vitest (configured in `vite.config.ts`, globals enabled)
* **Libraries:** `@testing-library/react`, `@testing-library/jest-dom`
* **Test files:** Co-located with source (e.g. `src/lib/donnyMatching.test.ts`, `src/hooks/useCampaignFilters.test.ts`)
* **E2E tests:** `tests/e2e/` directory (e.g. `toast-integration.spec.ts`)
* **Run a single test:** `npx vitest run src/lib/donnyMatching.test.ts`

\---

## Project Structure

```
src/
├── assets/           # Static assets (images, icons, fonts)
├── components/       # Reusable UI components
│   ├── first-run/          # FirstRunDashboard, MissionChecklist, MissionItem, FirstRunHero
│   ├── campaign-creator/
│   │   ├── InspirationStrip.tsx  # Dragon Feed reference in campaign creation
│   │   └── InspirationBadge.tsx  # "Inspired by" badge on Launchpad
├── contexts/         # React context providers (auth, theme, etc.)
├── hooks/            # Custom React hooks (React Query hooks live here)
├── integrations/     # Third-party service integrations (Supabase, Stripe, etc.)
├── lib/              # Supabase client and utility libraries
├── pages/            # Route-level page components
├── types/            # TypeScript types and interfaces
├── App.css           # Global app styles
├── App.tsx           # Root app component and routing
├── index.css         # Base styles
├── main.tsx          # App entry point
└── vite-env.d.ts     # Vite environment type declarations
```

\---

## Supabase Database Tables

### User \& Auth

|Table|Purpose|
|-|-|
|`profiles`|Core user profiles (linked to Supabase auth). Includes `first_run_missions` JSONB for onboarding state.|
|`creator\_profiles`|Extended profile data for content creators|
|`business\_profiles`|Extended profile data for brands/businesses|
|`profile\_views`|Tracks who viewed which profiles|
|`onboarding\_steps`|Defines onboarding flow steps|
|`user\_onboarding\_progress`|Tracks per-user onboarding completion|
|`email\_verification\_tokens`|Email verification flow|
|`feature\_flags`|Per-user or global feature toggles|

### Campaigns \& Marketplace

|Table|Purpose|
|-|-|
|`campaigns`|Brand-created campaigns seeking creators|
|`campaign\_applications`|Creator applications to campaigns|
|`campaign\_collaborations`|Active collaborations between brands and creators|
|`campaign\_invitations`|Direct invites from brands to creators|
|`campaign\_matches`|Matched brand/creator pairings|
|`campaign\_sponsorships`|Sponsorship arrangements within campaigns|
|`application\_counter\_offers`|Negotiation counter-offers on applications|

### Payments \& Promotions

|Table|Purpose|
|-|-|
|`promotions`|Promotional offers or deals|
|`promotion\_submissions`|Creator submissions for promotions|
|`discount\_codes`|Discount/promo codes|

> \*\*Stripe:\*\* Payments are processed via Stripe (currently in \*\*test mode\*\*). Stripe logic lives in `src/integrations/`. Never switch to live Stripe keys without explicit confirmation.

### Messaging \& Realtime

|Table|Purpose|
|-|-|
|`conversations`|Conversation threads|
|`conversation\_participants`|Users in each conversation|
|`messages`|Individual messages|
|`messages\_with\_profiles`|View joining messages with sender profile data|
|`message\_reactions`|Emoji reactions on messages|
|`user\_presence`|Online/offline status (realtime)|
|`push\_notifications`|Push notification records|
|`notification\_preferences`|Per-user notification settings|

### File Management

|Table|Purpose|
|-|-|
|`file\_uploads`|Uploaded files (content deliverables, assets)|
|`file\_versions`|Version history for uploaded files|
|`file\_permissions`|Access control on files|
|`file\_comments`|Comments on files|
|`file\_tags`|Tag definitions|
|`file\_tag\_assignments`|Tags assigned to files|

### Reviews \& Feedback

|Table|Purpose|
|-|-|
|`project\_reviews`|Reviews of completed collaborations|
|`review\_responses`|Responses to reviews|
|`beta\_feedback`|Beta user feedback submissions|

### Analytics

|Table|Purpose|
|-|-|
|`analytics\_events`|Custom event tracking|

\---

## Key Relationships

* `profiles` is the central user table — always join through here for user info
* `campaigns` → `campaign\_applications` → `campaign\_collaborations` is the core marketplace flow
* `conversations` + `conversation\_participants` + `messages` power the chat system
* `file\_uploads` are the primary content deliverable mechanism between creators and brands

\---

## Design System

> Screenshots of all screens are in the `/designs` folder. Always reference them when building or modifying UI.

### Color Palette (Tailwind `dc-*` tokens)

Use the `dc-*` Tailwind tokens defined in `tailwind.config.ts` — never hardcode hex values in components.

|Token|Tailwind class|Hex|Usage|
|-|-|-|-|
|Teal (Primary)|`dc-teal`|`#4DD9C0`|Primary buttons, borders, headings, icons|
|Teal Dark|`dc-teal-dark`|`#00E5CC`|Hover/accent teal|
|Teal Button|`dc-teal-btn` / `dc-teal-btn-hover`|`#0F766E` / `#115E59`|Dark teal button fills|
|Pink (Secondary)|`dc-pink`|`#F9A8D4`|Inbound bubbles, CTA accents|
|Pink Accent|`dc-pink-accent`|`#EC4899`|Secondary button text, links, star ratings|
|Pink Accent Button|`dc-pink-accent-btn` / hover|`#DB2777` / `#BE185D`|Pink button fills|
|Pink Background|`dc-pink-bg`|`#F9C8E0`|Browse Creators, business dashboard header|
|Gray Background|`dc-gray`|`#A8A8A0`|Main app background (most screens)|
|Dark|`dc-dark`|`#1A1A2A`|Dark backgrounds|
|Card|`dc-card`|`#FFFFFF`|Card backgrounds|
|Text|`dc-text`|`#111111`|Headings, bold labels, card titles|
|Text Muted|`dc-text-muted`|`#555555`|Body copy, subtitles, placeholder text|
|Yellow|`dc-yellow`|`#FACC15`|CTA accent strips on campaign cards|

### Typography

|Element|Style|
|-|-|
|Page titles / H1|ALL CAPS, bold, large — teal (`#4DD9C0`) on dark bg, dark on light bg|
|Section headings / H2|Title case or ALL CAPS, bold, dark or teal|
|Card titles|Bold, sentence case, dark (`#111111`)|
|Body text|Regular weight, sentence case, gray (`#555555`)|
|Button labels|Bold or semi-bold, sentence case (e.g. "Get Started", "Apply Now")|
|Subtext / captions|Small, light gray, sentence case|
|Stats / numbers|Extra bold, large, black — used for Projects Completed, Reels, etc.|

### Buttons

|Type|Style|
|-|-|
|Primary CTA|Full-width pill shape, teal fill (`#4DD9C0`), white bold text|
|Secondary CTA|Full-width pill shape, white/light fill, pink text (`#EC4899`) with dark border|
|Ghost / Outline|Pill shape, transparent fill, dark border, pink or teal text|
|Action (small)|Pill shape, pink or teal fill, white text — used in cards (e.g. "View Portfolio")|
|Send button|Dark circle with arrow icon (messaging)|
|Add button|Dark circle with `+` icon (bottom nav center)|

### Cards

* White background, large rounded corners (`rounded-2xl` or `rounded-3xl`)
* Subtle shadow or teal border (`border border-teal-300`)
* Consistent internal padding
* Creator cards: thumbnail image (left, rounded) + name + description + action button
* Campaign cards: full-bleed image with dark overlay + text + company avatar at bottom
* Quick action cards: teal border, bold title, short description, centered text

### Navigation

* **Top nav:** Logo (top-left) + hamburger menu (top-right), minimal — no labels
* **Bottom nav:** 7 icons — Home, Favorites, Play/Video, **+ (teal, prominent center)**, Campaigns/List, Megaphone/Promote, Profile
* Active center `+` button: teal circle, larger than other icons, elevated
* Inactive icons: gray (`#888888`)

### Messaging UI

* Background: medium gray (`#A8A8A0`)
* Inbound bubbles: pink (`#F9A8D4`), left-aligned, with sender avatar (Dragon Candy logo for platform messages)
* Outbound bubbles: teal (`#4DD9C0`), right-aligned, with user avatar
* Bubble shape: large pill / fully rounded ends
* Top bar: white/light bg, creator name in teal, "Recently Active" subtitle, phone icon (pink circle)
* Input bar: white pill input + dark `+` button (left) + dark send arrow (right)

### Profile \& Portfolio Pages

* Hero: full-bleed background image (photo or colored wall)
* Profile card: white pill/rounded card overlaid at bottom of hero — avatar (left, circular with teal border) + name + rating + location
* Stats row: 3 columns separated by pink vertical dividers — large bold number + label
* Reviews: 3-column horizontal scroll, plain text quotes + bold business name attribution
* CTA button: full-width teal pill at bottom

### Page-Specific Backgrounds

|Page|Background|
|-|-|
|Landing / Marketing|White (`#FFFFFF`)|
|Login|Medium gray (`#A8A8A0`)|
|Business Dashboard|Light pink (`#F9C8E0`) header, white body|
|Browse Creators|Light pink (`#F9C8E0`) full page|
|Creator Portfolio|Medium gray (`#A8A8A0`)|
|Available Campaigns|Medium gray (`#A8A8A0`)|
|Messaging|Medium gray (`#A8A8A0`)|
|Creator/Business Profile|Gray with hero image|

### Design Rules for Claude Code

* **Always use Tailwind utility classes** that match the above — never hardcode hex colors in inline styles
* **Mobile-first** — all screens are designed for mobile (375–430px width)
* **Pill-shaped buttons everywhere** — use `rounded-full` for all buttons
* **Teal borders on interactive cards** — use `border border-teal-300` or `border-2 border-teal-400`
* **Never change the color system** without explicit instruction — teal + pink is the core brand identity
* **Avatar images** always use `rounded-full` with a teal ring (`ring-2 ring-teal-400`)
* **Full-width buttons on mobile** — `w-full` for all primary CTAs
* **Consistent spacing** — use `p-4` or `p-6` for card padding, `gap-4` between elements

### Design Reference Files

Screenshots are stored in `/designs`:

* `login\_page.png` — Login \& signup screen
* `mobile\_landing\_page.png` — Public landing/marketing page
* `restaurant\_dashboard\_page.png` — Business user dashboard
* `browse\_creators\_page.png` — Creator listing/browse page
* `creator\_portfolio\_page.png` — Creator portfolio modal/page
* `creatorbusiness\_profile.png` — Creator public profile with reviews
* `creator\_view\_of\_available\_campaigns.png` — Campaign swipe/browse view
* `messaging\_page.png` — In-app messaging / chat UI

\---

## Important Rules

* **Never modify auth logic** (`email\_verification\_tokens`, Supabase Auth config) without confirming first
* **Never drop or rename tables/columns** — always add new columns as nullable
* **Always use RLS-safe queries** — assume Row Level Security is enabled on all tables
* **Do not hardcode user IDs or secrets** — use `supabase.auth.getUser()` for current user
* **Realtime features** (`messages`, `user\_presence`) use Supabase Realtime subscriptions — preserve existing subscription patterns
* **Ask before refactoring** large shared components (e.g. auth flow, messaging UI, campaign listings)
* When adding new Supabase queries, **always include `.select()` field lists** — avoid `select \*` in production code

\---

## Session Continuity

Work that spans multiple sessions uses handoff documents stored in `.claude/handoffs/`.

### Resuming Work

At the start of every session, check `.claude/handoffs/` for existing handoffs:
- **User explicitly continues** ("pick up where we left off", "continue the audit", "what's next") → Load the freshest relevant handoff and begin working from its "Immediate Next Steps"
- **Ambiguous request that could relate to an active handoff** → Load it and note: "Loaded handoff context for [X]." The user can redirect if wrong
- **Clearly unrelated request** → Do not mention handoffs

When loading a handoff, verify its context still holds: check the branch, confirm referenced files exist, and review git log for commits since the handoff was created.

### Creating Handoffs

Invoke the `session-handoff` skill to create a handoff at these moments:
- Completing a plan phase or task batch with more work remaining
- Before switching to a different workstream
- When context is heavy and the session is ending with pending work

Do NOT create handoffs for:
- Small self-contained fixes (git log is sufficient)
- Work that completed fully within the session
- Sessions with no meaningful state to preserve

### Relationship to Other Persistence

| Layer | Purpose | Update cadence |
|-------|---------|----------------|
| Memory (`.claude/...memory/`) | Durable user/project facts, preferences, feedback | When new facts are learned |
| PROJECT_CONTEXT.md | Project identity, strategy, principles, stack | Monthly or at major milestones |
| Handoffs (`.claude/handoffs/`) | In-flight execution state, next steps, gotchas | Per work session or plan phase |
| Git log | What changed and why | Per commit |

\---

## Environment Variables

```
VITE\_SUPABASE\_URL=https://zocahiffooqdybdhguqv.supabase.co
VITE\_SUPABASE\_ANON\_KEY=
VITE\_STRIPE\_PUBLISHABLE\_KEY=pk\_test\_51SkFixJi7lqzzhdMKFYEBrKqmG0GhI1tBleC4Hw5x2doJL532AvXc3u1wPfFowtLUO8bPvmZme91hrMQthYkiEqQ00MxRx41yB
```

Never commit actual values. Reference `.env.local` locally.
Never use Stripe live keys (pk\_live\_... / sk\_live\_...) — test mode only until explicitly approved.

\---

## Deployment

* Push to `main` branch on GitHub → Lovable auto-deploys to dragoncandy.io
* Test locally with `npm run dev` before pushing
* No separate staging environment — test thoroughly before merging to main

