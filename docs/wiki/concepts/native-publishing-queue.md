---
title: Native Publishing Queue
type: concept
created: 2026-08-26
updated: 2026-08-27
sources: [2026-08-26-native-publishing-queue.md]
tags: [publishing, exactly-once, idempotency, queue, instagram, facebook, storage, connectors]
---

# Native Publishing Queue

The first direct-API **write** in this project, and the machine that carries it.

Every direct platform connector before this was read-only under the 2026-08-23
scope decision — *Outstand publishes, direct APIs measure* — recorded on
[[Instagram Insights Connector]], [[Facebook Page Insights Connector]],
[[X Analytics Connector]], [[TikTok Analytics Connector]] and
[[YouTube Analytics Connector]]. **That decision no longer describes Instagram
and Facebook.** It still holds for X, TikTok and YouTube, and the split is
deliberate rather than drift: publishing was built where a Page and an account
already existed to publish to.

`publish_jobs` is one queue for both platforms. The protocols are two modules and
are not shared, because Meta's two products do not agree about what a post is —
see [[Facebook Page Publishing]] for the five places copying the sibling would be
wrong.

## Publishing is like paying

The model is `pending_balance_flushes` ([[Payout Finalization & Re-entrancy]]),
not any read-only connector. Publishing is irreversible, public, and must happen
exactly once, so:

**The durable marker is written AFTER the side effect, never before.**
`provider_post_id` comes from the platform, so *"marker set ⇒ it published"*
holds by construction. A pre-claim would leave a job marked published that never
posted, or publish twice.

The other half is the one Stripe gives away for free and Meta does not: **there
is no idempotency key on `media_publish`.** So a second marker, `publishing_at`,
is stamped immediately before the point of no return — and every ambiguous
outcome after that point stops rather than retries.

## One step per tick, not one job per tick

A publish is several calls with an asynchronous transcode in the middle. A tick
that saw a job through from start to finish would hold its claim across a poll
that can take a minute — and **a lock only helps while it is held**.

`pg_advisory_xact_lock` releases with its transaction, long before the platform
is called. Two consequences that are easy to get wrong:

- **The rate-limit count includes in-flight work**, not only `published`. Counting
  only the latter lets two overlapping sweeps each see the limit minus one and
  both publish. Same lesson as `claim_pending_balance_flush`.
- **A poll must not cost an attempt.** `claim_publish_job` increments `attempts`
  and `release_publish_job` does `greatest(attempts - 1, 0)`, so a cycle is net
  zero. Verified on prod: ten poll cycles leave `attempts` at 0 and the job still
  claimable, while five real failures take it to 5 and `stuck`. Raised as a
  finding twice; **re-run the probe rather than re-reading the code**, because
  the refund is one `greatest()` in a migration and is invisible from the call
  site.

## `needs_review` is the `stuck` contract applied to a feed

Three places the sweep refuses to guess:

1. **Meta reports the container already `PUBLISHED`.** The only evidence an
   interrupted publish landed. Republishing duplicates a live post; failing
   claims it never happened. Neither is a cron's decision. *(Instagram only —
   Facebook has no equivalent, which is why that connector's allowlist carries
   more weight.)*
2. **The publish is accepted and returns no id.** We cannot name what we created.
3. **A claim expires with `publishing_at` set** — handled in SQL, by
   `claim_publish_job`'s janitor, whose **ambiguous branch runs first**. Reversed,
   a row whose publish may have landed would be moved back to `queued` by the
   safe branch and become eligible for a second attempt in the same call.

`PROVEN_NOT_PUBLISHED_CODES` is an **allowlist**, so a new error code added later
defaults to *ambiguous* — over-escalating to a human. A denylist would default it
to *safe to retry*, and the cost of being wrong there is a duplicate post on a
customer's feed. `rate_limited` is deliberately absent: a 429 looks like a
refusal but can be issued by an edge in front of Meta after the request was
accepted upstream.

**`release_publish_job` REFUSES a job past the point of no return** rather than
clearing the marker. Clearing would make a misuse pass quietly — the caller gets
`true`, the job requeues, and if the publish really went out it is eligible to go
out again. Refusing turns a wrong call site into a job that stops, which is the
right way round. The janitor then routes it to `needs_review` by TTL.

## Two bounds, because attempts alone cannot end a poll

`MAX_ATTEMPTS` bounds **failures**, and a poll is not one. A job whose media
never leaves `processing` would be claimed and released for ever. In practice
Meta ends it — a container or upload session expires in about a day — so the loop
was bounded by a third party's behaviour that neither sweep can verify or
control.

Hence a **wall-clock deadline** measured from `scheduled_at`, at 48 hours,
deliberately **longer** than Meta's own expiry so Meta's terminal status stays
the primary mechanism: it carries a reason a person can act on, where the
deadline only reports that nothing was ever heard.

