# DragonFeed uplift + sidebar double-active fix — design

- **Date:** 2026-08-07
- **Branch:** `worktree-dc-improvements-16`
- **Status:** Part 1 shipped (commit `77cd768b`); Parts 2–3 approved, in progress
- **Revision:** v2 — the `feed_items` table from v1 was **cut**. See §5.0.

## 1. Problem

Two issues reported together from the business dashboard.

### 1.1 The sidebar highlights two items at once

On `/dashboard/business/dragon-feed`, both **Dashboard** and **Dragon Feed** render active. Root
cause — `src/components/DashboardLayout.tsx:63`:

```ts
const isActiveRoute = (href: string) =>
  location.pathname === href || location.pathname.startsWith(href + '/');
```

Evaluated per item. Each role's Dashboard item points at the bare role root `/dashboard/business`
(`navConfig.ts:50`), a prefix of **all ~26** registered business child routes — so Dashboard was
wrongly lit on *every* business page. Dragon Feed is just where it was noticed.

The identical expression was copy-pasted, with no shared helper and no test coverage, into
`DashboardLayout.tsx:63`, `MobileBottomNav.tsx:18`, and `MobileTopNav.tsx:31` — so the mobile drawer
double-highlighted too, and the bottom nav lit "Home" alongside Campaigns / Messages / Profile.

### 1.2 The DragonFeed is thin and unlabelled

Reported: unclear when there is new content; media is not tagged; almost no filters; nothing
indicates what is hot or how many views; video is not distinguished from images.

**Root cause: a feed item is not a row.** `DragonFeedGrid` → `useUniqueCreatorPortfolio` reads
`creator_profiles.portfolio_urls`, a bare `text[]`. A feed item is a *string in an array*.

| Symptom | Mechanism |
|---|---|
| No "new" signal | Order is `sort(() => Math.random() - 0.5)` (`useUniqueCreatorPortfolio.ts:116`) — reshuffled on every mount |
| No tags | No tag column. "All Types" filters only `image`/`video`, from the file extension |
| No views / hot | Never instrumented. `dragonshare_engagement` has the columns and **0 rows, 0 readers, 0 writers** |
| Video unclear | No poster, no duration, no label — a 16px `<Play>` icon (`FeedTile.tsx:55`) |
| Desktop feels bare | `FeedTile` renders **no attribution at all**. Mobile `FeedPost` has a creator header |

### 1.3 Verified prod state (2026-08-07)

- Feed supply: **2 creators / 8 items** — matches the "8 items found" in the report.
- Blocked by the opt-in default: **3 more creators / 26 more items**, all `is_completed` and
  `profile_visibility='public'`, held back solely by `allow_portfolio_in_feed = false`.
- Of 15 creator profiles: 4 have the flag true (2 with media), **11 have it false** (9 completed +
  2 incomplete). Of those 11, **3 have portfolio media** — those 3 are the 26 items. The prompt in
  §4 targets the **9 completed, public** creators; only 3 of them change the item count today.
- `allow_portfolio_in_feed` defaults `false` in the DB *and* `useCreatorProfileForm.ts:70`. Its only
  UI is a switch inside a collapsed Settings accordion (`CreatorSettingsSections.tsx:302`).
- Measured social views platform-wide: **3 rows** in `content_performance` (4,145 views).

## 2. Goals / non-goals

**Goals.** Every item states what it is, when it arrived, and how it is doing — using only numbers
we can stand behind. A meaningful filter. 4x the content. Exactly one nav item highlighted.

**Non-goals.** Social/platform view counts (not honestly sourceable — §5.5). Per-item AI tags
(§5.3 ships the free skills filter instead). Merging `dragonshare_posts` (§6). Pagination.

## 3. Part 1 — Sidebar active state — SHIPPED

`src/lib/navActive.ts` exposes one pure helper:

```ts
export function activeNavHref(pathname: string, hrefs: string[]): string | null
```

**Longest match wins.** Plain exact matching would be the opposite regression — My Campaigns must
STAY lit on `/campaigns/:id`. Longest-match preserves that and is self-maintaining: nesting a new
route later needs no `exact` flag. All three consumers adopt it; the duplicated expression is gone.
`MobileTopNav` flattens hrefs across **all** drawer sections (the role root and its children live in
different sections, so a per-section match would still double-light) and memoizes `sections`.

