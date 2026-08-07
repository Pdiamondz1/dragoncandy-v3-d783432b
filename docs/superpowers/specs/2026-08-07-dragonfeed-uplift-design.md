# DragonFeed uplift + sidebar double-active fix — design

- **Date:** 2026-08-07
- **Branch:** `worktree-dc-improvements-16`
- **Status:** approved (founder), not yet implemented

## 1. Problem

Two issues reported together from the business dashboard.

### 1.1 The sidebar highlights two items at once

On `/dashboard/business/dragon-feed`, both **Dashboard** and **Dragon Feed** render in the active
teal/bold state. Root cause — `src/components/DashboardLayout.tsx:63`:

```ts
const isActiveRoute = (href: string) =>
  location.pathname === href || location.pathname.startsWith(href + '/');
```

The Dashboard item's href is the bare role root `/dashboard/business` (`navConfig.ts:50`), which is
a prefix of **all 26** registered business child routes. So Dashboard is wrongly lit on *every*
business page — Dragon Feed is just where it was noticed.

The identical expression is copy-pasted, with no shared helper and no test coverage, into:

| File | Line |
|---|---|
| `src/components/DashboardLayout.tsx` | 63 |
| `src/components/MobileBottomNav.tsx` | 18 |
| `src/components/MobileTopNav.tsx` | 31 |

So the mobile drawer shows the same double-highlight, and the bottom nav lights "Home" alongside
Campaigns / Messages / Profile.

### 1.2 The DragonFeed is thin and unlabelled

Reported: unclear when there is new content; media is not tagged; almost no filters; nothing
indicates what is hot or how many views; video is not distinguished from images.

**All five share one root cause: a feed item is not a row.** `DragonFeedGrid` →
`useUniqueCreatorPortfolio` reads `creator_profiles.portfolio_urls`, a bare `text[]`. A feed item is
a *string in an array* — no id, no timestamp, no owner record, no counters, nowhere to put a tag.

| Symptom | Mechanism |
|---|---|
| No "new" signal | No per-item timestamp. Order is `sort(() => Math.random() - 0.5)` (`useUniqueCreatorPortfolio.ts:116`) — reshuffled on every mount |
| No tags | No tag column. "All Types" filters only `image`/`video`, derived from the file extension |
| No views / hot | Never instrumented. `dragonshare_engagement` has view/like/reach columns and **0 rows, 0 readers, 0 writers** |
| Video unclear | No `poster`, no duration, no label — a 16px `<Play>` icon (`FeedTile.tsx:55`) |
| Desktop feels bare | `FeedTile` renders **no attribution at all**. Mobile `FeedPost` has a creator header; desktop is an anonymous wall of squares |

### 1.3 Verified prod state (2026-08-07)

- Feed supply: **2 creators / 8 items**. Matches the "8 items found" in the report.
- Blocked by the opt-in default: **3 more creators / 26 more items**, all `is_completed` and
  `profile_visibility='public'`, held back solely by `allow_portfolio_in_feed = false`.
- That flag defaults `false` in the DB *and* in `useCreatorProfileForm.ts:70`. Its only UI is a
  switch inside a collapsed Settings accordion (`CreatorSettingsSections.tsx:302`); onboarding never
  asks. 11 of 15 creators never saw it.
- Measured social views platform-wide: **3 rows** in `content_performance` (4,145 views total);
  `social_post_log` has 1 verified row.

## 2. Goals / non-goals

**Goals.** Every feed item states what it is, when it arrived, and how it is doing — using only
numbers we can stand behind. Meaningful filters. 4x the content. Exactly one nav item highlighted.

**Non-goals.** Social/platform view counts (not honestly sourceable — see §5). Merging
`dragonshare_posts` into the feed (deferred to phase 2 — see §6). Infinite scroll / pagination
(the current `.limit(50)` ceiling is not binding at 34 items).

## 3. Part 1 — Sidebar active state

**Longest-match-wins**, in one shared pure helper. Self-maintaining: no per-item `exact` flags to
remember when routes are added later.

New `src/lib/navActive.ts`:

