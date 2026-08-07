# Session — honest analytics, the drafts editor, and the edge-function typecheck gate

Date: 2026-08-06 (into 2026-08-07 UTC)
Branch: `fix/outstand-proxy-write-authz` (PR #368) — same branch as the proxy
authorization work, because everything sat behind one GitHub Actions outage.

## Context

After closing four cross-tenant authorization holes (see
[[Cross-Tenant Proxy Authorization]]), the founder asked what was next. The
honest answer was that none of the day's work was what they originally asked
for: this all descended from *"deeper analytics so Donny can consult the
business"*, and the day had gone into the measurement foundation and then the
security holes that foundation exposed.

Picked, in order: two small real bugs (#45, #42), then the first slice of
post-level analytics.

## 1 — Drafts "Edit" did nothing (#45)

`DraftsTab`'s Edit button called `onSwitchTab?.('compose')` and nothing else. It
dropped the draft's content on the floor — you landed on an EMPTY compose form —
and left the original row behind, so finishing the edit would have published a
duplicate and stranded the draft.

**Loading the draft into Compose would not have fixed it.** Compose publishes a
NEW provider post via the SDK's `createPost`; it is not, and cannot be, a draft
editor. A draft is a `donny_scheduled_posts` row, so editing it is an UPDATE on
that row. Added `updateDraft` + an edit dialog (caption / hashtags /
scheduled_at). Media is behind the provider upload flow, and the dialog says so
rather than leaving it to be discovered.

Hashtag parsing became a tested pure function, `parseHashtagInput`, deliberately
placed beside its inverse `composeCaption` — a round-trip that disagrees with
itself is how an edit silently mangles what it meant to preserve. It emits the
leading `#` because that is what is actually stored (verified against prod rows,
uniformly `#DragonDashed`-style) and uses no `\w`/ASCII class, because
`#CaféLife` is a real stored value an ASCII class would truncate to `#Caf`.

### The bigger bug underneath it

Codex then found that **hashtags were never published at all** — pre-existing.
`DonnyProvider.publishDraft` selected `caption, media_urls, platform,
content_type, campaign_id, metadata` (no `hashtags`) and posted
`content: draft.caption ?? ''`; `useDraftPosts.scheduleDraft` did the same. So
every tag Donny has ever generated was dropped at publish while the draft card
displayed it. The new dialog merely started *promising* otherwise. Both paths now
compose through the existing `composeCaption`.

## 2 — CI type-checked none of the 99 edge functions (#42)

`npm run typecheck` is `tsc -p tsconfig.app.json`, whose `include` is `["src"]`.
All **99** Deno functions were checked by nothing, for the life of the project.
`deno check` finds **128** real errors.

Checking everything fails today, and a gate that cannot pass gets disabled within
a week. So: check the **66** that pass, list the **33** that do not in
`supabase/functions/.typecheck-ignore`, and PRINT that list in full on every run
— a skip nobody can see is indistinguishable from coverage, which is the exact
failure being fixed. The list only shrinks; the script also fails if it names a
function that no longer exists, so the debt cannot rot into looking bigger than
it is. Added as a step inside the existing `verify` job, so it inherits the
branch protection already in place.

**Three errors were fixed to reach a passing gate, and all three were real:**

- `_shared/stripe-customer.ts` — `customerId` was `string | undefined` at the
  write, so a missing id would have been **persisted** into the authoritative
  `organizations.stripe_customer_id` and returned to payment callers as a
  customer id.
- `donny-apply-pitch` — annotated the `campaigns(title)` embed as an object while
  supabase-js infers an array. If the array shape is what arrives,
  `p.campaigns?.title` is undefined for every row and the pitch prompt silently
  degrades to "none yet", losing the creator's track record. Reads both shapes.
- `manage-internal-users` — `.map()` over an `Any` row yields `any[][]` not
  tuples, so `new Map()` inferred `Map<unknown, unknown>` and widened
  `full_name` to `{}`.

### The trap this cost

**`deno check --node-modules-dir=auto` from the repo root takes over the
project's `node_modules`.** It installs its own tree and prunes what it does not
recognise — it deleted `@types/node` and broke `npm run typecheck`, `lint` and
the tests until `npm ci` was re-run. I hit this locally; in CI it would have
silently poisoned every step after it, because I had placed the step before lint
and tests. Deno now runs from an isolated `.deno-typecheck/` directory whose
`deno.json` anchors its node_modules there. Verified: gate passes, root
`node_modules` keeps `@types/node`, no `.deno` tree appears.

## 3 — The analytics tab was showing three things that carried no information

All three verified in the code, not from memory:

| component | claimed | actually computed |
|---|---|---|
| `TopPosts` | "Top Posts" | sorted by `publishedAt` DESC; **no metric read anywhere** |
| `PostingHeatmap` | "Best Posting Times", legend Low→High **engagement** | `counts[slot][day]++` — post **volume** |
| `FollowerChart` | "Follower Growth" | bars plot **absolute** follower counts |

`PostingHeatmap` was the most harmful. Unlike a mislabelled chart it drove a
decision, and a circular one: post every Tuesday at 9am and it confidently
recommends Tuesday at 9am, with a colour ramp. That is precisely the decision
Donny exists to inform.

Meanwhile `content_performance` had been accumulating since June with **zero
readers anywhere in `src/`** — every per-post metric captured was written and
never shown.

### What the prod data actually says

Checked before designing anything:

- `content_performance`: **9 rows across 3 posts**, all from June, all
  `verified_at = false`
- of those, **6 are all-zero** — fabricated by the pre-fix capture job when the
  provider returned nothing — and 3 carry genuine numbers (1,388 views, 5 likes)
- `social_post_log`: 4 rows, **1 verified** — today's `ei1xc`, which has no
  metrics yet because its first milestone has not elapsed

So there is currently **no post with trustworthy metrics at all**, and the
fabricated zeros are still in the table: the spine fix stopped *writing* them but
never removed the ones already written. Anything reading the table naively would
average real 1,388-view data against fake zeros.

**Founder decision:** exclude in code rather than delete from prod. The hook
filters on `social_post_log.verified_at IS NOT NULL` — the pipeline's own rule —
which excludes all 9 legacy rows. The zeros stay as history and can never render.

### The fix, and why the threshold is the substance

Each heading now matches what is computed, and real engagement drives the ranking
once there is enough of it. But swapping a fake metric for a real one computed
over one or two posts would repeat the mistake in a new costume: the number true,
the conclusion still worthless. So every claim is gated on `MIN_POSTS_FOR_SIGNAL`
(3, matching the weekly brief's existing precedent), always states its N, and
below the threshold says how many more posts are needed instead of going quietly
blank — a silent empty state and a genuine absence of data look identical, and
only one is honest.

Ranking uses interactions (likes+comments+shares+saves) and **excludes views**: a
view is delivery, not response, and including it lets one autoplayed video
outrank a post people actually replied to.

### Two review findings, both treated as blocking

Codex called both P2; under-counting a creator's best post and labelling an empty
grid as insight are the failure modes this work exists to end.

- **Cross-posted posts lost their other platforms.** The unique key is
  `(outstand_post_id, platform, milestone)`, so a fanned-out post has one row per
  platform. Collapsing straight to post id kept whichever platform won the
  comparison and discarded the rest, so a cross-posted hit could rank BELOW a
  single-platform post with fewer total interactions. Now two stages: best
  milestone per (post, platform), then SUM across platforms.
- **The threshold was account-wide while the view is platform-filtered.**
  `AnalyticsTab` passes `filteredPosts`. Select a platform with no measurements
  while three other posts are measured, and both components flip into ranked
  mode: `TopPosts` discards every post it was given, and the heatmap titles an
  all-zero grid "Best Posting Times" — reintroducing the exact defect being
  removed. `signalForVisible()` intersects measurements with the ids on screen.

A third round caught a **literal NUL byte** in the composite key, which made
`src/lib/postPerformance.ts` **binary to git** (`git diff --numstat` reported
`- -`), silently breaking future diffs and reviews of that file. Replaced with an
escaped ` `.

## Process notes worth keeping

- **GitHub Actions was down ~5 hours** (major outage from 15:22 UTC). Two PRs sat
  un-mergeable for reasons entirely outside the repo, and a required check that
  queued 15 minutes and was cancelled reports as `fail` in `gh pr checks`. It
  recovered at ~00:53 UTC and all checks passed.
- **PR #367 was folded into #368 by cherry-pick** rather than merged separately:
  it touched exactly the same five docs files and would have conflicted.
- Because of the outage this branch accumulated four unrelated topics (proxy
  authz, an INSERT lockdown, a CI gate, analytics). Not ideal; worth splitting
  next time if CI is healthy.