9 unit tests in `src/lib/navActive.test.ts`.

**Flagged, not fixed:** the Analytics nav item points at `/dashboard/analytics` for **all three**
roles (`navConfig.ts:60/76/99`) while a separate `/dashboard/brand/analytics` route exists
(`App.tsx:281`). On that URL nothing highlights correctly. Needs a founder call on the intended
target. **Expected non-regression:** `creatorSidebarNav` has no Dragon Feed entry (only the drawer
does, `navConfig.ts:230`), so on `/dashboard/creator/dragon-feed` the sidebar lights "Dashboard" —
correct under the new rule, though visually similar to the reported bug. Do not file as a regression.

## 4. Part 2 — Supply

Portfolio visibility is a real consent decision, so it is **asked visibly**, never flipped silently.
**No migration touches any existing `allow_portfolio_in_feed` value.**

1. **Onboarding asks it**, defaulted to Yes. Critically, `OnboardingWizard.tsx:198` upserts
   `creator_profiles` **directly** and never goes through `useCreatorProfileForm` — so changing that
   hook's default alone would do nothing for onboarding creators. The wizard got its own visible
   `Switch` and its own explicit `allow_portfolio_in_feed` write. It rides on the existing **bio**
   step rather than adding a step — an extra step would cost keystrokes against the North Star.
2. **`useCreatorProfileForm.ts:70` is deliberately left at `false`.** Flipping it would create a
   retroactive-consent bug: `CreatorSettings.tsx:44` `handleFieldBlur` submits the **entire**
   `formData` on any field blur with **no `isLoaded` guard**, so a creator who blurs a field before
   their profile finishes loading would have the form's initial defaults written over their stored
   values — silently turning a stored `false` into `true`. Onboarding is the real provisioning path
   and now asks visibly, so the default buys nothing worth that risk.
3. **One-time prompt** for existing creators who have work but are opted out — `FeedOptInCard` on
   the creator dashboard, backed by `useFeedOptIn`. It is **self-limiting**: `shouldPrompt` requires
   `allow_portfolio_in_feed === false`, so opting in removes it permanently with no dismissal state
   to persist. "Not now" is a per-device `localStorage` flag. The `first_run_missions` mechanism was
   evaluated and **rejected** — `completeMission` early-returns once `completed_at` is set
   (`useFirstRunMissions.ts:62`), so a dismissal after first-run completion would never persist.
   The prompt is also gated on the creator having portfolio media and being publicly visible:
   asking someone with an empty portfolio to publish nothing is noise.
4. **Settings switch moved from "Privacy" to "Portfolio."** It was filed as a privacy toggle, but
   for a creator it is a *discovery* decision — and being buried under a collapsed Privacy accordion
   is why creators were absent from the feed by default rather than by choice. Relabelled from
   "Show portfolio in discover feed" to "Show my work in the Dragon Feed" (the feed's actual name).
5. **Defense in depth:** added `.eq('profile_visibility', 'public')` to
   `useUniqueCreatorPortfolio.ts`. RLS already enforces it for client queries, but the project rule
   is to re-assert it — a future service-role path would bypass RLS.

**Outcome is consent-dependent:** 8 → up to 34 items, only if all three creators with media accept.

## 5. Part 3 — Feed uplift

### 5.0 Why there is no new table (revision from v1)

v1 proposed a `feed_items` table. Spec review plus direct verification killed it:

- **It would have silently broken two live surfaces.** The current item id is the composite
  `${creator.id}-${url}` (`useUniqueCreatorPortfolio.ts:91`), and that exact string is persisted as
  `analytics_events.event_data.content_id` by `useFeedLike.ts:60`. **Two consumers decode it by
  string-stripping the creator-id prefix** to recover the URL — `useBusinessActivity.ts:82` (the
  Inspiration page) and `useInspirationStrip.ts:66` (the dashboard strip). A uuid item id makes
  `portfolio.find(u => u === urlPart)` return undefined, and both surfaces **drop the item with no
  error**. Every existing like would orphan and every new like would be invisible.
- **It had no lifecycle contract.** `portfolio_urls` is rewritten as a whole array on every profile
  save (`useCreatorProfileSubmit.ts:90`); there is no per-upload event. Nothing specified who
  inserts a row on upload or deletes one on removal — so a creator removing a portfolio item would
  leave it live in the feed forever. A consent regression inside a consent-motivated change.
- **It was not needed.** Verified on prod: **34 of 34** portfolio items resolve to a
  `storage.objects` row in `profile-assets` with a real `created_at` (**0 external URLs**). A
  genuine per-item upload timestamp already exists. v1's `published_at_estimated` workaround — sort
  by a date too rough to display — was solving a problem that does not exist.

So: **derive, don't duplicate.** The item id, and `portfolio_urls` as the single source of truth,
both stay exactly as they are. Nothing breaks.

### 5.1 Real dates and ordering

`useUniqueCreatorPortfolio` additionally calls `supabase.storage.from('profile-assets').list()` on
each creator's folder (one call per creator, ~5 today — the hook already loops creators to sign
URLs) and joins `created_at` onto each item by path.