```ts
/** Active = the LONGEST nav href matching the path. */
export function activeNavHref(pathname: string, hrefs: string[]): string | null {
  return hrefs
    .filter(h => pathname === h || pathname.startsWith(h + '/'))
    .reduce<string | null>((best, h) => (!best || h.length > best.length ? h : best), null);
}
```

| Path | Matching hrefs | Active |
|---|---|---|
| `/dashboard/business/dragon-feed` | root + dragon-feed | **Dragon Feed** only |
| `/dashboard/business/campaigns/123` | root + campaigns | **My Campaigns** — parent stays lit on detail pages, deliberately preserved |
| `/dashboard/business` | root only | **Dashboard** |

All three consumers adopt it; the duplicated expression is deleted. Tests in
`src/lib/navActive.test.ts` cover the three rows above plus the creator `campaigns` vs
`my-campaigns` non-collision, which must keep working.

**Flagged, not fixed:** brand's Analytics nav points at `/dashboard/analytics` (`navConfig.ts:76`)
while a `/dashboard/brand/analytics` route exists (`App.tsx:281`). On that URL nothing highlights
correctly. Needs a founder call on the intended target before changing.

## 4. Part 2 — Supply

Portfolio visibility is a real consent decision, so it is **asked visibly** rather than flipped
silently on creators' behalf.

1. **Onboarding asks it**, defaulted to Yes: *"Show your work in the Dragon Feed so businesses can
   find you?"* — a visible, reversible choice at the moment a creator wants to be hired. Change the
   `useCreatorProfileForm.ts:70` default and surface the field in the creator onboarding step.
2. **One-time prompt** for the 9 existing completed public creators who never saw it.
3. **Lift the Settings switch** out of the collapsed accordion so opting out stays easy.
4. **Defense in depth:** add `.eq('profile_visibility', 'public')` to
   `useUniqueCreatorPortfolio.ts:53`. RLS already enforces it for client queries, but the project
   rule is to re-assert it — a future service-role path would bypass RLS.

Expected: **8 → ~34 items**, no new schema.

## 5. Part 3 — `feed_items`

One table is the feed's item contract, so both content sources can flow into it later: one card,
one ranking, one filter set — not two parallel systems.

```
feed_items
  id           uuid pk
  creator_id   uuid not null            -- profiles(id)
  source       text not null            -- 'portfolio' | 'dragonshare'
  source_id    uuid                     -- dragonshare_posts.id when source='dragonshare'
  media_url    text not null
  media_type   text not null            -- 'image' | 'video'
  poster_url   text
  duration_seconds int
  tags         text[] not null default '{}'
  view_count   int  not null default 0
  like_count   int  not null default 0
  published_at timestamptz not null default now()
  published_at_estimated boolean not null default false
  created_at / updated_at
```

**RLS.** SELECT for `authenticated` gated on the owning creator still being publicly visible and
opted in (mirrors the existing feed predicate); creator manages own rows; no client INSERT of
`view_count`/`like_count` — those move only through the RPC in §5.3.

### 5.1 Backfill and the `published_at` honesty problem

Backfill one row per existing `portfolio_urls` entry, seeding `published_at` from
`creator_profiles.updated_at`.

**Verified:** `creator_profiles` is **not** affected by the `handle_updated_at()` stub documented in
`DATABASE_SCHEMA.md` — it carries no such trigger (only `auto_generate_profile_slug` and
`sync_profile_name_from_creator_profile`), and its values are genuinely varied on prod, set by the
application layer. So it is usable.

But it is the **profile's** last-update time, not the **item's** creation time — editing a bio bumps
it. Therefore backfilled rows set `published_at_estimated = true`, and the UI:

- **sorts** by `published_at` (a stable, sensible order — a large improvement over reshuffling), but
- **never renders a date** on an estimated row, and
- **never marks an estimated row NEW.**

Only genuine post-migration uploads get displayed dates and NEW badges. The estimate self-heals as
real items accumulate.

### 5.2 Presentation

- **Video:** real `poster` frame, duration badge, "Video" label — replacing the 16px play icon.
  `DragonFeedCard.tsx` (dead code, 303 lines, zero importers) already carries the Play/Pause and
  "Video"/"Photo" badge treatment; harvest it, then delete the file.
- **Desktop attribution:** creator avatar + name on the tile so the grid stops being anonymous.
  Mobile `FeedPost` already does this.
