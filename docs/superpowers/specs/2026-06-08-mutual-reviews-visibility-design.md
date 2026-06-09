# Mutual Reviews & Rating Visibility — Design

> Status: Approved design, ready for implementation planning
> Date: 2026-06-08
> Author: Claude Code + Dame (brainstorming session)

## 1. Problem

Creators and restaurants cannot meaningfully see each other's star ratings and
reviews at the moments they decide whether to work together. This influences
both sides' willingness to collaborate, yet the signal is effectively invisible.

Investigation showed the review system is **mostly built already** — the gap is
narrower (and different) than "build reviews":

- **Data + components exist.** `project_reviews` table (bidirectional review
  types, sub-ratings), `useReviews` / `useReviewStats` hooks, and
  `ReviewsList` / `RatingStats` / `StarRating` / `ReviewCard` /
  `PublicProfileReviews` components. Both `PublicCreatorProfile` and
  `PublicBusinessProfile` already render a Reviews section; `CreatorCard`
  already shows a ★ average.
- **Reviews barely get created, and the loop is one-sided.**
  `RatingPromptManager` (the post-project "Rate your experience" nudge) is
  mounted on `CreatorDashboard` but **not** on `BusinessDashboard`. Restaurants
  are essentially never prompted to rate creators, so `business_to_creator`
  reviews almost never exist → every creator reads as "New."
- **No rating at the in-app decision moment.** The in-app `CreatorProfileModal`
  may not show reviews; creators browsing restaurants
  (`DragonShareBrowseRestaurants`, `RestaurantProfileCard`) see **no rating at
  all**. `business_profiles` isn't even queried for an average rating, and the
  public business header shows *industry* where a star should be.

## 2. Goals

- Close the review-creation loop on **both** sides so ratings actually
  accumulate (the reciprocity engine).
- Surface the star rating + reviews at **every** point where one role evaluates
  the other, with a tap-through to full reviews.
- Produce **honest** signal via a double-blind reveal (no retaliation, no
  tit-for-tat inflation).
- Add the **least** new infrastructure: no cron, no new edge function, no new
  deploy surface (respects the Lovable edge-function deploy gap).

## 3. Non-goals

- **DragonShare boosts do not trigger reviews in this build.** DragonShare is
  the deliberately-fast profit engine (boost-or-pass, instant download); a
  double-blind mutual-review ceremony is too heavy for a $5–$500 boost and cuts
  against "less typing = more margin." The relationship is also thinner (the
  creator already made the content organically). The schema is designed so a
  *lightweight* one-tap DragonShare signal can plug in later without rework.
- No moderation/admin review queue (trust-then-flag stays the platform default).
- No changes to the existing rating sub-dimensions or the `RatingModal` form
  itself beyond its success-state copy.

## 4. Decisions (locked during brainstorming)

| Decision | Choice |
|---|---|
| Reveal model | **Double-blind**: a review is hidden until the counterpart submits, or 14 days pass |
| Reveal mechanism | **Read-time / derived** (no cron, no background flip) |
| Business rating storage | **Denormalized** `average_rating` / `total_reviews` on `business_profiles`, mirroring `creator_profiles` |
| Triggering relationships | **Campaign collaborations** + **Brand sponsorships** (DragonShare deferred) |
| Reveal timeout | **14 days** from review submission |

## 5. Design

### 5.1 Data model

**`project_reviews` — add two nullable columns** (additive only; never drop/rename):

- `reveal_at timestamptz` — set on insert to `now() + interval '14 days'`.
  The timeout half of the double-blind.
- `is_public` — **kept as-is**; meaning narrows to "not hidden by
  moderation/choice." It no longer means "show this now." Reveal is layered on
  top.

**Unique constraints** (duplicate-review backstop):

- `unique (reviewer_id, collaboration_id)`
- `unique (reviewer_id, sponsorship_id)`

Both `collaboration_id` and `sponsorship_id` are nullable; the constraints apply
per non-null pairing (a review references exactly one of the two).

**`business_profiles` — add two nullable columns** (mirror `creator_profiles`):

- `average_rating numeric` (nullable)
- `total_reviews integer` (nullable)

### 5.2 The reveal predicate (single source of truth)

A review is **publicly visible** when:

```
is_public = true
AND (
  EXISTS (counterpart review for the same collaboration_id / sponsorship_id
          written by the reviewee about the reviewer)
  OR now() >= reveal_at
)
```

The reviewer always sees their own review regardless of reveal state.

### 5.3 `public_project_reviews` view

A new Postgres view computes the reveal predicate and joins the reviewer's
profile (`full_name`, `avatar_url`) plus the campaign title (as today). **Every
public surface reads this view, never the raw table.** This concentrates the
entire double-blind display rule in one place — no cron, no edge function.

`useReviews` and `useReviewStats` are repointed from `project_reviews` to
`public_project_reviews`. Their public signatures are unchanged; the
`.eq('is_public', true)` filter is removed (the view already enforces it).

### 5.4 RLS (security, not just display)

Client-side filtering is insufficient for a real double-blind — the
counterparty must not be able to query the hidden text early. Base-table
`project_reviews` SELECT policy:

```
auth.uid() = reviewer_id          -- you always see your own
OR <reveal predicate is true>     -- otherwise only revealed rows
```

The view inherits the caller's RLS. Verify with `get_advisors` (security lint)
after applying the migration.

### 5.5 Denormalized aggregate trigger

A trigger on `project_reviews` (insert/update) recomputes the **reviewee's**
aggregate — `creator_profiles` or `business_profiles` depending on the
reviewee's role — counting **only revealed reviews**. The common reveal path
(counterpart submits) is a write, so the trigger keeps browse numbers fresh
for it.