`p_max_age_seconds` **defaults on**. A deadline a future caller silently omits is
the `p_claim_ttl_seconds` defect again — a parameter declared and never read,
where the effect was orphaned claims for ever and nothing looked wrong.
`supabase/publishSweeps.test.ts` re-derives the sweep list from disk and asserts
every one passes it, with a control that a discovery bug finding zero files fails
rather than passing vacuously.

Charging an attempt for a poll was the alternative and is wrong: it makes the
bound depend on the cron interval, so speeding the sweep up to make posts more
punctual would start killing long transcodes.

## Losing a race for one job must not abandon the backlog

Two overlapping sweeps select the same oldest job on the unlocked read; the loser
blocks on the advisory lock, re-reads inside it, finds the row claimed, and
returns `taken`. Both sweeps end their run on any reason but `rate_limited`, so
the loser used to stop — leaving every other due job for the next tick.

**This is the normal case.** The cron runs every minute and the claim TTL is
fifteen, so a tick longer than sixty seconds overlaps the next by construction.
The queue would drain at a fraction of its intended rate with nothing in any log
to explain it.

The retry lives **inside the RPC**, bounded at five: "the job I picked was taken"
is an internal detail of "give me a claimable job", and putting it in the callers
means two copies that drift ([[Edge-Function Deploy & Bundling]] §540). The
window is only between the unlocked select and the locked re-read, so once the
winner commits the loser's next select sees `status = 'claimed'` and skips it —
one retry almost always suffices.

## Staging: the ownership check, and why it is shared

`_shared/publish-staging.ts` freezes the approved bytes and proves the caller
owns them. The copy is **two clients on purpose, and the split IS the
authorization**:

1. the **caller's own credential** signs the source object — signing requires
   read permission, so Storage RLS makes the decision and we do not
   re-implement it for one of seventeen buckets;
2. the **service role** performs the copy, server-side inside Storage.

Step 2 alone would let any authenticated user name any path in any bucket and
have our credentials publish a stranger's file — the `outstand_post_ownership`
defect one layer up ([[Social Measurement Spine]]), with a public post instead of
a mis-filed metric as the consequence. Step 1 alone cannot write a bucket clients
are locked out of.

`storage.copy` with a `destinationBucket` runs **inside** Storage, so no bytes
pass through the function. Downloading and re-uploading works in testing and
OOMs on the first real video.

It also freezes rather than references: the bytes at a path can be replaced after
approval, so a reference would let someone schedule a post, overwrite the file,
and have the sweep publish something nobody approved.

**It existed twice for about an hour.** Two copies of an authorization check is
the shared-helper shape #540 recorded, and a drift there is one platform checking
ownership and the other not. The test pins **which credential does which
operation** — and was proven to fail by swapping the two clients in the module,
because a test that only checks "a signed url was requested" passes with them
reversed.

## Idempotent enqueue, in four rounds

A lost HTTP response meant the client's retry made a **second post**. Getting
that right took four Codex rounds, and three of them are worth keeping.

**The obvious fix was worse than the defect.** The catch used to delete staged
media when the RPC errored — including when it had committed and only the
response was lost. Simply keeping the media, with no key, turns a `stuck` job
into a duplicate public post: the discard was *accidentally* buying safety,
because an orphan job with no media cannot publish. That accident does not cover
a Facebook feed post, which has no media at all.

**So both halves moved together:**

- A **required, client-generated key**, with a `(user_id, idempotency_key)` unique
  index as the referee for concurrent replays — the constraint, not an advisory
  lock, because it lives on the table and a future caller cannot skip it.
  Scoped per user, so nobody can squat someone else's key.
- The catch **never deletes on an unknown outcome**. `rpcAttempted` is set the
  instant the call is issued; everything failing before it still discards.
- The unconfirmed branch **stops claiming an outcome**: not *"could not queue the
  post"*, but *"could not confirm, and retrying the same request is safe."*

**A reused key is a conflict, not a replay.** Returning the other job reports
success for work it discarded — the worst refusal shape here, because every other
one says what is wrong. `request_fingerprint` distinguishes them, and the answer
is a 409 rather than a generic 400 so a client can tell it apart.

**Then the two fixes cancelled each other out.** `plannedDestinations` mints a
fresh random batch directory every invocation — by design, so two approvals of
one file are two frozen sets of bytes — and the digest included those paths. Every
retry of a post *with media* looked like a different post. The digest now keys on
the media **sources** the caller named, which are stable across retries because
they are the file the user picked; destinations stay random and stay the thing
security is checked on.

**And the replay is now recognised BEFORE staging.** `resolve_publish_idempotency`
is a **fast path, not a gate** — the enqueue RPC still runs both checks and the
unique index is still the referee, which is what makes the lookup safe as an
unlocked read and safe to skip when it fails. Without it, a retry re-copied the
media first, so a source the user had since deleted answered `media_not_found`
for a post that was queued and about to publish.

## Two lessons about verification, not about publishing

