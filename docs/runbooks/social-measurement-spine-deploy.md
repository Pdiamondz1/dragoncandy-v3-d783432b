# Social measurement spine — deploy order and hard blockers

Written 2026-08-05 from the whole-branch review of `feat/social-measurement-spine`. **Read this
before deploying `outstand-webhook`.** One finding here is a genuine data-correctness blocker that
no per-task review could see, because it lives in the seam between two tasks that each passed.

## Required order

| # | Step | Why this position |
|---|------|-------------------|
| 1 | **Merge the branch** | Frontend changes are additive; the applied grant lockdown already covers both client insert paths. |
| 2 | **Apply** `20260805171523_content_performance_format.sql` | The deployed capture job already writes `format`. Until this lands, any insert it attempts fails on an unknown column. |
| 3 | **Apply** `20260805194725_content_capture_cron_timeout.sql` | Pins the cron to 90 s. Until then pg_net's 5 s default fires first and Task 7's failure signal is unobservable. |
| 4 | **Redeploy** `content-performance-capture` | **Prod is one commit behind** — it is running `fbce9168`, which lacks the 15 s fetch abort from `2ebfbd9e`. |
| 5 | **Fix BLOCKER 1 below** | Must precede step 6, or the first multi-platform post is mis-recorded. |
| 6 | **Deploy `outstand-webhook` LAST** | This is what starts stamping `verified_at`, which is what makes the capture job select anything at all. |

**No ordering causes permanent data loss** — milestones are only marked captured on a successful
insert, so a wrong order self-heals once corrected. That property is worth preserving in any
future change here.

## BLOCKER 1 — per-platform rows collapse into one `content_performance` record

**The defect.** Task 5 made `social_post_log` one row per published *account*
(`UNIQUE (outstand_post_id, platform)`). `content_performance`'s dedupe key is still
`uniq_content_perf_post_milestone (outstand_post_id, milestone)` — **no platform**.

`PostingPlanReview.tsx` publishes one Outstand post to *every* connected account. So a business
with Facebook + Instagram + YouTube produces three `social_post_log` rows sharing one
`outstand_post_id`. The capture job iterates them ordered by `id`:

- the first inserts `(post, '24h')`, labelled with whichever platform sorted first;
- the other two find `captured = {'24h'}`, compute `due = []`, and hit
  `if (due.length === 0) { skipped++; continue; }` — **the same counter as "nothing due yet"**.

Two platforms vanish into a bucket that means "healthy no-op".

**It is worse than a drop.** The metrics stored come from `aggregated_metrics`, which Outstand sums
**across all accounts**. So the surviving row carries the whole post's engagement while claiming a
single platform. `content-strategy-recommend/index.ts:111` groups by `(platform, post_type)` — it
will attribute every network's engagement to one, and report the others as having no measured posts
at all. Per-platform figures do exist in the payload's `metrics_by_account`, and survive only
inside the untouched `raw` column.

**Why no per-task review caught it.** Task 5 (per-platform grain) and Task 6 (`format` passthrough)
each passed their own gate. The contradiction only exists between them.

**Not yet observed.** Zero `social_post_log` rows currently carry `verified_at`, so this path has
never executed. It will execute on the first post after step 6.

**The fix is a decision, not a patch.** Either extend the `content_performance` unique key to
include `platform` and store per-account metrics from `metrics_by_account`, or keep one row per
post and stop labelling it with a platform. The first preserves the question "which platform
works?"; the second abandons it. This is the same decision as the `platform` dual-meaning below —
decide once, not twice.

## Related, same root — decide together

**`platform` carries three vocabularies.** `donny_scheduled_posts.platform` has a CHECK of
`instagram|tiktok|youtube|twitter|facebook`; the webhook now derives platform from Outstand's
`socialAccounts[].network` (documented values include `threads` and `linkedin`, which the product
does not model); and `useSponsorshipAmplification.ts:42` writes an Outstand **account id** into the
same column. Today these coincide only because prod holds just instagram/youtube/facebook — by
luck, with no mapping layer and no test. If Outstand's network for X is `x` while
`DonnyProvider.tsx:228` writes `twitter`, the upsert never conflicts and one physical post yields
two rows, one verified and one not.

**Amplification rows can never be verified.** Because that same line writes an account id where the
webhook writes a network name, the webhook's upsert can never match an amplification row, so
`verified_at` is never stamped on it. Each one is then counted and warned about by the capture job
every run for 8 days, with no action available. A chronic un-actionable warning is how a real one
gets ignored — the exact desensitisation this sub-project exists to prevent.

## Still open, tracked elsewhere

The live cross-tenant metric read — `social_post_log`'s INSERT policy constrains only `user_id`, so
any authenticated user can name any `outstand_post_id` — is **not** fixed by this branch. The
`verified_at` gate closes blind enumeration and the quota-burn angle; it does not close the targeted
case. Only server-established provider-account ownership does.
→ `docs/wiki/raw/sessions/2026-08-05-outstand-cross-tenant-metric-read.md`
