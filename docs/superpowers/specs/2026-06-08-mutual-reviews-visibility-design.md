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
  has_counterpart_review(reviewer_id, reviewee_id, collaboration_id, sponsorship_id)
  OR now() >= reveal_at
)
```

The reviewer always sees their own review regardless of reveal state.

**Counterpart match is an exact id-swap**, not a review-type pairing. The
counterpart of review `R` is the row where:

```
cp.reviewer_id = R.reviewee_id          -- the other party
AND cp.reviewee_id = R.reviewer_id      -- reviewing me back
AND cp.collaboration_id IS NOT DISTINCT FROM R.collaboration_id
AND cp.sponsorship_id   IS NOT DISTINCT FROM R.sponsorship_id   -- same project
AND cp.id <> R.id
```

This is unambiguous for every bidirectional pair — `business_to_creator` ↔
`creator_to_business` (same `collaboration_id`) and `brand_to_business` ↔
`business_to_brand` (same `sponsorship_id`) — without needing to enumerate
review-type opposites. The id-swap also self-protects against a (disallowed)
self-review row matching itself.

### 5.3 `has_counterpart_review` — SECURITY DEFINER function

The counterpart check is an `EXISTS` subquery **against `project_reviews`
itself**. If that subquery runs inside the base-table RLS SELECT policy under
the caller's own RLS, it recurses. Therefore the predicate is wrapped in a
`SECURITY DEFINER` SQL function `has_counterpart_review(...)` that bypasses RLS
for the inner lookup only — exactly the pattern the codebase already uses for
`has_role()` (see DATABASE_SCHEMA.md, `user_roles`). The function:

- takes the four identifying columns of the originating review,
- returns `boolean` (does a counterpart row exist),
- is `STABLE` and `SECURITY DEFINER` with a locked `search_path`,
- leaks nothing: it returns only a boolean, never review content.

Both the RLS policy (§5.5) and the view (§5.4) call this one function.

### 5.4 `public_project_reviews` view

A new Postgres view computes the reveal predicate (via
`has_counterpart_review`) and exposes the reviewer's profile fields and a
project title **as plain columns** (not PostgREST FK embeds — see hook note
below). It `LEFT JOIN`s **both** project paths:

- `collaboration_id → campaign_collaborations → campaigns(title)`
- `sponsorship_id → campaign_sponsorships → campaigns(title)` (whichever the
  sponsorship references)

Project title is `coalesce(collab_campaign_title, sponsorship_campaign_title,
'Project')`. Using `LEFT JOIN`s (not `INNER`) ensures sponsorship reviews —
which have a null `collaboration_id` — are **not** dropped from the view.

**Every public surface reads this view, never the raw table.** This
concentrates the entire double-blind display rule in one place — no cron, no
edge function.

**Hook rewrite (not just a repoint).** `useReviews` currently relies on
PostgREST FK embedding (`profiles!project_reviews_reviewer_id_fkey(...)` and the
nested `campaign_collaborations(...)`), which does **not** work against a view
with no declared relationships. The view therefore flattens those into plain
columns (`reviewer_full_name`, `reviewer_avatar_url`, `project_title`), and
`useReviews` / `useReviewStats` are rewritten to select those columns directly.
The `.eq('is_public', true)` filter is removed (the view already enforces the
full reveal predicate). The hooks' public signatures and return shapes are
preserved so call sites are unaffected.

### 5.5 RLS (security, not just display)

Client-side filtering is insufficient for a real double-blind — the
counterparty must not be able to query the hidden text early. Base-table
`project_reviews` SELECT policy:

```
auth.uid() = reviewer_id          -- you always see your own
OR ( is_public
     AND ( has_counterpart_review(reviewer_id, reviewee_id,
                                  collaboration_id, sponsorship_id)
           OR now() >= reveal_at ) )
```

The `EXISTS` lives inside `has_counterpart_review` (SECURITY DEFINER, §5.3), so
the policy does not recurse. The view inherits the caller's RLS. Verify with
`get_advisors` (security lint) after applying the migration — expect no new
RLS warnings and no recursion.

### 5.6 Denormalized aggregate trigger

A trigger on `project_reviews` (insert/update) recomputes the **reviewee's**
aggregate, counting **only revealed reviews** and **only the review type that
feeds that profile's headline number**:

- `creator_profiles.average_rating` / `total_reviews` ← counts **only
  `business_to_creator`** (how businesses rate this creator).
- `business_profiles.average_rating` / `total_reviews` ← counts **only
  `creator_to_business`** (how creators rate this restaurant — the exact signal
  the creator→restaurant decision surfaces read).

This keeps each headline number semantically clean: a restaurant's rating is
"rated by creators," never blended with `brand_to_business`. Brand-as-reviewee
(`business_to_brand`) and brand profiles are **intentionally not aggregated** in
this build (no surface reads them); the trigger's `WHERE` clause is explicit
about the two counted types so this is a deliberate scope, not an accident. A
future DragonShare or brand signal gets its own column/filter rather than
polluting these.

**Known limitation:** a review that reveals purely by the 14-day timeout
(counterpart never reviewed) produces no write event, so the denormalized number
on **browse/list cards** can lag until the next write touches that reviewee.
**Mitigation:** profile pages and detail modals show **live** stats via
`useReviewStats` (computed from the view), so the authoritative number is always
correct where it matters most. Accepted tradeoff to avoid a nightly recompute /
cron.

**Per-surface data source (explicit):** browse/list surfaces (`CreatorCard`,
restaurant browse cards, `ApplicationsListFixed` rows) read the **denormalized
columns** — fast, single query, possibly briefly stale on timeout-reveal.
Profile pages and detail modals (`PublicCreatorProfile`, `PublicBusinessProfile`,
`CreatorProfileModal`) read **live** stats from the view. `InlineRating` accepts
the numbers as props so each surface picks its own source.

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

## 11. Resolved during review

- **Star color: pink (`dc-pink-accent`) everywhere** — locked. `InlineRating`
  uses pink; `CreatorCard`'s current yellow ★ is normalized to pink. (No longer
  an open question — §7 already assumes this.)
- **Reveal timeout: 14 days** — locked as the default. Cheap to revisit later
  (it's a single `interval` literal in the §5.2 insert trigger); not a blocker.

## 12. Future considerations (out of scope, schema-ready)

- Lightweight one-tap DragonShare signal (separate column/filter, not the
  double-blind flow).
- Brand-as-reviewee aggregates, if a surface ever needs to show how businesses
  rate brands.
