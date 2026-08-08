# Session — DragonFeed uplift + sidebar double-active fix (2026-08-07)

Branch `worktree-dc-improvements-16`. Founder reported two things from the business dashboard:
the sidebar highlighting two items at once, and the DragonFeed being thin — "unclear what happens
when there is new content", untagged media, almost no filters, nothing showing what is hot or how
many views, and unclear video handling.

## 1. The nav bug was on every page, not one

`DashboardLayout.tsx:63` evaluated, per item:

```ts
location.pathname === href || location.pathname.startsWith(href + '/')
```

Each role's Dashboard item points at the bare role root (`/dashboard/business`), which is a prefix
of **all ~26** of that role's child routes — so Dashboard rendered active everywhere. The identical
expression was copy-pasted into `MobileBottomNav.tsx:18` and `MobileTopNav.tsx:31` with no shared
helper and no test, so the drawer double-highlighted and the bottom nav lit "Home" next to
Campaigns / Messages / Profile.

**Fix: longest match wins**, in one pure `activeNavHref()` (`src/lib/navActive.ts`), adopted by all
three. Exact matching would have been the opposite regression — My Campaigns must stay lit on
`/campaigns/:id`. Longest-match preserves that and is self-maintaining: nesting a new route later
needs no `exact` flag. 9 unit tests.

**Reusable lesson:** when "the parent nav item is also highlighted", the fix is not exact-matching,
it is *specificity*. And a duplicated one-liner in three files is a missing helper, not three bugs.

## 2. Every DragonFeed complaint had one root cause

**A feed item is not a row.** The feed reads `creator_profiles.portfolio_urls`, a bare `text[]`, so
an item is a *string in an array* — no id, no timestamp, no counters, nowhere to put a tag. Order
was `sort(() => Math.random() - 0.5)`, reshuffled every mount, so nothing could be "new" relative to
anything.

### The table that got cut

The first design added a `feed_items` table. Verification killed it — all three reasons are worth
keeping:

1. **It would have silently broken two live surfaces.** The item id is the composite
   `${creator.id}-${url}`, and that exact string is persisted as
   `analytics_events.event_data.content_id` by `useFeedLike.ts:60`. **Two consumers decode it by
   string-stripping the creator-id prefix** to recover the URL — `useBusinessActivity.ts:82` (the
   Inspiration page) and `useInspirationStrip.ts:66` (the dashboard strip). A uuid id makes
   `portfolio.find(u => u === urlPart)` return `undefined`, and both surfaces **drop the item with
   no error**. Every existing like would orphan and every new like would be invisible.
2. **No lifecycle contract.** `portfolio_urls` is rewritten as a whole array on every profile save
   (`useCreatorProfileSubmit.ts:90`) — there is no per-upload event. Nothing would have deleted a
   feed row when a creator removed an item, so removed work would stay live forever: a consent
   regression inside a consent-motivated change.
3. **It was not needed.** Verified on prod: **34 of 34** portfolio items resolve to a
   `storage.objects` row in `profile-assets` with a real `created_at` (**0 external URLs**). A
   genuine per-item timestamp already existed.

**Reusable lesson: derive, don't duplicate.** A composite id that other code *parses* is a public
contract, even when it looks like an implementation detail — grep for consumers before changing an
id scheme. And check whether the fact you need is already recorded somewhere (here: storage
metadata) before adding a table to record it.

### What shipped instead

- **Dates/order** — join `storage.objects.created_at` via one `list()` per creator (same
  shared-promise shape the avatar already used). **Deliberately NOT** parsed from the
  `${kind}-${Date.now()}` millis that `uploadProfileAsset.ts:109` bakes into the filename: that
  value is client-supplied, and a creator writing to their own folder could craft a future
  timestamp to pin their work to the top of the feed permanently. The storage timestamp is
  server-assigned. Unknown timestamps sort to the end and render no date rather than guessing.
- **NEW badge + "N new since your last visit"** against a per-device last-visit marker. A
  first-ever visit badges nothing — badging everything is noise, not signal.
- **Skill chips** from `creator_profiles.skills` — already fetched, already rendered on creator
  search rows, **never used as a filter**. Zero new storage. Chips derive from skills present in
  the loaded feed so none can match nothing. Per-item AI tagging deferred (needs an edge function,
  `_shared/cost-ledger.ts` routing, a controlled vocabulary, and a backfill).
- **Video** — duration badge from the browser's own `loadedmetadata`, no server probe and no new
  column. A true poster frame was **not** attempted: nothing in the codebase generates thumbnails.
- **Desktop attribution** — `FeedTile` rendered *nothing* before; mobile `FeedPost` always had a
  creator header.
