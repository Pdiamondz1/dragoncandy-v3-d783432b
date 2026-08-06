---
title: Social Measurement Spine
type: concept
created: 2026-08-06
updated: 2026-08-06
sources: [2026-08-06-social-measurement-spine-and-post-ownership.md, 2026-08-05-outstand-cross-tenant-metric-read.md]
tags: [analytics, outstand, measurement, security, edge-functions, rls]
---
# Social Measurement Spine

How a post published through DragonCandy becomes a measured post — and the invariants that
keep an *unmeasured* post from silently looking like a post nobody engaged with.

Shipped across PR #365 (the spine, merged + deployed 2026-08-06) and PR #366 (amplification,
reconciliation, server-established ownership).

## The governing rule

**An absent measurement must never be indistinguishable from a real zero, and no skip may be
invisible.**

Every design decision here follows from it. Unmeasured posts are skipped and counted per
state; excluded rows are reported, not filtered away; a run that inserted nothing while
erroring returns non-2xx rather than a cheerful 200; a run that recorded nothing because
nothing was missing is a **success**.

The rule exists because the defects in this area all *run perfectly*. Nothing throws, no
alert fires, and the output is a plausible number. That is the failure mode — see
[[Service-Role Data Exposure]] for the same property in a different defect class.

## The pipeline

```
publish path ──> donny_scheduled_posts (dimensions)
                          │
provider ──post.published──> outstand-webhook ──> social_post_log (+ verified_at)
                          │                              │
   reconcile-social-posts ─┘ (hourly, for lost/early)     ▼
                                            content-performance-capture
                                                          │
                                                    content_performance
```

- **`social_post_log`** is the enumeration surface. `content-performance-capture` measures
  only rows carrying **`verified_at`**, which only server-side code sets.
- **`outstand-webhook`** is the choke point: it receives `post.published` for every post
  regardless of which path created it, so coverage is structural rather than something each
  new publish path must remember. Same pattern as the notification choke point.
- **`reconcile-social-posts`** (hourly cron) exists because every publish path writes its
  schedule row *after* the provider returns, so a fast webhook can arrive before the row
  exists — the webhook matches nothing, returns 200, and the provider does not retry. It
  re-drives the same match, making delivery order and webhook uptime non-load-bearing.

## Ownership is server-established, not client-asserted

**This is the load-bearing security invariant, and it took four attempts to get right.**

The problem: both consumers decided *who owns a published post* by joining
`donny_scheduled_posts` on `metadata->>'outstand_post_id'`. Verified on prod —
`authenticated` and `anon` hold INSERT and UPDATE on **every** column of that table
(`metadata` included), and the INSERT policy is `WITH CHECK (user_id = auth.uid())` with
nothing constraining `metadata`. So any authenticated user could plant a row claiming any
post id, get `verified_at` stamped on it, and have the capture job spend the **org-wide**
Outstand key fetching another tenant's metrics into their own row — mis-filing the victim's
measurement at the same moment.

Provider post ids are **5 characters and low-entropy** (`XDb8e`, `XDbxe`, `mJuDd` — two
created nine seconds apart sharing a three-character prefix), so an attacker need not learn
an id. Planting a neighbourhood of guesses and letting the hourly sweep harvest the hits is
enough.

**The same root cause surfaced four times** before being closed: a webhook fallback built
over three tasks and deleted as a Codex P1; issue #35; the `verified_at` gate that closed
only half of #35; and the reconciliation review. Every response worked *around* it, and they
all went circular **because the trust anchor was a client-writable column**.

The fix: `outstand-proxy` holds both facts at once — it authenticates the caller
(`ctx.userId` from `auth.getUser()`, never a body or header) and proxies `POST /posts`, so it
sees the created id in the provider's own response. Neither half is client-assertable. The
binding lives in `outstand_post_ownership`, written only by the proxies with the service-role
key, with **no client write path at all**.

### Deliberate asymmetry