- **Tags:** replace the lone "All Types" dropdown with tag chips + type, on the `AppChip` kit.
  Creators do not type tags (North Star: *less typing = more margin*) — **Donny auto-tags on
  upload**, creator can correct. `dragonshare_posts.hashtags[]` establishes the vocabulary to reuse.
- **New:** sort `published_at` desc; **delete the `Math.random()` shuffle** — a feed cannot signal
  "new" while it reshuffles every load. NEW badge + "N new" header count against a per-user
  last-visit marker (localStorage is sufficient for v1).

### 5.3 "Hot" and views — the honest version

Social view counts are unavailable (3 measured posts platform-wide). Displaying invented counts is
exactly what PR #368 ([[Honest Analytics]]) was built to prevent. Instead instrument **what we own**:

- **In-app feed views** — `feed_items.view_count`, incremented via a SECURITY DEFINER RPC on
  lightbox open, deduped per user per item per day. True from day one, and the more useful signal
  for a business browsing DragonCandy anyway.
- **"Hot"** = a transparent blend of in-app views + likes + boost dollars + recency.
- Where a genuinely measured social number exists (`content_performance`), render it **labelled with
  its source and N**. Never blend measured and in-app numbers into one unlabelled figure.

## 6. Deferred — phase 2: DragonShare posts in the feed

`dragonshare_posts` has **no public SELECT policy**. Reads are `creator_id = auth.uid()`,
`status='verified' AND target_org_id IN (get_user_org_ids())`, or admin. A post is content a creator
made **for one specific business** (`target_org_id NOT NULL`). Copying those rows into a cross-tenant
feed as-is would show Business A's paid content to Business B — the bug class found six times in this
codebase in two days.

Two facts shape the eventual fix, both verified against prod:

- **The media file is already world-readable.** Bucket `dragonshare-content` is `public = true` with
  an unconditional `Public can read dragonshare content` SELECT policy for role `public`. Surfacing
  the *file* is not new exposure; surfacing the **association** (this creator made this for this
  business), the caption/hashtags, and the discoverability **is**.
- **No consent flag exists.** No `share_to_feed` / `is_public` / `opt_in` on `dragonshare_posts` or
  `organizations`. The existing `landing-clips` edge function treats *"a business paid to boost it"*
  as implicit consent to place the video on the anonymous homepage; neither party is asked.

**Founder decision (2026-08-07):** creator opts in (it is their craft), **business can veto** (it is
their venue and they paid). Default off, asked at boost time. Requires a consent column plus a
matching RLS policy — publication as a decision, mirroring `allow_portfolio_in_feed`.

## 7. Out of scope — unverified leads to file separately

Surfaced while tracing the tenant boundary. **None of these were verified**; each needs its own
check before anyone acts on it.

- `donny-dragonshare-score/index.ts:44-48` reads a post by `post_id` with the service-role key and
  *appears* not to check the caller's membership in `target_org_id` — IDOR-shaped.
- `donny-orchestrator/agents/dragonshare.ts:71-76` *appears* to omit `status='verified'`, unlike the
  `donny-chat` equivalent. Same-tenant only, so not a leak, but a divergence from the RLS contract.
- `landing-clips` is deployed and publicly callable but orphaned — its only consumer sits behind
  `LANDING_VIDEO_BACKDROP_ENABLED = false`.

## 8. Verification

- `npm run build`, `npm run typecheck`, `npm run lint`
- `npx vitest run src/lib/navActive.test.ts` — trust "N passed", not the exit code (~103
  pre-existing file failures are expected in nested worktrees)
- **Nav:** visit `/dashboard/business/dragon-feed`, `/campaigns`, `/campaigns/:id`, `/settings` and
  the bare root — confirm **exactly one** sidebar item is teal on each; repeat in the mobile drawer
  and bottom nav under 768px
- **Feed:** item count rises after the opt-in change; video tiles show poster + duration; order is
  stable across reloads; NEW appears only on genuine post-migration items, never on backfilled ones
- **Migration before code** — apply `feed_items` to prod before merging anything that reads it
- RLS/policy changes → `data-exposure-reviewer` subagent, then `codex review --base main`
- Post-merge: `verify-prod` on both viewports, console clean
