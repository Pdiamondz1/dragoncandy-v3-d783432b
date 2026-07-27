# Synthetic content pass — design

**Date:** 2026-07-27
**Status:** proposed
**Extends:** `docs/superpowers/specs/2026-07-26-synthetic-avatar-pool-design.md` (merged as PR #351)
**Related:** [[Living Synthetic Marketplace]] · [[Synthetic Weight Engine]] · [[Dragon Feed]]

## 1. Problem

The founder browsed prod as a real user and the marketplace read as empty. Two screenshots, two
different causes — neither of which the avatar pool fixes. Measured on prod 2026-07-27:

| Surface | What the user saw | Reality | Cause |
|-|-|-|-|
| Find Restaurants | "30 restaurants" | **520 eligible** (509 synthetic + 11 real) | `search_restaurants(…, result_limit integer DEFAULT 30)` — a hard cap. The data is there; the client never asks for more. |
| DragonFeed | "24 items found", blank cards | **26 posts exist platform-wide** (21 photo / 5 video; 16 synthetic) | The feed is nearly empty, and all 16 synthetic posts point at **160-byte 8×8 JPEG** objects, so each card renders as a blank block. |
| Creator cards | Empty bodies | `portfolio_urls` empty on 1,500 of 1,516 | Work samples were never seeded. |

**The shape of the problem: the marketplace has 2,000 profiles and almost no content.** The 1,976
browse-only depth profiles have zero posts — content was only ever created for the ~24 interactive
bots, and even those got the placeholder square.

This is also the moment to be precise about a number that caused confusion: the 50K/200K DAU figures
were a **load-capacity proof** (bots minted per run, torn down after — `botla` is 0 today), never a
claim of real users. Real accounts: ~40. Nothing in this spec changes that; it addresses *liveness*,
which is what a visitor actually perceives.

## 2. Goals / non-goals

**Goals**
- Every synthetic creator shows **3 work samples**, so a profile card is not an empty box.
- DragonFeed shows a populated, plausibly-accumulated feed instead of 24 blank tiles.
- Find Restaurants surfaces the population that already exists rather than a hard 30.
- All of it reversible by one command, registry-scoped, and incapable of reaching real users or the
  marketing site.

**Non-goals**
- Video content. Posts are photos; the feed's video lane stays as-is (5 real posts).
- Any change to real users' portfolios, posts, or businesses.
- Making synthetic content eligible for the public landing hero (explicitly prevented — §4.4).
- Engagement simulation (likes/comments). Rows exist for it; populating them is a separate question.

## 3. Decisions already settled with the founder

1. **Photoreal**, consistent with the faces decision, with the impersonation trade-off accepted.
2. **Budget ≈ $37** — chosen over a ~$24 option specifically to cut image reuse from ~7.5× to ~2.5×,
   because visible repetition across a 24-city marketplace is the tell that it is synthetic.
3. **Pool-by-reference**, reusing the merged avatar-pool machinery rather than a parallel system.

## 4. Architecture

### 4.1 Two pools, one mechanism

`sim/avatars/` already provides deterministic assignment, checkpointed generation, registry-scoped
apply, and explicit purge. This pass adds a **second pool** rather than a second system:

```
profile-assets/synthetic/faces/NNNN.<ext>     1,500  (PR #351, unchanged)
profile-assets/synthetic/work/NNNN.<ext>      1,800  (new)
```

Both are durable, shared, and referenced — never copied per user. The properties that follow are the
same ones the faces pool earns: teardown cannot orphan them, and a re-seed after a cohort purge is
free.

### 4.2 Work-pool composition

Subjects are **venue- and food-centric**, sampled across a matrix: plated dishes, drinks and
cocktails, dining-room interiors, storefront exteriors, kitchen prep, patios, flat-lays, and
close-up detail shots — varied by cuisine cue, time of day, and lighting.

**Human-focused shots are deliberately excluded.** A "creator portfolio" full of people would
generate a second, unmanaged population of faces outside the faces pool, with the same impersonation
questions and none of the accounting. Incidental hands or a blurred figure in a dining room are
acceptable; portraits are not.

### 4.3 Portfolio assignment

Three samples per creator: `poolIndex(userId, poolSize)` for the first, then a **stride** derived
from the same hash for the second and third, so one creator's three images are never adjacent
duplicates. 4,500 slots drawn from 1,800 images ≈ **2.5× average reuse**.

Blind assignment stands. Verified 2026-07-27: the seeded skills are near-uniform — `photography`
1,492, `video_editing` 1,491, `ugc_creation` 1,489 — so there is no meaningful niche to match
against, and the pool's own breadth is what makes a sample set plausible.

### 4.4 Feed seed

~500 `dragonshare_posts` rows across depth creators, each referencing a work-pool object.

Column facts verified against prod:
- **NOT NULL:** `creator_id`, `target_org_id`, `content_type` (plus defaulted `status`,
  `boost_status`, `monetization_type`, `submitted_at`, `expires_at`).
- `target_org_id` points at an existing **synthetic** org (520 exist, one per synthetic business).
- `submitted_at` is spread over **60 days** so the feed reads as accumulated activity rather than one
  dump; the feed orders by it descending.
- `expires_at` is set **far out**. Nothing filters on it today (only the TS type mentions it), but
  the column defaults to `now() + 30 days`, which would quietly empty the feed a month later.

**The landing page is protected by construction.** `landing-clips` requires
`status='verified' AND boost_status='boosted' AND content_type IN ('video','reel')` **and** an
inner-joined `dragonshare_boosts` row with status `captured`/`transferred`. Seeded posts are photos,
keep the default `boost_status='available'`, and get **no boost rows** — so they cannot satisfy that
query. This is asserted by a test, not left as an intention.

### 4.5 Restaurant cap

The client passes a larger `result_limit` (**200**) to `search_restaurants`. No migration: the RPC
already accepts the parameter, and the sheet already has a search box plus category chips for
narrowing. 520 rows in one mobile sheet would be a worse experience than 200 plus search, and
infinite scroll is a UI change this pass does not need.

### 4.6 Teardown

The existing `avatars-purge` becomes `content-purge`, covering: both pools, `avatar_url` /
`logo_url` / `profiles.avatar_url`, `portfolio_urls`, and the seeded posts — every write
registry-scoped and prefix-filtered, so it removes exactly what this pass created and nothing else.
Deleting a post also deletes nothing else by cascade that matters: `dragonshare_events` rows written
by the `trg_ds_post_submitted` trigger are cleaned alongside, as the marketplace teardown already
does.

## 5. Cost

| Item | Count | Unit | Total |
|-|-|-|-|
| Faces (PR #351, not yet run) | 1,500 | ~$0.011 | ~$17 |
| Work images | 1,800 | ~$0.011 | ~$20 |
| Feed posts | ~500 | rows only | $0 |
| Restaurant cap | — | code | $0 |
| **Total** | **3,300 images** | | **≈ $36** |

Storage ≈ 400 MB. Re-seeding after a cohort purge stays **$0** — the pools persist.

As with the avatar pool, this is **seed capex, not Donny runtime**, so it is deliberately kept out of
`donny_cost_ledger`: that ledger drives the ≤15%-of-revenue AI kill-switch, and a one-off seeding
charge would trip the `ai-cost-vs-cap` verdict against a cost the cap was never meant to govern.

## 6. Testing

Pure units get real tests; paid and networked edges stay injected, as in PR #351.

- **Portfolio assignment** — determinism, exactly 3 distinct indices per creator, no adjacent
  duplicates, distribution across 1,500 creators, and that the name is never an input.
- **Feed row builder** (pure) — required NOT NULL fields present, `submitted_at` inside the intended
  window and varied, `boost_status` left at `available`, no boost row emitted.
- **Landing exclusion** — a test asserting a seeded post fails the `landing-clips` predicate
  (photo + unboosted), so a future change that would expose synthetic media to the marketing site
  breaks a test rather than shipping.
- **Purge coverage** — every column and prefix this pass writes appears in the purge path; a
  non-synthetic id is never in an update set.
- Generation is injected, so batching, resume, and refusal handling are tested with zero spend.

Prod verification after the run: counts of non-empty `portfolio_urls` and seeded posts; a spot-check
that pool objects are **> 20 KB** (the placeholder was 160 bytes, so byte size is the honest
discriminator); and both-viewport screenshots of DragonFeed, Find Creators, and Find Restaurants.

## 7. Risks

| Risk | Mitigation |
|-|-|
| Visible image repetition | 2.5× average reuse at 1,800 images; stride assignment avoids adjacent repeats within a profile. |
| Synthetic media reaching the landing page | Impossible via the `landing-clips` predicate; asserted by test (§4.4). |
| Feed silently empties later | `expires_at` set far beyond the 30-day default. |
| A write escapes the synthetic cohort | Every write anchored on `synthetic_users` and prefix-filtered, as in PR #351. |
| Spend overrun | `--dry-run` estimate, hard `--limit`, local cache so a re-run never re-pays. |

## 8. Rollback

`content-purge` restores the cohort to its current state: pools deleted, columns nulled, seeded posts
removed. No migration and no schema change, so there is nothing to roll back beyond data this pass
wrote. The restaurant-cap change is a one-line client revert.

## 9. Open questions

None blocking. Deferred: video content for the feed, and engagement simulation
(`dragonshare_engagement` exists but is unpopulated).