| consumer | posture | on no binding |
|---|---|---|
| `reconcile-social-posts` | **strict** | count (`unbound`) and skip |
| `outstand-webhook` | **permissive** | schedule-row match, counted `ownership=legacy_schedule` |

The sweep is new, so strictness costs it nothing. The webhook keeps the legacy path so
existing posts keep flowing — and counts its use, so the legacy population is *measurable*
rather than assumed. A binding that cannot be **read** refuses rather than falling back, with
one tolerated exception: the table not existing yet, which self-clears on migration.

### Per-row, not per-post rejection

Where the binding and a schedule row disagree, the disagreeing **row** is rejected, not the
whole post. Per-post rejection would let an attacker take a victim's real row down with a
planted one — trading a data leak for a **denial of measurement**, which on 5-character ids
is trivially blanketed. The rejection is counted even when the post is still recorded, so a
neutralised forgery is not invisible.

## What the binding does NOT prove

- **Not account control.** It establishes who *published*, because
  `business_outstand_accounts` is not column-locked and its `outstand_social_account_id` is
  therefore client-assertable.
- **Outstand only.** The table keys on a bare post id with no provider column, and
  5-character ids risk a cross-provider collision binding a post to the wrong user.
  Non-Outstand publishes log as **unbound rather than mis-bound**. See
  [[Social Provider Decision]] for why a second provider remains plausible.

## Known issues

- **Nothing has ever flowed through this pipeline.** Three `social_post_log` rows exist, all
  from June 2026, none verified. Every guarantee here rests on review and tests, not on a
  post being measured end to end. One real publish through each path is the only thing that
  closes this — an instance of [[Verify Before Reporting]].
- **`outstand-proxy` `enforceScope` authorizes PATCH/PUT/DELETE from account ids in the
  request body**, never checked against the target post — a cross-tenant *modify and delete*,
  pre-existing and worse than the read hole closed here.
- **Its platform-level read fallback** grants read access to every post on a platform the
  caller owns any one account on.
- **CI type-checks no edge functions.** `tsconfig.app.json`'s `include` is `["src"]`, so all
  80 Deno functions are unchecked. `deno check` works. `outstand-webhook`'s untyped
  `createClient()` resolves row types to `never` (12 such errors on main).
- **`posting_schedule_status = 'completed'` is a dead branch** — the CHECK permits it, no
  writer produces it, so its UI copy can never render. Same recorded-vs-reachable gap
  [[Content Delivery State Machine]] documents.

## Traps this cost us

- **A column-level `REVOKE` is a no-op** against Supabase's ambient table-wide GRANT. Revoke
  at *table* level, then re-grant explicit columns — and verify against
  `information_schema`, never against a successful apply.
- **A missing table surfaces as `PGRST205`, not SQLSTATE `42P01`.** PostgREST resolves tables
  from its own schema cache and 404s before the query reaches Postgres. (A bogus *column* on
  an existing table *does* reach Postgres → `42703`.) Match on `code`, never message prose.
- **When two implementations diverge and one is safer, unify to the safer one and fix the
  other.** Propagating the weaker behaviour for consistency preserves a latent bug and calls
  it alignment.
- **Reuse-don't-duplicate assumes the thing being reused works.** Amplification inherited a
  broken post-id parser by extending an existing guard; the result was a change that shipped,
  passed four reviews, and did nothing at all.
- **Read call sites, not signatures.** A finding was dismissed as over-reach because a
  component *accepts* a filter prop; the prop is optional and no real call site passes it.

## See Also

- [[Service-Role Data Exposure]] — the sibling defect class; same "runs perfectly" property
- [[Outstand]] — the provider this measures through
- [[Social Provider Decision]] — why Outstand, and what a provider swap would cost here
- [[Verify Before Reporting]] — an empty result is ambiguous, not a finding
- [[QA CI/CD Gate]] — where the edge-function type-check gap belongs
