---
title: Facebook Page Publishing
type: concept
created: 2026-08-26
updated: 2026-08-27
sources: [2026-08-26-native-publishing-queue.md]
tags: [facebook, publishing, meta, app-review, connectors, exactly-once]
---

# Facebook Page Publishing

Native publishing to a Facebook Page, and the five places where copying the
Instagram connector beside it would have been wrong.

The queue underneath is shared — see [[Native Publishing Queue]] for claiming,
the ambiguity marker, the janitor and the idempotent enqueue. **Nothing in this
page is about that machine.** It is about Meta's contract, read from the Pages,
Video and Page Stories docs rather than inferred from the sibling that shipped
the week before — which is the same discipline
[[TikTok Analytics Connector]] paid for after
[[Facebook Page Insights Connector]] shipped a real defect by pattern-matching
Instagram.

## The five divergences

| | Instagram | Facebook |
|---|---|---|
| Photo | container → poll → publish | `POST /{page}/photos` — **one call** |
| Text, no media | impossible | **one call** |
| Reel | container → poll → publish | upload session on `rupload.facebook.com` |
| Ready signal | `FINISHED` | `ready` — seven lower-case statuses |
| "Did it already publish?" | `PUBLISHED` | **no equivalent exists** |
| Token | 60 days, dies unrefreshed | Page token, **never expires** |
| Gates | one permission | permission **and** Page task |

### 1. There is no single protocol. There are four.

```
feed_text      1 call   marker -> POST /{page}/feed            -> confirm
photo_single   1 call   marker -> POST /{page}/photos          -> confirm
photo_story    2 calls  POST /photos?published=false -> record ref
                        marker -> POST /photo_stories          -> confirm
video_session  3 calls  start + upload -> record ref
                        poll; ready -> marker -> finish        -> confirm
```

So *"advance the job one step"* cannot mean the same thing for every job.

**The protocol is DERIVED, never stored.** `validateJobShape` returns it from the
content type and the file extension, and both the enqueue path and the sweep call
that same function. Storing it would create a second copy that can disagree with
the job it describes — one validating a photo story while the other runs a Reel.
It also means `provider_ref` needs no discriminator: a job with a ref is a
`photo_story` holding a photo id or a `video_session` holding a video id, and
which one is answered by the protocol.

**A plain feed VIDEO is a Reel**, exactly as on Instagram. Meta retired
standalone Page video publishing, so an owner who thinks of their post as "a
video on the page" is publishing a Reel whether or not the UI says so.

### 2. The point of no return moves with the protocol

Instagram's first call always builds a container and publishes nothing, so its
marker is always stamped in step two. **Two of Facebook's four protocols publish
on their FIRST call** — a text post has no container to hide behind — so the
marker moves.

The two-step protocols keep Instagram's safety for the same reason it had it:
`published=false` puts a photo in the Page's library and **not** on the feed, and
an upload session with no `finish` publishes nothing. A retry that repeats either
leaves an orphan, never a duplicate post.

### 3. A Reel is an upload session, not a container

Instagram is handed a URL and fetches the media itself. Facebook opens a session,
expects the **bytes**, and only then accepts a publish. It does accept a
**`file_url` header**, which is the only reason the staged-media design survives
contact with this API — without it an edge function would have to stream a 300 MB
Reel through a 256 MB heap.

**`video_session` opens the session AND uploads in one tick**, recording the video
id only once both succeed. The tidier-looking split is a bug: record the id after
`start` and upload on the next tick, and a video that never receives bytes sits
at `uploading` for ever — polled and released every tick without ever charging an
attempt, so `MAX_ATTEMPTS` could never end it. Recording only after the upload
confirms means a failure abandons an empty session and a retry opens a fresh one.

### 4. No `PUBLISHED` status — the ambiguity Facebook will not resolve

Instagram reports `FINISHED` / `IN_PROGRESS` / `ERROR` / `EXPIRED` / `PUBLISHED`
on the container. Facebook reports `uploading` / `upload_complete` / `processing`
/ `ready` / `expired` / `error` / `upload_failed` on the **video** — ready is
`ready`, lower case, and **there is no `PUBLISHED`.**

That is the most important fact in this page. When an Instagram publish times
out, the container can be re-read and its status settles whether the post landed.
Nothing here can ask *"did that go out?"* after the fact.

So `PROVEN_NOT_PUBLISHED_CODES` does more work than its Instagram counterpart: it
is the only thing standing between an ambiguous answer and a person. Anything it
does not name stops at `needs_review` — a human looking at a Page they already
own is cheap, and a duplicate post on a customer's feed is not.

**A recovery check was considered and deliberately not built.** Meta exposes
fields on a video object that *might* distinguish a published Reel from an
unpublished one, but that was not verified against Meta's docs — and a recovery
path that is wrong is worse than none, because it resolves an ambiguity
confidently in the wrong direction. Building it means reading the docs and
proving it against a real Page.

**An unrecognised status is treated as still working, never as ready.** Being
wrong that way costs one more poll; being wrong the other way publishes an
unfinished video.

### 5. Two independent gates, not one

Publishing needs the **`pages_manage_posts` permission** *and* the
**`CREATE_CONTENT` task** on the Page itself. They fail differently and are
granted by different people — the permission by the user at consent, the task by
whoever administers the Page — so `requirePublishAccess` names **which** is shut.
One message would send half the people who see it to the wrong fix: reconnecting
versus asking a Page admin to change a role.

Same shape as `INSIGHTS_TASK` / `canReadInsights` on
[[Facebook Page Insights Connector]], which exists because exactly this happened
for reads.