- Sort **newest first**. **Delete the `Math.random()` shuffle** — a feed cannot signal "new" while
  it reshuffles on every load.
- Fallback for an item with no matching storage object: fall back to array position
  (`PortfolioUpload.tsx:92` appends, so array order is upload order), then to the end. Render no
  date when the timestamp is unknown rather than guessing.

### 5.2 "New content"

- A **NEW** badge on items whose `created_at` is later than the viewer's last visit, plus an
  "N new" count in the header. Last-visit marker in `localStorage`, per user id.
- First-ever visit shows no NEW badges (everything would be "new", which is noise).

### 5.3 Filtering — creator skills

`creator_profiles.skills` already rides on every feed item (`PortfolioMedia.skills`), is already
fetched, and is already rendered as chips on creator search rows — but has **never** been used as a
filter. It becomes the filter vocabulary: zero new storage, honest, ships now.

- Chip row on the `AppChip` kit, alongside the existing image/video type filter.
- Chips are derived from the skills actually present in the loaded feed, so no empty chips.
- **Search-mode interaction:** `DragonFeedGrid.tsx:36` swaps the grid for a creator list when
  `searchActive` and hides the type filter (`:110`). Skill chips follow the same rule — hidden in
  search mode, and `clearFilters` resets them.

Per-item AI tagging is explicitly deferred: it needs an edge function, model routing through
`_shared/cost-ledger.ts`, a controlled vocabulary, and a backfill for the 34 existing items.

### 5.4 Presentation

- **Video:** duration badge from the browser's own `loadedmetadata` event (no server-side probe, no
  new column), plus a larger, clearer play affordance replacing the 16px corner icon. A true poster
  frame is **not** attempted — nothing in the codebase generates thumbnails, and `preload="metadata"`
  already yields a first frame.
- **Desktop attribution:** creator avatar + name on the tile, so the grid stops being an anonymous
  wall of squares. Mobile `FeedPost` already has this.
- `DragonFeedCard.tsx` (dead, 303 lines, zero importers) is the donor for the badge treatment, then
  deleted.

### 5.5 Views — honest, instrumented now, displayed when meaningful

Social view counts are unavailable (3 measured posts platform-wide). Displaying invented numbers is
exactly what PR #368 ([[Honest Analytics]]) exists to prevent.

- **Instrument now:** a `dragon_feed_view` row in `analytics_events` on lightbox open, keyed by the
  **existing** composite `content_id` — the same key likes already use. No new table, no id change.
  Deduped per user per item per day, client-side against a `localStorage` day-stamped set (a
  best-effort counter, not a billing ledger; stated as such rather than over-engineered).
- **Display gated:** view/like counts render only once an item clears a minimum sample size, mirroring
  `MIN_POSTS_FOR_SIGNAL`. Below it, no number is shown at all — never a "0 views" that reads as dead.
- **"Hot" is deferred with the ranking, not faked.** Its v1 formula included boost dollars, which are
  structurally **zero** for portfolio items (boosts attach only to `dragonshare_posts`, the deferred
  source). A blend that silently drops a term is the wrong shape for a spec citing honest analytics.
  Revisit once view data exists.

