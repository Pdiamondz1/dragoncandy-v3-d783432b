# Instagram native publishing — design

Date: 2026-08-26
Status: **BUILT, SWITCHED OFF** — schema applied to prod, edge functions written and
type-checked, nothing deployed and no cron scheduled. Section 9 records what shipped and
what deliberately did not.
Scope: Instagram feed posts, Reels and Stories; scheduled and auto-released.
Sequel platforms (Facebook, TikTok, X, YouTube) copy this shape; each has its own spec.

---

## 0. Why this exists, and what it reverses

The 2026-08-23 scope decision was **Outstand publishes, direct APIs measure**. All five
connectors were deliberately built read-only, and `instagram_business_content_publish` was
*removed* from the Meta app on 2026-08-23 and its removal verified after a page reload.

The founder's decision on 2026-08-26 is to **ultimately replace Outstand entirely**. This spec
is the first step of that: native Instagram publishing, built *alongside* Outstand, migrating
when approved.

**"Ultimately" is load-bearing.** Publishing cannot stop while an app review is pending, and
Meta's review is measured in weeks. So Outstand keeps publishing until this path is approved
and proven on a real account, and the two coexist by design — not as a hedge, but because the
alternative is an outage of the one capability the product sells.

**Why Instagram first:** it is the only platform that publishes all three content types the
founder asked for (feed, Reels, Stories). TikTok has no Stories API at all and YouTube
discontinued Stories in 2023, so Instagram is where the full feature actually exists. Its
connector is also already live and working (`@areyouaman`, 2026-08-24), and we know exactly
which scope to re-add because we are the ones who removed it.

---

## 1. The security finding this design is built around

**`donny_scheduled_posts` is client-writable on every column, and today that is harmless only
because nothing publishes from it.**

Measured on prod 2026-08-26:

- `anon` **and** `authenticated` hold `INSERT`, `SELECT` and `UPDATE` on **all 19 columns**.
- RLS is four policies: SELECT/UPDATE/DELETE `USING (user_id = auth.uid())`, INSERT
  `WITH CHECK (user_id = auth.uid())`.
- The UPDATE policy has **no `WITH CHECK`**, so Postgres defaults it to the `USING`
  expression. That pins `user_id` and constrains *nothing else*.

So a user may write or rewrite `platform`, `content_type`, `caption`, `media_urls`,
`hashtags`, `scheduled_at`, `status`, `campaign_id`, `deliverable_id` and `metadata` at will.

Today the actual publish goes through Outstand carrying the user's own session, so this table
is a *record* of a schedule, not an instruction. **The moment a cron publishes what it finds
here, a client-writable row becomes a real public post**, and three things follow:

1. **`media_urls` is arbitrary.** Instagram's API fetches media from a URL we supply. A row can
   name any host on the internet, so our platform credentials would publish content we never
   stored and never saw.
2. **`campaign_id` / `deliverable_id` are unconstrained** — the same forgery shape as
   `outstand_post_ownership`, where a client-asserted post id let one tenant file another
   tenant's metrics. There it cost a mis-filed measurement; here it would attribute a real
   public post to a campaign the poster has nothing to do with.
3. **`status` is writable**, so a user can move a row back to `scheduled` after it published
   and have it published again.

### The decision

**The publish queue is a new server-owned table. `donny_scheduled_posts` stays exactly what it
is — the user's schedule — and is never read by the publisher.**

This is the `outstand_post_ownership` rule applied one layer up: *the thing that authorises an
irreversible action must be established by the server, never asserted by a client.* Locking
`donny_scheduled_posts` down with column grants was considered and rejected — it has existing
client writers across the app (a partial-object update pattern the identity slice already
recorded as a silent-42501 trap), and narrowing it would break them for a benefit a separate
table gets for free.

---

## 2. Shape

```
  user / Donny draft            server                        Meta
  ─────────────────             ──────                        ────
  donny_scheduled_posts   ──▶  enqueue_publish_job()    ──▶  publish_jobs
  (client-writable,             SECURITY DEFINER,             (service-role only,
   the user's plan)             validates + COPIES            RLS zero policies)
                                media into our bucket
                                                        ┌──▶ claim (advisory lock)
                        instagram-publish-sweep  ───────┤    container → poll → publish
                                (cron, */5)             └──▶ confirm + social_post_log
```

Three properties, each answering a failure this project has already paid for:

