# 2026-08-08 — `donny-dragonshare-score`: lead checked, confirmed, removed

Follow-up to the 2026-08-07 DragonFeed uplift session, which filed four **unverified leads**. This
session checked two of them. One was real; one of my own claims about the other was wrong.

## Lead 1 — `donny-dragonshare-score` IDOR: CONFIRMED, resolved by deletion

### What was actually wrong

Read from the deployed source (v60, `ACTIVE`, `verify_jwt: true` — no `config.toml` entry, so the
platform default applies). The authenticated `caller` was bound on line 32 via
`supabaseAnon.auth.getUser(token)` (401 on failure) and **never referenced again**. There was no
check that the caller owned the post or belonged to `post.target_org_id`. Everything after ran on the
service-role client, keyed only on a body-supplied `post_id`.

Consequences, in order of seriousness:

1. **Cross-tenant write** — overwrote `donny_recommended_tier`, `donny_score`,
   `donny_reach_estimate` on any post.
2. **A solvable private aggregate** — `matchQuality = min(100, 50 + orgBoostCount×5 +
   creatorPostCount×3)`, and `rationale` states `creatorPostCount` in plain text. One equation, one
   unknown ⇒ the target org's total captured/transferred boost count, which `ds_boosts_org_select`
   limits to org members and `ds_boosts_creator_select` limits to a creator's own posts. Saturates
   at 100; a count, not an amount.
3. **Cross-tenant read** — `select("*")` returned the post's `platform`, `content_type`, and the
   creator's verified post count.
4. **Audit misattribution** — the `dragonshare_events` row was stamped
   `actor_user_id: post.creator_id`, the **victim**. `ds_events_select` is
   `actor_user_id = auth.uid()`, so the victim sees a phantom event and the caller is untraceable.

### The sharpest detail: it was the hole in the DB's own guard

`trg_ds_posts_block_self_verify` (migration `20260601160000`) explicitly blocks an authenticated
non-admin from changing exactly those three `donny_*` columns — then returns early for
`auth.uid() is null`, i.e. the service role, because `boost-payment` legitimately needs that path.
So a service-role function with no authorization of its own reopened a path the DB had deliberately
closed. Defense-in-depth at the DB only protects against the credentials it can see.

### Why deletion beat adding the check

- **Zero callers.** Nothing in `src/`, no other edge function, no `config.toml` entry, no CI
  typecheck-gate entry, no script. Only docs mention it.
- **The trigger was never wired.** The 2026-04-27 plan specified a `dragonshare_posts` INSERT
  webhook; `trg_ds_post_submitted_fn` only inserts an event row. No HTTP call anywhere.
- **Never executed.** Confirmed on prod on two consecutive days (2026-08-07, 2026-08-08):
  `posts=10, with_tier=0, with_score=0, with_reach=0, score_events=0`.
- **Nothing reads the columns.** They appear only in generated `types.ts` and the guard trigger.

Musk's algorithm step 2 before step 3. Columns were **kept** (never drop a column) — they are simply
permanently null, which is already the status quo.

### Honest scoping of the severity

`post_id` is a uuid and RLS blocks listing foreign post ids, so a cross-tenant call needed an id
obtained out of band — not brute-forceable. Scores are deterministic from the post's own fields, so
no arbitrary value could be injected. **But** one variant needed no foreign id at all: a creator
knows their own post ids, and calling it on their own post still solves for the target business's
boost count. Hard to aim ≠ closed.

I did **not** execute the function against prod to prove the write. Demonstrating a write-capable
IDOR by performing the write is not worth it when the code reads unambiguously.

## Lead 2 — `landing-clips`: my "orphaned" claim was WRONG

Filed as "deployed and publicly callable but orphaned". The second half is false, and I had
propagated it into a recommendation to delete both functions together.

- It has a **real wired consumer**: `useLandingBackdropPlaylist` → `RotatingBackdrop` →
  `HeroVideoBackdrop`, lazy-loaded by `HeroSection` behind `LANDING_VIDEO_BACKDROP_ENABLED`.
- The flag being `false` is **deliberate preservation, not abandonment**. `DESIGN_SYSTEM.md` states
  that flipping it "re-enables the video experience with zero other code changes". Deleting the
  function would have broken that promise **silently** — `fetchLandingBackdropClips` swallows every
  error and returns `[]`, so the hero would just fall back to static with no error anywhere.
- It is also **not a data-exposure surface**. It returns only `content_file_path` for
  boosted + `status='verified'` + unflagged video posts, and the `dragonshare-content` bucket is
  `public = true` with an unconditional public-read policy — those URLs are already world-readable,
  for an anonymous marketing homepage.

The genuine open question there is **consent** — neither the creator nor the business is asked
before their video fronts the public homepage. That is the DragonFeed spec's phase-3b decision
(creator opts in, business can veto), not a vulnerability.

**Lesson:** "no live feature behind it" is a claim about the *whole* consumer chain including
flag-gated ones, and a lazy dynamic `import()` behind a false flag looks exactly like dead code to a
grep of runtime call sites. Check the chain, not the flag.

## The durable lesson: deleting source is not undeploying

Merging this PR removes the function from the repo. **The deployed function keeps serving requests**
until it is explicitly removed from Supabase. Until then the repo and the live attack surface
disagree — and the repo is the artifact everybody greps.

An orphaned *deployed* function is the worst instance of this class: live, authenticated-reachable,
and owned by no feature, so no test, no user report, and no code-review path ever touches it again.
The remedy is to audit the **deployed** function list against the repo, not the repo alone.

## Changed

- Deleted `supabase/functions/donny-dragonshare-score/index.ts` (the whole function; single file, no
  `_shared` imports beyond the standard two, no `config.toml` entry, no CI-gate entry).
- `docs/wiki/concepts/service-role-data-exposure.md` — new "Resolved by deletion" section + the
  source-vs-deploy lesson.
- `docs/superpowers/specs/2026-08-07-dragonfeed-uplift-design.md` §7 — both leads marked checked,
  with the `landing-clips` correction stated explicitly.
- `docs/superpowers/specs/2026-04-27-dragonshare-design.md` and
  `docs/superpowers/plans/2026-04-27-dragonshare-implementation.md` — removal notes so nobody
  rebuilds it from the old spec (the plan file still contains the full original source).

## Still open

- `donny-orchestrator/agents/dragonshare.ts:71-76` may omit `status='verified'`. Same-tenant, so not
  a leak, but a divergence from the RLS contract. **Unverified.**
- `CreatorSettings.tsx:44` may save stale form state over stored values. **Observed in code, not
  reproduced.**
- **Undeploying** `donny-dragonshare-score` from Supabase — a separate prod action, not done by this
  PR.