**A probe that exercises a function directly can prove the function right and the
feature wrong.** The prod check for the idempotency key passed the *same* staged
paths on both calls, because it was testing the RPC in isolation. That contract
is real and it held; it is not the contract the client sees, and the client never
passes the same paths twice. No control *inside* that probe catches this — the
fixture has to come from where the caller stands.

**A rejection test written as `insert ... select` fails open.** One check ran
after its fixture had been deleted two steps earlier, so it matched no rows,
inserted nothing, raised nothing, and reported that the constraint had allowed
it. Then, once moved, its error message revealed the **trigger** firing rather
than the CHECK it was named for — so the constraint was untested while a check
named for it passed.

## Key Decisions

- **One queue, two protocols.** Claiming, releasing, the marker, the janitor, the
  skip lists and the advisory lock are about *our* exactly-once guarantee, not
  about Meta. Copying them per platform gives five copies that drift.
- **Dead columns over a rename.** `CLAUDE.md` forbids renaming, so `ig_user_id`,
  `ig_container_id` and `ig_media_id` survive as superseded nullable columns.
  Reusing them for Facebook data was rejected on the founder's call:
  `ig_user_id` holding a Page id is the nearly-but-not-quite shape that makes the
  next reader believe a name that lies.
- **Jobs survive a disconnect** (`ON DELETE SET NULL`). Cascading deleted a job
  *mid-publish*: the post went live and `confirm_publish_job` had nothing left to
  write to. `publish_jobs_one_connection` relaxed to allow both-null, and a
  `BEFORE INSERT` trigger took over what only holds at creation — a CHECK cannot
  tell an insert from an update, and the rule is about a transition.
- **A timestamp with no timezone is refused, not normalised.** Pinning it to an
  instant removed the inconsistency between layers and settled it by *guessing* —
  the edge runtime's offset — so a restaurant in Hoboken asking for six in the
  evening would post at two in the afternoon.
- **Donny cannot publish.** The enqueue RPC takes identity from `auth.uid()`, so
  a job is created by the person whose session made the request. "Auto-posting"
  means a human-approved item released on time, never that a model decided to
  post — the property [[Donny Social Tools]] enforces by where the code lives
  rather than by an instruction a model may ignore.

## Known Issues

- ~~**Nothing is deployed and no cron is scheduled** (2026-08-26).~~ **Corrected
  2026-08-27, hours after it was written.** **Deployed and running, 2026-08-27.** All four functions answer **401** to an
  anonymous POST where an invented function name answers **404**, so the probe distinguishes
  *absent* from *present and refusing*. Both crons are applied and active on `* * * * *`, and
  both have **succeeded** with a real **200** — Facebook returning `{"staged":0,...}` and
  Instagram `{"container_created":0,...}`. Those distinct shapes are the control that the two
  Vault URLs are not swapped; identical responses would have left that unknowable. Note
  `cron.job_run_details` saying `succeeded` is a *weaker* claim than it looks — `pg_net` is
  async, so it only means the request was queued. The verdict came from `net._http_response`.
  The queue is empty, which is exactly why this was the cheap moment to prove the plumbing: the
  documented failure mode of a missing Vault secret is a NULL url that fails *quietly*, and
  finding that with zero jobs costs nothing.
- **Neither platform has its publish permission.** Every path fails closed at the
  gate. For Instagram the order is load-bearing: App Review **first**, then add
  `instagram_business_content_publish` to the scope list, then **every existing
  connection must reconnect** — a token refresh does not widen a grant.
- **No storage reaper.** Three paths orphan files in `publish-media`: the deadline
  branch (SQL cannot reach Storage), a `needs_review` job whose bytes are kept
  *on purpose* so a person can see what was about to go out, and an enqueue whose
  RPC genuinely did not commit. Cleaning up at each site was the proposed remedy
  and is the wrong shape — it asks every future path to remember, the enumeration
  failure this repo has watched three times on `profiles` write grants.
- **No carousel**, on either platform. Facebook's is easier (`attached_media` on
  one call) but N in-flight ids do not fit one `provider_ref` column.
- **No `social_post_log` row** for a natively published post. That key is
  `(outstand_post_id, platform)` and a native post has no Outstand id.
- **No UI.** Nothing calls either enqueue function.
- **A latent CHECK that never fired**, found here and worth carrying:
  `array_length('{}', 1)` is **NULL**, and a CHECK **passes** on NULL. The
  original media constraint had therefore never rejected anything.

## See Also

- [[Facebook Page Publishing]] — the four protocols and the two gates
- [[Facebook Page Insights Connector]] · [[Instagram Insights Connector]] — the
  read-only halves, and the scope decision this work changes for those two
- [[Payout Finalization & Re-entrancy]] — the exactly-once model this copies
- [[Social Measurement Spine]] — `outstand_post_ownership`, the defect one layer up
- [[Donny Social Tools]] — why a model composes and a person publishes
- [[Edge-Function Deploy & Bundling]] — the shared-helper lesson (#540)