- **Exactly-once.** Publishing is irreversible and public. `publish_jobs` carries a claim/confirm
  pair under `pg_advisory_xact_lock`, and the durable marker is written **after** Meta returns a
  media id — never before. `pending_balance_flushes` established this rule for money: *marker set
  ⇒ the side effect happened*, by construction. A pre-claim would leave a job marked published
  that never posted, or worse, publish twice.
- **Server-established content.** `enqueue_publish_job` copies the media into our own Storage
  bucket and records the resulting path. The publisher only ever hands Meta a URL under our
  origin. A row cannot name a third-party host.
- **Human-approved, time-shifted.** A job is created only from an owner action — approving a
  draft card or saving a schedule. **Donny cannot enqueue.** The existing `social-draft.ts`
  property ("the LLM cannot publish — enforced by where the code lives, not by a prompt
  instruction a model may ignore") is preserved verbatim: auto-posting means *a human-approved
  item is released on time*, not *a model decides to post*.

---

## 3. `publish_jobs`

Service-role only, exactly like the five connector tables: RLS enabled with **zero policies**,
plus TABLE-level revocation (a column-level `REVOKE` is a documented no-op against Supabase's
ambient table-wide `GRANT` — four recorded instances).

| Column | Notes |
|---|---|
| `id` | uuid PK; **is** the idempotency key handed to Meta |
| `user_id` | FK `auth.users`, whose account is published TO |
| `acting_user_id` | FK `auth.users`, who enqueued. v1 requires `= user_id`; the delegation seam (§7.2) |
| `connection_id` | FK `instagram_account_connections`, resolved server-side |
| `ig_user_id` | denormalised, so a reconnect to a *different* account cannot silently retarget a queued job |
| `content_type` | `feed` \| `reels` \| `stories` |
| `caption` | null for stories |
| `media_paths` | `text[]`, paths in **our** bucket — never external URLs |
| `scheduled_at` | when it may be released. **Not nullable** — "post now" writes `now()` rather than null, so the sweep has one predicate (`scheduled_at <= now()`) instead of two code paths, and an immediate post is just a schedule whose time has already arrived |
| `status` | `queued` \| `claimed` \| `published` \| `failed` \| `stuck` |
| `ig_container_id` | Meta's container, kept for resume |
| `ig_media_id` | set **after** publish — the proof |
| `published_at`, `attempts`, `last_error` | |
| `claimed_at`, `claim_id` | the claim pair |
| `source_schedule_id` | FK `donny_scheduled_posts`, **audit only, never read for content** |

**`ig_user_id` is not redundant with `connection_id`.** Instagram's row is `on conflict` upserted
per user, so reconnecting to a different account reuses the row. A job queued for account A must
refuse to publish to account B — the same rule `cache_tiktok_insights` enforces with
`account_changed`, and the same fabrication risk: a real post attributed to the wrong subject.

---

## 4. Publishing, per Meta's actual contract

Three steps, not one — this is where a naive implementation breaks:

1. `POST /{ig-user-id}/media` with `media_type` = `REELS` \| `STORIES` \| (omitted for feed),
   plus `image_url`/`video_url` → returns a **container id**.
2. **Poll** `GET /{container-id}?fields=status_code` until `FINISHED`. Video transcoding is
   asynchronous and takes tens of seconds.
3. `POST /{ig-user-id}/media_publish` with `creation_id` → returns the media id.

Consequences the design has to carry:

- **A job is not one HTTP call**, so a sweep that claims-and-publishes inline will hold a claim
  across a slow poll. The sweep therefore *advances* a job one step per tick and persists
  `ig_container_id`, rather than blocking. A lock only helps while it is held — the X connector
  round-7 lesson.
- **Failure between step 1 and 3 leaves an orphan container**, which is harmless (it expires) but
  must not cause a retry to build a *second* container: resume from the stored id.
- **`STORIES` takes no caption.** Sending one is a silent no-op, so validation rejects it at
  enqueue rather than letting a user believe their story had text.
- **Rate limit: 100 API-published posts per rolling 24 hours**, all content types combined,
  carousel counting as one. This is per Instagram account. The sweep must count against it and
  defer rather than burn attempts — and the count belongs in SQL, not in the function, for the
  same check-then-act reason `reserve_phone_verification_send` exists.

---

## 5. Scope and review

Re-add **`instagram_business_content_publish`** to the Meta app. It was removed on 2026-08-23
after a page reload confirmed the other two survived, so the removal is known-good and the
re-add is the exact inverse.

This needs Meta App Review with a demo video showing publishing. Two gates already recorded
apply unchanged: **Tech Provider verification**, and an **anonymously reachable privacy policy**
— so the site gate must stay off through the window, which is now true of TikTok's, Google's and
Meta's reviews simultaneously.

**`business_management` should come off the Pages use case before this submission**, not after —
it is already flagged, and adding a publishing scope to a use case carrying an unnecessary one
invites a rejection that costs weeks.

---

## 6. Migration, and how Outstand actually gets retired

Per platform, in this order, with no big-bang cutover:

1. Native path ships **dark** behind a `feature_flags` row.
2. Proven on one real account end to end — the acceptance signal is an `ig_media_id` on the job
   **and** the post visible on the account. *A row can be written without Meta ever being
   called; a media id cannot.*
3. Flag on for that platform. Outstand stays connected.
4. Outstand's Instagram path retired only once native has published for a period with no manual
   intervention.

**Do not drop the Outstand subscription until the last platform migrates.** It is one $249/mo
line covering IG, TikTok and YouTube; cancelling it after Instagram alone buys nothing and
removes the fallback.

---

## 7. Founder decisions — answered 2026-08-26

**1. "Auto" describes the COMPOSING, not the publishing.** Donny writes a caption matched to the
content and presents it ready to go; **the owner still taps**. So the `social-draft.ts` property
survives unchanged — the LLM cannot publish, enforced by where the code lives. Nothing in this
spec's safety model moves.

Two things follow that are easy to miss. **A draft must support "post now" as well as "post at
a time"** — "ready to post instantly with your approval" is the primary path, and scheduling is
the secondary one; a queue that only handles future timestamps would make the common case the
awkward one. And **captioning content means reading the content**: matching a caption to a Reel
requires the media, not just the campaign brief, so caption generation is a vision call over the
uploaded file. That is a real cost and latency line, and it belongs in the enqueue path (once,
at draft time) rather than in the publish sweep (which must stay cheap and idempotent).

**2. Delegated posting: v1 is OWN-ACCOUNT ONLY, and the seam is built in.** `publish_jobs`
carries `acting_user_id` (who enqueued) separately from `user_id` (whose account is published
to), and `enqueue_publish_job` requires them equal. Delegation later changes one predicate
instead of retrofitting a table.

The reasoning is this repo's own record rather than caution in the abstract: cross-tenant
authorization is where it has found the most live holes — `outstand-proxy` alone had **four**,
including body-supplied account ids treated as a grant, and a platform fallback that handed one
Instagram account every Instagram post. `create_counter_offer` was anon-executable with zero
authz. `can_notify_user`'s crew clause was forgeable with two INSERTs. Publishing is
irreversible and public, so a wrong authorization predicate here is worse than any of those.
Prove the pipeline own-account, then add `delegated_posting_permissions` as a scoped change with
its own review — noting its `status` and `expires_at` both have to be checked, which is exactly
the membership-status filter `can_notify_user` was missing.

**3. YouTube: GO.** The CASA assessment is accepted, including that it **recurs annually** —
free self-scan at Tier 2, up to $5,000+ for a Tier 3 pen test. Record it as an operating cost
with a renewal date, not a one-off: `PROJECT_CONTEXT` §4's own history is that vendor costs go
stale silently (Outstand sat at a stale $67 against a real $249 for an unknown stretch). YouTube
publishes video and Shorts; it has **no Stories**, so the three-content-type promise is
Instagram and Facebook only.

---

## 9. What was built, 2026-08-26 — and the two gaps that are deliberate

### Applied to prod

Verified by object and by behaviour after each one — **91 behavioural checks across six suites**,
every rejection paired with a control that had to succeed, everything rolled back.


| Migration | What |
|---|---|
| `20260826264500` | `publish_jobs` + `enqueue_publish_job` and the four service-role RPCs |
| `20260826270000` | claim recovery, `publishing_at`, `needs_review`, the `publish-media` bucket |
| `20260826290000` | Codex round 1: staged-path ownership, and an in-flight rate reservation |
| `20260826300000` | Codex round 2: enqueue refuses a connection without the publish permission |
| `20260826310000` | Codex round 3: a per-job skip list, so one tick advances a job once |
| `20260826320000` | Codex round 4: `source_schedule_id` must belong to the caller |
| `20260826330000` | Codex round 5: a requeue resets the marker and, on request, the container |

**Six Codex rounds, nine findings, all real.** Two were P1s in the exact property this design
exists to guarantee — an ambiguous `media_publish` was requeued and would have posted twice, and
the rate limit counted nothing in flight so two overlapping sweeps could both publish. One was a
cross-tenant hole: `enqueue_publish_job` accepted any plain path, so a caller who skipped the edge
function could have published another tenant's staged file to their own account. Round 6 returned
clean.

The pattern worth keeping from that: **every finding was a check that existed one layer up.** The
edge function verified media ownership, so the RPC did not. The janitor handled an expired claim
mid-publish, so the in-process throw did not. A foreign key proved a schedule existed, so nothing
proved it was the caller's. A guard in the layer above is not a guard.

**`20260826280000` (the pg_cron schedule) is written and NOT applied**, on purpose. It calls the
sweep every minute, so applying it before the function is deployed and the Vault URL exists would
produce a `net.http_post` against a NULL url once a minute, failing quietly in
`cron.job_run_details`. It is a go-live step, not a merge step.

### The defect the build found in the schema it was built against

`20260826264500` gave `claim_publish_job` a `p_claim_ttl_seconds` parameter and never referenced
it. **A parameter nothing reads is not a control**, the same class as a constant nothing reads. A
sweep that died between claiming and confirming left its job in `claimed` for ever — not retried,
not alerted, not visible as failed. It simply stopped.

Fixing it turned out to be the substantive design question, because "put it back to `queued`" is
wrong for the one state that matters. Between `POST /media_publish` leaving the process and
`confirm_publish_job` committing, a live post and no post are indistinguishable from outside, and
Meta has no idempotency key to tell them apart. So `publishing_at` is stamped immediately before
that call and the janitor reads it: null means safe to retry, non-null means `needs_review` and a
person looks at the account. That is the `stuck` contract applied to a feed instead of to money.

Verified on prod in a rolled-back transaction — **30 checks, all passing**, including the ordering
proof that the ambiguous branch runs first (reversed, the safe branch would queue the risky row in
passing and it would be retried in the same call), that `release` returns an attempt while `fail`
keeps it, that a second `confirm` is a no-op, and that the account's allowance counts a row
published seconds earlier. Six of the checks are controls that had to succeed.

### Gap 1 — no carousel

`validateJobShape` refuses any multi-file post with a message that says so. A carousel is N child
containers plus a parent, the parent may only be built once every child reports FINISHED, and each
child transcodes on its own clock — N+1 container ids to persist and poll independently, against a
single `ig_container_id` column. Joining them into that column would model the state badly enough
that a resumed job could publish the wrong thing, and this is the one place in the product where
being wrong is public and permanent. Adding carousels means a child-container table.

### Gap 2 — a published job is not written to `social_post_log`

That table's key is `(outstand_post_id, platform)` and a natively published post has no Outstand
id. Writing an Instagram media id into that column would corrupt the measurement spine's own
vocabulary to save one migration. The job row carries `ig_media_id` and `published_at`, which is
the acceptance signal section 6 names; wiring native posts into measurement is its own slice.

### Still to do before this can publish anything

**The permission is a THREE-part step and every part is easy to leave out.** Codex round 2
flagged that declaring `PUBLISH_PERMISSION` in code does not put it on the consent screen —
`INSTAGRAM_SCOPES` still asks for basic + insights only. It is not added yet on purpose: Meta
will not grant an advanced permission before App Review approves it, and asking early breaks
consent for every user who is not a developer on the app, which would take the **working**
insights connector down to ship a feature that still could not publish.

So the order is:

1. Take `business_management` off the Pages use case (section 5), then add
   `instagram_business_content_publish` to the Meta app and pass **App Review** with a
   publishing demo video.
2. Add the permission to `INSTAGRAM_SCOPES` in `_shared/instagram.ts`.
3. **Have every existing connection reconnect.** A token minted before step 2 does not gain the
   permission by being refreshed — `ig_refresh_token` extends the grant that exists, it does not
   widen it. This is the part that gets forgotten, and until it happens the account looks
   Connected and cannot post.

Until all three are done, `requirePublishPermission` refuses at enqueue — in the edge function
for a readable message, and in `enqueue_publish_job` (migration `20260826300000`) as the copy a
future caller cannot route around. Verified on prod in both directions inside a rolled-back
transaction: the live connection is refused as it stands, and the same call succeeds once the
permission is added to its `permissions` array.

Then:

4. Deploy both functions; create the `instagram_publish_sweep_url` Vault secret; apply
   `20260826280000`; check `cron.job_run_details` rather than assuming.
5. The UI — nothing calls `instagram-publish-enqueue` yet.

---

## 10. Facebook, and why the queue became multi-platform

A Facebook Page (**DragonCandy**, `1240103162522777`) was connected on 2026-08-26 and read
insights successfully nine seconds later, clearing the "no Facebook Page exists to connect"
founder item. That made Facebook publishing the obvious next platform, and forced a decision the
Instagram-only design had deferred.

### Facebook's publishing contract is NOT Instagram's

Read from Meta's Pages, Video and Page Stories docs rather than inferred from the sibling:

| | Instagram | Facebook |
|---|---|---|
| Photo | container → poll → publish | `POST /{page}/photos` — **one call** |
| Text, no media | impossible | `POST /{page}/feed` — **one call** |
| Reel | container → poll → publish | **start → upload → finish**, an upload session on a second host |
| Story | container(`STORIES`) → poll → publish | photo: 2 steps; video: 3 |
| Ready signal | `FINISHED` | `ready` — 7 statuses, lower case |
| "Already published?" | `PUBLISHED` on the container | **no equivalent exists** |
| Token | 60 days, dies unrefreshed | Page token, **never expires** |
| Rate limit | flat 100 / 24h | a formula over engaged users |
| Extra gate | one permission | a permission **and** a Page task |

Two of those are load-bearing. **Facebook offers no equivalent of Instagram's `PUBLISHED`
container status** — the single signal that resolves whether an interrupted publish landed — so
the ambiguity Instagram lets us settle, Facebook does not. And **publishing needs both the
`pages_manage_posts` permission and the `CREATE_CONTENT` task on the Page**, granted by different
people and fixed different ways; the live connection already holds the task, so only the
permission is outstanding.

### The queue is shared; the protocol is not

`publish_jobs` gained `platform`, `account_key`, `provider_ref`, `provider_post_id` and a nullable
connection FK per platform, with a CHECK that exactly one is set. The claim/release/review/janitor
machinery is untouched, because it is about *our* exactly-once guarantee rather than about Meta —
and duplicating it per platform would produce five copies that drift, which is the shared-helper
lesson #540 recorded.

`CLAUDE.md` forbids renaming columns, so `ig_user_id`, `ig_container_id` and `ig_media_id` survive
as **dead nullable columns**, superseded and never written again. Reusing them for Facebook data
was the alternative and was rejected: `ig_user_id` holding a Page id is exactly the
nearly-but-not-quite shape that makes the next reader believe a name that is lying.

**A latent hole surfaced while writing it.** `publish_jobs_media_paths_check` was
`CHECK (array_length(media_paths, 1) >= 1)` and had never rejected anything — `array_length('{}', 1)`
is **NULL**, and a CHECK passes on NULL. Measured on prod, not reasoned. Nothing exploited it
because the enqueue RPC tested for the empty case separately, so the table constraint was
decorative while the RPC did the work. Replaced with a `coalesce(…, 0)` form that actually fires,
and widened in the same statement for the one case Facebook genuinely has and Instagram does not.

**Every guarantee from the six Codex rounds was re-proven against the new contract** — 23 checks,
plus 23 more on the multi-platform behaviour, plus the function ACLs re-derived by object because
four signatures changed and one function was renamed.

## 11. The Facebook step machine, 2026-08-26 — and two things the queue got wrong

`facebook-publish-enqueue` and `facebook-publish-sweep` are built. Four protocols share one
queue: `feed_text` and `photo_single` are one call, `photo_story` two, `video_session` three. The
protocol is **derived, never stored** — `validateJobShape` returns it, and both the enqueue path
and the sweep call the same function, so `provider_ref` needs no discriminator and the two callers
cannot come to disagree about one job.

**The point of no return moves with the protocol**, which is the design difference worth
remembering. Instagram's first call always builds a container and publishes nothing. Two of
Facebook's four protocols publish on their FIRST call — there is no container to hide behind for a
text post or a single photo — so the marker is stamped in step one for those and step two for the
others. The two-step protocols keep Instagram's safety for the same reason it had it:
`published=false` is not on the feed, and an upload session with no `finish` publishes nothing.

`video_session` opens the session **and** uploads in one tick, recording the video id only once
both succeed. The tidier-looking split is a bug: record after `start` and upload next tick, and a
video that never receives bytes sits at `uploading` for ever, polled and released every tick
without ever charging an attempt.

### The staging path is shared, because it is the ownership check

`_shared/publish-staging.ts` holds the copy that freezes the approved bytes and the two-client
split that proves the caller owns them. It existed twice for about an hour; two copies of an
authorization check is #540's shape, and a drift there is one platform checking ownership and the
other not. `publish-staging.test.ts` pins **which credential does which operation**, and that test
was proven to fail by swapping the two clients in the module.

### Two defects in the shared queue, both pre-existing

**A job that is only ever POLLED could never run out of attempts.** `MAX_ATTEMPTS` bounds
failures, and a poll is not one — it gives its attempt back on purpose. In practice Meta ends it
(a container or upload session expires in about a day), so the loop was bounded by a third party's
behaviour that neither sweep can verify. Fixed by a wall-clock deadline in
`claim_publish_job` (`20260826370000`), measured from `scheduled_at` at 48 hours — deliberately
longer than Meta's own expiry, so Meta's terminal status stays the primary mechanism, since it
carries a reason a person can act on. It **defaults on**, because a deadline a future caller
silently omits is the `p_claim_ttl_seconds` defect again.

**A lost enqueue response could produce a duplicate post** (Codex, round 7). If the RPC commits
and its response is lost, the catch used to delete media a committed job referenced. The obvious
remedy — keep the media — is *worse*: the discard was accidentally buying safety, because an
orphaned job with no media cannot publish. That accident does not cover a Facebook feed post,
which has no media at all, so the orphan publishes and the user's retry publishes again. Fixed by
making enqueue idempotent (`20260826380000`): a required client-generated key, a
`(user_id, idempotency_key)` unique index that referees concurrent replays, and a catch that
**never deletes on an unknown outcome**.

### A disconnect must not delete the posts queued for it

Codex first reported the connection cascade as a storage leak, and I filed it as one. That
reading was too narrow, and it came back as a P1 with the half I had under-weighted:
**the row can go while the publish is in flight.** The sweep loads the connection, stamps
`publishing_at`, calls Meta; the user disconnects in another tab; the cascade removes the row;
Meta publishes; and `confirm_publish_job` updates nothing, because there is nothing left to
update. So does `review_publish_job`, which is the branch written for exactly that failure. A
live post, and a console line as its only trace.

That is not storage cost. It is the one outcome the whole design exists to prevent. The quieter
half is bad too: a queued post vanished with **no terminal status**, so nothing ever told its
owner it would not go out.

Fixed by `ON DELETE SET NULL` (`20260826430000`). The sweep already fails a job whose connection
has gone, with a sentence naming what happened — that path was simply unreachable, because the
row was deleted before anything could reach it. Now the job survives, reaches `stuck`, and
because `stuck` is the branch that discards staged media, takes its bytes with it.

The `publish_jobs_one_connection` CHECK had to relax to allow both-null, so a **`BEFORE INSERT`
trigger** takes over what only has to be true at creation: a new job names exactly one connection.
A CHECK cannot tell an insert from an update, and the rule here is about a transition, not a row —
the same split the `guard_*_verification_columns` triggers make.

### Open — a storage reaper, which is its own slice

Three orphan paths remain, down from four:

1. a job given up on by the deadline branch, which is SQL and cannot reach Storage;
2. a job routed to `needs_review`, where the bytes are kept **on purpose** so a person can see
   what was about to go out, and then never collected;
3. an enqueue whose RPC genuinely did not commit, where the rule keeps the media precisely
   because that outcome is unknowable.

Cleaning up at each site was the proposed remedy and is the wrong shape: it asks every future
path to remember, which is the enumeration failure this repo has watched three times on
`profiles` write grants. One reaper — list `publish-media`, drop any object older than N days
with no referencing `publish_jobs` row — closes all three and needs nothing remembered anywhere.
Not built: it is an edge function, a cron and a Vault secret, and the bucket holds zero objects.

### Still to do for Facebook

`pages_manage_posts` on the Meta app and its own App Review. The live Page already holds the
`CREATE_CONTENT` task, so of the two gates only the permission is outstanding.

---

## 8. Not in this spec

Facebook Pages, TikTok (draft mode needs no audit — a genuinely earlier win than assumed), X
(now funded, 2026-08-26) and YouTube. Each copies section 2's shape and diverges only where the
platform does — which is the lesson the five read-only connectors already paid for: **the value
is in the places where copying the sibling would be wrong.**