**Measured on the live DragonCandy Page (`1240103162522777`), 2026-08-26:** tasks
are `MODERATE, MESSAGING, ANALYZE, ADVERTISE, CREATE_CONTENT, MANAGE`. So of the
two gates, **only the permission is outstanding.**

## The token model carries nothing over

A Page access token **does not expire**. `_shared/facebook-connection.ts` is
deliberately much smaller than its Instagram counterpart, and the absences are
the point: no `REFRESH_WHEN_REMAINING_MS`, no proactive refresh, no dormancy
sweep. Porting that machinery would guard a failure that cannot happen and tell
the next reader that it can.

## `published=false` publishes nothing, so the error code must not say it did

`publishPhoto` originally raised `published_unknown_id` when Facebook answered
200 with no id — the same code for a genuinely published photo and for **step one
of a photo story**, which puts the photo in the Page's library and nothing on the
feed. The sweep sends `published_unknown_id` straight to `needs_review`, on
purpose, because it means something is live and we cannot name it.

So a failed **upload** was reported as an ambiguous **live post**. The job stopped
for ever, waiting for a person to check a Page for a story that was never
created, when a plain retry would have worked.

Split into `staged_unknown_id`, which is retryable and on
`PROVEN_NOT_PUBLISHED_CODES` because by construction it belongs there. **The
invariant now lives on the code rather than on the branch:** only a call that
genuinely published may raise `published_unknown_id`, which is what lets the
sweep's catch keep sending it to a person with no marker check. Written down at
that branch, because the next person adding a call site is the one who can break
it.

## Rate limiting: our number, and we say so

Instagram publishes a flat 100 per rolling 24 hours per account — Meta's own
published cap. **Facebook's Page limit is a formula over engaged users**,
reported after the fact in the `X-Business-Use-Case-Usage` header, so it cannot
be evaluated before a call and there is no honest way to put Meta's number in the
code.

`RATE_LIMIT_POSTS = 50` is therefore **self-imposed**: enough that no real
business meets it, small enough that a runaway loop costs 50 posts rather than a
feed full of them. **Meta's throttle is the actual authority** — a 429 or error
code 32 raises `rate_limited`, and the sweep puts that Page on its skip list for
the rest of the run. A test asserts the number is *not* Instagram's, because the
two do not mean the same thing.

This is also why the sweeps are two functions on two crons rather than one over
both platforms: `claim_publish_job` takes `p_rate_limit`, and one sweep claiming
the globally-oldest job would apply whichever number it happened to be holding to
whichever account it happened to claim.

## Scheduling is ours, not Meta's

Facebook will schedule a post between 10 minutes and 30 days out.
`FACEBOOK_NATIVE_SCHEDULING_USED = false`, and that is a decision.

Handing scheduling to Meta means the approval and the release stop being one
decision we control: a post the owner cancels is already lodged with Facebook,
our queue no longer knows whether it went out, and *"did this publish"* becomes a
question only Meta can answer. The whole point of `publish_jobs` is that the
marker is ours and written after the fact. It also would not generalise —
Instagram has no equivalent — so building on it would give two platforms
genuinely different guarantees about the same user-visible feature.

## Formats are Facebook's, not Instagram's

Instagram accepts JPEG only for images. Facebook Pages also accept PNG, GIF, BMP
and TIFF, and refusing a PNG here because the sibling refuses one would refuse a
post Facebook would have taken. That is the #540 shared-helper lesson pointing
the *other* way: a nearly-fitting helper is worse than two honest ones when the
values genuinely differ.

Video stays `mp4`/`mov`, because every video path goes through `video_reels` or
`video_stories` and those are the two formats Meta names for Reels.

## Key Decisions

- **The protocol module is separate; the queue is shared.** The divergences above
  are real and belong in one place; nothing about claiming or exactly-once does.
- **Ambiguity stops for a person**, because Facebook offers no signal to resolve
  it and a guess would resolve it confidently in the wrong direction.
- **`rate_limited` is not proof nothing published** — the same exclusion
  Instagram makes, and for the same reason.
- **A carousel is not built**, and for a *different* reason than Instagram's:
  Facebook's is genuinely "upload N, then one call" via `attached_media`, but N
  in-flight ids do not fit one `provider_ref` column. That is a schema change, so
  a slice rather than a flag.

## Known Issues

- **`pages_manage_posts` is not on the Meta app and needs its own App Review.**
  The `CREATE_CONTENT` task is already held on the live Page.
- ~~**Not deployed, no cron.**~~ **Corrected 2026-08-27.** `facebook-publish-sweep`
  is deployed (401 to an anonymous POST, against 404 for an invented name) and
  `20260826360000` is applied, with `facebook_publish_sweep_url` in Vault. Its first
  cron run returned **200** with `{"staged":0,...}` — a response shape only this
  function produces, which is what proves the Vault URL points here and not at the
  Instagram sweep.
- **The connection re-read in the sweep is belt-and-braces here, not
  load-bearing** — unlike Instagram, where one row per *user* means a reconnect
  to a different account reuses it. `facebook_page_connections` is unique on
  `(user_id, page_id)`, so a job cannot outlive its connection by that route.
  Kept anyway: one query against a real post attributed to the wrong Page.

## See Also

- [[Native Publishing Queue]] — the machine this protocol runs on
- [[Facebook Page Insights Connector]] — the read-only half, same app, same token
- [[Instagram Insights Connector]] — the sibling whose shape does **not** carry
- [[TikTok Analytics Connector]] — read platform facts at source, not from a sibling
- [[Honest Analytics]] — the same refusal to state what was not measured