**Known limitation:** a review that reveals purely by the 14-day timeout
(counterpart never reviewed) produces no write event, so the denormalized number
on **browse cards** can lag until the next write touches that reviewee.
**Mitigation:** profile pages show **live** stats via `useReviewStats` (computed
from the view), so the authoritative number is always correct where it matters
most. Accepted tradeoff to avoid a nightly recompute / cron.

### 5.6 Reveal clock set server-side

A `BEFORE INSERT` trigger sets
`NEW.reveal_at := COALESCE(NEW.reveal_at, now() + interval '14 days')` so the
client and the existing `RatingModal` need no changes to populate it.

## 6. Creation loop (both sides)

The `RatingPromptManager` is already role-aware (`useProjectCompletion` returns
completed projects for the logged-in user and derives `business_to_creator` vs
`creator_to_business` from `user_role`). The fix is mounting it where it's
missing:

- **Mount `RatingPromptManager` on `BusinessDashboard`** → restaurants get the
  post-campaign nudge → `business_to_creator` reviews finally get created.
- **Mount the sponsorship prompt on the business side** (mirror of
  `BrandSponsorships`' `SponsorshipRatingPromptManager`) → `business_to_brand`
  reviews get created, not just the brand→business direction.

**Double-blind expectation-setting (the one place it needs explaining):**

- `RatingModal` success state: *"Your review is in. It goes live once [name]
  reviews you too — or automatically in 14 days."*
- `ReviewsManagement` → "Given" tab: a pending (not-yet-revealed) review shows a
  small badge *"⏳ Hidden until they review back"* so a submitted-but-invisible
  review doesn't read as a bug. Uses brand-adjacent colors (no gray, per design
  system).

## 7. Display surfaces

**New shared component `InlineRating`** — renders `★ 4.8 · 12 reviews`, or a
`New` pill when `total_reviews = 0`. Uses the design-system pink star
(`dc-pink-accent`) consistently. Standardizing this normalizes `CreatorCard`'s
current yellow ★ to pink.

| Surface | Evaluator → evaluated | Change |
|---|---|---|
| `CreatorCard` (browse) | Business → creator | Swap existing ★ to `InlineRating` |
| `CreatorProfileModal` (browse + campaign applications) | Business → creator | **Add** rating header + compact reviews list |
| `ApplicationsListFixed` | Business → applicants | **Add** ★ per applicant row |
| `RestaurantProfileCard`, `DragonShareBrowseRestaurants` | Creator → restaurant | **Add** ★ from `business_profiles.average_rating` |
| `PublicBusinessProfile` header | Creator → restaurant | **Add** ★ + count (query the new columns) |
| `BusinessProfileStrip` / `CampaignHero` | Creator → restaurant (on a campaign) | **Add** ★ |
| `PublicCreatorProfile` | Anyone → creator | Already complete — no change |
| `ReviewsManagement` | Self-service, both roles | Add the pending badge (§6); already role-aware |

The two genuinely new capabilities: (a) the **restaurant side gets a headline
rating at all**, and (b) **reviews appear inside in-app modals**, not only on
the standalone public pages.

**Viewport discipline:** desktop changes use `lg:`/`xl:` only; mobile changes
use base classes only. Test both viewports per surface.

## 8. Edge cases & error handling

- **No reviews yet (`total_reviews = 0` / null):** render the `New` pill, never
  `★ 0.0`. Applies to every surface.
- **Only one side reviewed, within 14 days:** counterpart's view shows nothing
  (hidden); reviewer sees their own with the pending badge.
- **One side reviewed, 14 days elapsed:** that review reveals via timeout even
  though the other never reviewed.
- **Duplicate submission:** blocked by unique constraint; UI pre-checks via
  `useHasReviewedCollaboration`. Surface a friendly "already reviewed" state, not
  a raw DB error.
- **Supabase query/mutation errors:** every new query and mutation handles
  loading + error states (per repo conventions); aggregate reads degrade to the
  `New` pill rather than erroring the card.
- **Denormalized aggregate staleness (timeout reveal):** documented in §5.5;
  profile pages always show live numbers.

## 9. Testing

- **Unit (Vitest):** reveal-predicate logic and `InlineRating` rendering
  (New vs rating, pluralization, pink star). Co-located.
- **DB-level:** verify RLS hides a counterpart's unrevealed review from the
  other party; verify reveal on counterpart-submit and on timeout; verify
  unique constraints reject duplicates; verify the aggregate trigger updates the
  correct profile table by reviewee role.
- **Security lint:** `get_advisors` after migration — no new RLS warnings.
- **Manual / E2E:** complete a campaign as both roles, submit one review,
  confirm it's hidden to the counterpart; submit the second, confirm both
  reveal; confirm ratings appear on each listed surface in both desktop and
  mobile viewports.
- **Production verification after deploy:** screenshot affected pages at
  dragoncandy.io, check console for errors, test both viewports (per session
  discipline).

## 10. Rollout notes

- Schema migration is additive (new nullable columns, view, trigger, RLS,
  constraints) — no drops/renames.
- `src/integrations/supabase/client.ts` is Lovable-autogenerated; regenerate
  types after the migration and watch for regen reversions.
- Frontend deploys via push to `main`; the migration + RLS + trigger + view must
  be applied to Supabase separately (edge-function/DB deploy gap). Apply to
  staging (`mhffqrawgizhprbobcta`) first, validate, then production.
- No live Stripe keys involved; no auth-logic changes.

## 11. Open questions

- Confirm star color normalization: standardize on pink (`dc-pink-accent`)
  everywhere, or keep `CreatorCard`'s existing yellow ★?
- Is 14 days the right reveal timeout, or shorter (e.g. 7) given pre-revenue,
  low-volume reality?
