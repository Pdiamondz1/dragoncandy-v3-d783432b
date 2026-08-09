---
title: Honest Analytics
type: concept
created: 2026-08-06
updated: 2026-08-06
sources: [2026-08-06-honest-analytics-and-edge-typecheck.md]
tags: [analytics, outstand, ui, measurement, donny]
---
# Honest Analytics

The rule for anything on this platform that presents a number as insight:

**A claim may not outrun its evidence — and when the evidence is absent, say so
rather than rendering something that looks like an answer.**

This exists because the analytics tab shipped three components that were
confidently wrong, and because the fix for that is *not* simply "use a real
metric".

## What was wrong

| component | claimed | actually computed |
|---|---|---|
| `TopPosts` | "Top Posts" | sorted by `publishedAt` DESC — **no metric read anywhere** |
| `PostingHeatmap` | "Best Posting Times", legend Low→High **engagement** | `counts[slot][day]++` — post **volume** |
| `FollowerChart` | "Follower Growth" | bars plot **absolute** follower counts |

`PostingHeatmap` was the worst, and instructively so. A mislabelled chart is
merely misleading; this one **drove a decision**, and a circular one — post every
Tuesday at 9am and it recommends Tuesday at 9am, with a confident colour ramp.
It is exactly the decision [[Donny]] exists to inform, answered by feeding the
user's own habit back to them as advice.

`FollowerChart` is the subtle one: the tallest bar reads as fastest-growing,
which is usually the *opposite* of the truth, since the largest account is
typically the slowest mover.

Meanwhile `content_performance` had been accumulating since June with **zero
readers anywhere in `src/`**. Every per-post metric captured was written and
never shown.

## Why a real metric is not, by itself, the fix

Replacing a fake number with a true one computed over one or two posts repeats
the mistake in a new costume: **the number is true and the conclusion is still
worthless.** N=1 is a fact, not a pattern.

So every claim is gated:

- `MIN_POSTS_FOR_SIGNAL = 3`, matching the precedent the weekly brief already
  set.
- The N is **always stated on screen**. A ranking whose sample size is invisible
  is a claim the reader cannot weigh.
- Below the threshold the UI says **how many more posts are needed** rather than
  going blank. A silent empty state and a genuine absence of data look
  identical, and only one of them is honest.
- The heading always matches the sort. When there is no engagement to rank on,
  the component is called "Recent Posts" and "When You Post" — still useful, and
  no longer lying.

## Load-bearing details, each of which was a bug

- **Interactions exclude views.** A view is delivery, not response. Including it
  lets one autoplayed video outrank a post people actually replied to — the
  opposite of the question a business is asking.
- **Sum across platforms, don't pick one.** The unique key is
  `(outstand_post_id, platform, milestone)`, so a fanned-out post has a row per
  platform. Collapsing straight to post id keeps whichever platform wins the
  comparison and silently discards the rest, so a cross-posted hit can rank
  *below* a weaker single-platform post. Collapse milestones **within** a
  platform first, then sum.
- **Gate on what is on screen, not on the account.** The tab has a platform
  filter. An account-wide verdict lets a filtered view showing only unmeasured
  posts flip into "ranked" mode — the ranking then discards every post present,
  and the heatmap titles an all-zero grid "Best Posting Times". The claim must be
  gated by the evidence *in the thing the user is looking at*.
- **Filter on `verified_at IS NOT NULL`.** This is the same gate
  `content-performance-capture` uses, and it is what keeps **fabricated** rows off
  the screen — see below.

## The fabricated zeros

`content_performance` holds **9 legacy rows across 3 posts**, all from June, none
verified. **Six are all-zero**: the pre-fix capture job wrote a zero measurement
whenever the provider returned nothing. The [[Social Measurement Spine]] fix
stopped *writing* them but never removed the ones already written.

So the table contains real data (1,388 views) sitting beside fake data (0), and
anything reading it naively averages the two. The decision was to **exclude in
code rather than delete from prod**: the `verified_at` filter already excludes all
9, the rows survive as evidence that the old job produced them, and no
irreversible prod deletion was needed.

**Consequence, stated rather than discovered:** as of 2026-08-06 this surface
shows **zero measured posts**. The only verified post published that afternoon
and its first milestone had not elapsed. That is the correct answer, and the UI
says it.

## The rule now binds Donny too (2026-08-09)

The `verified_at` gate and `MIN_POSTS_FOR_SIGNAL` were, until 2026-08-09, properties
of the **screen**. Donny answered the same questions from the same table with neither
— so the chat panel and the Analytics page could disagree about the same account, and
the panel was the one that would have been believed.

Two things closed that, both in [[Donny Social Tools]]:

- **The same inner-join filter**, in both of Donny's `content_performance` reads.
  `!inner` alone only proves the joined row exists; the `.not()` on `verified_at` is
  what proves it is stamped. Note the second read is a **sample-size count**, which is
  the worse of the two places to leak: an unverified row there does not merely add a
  wrong number, it buys the model permission to state a rate as meaningful.

  > **A bar cleared by rows nobody measured is a gate that lies while looking rigorous.**

- **One canonical `MIN_POSTS_FOR_SIGNAL`.** It had drifted into two copies; the edge
  side now has one (`supabase/functions/_shared/social-signal.ts`) that
  `content-strategy-recommend` re-exports, with `src/lib/postPerformance.ts` left as the
  frontend copy behind a pointer comment — `src/` and `supabase/functions/` cannot import
  each other, so two files is the floor, and the pointer is what keeps them one value.

A related trap in the same read, worth stating because the code *ran perfectly*:
`content_performance` rows are **cumulative per milestone**, so summing them roughly
tripled real totals. See [[Donny Social Tools]] for the prod numbers that proved it.

## See Also

- [[Donny Social Tools]] — the same evidence bar applied to Donny's own social answers
- [[Social Measurement Spine]] — the pipeline that produces the data, and the
  `verified_at` rule this filters on
- [[Cross-Tenant Proxy Authorization]] — same session; the same "runs perfectly,
  plausible, wrong" failure mode in a security setting
- [[Verify Before Reporting]] — every claim above was checked against the code
  and against prod rather than taken from notes
