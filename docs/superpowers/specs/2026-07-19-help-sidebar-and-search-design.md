# Help — Desktop Sidebar Link + Improved Search Design

**Date:** 2026-07-19
**Status:** Approved (brainstorming → spec)
**Author:** Claude (with Dame)

## Problem & Context

Two founder asks for the help experience:

1. **Desktop sidebar:** the `/help` page isn't reachable from the desktop dashboard **sidebar nav**. It's
   currently only in the desktop **account dropdown** (top-right avatar → Settings/Help/Log out) and the
   **mobile hamburger drawer** ("Support" section). Users don't find it in the left nav where they look.
2. **Help search:** the `/help` page already has a search bar (`HelpCenter.tsx`), but it's visually subtle
   and does an unranked in-memory substring filter. The founder wants it more prominent and smarter, and
   reachable from the individual article pages too.

## Goals

- Add a visible **Help** item to the desktop sidebar nav for all three roles.
- Make the `/help` search prominent, on-brand, and relevance-ranked, and searchable from article pages.
- Frontend-only — no schema, RLS, edge function, or migration.

## Non-Goals (YAGNI)

- **No server-side `search_vector` full-text search.** Considered and rejected for this ~32-article corpus:
  it adds per-keystroke network latency, loses partial/type-ahead matching (full-text needs whole words),
  and requires a new DB function. `search_vector` (used by Donny's `guidance_agent`) stays as-is; the human
  help search stays client-side. Revisit only if the corpus grows large.
- No global in-app search (a search box in the sidebar/header). Search stays on the help surface.
- No change to Donny, the renderer, or the help_articles schema.

## Design

### Part 1 — Help in the desktop sidebar

`src/lib/navConfig.ts` defines the per-role sidebar arrays (`businessSidebarNav`, `brandSidebarNav`,
`creatorSidebarNav`), consumed by `getSidebarNav(role)` in `DashboardLayout.tsx`'s `AppSidebar`. Add one
item to each array, at the **bottom, immediately after `Settings`**:

```ts
{ icon: HelpCircle, label: 'Help', href: '/help' },
```

`HelpCircle` is already imported in `navConfig.ts`. The `AppSidebar` map renders it like any other item —
no change to `DashboardLayout.tsx`. **Note:** `/help` is a *standalone* route (`App.tsx`) that renders
`HelpCenter` with its own `PublicPageHeader`, **not** inside `DashboardLayout`, so clicking Help navigates
out of the dashboard shell to the help center (then "Back to Dashboard" returns). This matches the existing
account-dropdown and mobile-drawer Help links; there is no in-sidebar active-highlight to show (the sidebar
isn't rendered on `/help`), and that's fine — the ask is reachability, which the nav item delivers. The
account-dropdown Help link and the mobile drawer's "Support" Help stay as they are (redundant is fine).

### Part 2 — Improved `/help` search

**a) Prominent, branded box.** In `HelpCenter.tsx`, enlarge the existing search input and brand it: larger
height/text, teal focus ring + border (`focus:border-dc-teal focus:ring-2 focus:ring-dc-teal/30`), a search
icon, and placeholder "Search help articles…". Keep it at the top of the page (hero placement it already has).

**b) Smart client-side ranking.** Extract matching into a pure, unit-tested helper
`src/lib/helpSearch.ts`. The `HelpArticle` type is currently local + unexported inside `HelpCenter.tsx`;
`helpSearch.ts` defines and **exports** its own minimal structural interface (the fields it needs) and
`HelpCenter.tsx` imports it (dropping its local duplicate), so there is one source of truth:

```ts
export interface HelpArticle {
  id: string; slug: string; title: string; body: string;
  category: string; roles: string[]; search_terms: string[];
}
export function rankHelpArticles(articles: HelpArticle[], query: string): HelpArticle[]
```

- Empty/whitespace query → returns `[]` (caller shows the category tree instead).
- Case-insensitive. Tokenizes the query on whitespace; an article matches if **every** token appears
  (substring) in its searchable text — preserves partial/type-ahead matching ("camp" → campaign).
- **Score by field priority:** a token hit in `title` scores highest, then `search_terms`, then `body`.
  A whole-word / word-boundary hit outscores a mid-word substring hit; an earlier position scores slightly
  higher. Sum across tokens.
- Returns matches sorted by score desc, then title asc (stable, deterministic — no `Math.random`/`Date`).

`HelpCenter.tsx` uses it: when the query is non-empty, render a **flat ranked result list** ("N results" +
each article as title + 1-line body excerpt + category label, linking to `/help/:slug`); when empty, render
the existing category accordion unchanged. The empty-results state ("No articles found… try Donny") is kept.

**c) `?q=` param + article-page search.**
- `HelpCenter.tsx` reads the `?q=` search param on mount (via `useSearchParams`) to seed the search input,
  so a deep link like `/help?q=crew` lands pre-searched. Typing updates the input state; the URL is updated
  with `setSearchParams(..., { replace: true })` so it stays shareable without spamming history. (Guard against
  an update loop: only write when the value actually changes.)
- `HelpArticlePage.tsx` gains a compact search box (same icon/branding, smaller) near the top; on submit
  (Enter or the search button) it `navigate`s to `/help?q=<encoded query>`. So a reader can search from any
  article without manually going back.

## Components / files

| File | Change |
|---|---|
| `src/lib/navConfig.ts` | +1 Help item in each of the 3 sidebar arrays |
| `src/lib/helpSearch.ts` (new) | pure `rankHelpArticles`, + co-located `helpSearch.test.ts` |
| `src/pages/help/HelpCenter.tsx` | branded search box; ranked flat list when searching; read/write `?q=` |
| `src/pages/help/HelpArticlePage.tsx` | compact search box → `/help?q=` |

## Error handling / edge cases

- No network calls added, so no new failure modes. `rankHelpArticles` is total (handles empty query, empty
  article list, `null`/undefined `search_terms`/`body`).
- Query param is `encodeURIComponent`-encoded on write and read via `useSearchParams` (safe).
- Article page: an empty/whitespace query submit is a no-op (don't navigate to `/help?q=`).

## Testing

- Unit tests for `rankHelpArticles`: empty query → `[]`; title match ranks above body match; multi-token
  AND semantics; partial/prefix match ("camp"); missing `search_terms`/`body` tolerated; deterministic order.
- Manual both-viewport verify after deploy: sidebar Help item present in the desktop nav and navigates to
  `/help` (no active-highlight expected — `/help` isn't in the dashboard shell); search box prominent;
  ranked results; `/help?q=crew` deep link; article-page search routes correctly.

## Deploy

Frontend-only → ships on merge to `main` (Vercel). No migration, edge function, or secret. `npm run build`
before the PR; Codex second review; both-viewport prod verify.

## Execution note

Small, cohesive, frontend-only change (4 files). Executed inline with TDD on the `rankHelpArticles` helper,
not subagent-driven (the pieces are tightly coupled to two page components).