- **Views instrumented, display gated.** Keyed by the **same** `content_id` likes use, deduped per
  user/item/day in localStorage (a best-effort engagement counter, explicitly not a billing
  ledger). Counts stay off screen until they clear a sample-size gate — there are **3** measured
  posts platform-wide in `content_performance`, so any social-sourced view number would be
  fabricated. Follows [[Honest Analytics]] (#368). **"Hot" was deferred rather than faked:** its
  draft formula included boost dollars, which are structurally **zero** for portfolio items
  (boosts attach only to `dragonshare_posts`), so the blend would have silently dropped a term.

## 3. Supply was the cheapest win and the real bottleneck

Prod, verified: the feed showed **2 creators / 8 items**. Three more creators with **26 more items**
were `is_completed`, `profile_visibility='public'`, and blocked *only* by
`allow_portfolio_in_feed = false` — a flag that defaults false and whose sole UI was a switch inside
a **collapsed Settings accordion**, filed under *Privacy*, never asked at onboarding. 11 of 15
creators never saw it. Being absent from the feed was almost never a decision.

- **Onboarding now asks it**, defaulted Yes, on the existing bio step (no extra step = no extra
  keystrokes). Critically, `OnboardingWizard.tsx:198` upserts `creator_profiles` **directly** and
  never goes through `useCreatorProfileForm`, so changing that hook's default would have done
  nothing for onboarding creators — the wizard needed its own control and its own write.
- **The Settings switch moved Privacy → Portfolio** and was relabelled to the feed's actual name.
  For a creator this is a *discovery* decision, not a privacy one.
- **A self-limiting dashboard card** (`FeedOptInCard` + `useFeedOptIn`) prompts creators who have
  work but are opted out. `shouldPrompt` requires the flag to still be false, so opting in removes
  it permanently with no dismissal state to persist. The `first_run_missions` mechanism was
  evaluated and **rejected**: `completeMission` early-returns once `completed_at` is set
  (`useFirstRunMissions.ts:62`), so a later dismissal would never stick.

**Deliberately NOT done: flipping `useCreatorProfileForm.ts:70` to `true`.** `CreatorSettings.tsx:44`
`handleFieldBlur` submits the **entire** `formData` on any field blur with **no `isLoaded` guard**,
while the form seeds every field with empty defaults and fills them asynchronously. Flipping the
default would let an existing creator's stored `false` be silently overwritten — the exact
retroactive consent flip the change was supposed to avoid.

**Reusable lesson:** a consent flag that defaults off and lives somewhere nobody looks produces
"nobody opted in", which reads as disinterest but is really a discovery bug. And before changing a
default, check whether any code path writes the whole form back.

## 4. Why the DragonShare merge was deferred

The founder's first instinct was to merge `dragonshare_posts` into the feed. That table has **no
public SELECT policy** — reads are `creator_id = auth.uid()`, `status='verified' AND target_org_id
IN (get_user_org_ids())`, or admin. A post is content a creator made **for one specific business**.
Merging as-is would show Business A's paid content to Business B: the class of bug found six times
in this codebase in two days ([[Cross-Tenant Proxy Authorization]]).

Two facts, both verified on prod, shape the eventual fix:

- **The media file is already world-readable.** Bucket `dragonshare-content` is `public = true` with
  an unconditional `Public can read dragonshare content` SELECT policy for role `public`. So
  surfacing the *file* is not new exposure — surfacing the **association** (this creator made this
  for this business), the caption/hashtags, and the discoverability is.
- **No consent flag exists anywhere.** No `share_to_feed` / `is_public` / `opt_in` on
  `dragonshare_posts` or `organizations`. The `landing-clips` edge function currently treats *"a
  business paid to boost it"* as implicit consent to put the video on the anonymous homepage;
  neither the creator nor the business is ever asked.

**Founder decision:** creator opts in (their craft), **business can veto** (their venue, they paid),
default off, asked at boost time. Note the resulting RLS predicate is business-consent-based and
will **not** generalize from the portfolio one.

## Unverified leads filed (do not act on without checking)

- `donny-dragonshare-score/index.ts:44-48` reads a post by `post_id` with the service-role key and
  *appears* not to check the caller's membership in `target_org_id` — IDOR-shaped.
- `donny-orchestrator/agents/dragonshare.ts:71-76` *appears* to omit `status='verified'`, unlike the
  `donny-chat` equivalent. Same-tenant only, so not a leak, but a divergence from the RLS contract.
- `landing-clips` is deployed and publicly callable but orphaned — its only consumer sits behind
  `LANDING_VIDEO_BACKDROP_ENABLED = false`.
- **Creator Settings saves stale form state** (`CreatorSettings.tsx:44`) — see §3.

## Testing note

`OnboardingWizard.test.tsx` failed on a cold vitest cache (import alone took 63s against a 5s test
timeout) and passed on a warm one, with the change in place both times. Verified by reverting only
the two touched files, re-running, and restoring — worth remembering before attributing a timeout
in this repo's nested worktrees to a code change.

## Spec

`docs/superpowers/specs/2026-08-07-dragonfeed-uplift-design.md` (v2 — v1's `feed_items` table cut).
