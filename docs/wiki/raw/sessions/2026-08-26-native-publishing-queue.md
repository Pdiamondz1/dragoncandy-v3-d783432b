# Session — native publishing: the Facebook step machine, and one queue for every platform

Date: 2026-08-26
Branch: `feat/instagram-native-publishing` · PR #544 (open)
Range: `bc55e1b6..056195fd`, 21 commits

---

## What shipped

The first direct-API **write** in this project. Until now every direct platform
connector was read-only under the 2026-08-23 scope decision (*Outstand publishes,
direct APIs measure*); this branch adds native publishing for Instagram and
Facebook Pages, and that decision no longer describes those two platforms.

Three layers:

1. **`publish_jobs`** — a shared, platform-agnostic queue with an exactly-once
   guarantee modelled on `pending_balance_flushes` rather than on any read-only
   connector, because publishing is irreversible, public, and must happen once.
2. **Two protocol modules** — `_shared/instagram-publish.ts` and
   `_shared/facebook-publish.ts`. Deliberately separate: Meta's two products do
   not agree about what a post is.
3. **Four edge functions** — `instagram-publish-enqueue` / `-sweep`,
   `facebook-publish-enqueue` / `-sweep`.

Nothing is deployed and no cron is scheduled (verified 2026-08-26: a POST to
`facebook-publish-sweep` returns **404** where the deployed `instagram-insights`
returns **401**, which is the control proving the probe distinguishes the two).
Neither platform has its publish permission approved, so every path fails closed
at the permission gate even once deployed.

---

## The shape of the design

### Publishing is like paying

The marker is written **after** the side effect, never before. `provider_post_id`
comes from the platform, so *"marker set ⇒ it published"* holds by construction.
A pre-claim would leave a job marked published that never posted, or publish
twice.

### One step per tick, not one job per tick

A publish is several calls with an asynchronous transcode in the middle, and **a
lock only helps while it is held**. So each tick advances one job by exactly one
step and hands the claim back. `pg_advisory_xact_lock` releases with its
transaction, long before the platform is called, which is why the rate-limit
count includes **in-flight** work (`claimed`, `needs_review`) and not only
`published` — counting only the latter lets two overlapping sweeps each see the
limit minus one and both publish.

### `needs_review` is the `stuck` contract applied to a feed

Meta's `media_publish` has **no idempotency key** (Stripe has one; this does
not). So `publishing_at` is stamped immediately before the point of no return,
and every ambiguous outcome after it stops for a person rather than retrying.
Three refusals to guess:

1. Meta reports the container already `PUBLISHED` — the only evidence an
   interrupted publish landed.
2. Meta accepts the publish and returns no id — we cannot name what we created.
3. A claim expires with `publishing_at` set — handled in SQL by the janitor.

`PROVEN_NOT_PUBLISHED_CODES` is an **allowlist**, so a new error code defaults to
*ambiguous* (over-escalate to a human) rather than to *safe to retry* (duplicate
post). `rate_limited` is deliberately off it: a 429 can be issued by an edge in
front of Meta after the request was accepted upstream.

---

## Facebook is not Instagram, in five places

Read from Meta's Pages, Video and Page Stories docs rather than inferred from
the sibling that shipped the week before.

| | Instagram | Facebook |
|---|---|---|
| Photo | container → poll → publish | `POST /{page}/photos` — one call |
| Text, no media | impossible | one call |
| Reel | container → poll → publish | upload session on `rupload.facebook.com` |
| Ready signal | `FINISHED` | `ready` — 7 lower-case statuses |
| "Did it already publish?" | `PUBLISHED` | **no equivalent exists** |
| Token | 60 days, dies unrefreshed | Page token, never expires |
| Gates | one permission | permission **and** Page task |

Two of those are load-bearing.

**There is no `PUBLISHED` equivalent.** The ambiguity Instagram lets us settle,
Facebook does not — nothing can ask "did that go out?" after the fact. So
`PROVEN_NOT_PUBLISHED_CODES` does more work here than it does for Instagram: it
is the only thing between an ambiguous answer and a person. A recovery check was
**considered and deliberately not built**, because the fields that might
distinguish a published Reel were not verified against Meta's docs, and a
recovery path that is wrong resolves an ambiguity confidently in the wrong
direction.

**Two independent gates:** `pages_manage_posts` (what the user granted the app)
and `CREATE_CONTENT` (what their Facebook role allows on that Page). Granted by
different people, fixed different ways — reconnecting versus a Page admin
changing a role — so `requirePublishAccess` names *which* is shut. Measured on
the live DragonCandy Page (`1240103162522777`): the task is already held; only
the permission is outstanding.