## 6. Deferred — phase 2: DragonShare posts in the feed

`dragonshare_posts` has **no public SELECT policy**: reads are `creator_id = auth.uid()`,
`status='verified' AND target_org_id IN (get_user_org_ids())`, or admin. A post is content a creator
made **for one specific business** (`target_org_id NOT NULL`). Copying those rows into a cross-tenant
feed would show Business A's paid content to Business B — the bug class found six times in this
codebase in two days.

Two facts shape the eventual fix, both verified on prod:

- **The media file is already world-readable.** Bucket `dragonshare-content` is `public = true` with
  an unconditional public SELECT policy. Surfacing the *file* is not new exposure; surfacing the
  **association** (this creator made this for this business), the caption/hashtags, and the
  discoverability **is**.
- **No consent flag exists.** No `share_to_feed` / `is_public` / `opt_in` on `dragonshare_posts` or
  `organizations`. The existing `landing-clips` edge function treats *"a business paid to boost it"*
  as implicit consent to place the video on the anonymous homepage; neither party is asked.

**Founder decision (2026-08-07):** creator opts in (their craft), **business can veto** (their venue,
they paid). Default off, asked at boost time. Needs a consent column plus its own RLS policy — note
that predicate is business-consent-based and will **not** generalize from the portfolio one.

## 7. Out of scope — unverified leads to file separately

**None of these were verified**; each needs its own check before anyone acts on it.

- `donny-dragonshare-score/index.ts:44-48` reads a post by `post_id` with the service-role key and
  *appears* not to check the caller's membership in `target_org_id` — IDOR-shaped.
- `donny-orchestrator/agents/dragonshare.ts:71-76` *appears* to omit `status='verified'`, unlike the
  `donny-chat` equivalent. Same-tenant only, so not a leak, but a divergence from the RLS contract.
- `landing-clips` is deployed and publicly callable but orphaned — its only consumer sits behind
  `LANDING_VIDEO_BACKDROP_ENABLED = false`.
- **Creator Settings saves stale form state.** `CreatorSettings.tsx:44` `handleFieldBlur` submits
  the whole `formData` on any blur with no `isLoaded` guard, while `useCreatorProfileForm` seeds
  every field with empty-string/false defaults and `setFormDataFromProfile` fills them
  asynchronously. Blurring a field before the profile loads should therefore overwrite stored
  values (bio, location, rates) with blanks. **Observed in code, not reproduced** — needs a repro
  before anyone changes it, but it is why §4.2 declines to touch that default.

## 8. Verification

- `npm run build`, `npm run typecheck`, `npm run lint`
- `npx vitest run src/lib/navActive.test.ts src/lib/feedOrdering.test.ts` — trust "N passed", not the
  exit code (~103 pre-existing file failures are expected in nested worktrees)
- **Nav:** visit `/dashboard/business/dragon-feed`, `/campaigns`, `/campaigns/:id`, `/settings` and
  the bare root — **exactly one** sidebar item teal on each; repeat in the mobile drawer and bottom
  nav under 768px. `/dashboard/creator/dragon-feed` lighting Dashboard is expected (§3).
- **Ordering:** reload the feed 3x — order is **identical** each time (the shuffle is gone) and
  newest-first.
- **Supply:** a creator who toggles `allow_portfolio_in_feed` on appears in the feed within one
  reload; toggling off removes them. (The 8 → 34 jump is consent-dependent and not merge-testable.)
- **Skills filter:** selecting a chip narrows to that skill; chips reset via Clear; chips are hidden
  in search mode.
- **Video:** tiles show a duration badge once metadata loads, and the play affordance is legible.
- **NEW:** badge appears only on items newer than the stored last-visit marker; a first-ever visit
  shows none.
- **Views:** opening an item writes exactly one `dragon_feed_view` per user per item per day; counts
  stay hidden below the sample-size gate.
- No RLS/policy/migration change in this branch → no `data-exposure-reviewer` gate required, but
  `codex review --base main` still runs before the PR.
- Post-merge: `verify-prod` on both viewports, console clean.