### Four protocols, so "one step" means four different things

```
feed_text      1 call   marker -> POST /{page}/feed            -> confirm
photo_single   1 call   marker -> POST /{page}/photos          -> confirm
photo_story    2 calls  POST /photos?published=false -> record ref
                        marker -> POST /photo_stories          -> confirm
video_session  3 calls  start + upload -> record ref
                        poll; ready -> marker -> finish        -> confirm
```

**The protocol is derived, never stored.** `validateJobShape` returns it, and
both the enqueue path and the sweep call that same function — so `provider_ref`
needs no discriminator, and the two callers cannot come to disagree about one
job (one validating a photo story while the other runs a Reel).

**The point of no return moves with the protocol.** Instagram's first call always
builds a container and publishes nothing. Two of Facebook's four publish on their
*first* call — a text post has no container to hide behind — so the marker is
stamped in step one for those and step two for the others. The two-step
protocols keep Instagram's safety for the same reason it had it:
`published=false` is not on the feed, and an upload session with no `finish`
publishes nothing.

**`video_session` opens the session AND uploads in one tick**, recording the
video id only once both succeed. The tidier-looking split is a bug: record after
`start` and upload next tick, and a video that never receives bytes sits at
`uploading` for ever — polled and released every tick without ever charging an
attempt, so `MAX_ATTEMPTS` can never end it.

`uploadVideoFromUrl` hands Meta a **`file_url` header** rather than streaming
bytes. Without it an edge function would have to read a 300 MB Reel into a
256 MB heap — works in testing, OOMs on the first real video.

---

## The staging path became shared, because it is the ownership check

`_shared/publish-staging.ts` holds the copy that freezes the approved bytes and
the two-client split that proves the caller owns them:

1. the **caller's own credential** signs the source object — signing requires
   read permission, so Storage RLS makes the ownership decision and we do not
   re-implement it for one of seventeen buckets;
2. the **service role** performs the copy, server-side inside Storage.

Step 2 alone would let any authenticated user name any path in any bucket and
have our credentials publish a stranger's file — the `outstand_post_ownership`
defect one layer up, with a public post instead of a mis-filed metric as the
consequence. Neither half is redundant.

It existed **twice for about an hour**. Two copies of an authorization check is
the #540 shared-helper shape, and a drift there is one platform checking
ownership and the other not. `publish-staging.test.ts` pins *which* credential
does *which* operation, and that test was **proven to fail** by swapping the two
clients in the module.

The copy also freezes the bytes: a reference is a promise about a path, and the
bytes at a path can be replaced after approval.

---

## Codex: sixteen rounds

Nine on this stretch alone. Eight real, one refuted by measurement. The ones
worth keeping:

### A disconnect deleted the posts queued for it — mid-publish included

`ON DELETE CASCADE` on the connection FKs. I first filed this as a storage leak
and **that reading was too narrow**; it came back as a P1 with the half I had
under-weighted:

> The sweep loads the connection, stamps `publishing_at`, calls Meta. The user
> disconnects in another tab. The cascade removes the row. Meta publishes — the
> post is LIVE — and `confirm_publish_job` updates zero rows because there is
> nothing left to update. So does `review_publish_job`, the branch written for
> exactly that failure. A live post whose only trace is a console line.

That is the one outcome the whole design exists to prevent. The quieter half is
also bad: a queued post vanished with **no terminal status**, so nothing ever
told its owner it would not go out.

Fixed with `ON DELETE SET NULL`. The sweep already fails a job whose connection
has gone, naming what happened — that path was simply unreachable, because the
row was deleted before anything could reach it. Now the job reaches `stuck`, and
because `stuck` is the branch that discards staged media, it takes its bytes with
it.

`publish_jobs_one_connection` had to relax to allow both-null, so a **`BEFORE
INSERT` trigger** took over what only has to be true at creation. A CHECK cannot
tell an insert from an update, and this rule is about a **transition**, not a
row — the same split the `guard_*_verification_columns` triggers make.

### Enqueue was not idempotent, and fixing it took three rounds

A lost HTTP response meant a retry made a second post. That took:

- **Round 7** — the key itself, with a `(user_id, idempotency_key)` unique index
  as the referee for concurrent replays. The catch also stopped deleting media on
  an unknown outcome. Note the obvious remedy was *worse*: the discard was
  accidentally buying safety (an orphan job with no media cannot publish), and
  that accident does not cover a Facebook text post, which has no media at all.
- **Round 8** — a reused key returned the other post's job and reported success
  for work it discarded. Fixed with a request fingerprint.
- **Round 9** — **the two fixes cancelled each other out.** `plannedDestinations`
  mints a fresh random batch directory every invocation (by design: two approvals
  of one file are two frozen sets of bytes), and the digest included those paths.
  So every retry of a post *with media* looked like a different post and was
  answered with `idempotency_key_conflict`. Only a Facebook text post still
  worked. Fixed by digesting the **sources** the caller named — stable across
  retries because they are the file the user picked.
- **Round 10** — the replay was recognised only *after* staging, so a retry
  re-copied the media first and a source the user had since deleted answered
  `media_not_found` for a post that was queued and about to publish. Added
  `resolve_publish_idempotency` as a **fast path, not a gate** — the enqueue RPC
  still runs both checks and the unique index is still the referee.

### Why my own verification missed round 9

The prod probe for the key passed the **same** `v_paths` array on both calls,
because it was testing the RPC in isolation. That contract is real and it held.
It is not the contract the *client* sees, and the client never passes the same
paths twice.

**A probe that exercises a function directly can prove the function right and the
feature wrong, and no control inside that probe catches it — the fixture has to
come from where the caller stands.**

### One digest, which surfaced a latent timezone bug

Two callers of one digest is the #540 drift shape, so the md5 moved into
`publish_request_fingerprint`. Writing it down separately exposed the bug in the
inline version: it rendered `p_scheduled_at` through `jsonb_build_object`, and
**the text form of a `timestamptz` depends on the session `TimeZone`**. Two
requests carrying the identical instant would digest differently if their
sessions disagreed — an intermittent false conflict, invisible to any test that
pins the timezone. Now `extract(epoch from ...)`, which is a number.

### A timestamp with no timezone does not name an instant

Related and separate. `parseScheduledAt` originally *normalised* a bare
`2026-09-01T18:00` to one explicit instant, which removed the inconsistency
between layers — and settled it by **guessing**. The guess is the edge runtime's
offset (UTC), so a restaurant in Hoboken asking for six in the evening gets a
post at two in the afternoon.

Now refused. An explicit `Z` or `±HH:MM` is required. The client knows its
timezone; the server cannot and must not invent one. Same principle as
`needs_review` over a retry and `unknown` over a fabricated zero — scheduling was
the last place still picking a plausible answer.

### `published=false` publishes nothing, so that error code was lying

`publishPhoto` raised `published_unknown_id` when Facebook answered 200 with no
id — the same code for a genuinely published photo and for step one of a photo
story, which puts the photo in the Page's library and nothing on the feed. So a
failed **upload** was reported as an ambiguous **live post**, and the job stopped
for ever waiting for someone to check a Page for a story that was never created.
Split into `staged_unknown_id`, which is retryable and on
`PROVEN_NOT_PUBLISHED_CODES` because by construction it belongs there. The
invariant now lives on the **code** rather than on the branch: only a call that
genuinely published may raise `published_unknown_id`.

### Losing a race for one job abandoned the whole backlog

Two overlapping sweeps select the same oldest job; the loser blocks on the
advisory lock, finds it claimed, returns `taken`, and **both sweeps end their run
on any reason but `rate_limited`**. With a one-minute cron and a fifteen-minute
claim TTL, a tick longer than sixty seconds overlaps the next by construction —
so this is the normal case. The queue would drain at a fraction of its intended
rate with nothing in any log to explain it.

Fixed with a bounded retry **inside the RPC**, not in the callers: "the job I
picked was taken" is an internal detail of "give me a claimable job", and putting
it in the callers means two copies that drift.

### The one that was refuted

Round 15: *polling consumes the retry budget, so a slow video becomes
permanently unclaimable.* It does not. `release_publish_job` has always done
`attempts = greatest(attempts - 1, 0)`, so a poll cycle is net zero.

Measured rather than argued: **ten full poll cycles leave `attempts` at 0 and the
job still claimable**, with the control that **five real failures take it to 5 and
`stuck`**. The refund is one `greatest()` inside a migration and is invisible from
the call site, which is why the finding was entirely plausible — so the
measurement is now written at `MAX_ATTEMPTS` in both sweeps, with the instruction
to re-run the probe rather than re-read the code if it comes up a third time.

---

## Two pre-existing defects found while building

### A job that is only ever polled could never run out of attempts

`MAX_ATTEMPTS` bounds failures and a poll is not one. In practice **Meta** ends
it (a container or upload session expires in about a day) — so the loop was
bounded by a third party's behaviour that neither sweep can verify or control.
Equally present on Instagram; Facebook's async `file_url` fetch only makes it
more reachable.

Fixed with a wall-clock deadline measured from `scheduled_at`, at 48 hours —
deliberately **longer** than Meta's own expiry, so Meta's terminal status stays
the primary mechanism, since it carries a reason a person can act on. It
**defaults on**, because a deadline a future caller silently omits is the
`p_claim_ttl_seconds` defect again.

### A CHECK constraint that had never rejected anything

`publish_jobs_media_paths_check` was `CHECK (array_length(media_paths, 1) >= 1)`.
`array_length('{}', 1)` is **NULL**, and a CHECK **passes** on NULL. Measured on
prod rather than reasoned. Nothing exploited it because the enqueue RPC tested
the empty case separately — so the table constraint was decorative while the RPC
did the work.

---

## Migrations (all applied to prod and verified by object)

| Version | What |
|---|---|
| `20260826264500` | `publish_jobs`, the base table |
| `20260826270000` | claim recovery, `publishing_at`, `needs_review`, the `publish-media` bucket |
| `20260826280000` | Instagram sweep cron — **NOT applied** (needs the function + a Vault secret) |
| `20260826290000` | media path ownership + in-flight rate reservation |
| `20260826300000` | enqueue requires the publish permission |
| `20260826310000` | `p_skip_job_ids` |
| `20260826320000` | `source_schedule_id` ownership |
| `20260826330000` | `fail_publish_job` resets what made the job fail |
| `20260826340000` | **multi-platform** — `platform`, `account_key`, `provider_ref`, `provider_post_id` |
| `20260826350000` | `release_publish_job` REFUSES past the point of no return |
| `20260826360000` | Facebook sweep cron — **NOT applied** |
| `20260826370000` | the 48-hour deadline |
| `20260826380000` | idempotency key |
| `20260826390000` | request fingerprint (key reuse = conflict) |
| `20260826400000` | fingerprint keys on media **sources** |
| `20260826410000` | `resolve_publish_idempotency` + one shared digest function |
| `20260826420000` | claim retries after `taken` |
| `20260826430000` | jobs survive a disconnect (`SET NULL` + insert trigger) |

`CLAUDE.md` forbids renaming columns, so `ig_user_id`, `ig_container_id` and
`ig_media_id` survive as **dead nullable columns**, superseded and never written
again. Reusing them for Facebook data was rejected on the founder's call:
`ig_user_id` holding a Page id is exactly the nearly-but-not-quite shape that
makes the next reader believe a name that lies.

## Files

- `supabase/functions/_shared/publish-staging.ts` (+ test) — **new**, shared
- `supabase/functions/_shared/facebook-publish.ts` (+ test) — **new**
- `supabase/functions/_shared/instagram-publish.ts` (+ test)
- `supabase/functions/facebook-publish-enqueue/`, `facebook-publish-sweep/` — **new**
- `supabase/functions/instagram-publish-enqueue/`, `instagram-publish-sweep/`
- `supabase/publishSweeps.test.ts`, `supabase/publishEnqueues.test.ts` — **new**
  repo-level guards, both re-deriving their file list from disk with a control
  that a discovery bug returning zero files fails rather than passing vacuously
- `supabase/config.toml` — four `verify_jwt` declarations
- `docs/superpowers/specs/2026-08-26-instagram-native-publishing-design.md`

---

## Left deliberately undone

- **A storage reaper.** Three paths can orphan files in `publish-media`: the
  deadline branch (SQL cannot reach Storage), a `needs_review` job whose bytes
  are kept **on purpose** so a person can see what was about to go out, and an
  enqueue whose RPC genuinely did not commit. Cleaning up at each site was the
  proposed remedy and is the wrong shape — it asks every future path to remember,
  which is the enumeration failure this repo has watched three times on
  `profiles` write grants. One sweep closes all three.
- **No carousel.** Facebook's is easier than Instagram's (`attached_media` on one
  call), but N in-flight ids do not fit one `provider_ref` column — a schema
  change, so a slice.
- **No `social_post_log` row** for a natively published post. That table's key is
  `(outstand_post_id, platform)` and a native post has no Outstand id; putting a
  Meta id there would corrupt the measurement spine's vocabulary to save one
  migration.
- **No UI.** Nothing calls either enqueue function.

## Blocked on someone else

- `pages_manage_posts` on the Meta app, and its App Review.
- `instagram_business_content_publish`, and its App Review — with an ordering
  trap already recorded: App Review **first**, then add the scope, then **every
  existing connection must reconnect**, because a token refresh does not widen a
  grant.
