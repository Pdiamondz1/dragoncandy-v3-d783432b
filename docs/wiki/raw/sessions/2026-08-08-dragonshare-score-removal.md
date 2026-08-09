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
- **The trigger was never wired — verified against prod, not the repo.** The 2026-04-27 plan
  specified a `dragonshare_posts` INSERT webhook. On prod: no `cron.job` command mentions
  dragonshare, no `pg_proc` body mentions `dragonshare-score`, and all four triggers on
  `dragonshare_posts` (`ds_posts_block_self_verify`, `trg_ds_post_submitted`,
  `trg_ds_post_verified`, `trg_ds_posts_updated_at`) call local plpgsql functions — none is a
  `supabase_functions.http_request` webhook.
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

### …but confirming that turned up a real defect, fixed in the same PR

`data-exposure-reviewer` raised `screenshot_url` as `[low]`. Verifying it showed the same reasoning
covers `content_file_path` too, which the reviewer missed — so the finding was **bigger than
flagged**, not smaller.

Both columns are **creator-writable free text**. Read from prod `pg_policies`:
`ds_posts_creator_insert` is `WITH CHECK (creator_id = auth.uid())` and `ds_posts_creator_update` is
`USING/WITH CHECK (creator_id = auth.uid())` — **no column constraint on either** — and
`trg_ds_posts_block_self_verify` lists status/boost/verification/`donny_*`/`creator_id`/
`target_org_id`, **neither media column**. The SQL filter (boosted + verified + unflagged) decides
*whose row is eligible*; it says nothing about *where the bytes come from*, and `VIDEO_EXT` checks
only the suffix. So a creator whose post got boosted could point the anonymous homepage at any URL —
an IP/UA beacon fired from every visitor's browser.

Fix: `buildClips` now takes a **required** `allowedPrefix` (required, not optional — an optional
security control invites omission) built by `allowedMediaPrefix(SUPABASE_URL)`, and pins both fields
to `…/storage/v1/object/public/dragonshare-content/`. An off-bucket **poster is dropped but the clip
is kept** (the video plays, it just loses its still frame). All 9 real rows already carry the prefix
(`with_screenshot = 0`, and every `content_file_path` matches), so behaviour is unchanged today.
14 tests, including a prefix-lookalike host, a sibling public bucket, and a non-http scheme.

**Codex then caught that the in-code filter alone was starvable** — the second-model pass earning its
place. The query takes the newest 20 eligible rows and `buildClips` filtered *after* the limit, so
enough recent off-bucket boosted rows would evict every valid clip from the window and the hero would
silently lose its dynamic clips (bounded: the static playlist still renders, since
`mergeBackdropPlaylist` merges dynamic *into* static). Fixed by pushing the predicate into the query
— `.like("content_file_path", likePrefixPattern(prefix))` — escaping `\ % _`, since `_` is a LIKE
single-char wildcard that would *loosen* the filter it exists to tighten. **Both layers kept**: SQL so
the window can't be starved, in-code because that covers `screenshot_url` and any future caller of the
pure helper. 16 tests.

**Generalizable:** a row-level eligibility filter is not a content filter. When a service-role
endpoint echoes a **URL that any user can write**, pin the origin separately from whatever decides
the row is allowed — and pin it **where the rows are selected**, not only where they are mapped, or
the filter is starvable by construction.

Note this half **needs an edge-function deploy** — unlike the deletion, it is a code change.

## Two new leads, both pre-existing, NOT fixed

Fanning the reviewer across all 90 functions surfaced two more instances of the same shape.
Corroborated mechanically — `grep -c "getUser\|isAuthorizedIngest"` returns **0** for both — but
**not reproduced end-to-end**, so they are leads.

- `fire-dragonshare-social-hook/index.ts:26-54` — body `boost_id`/`post_id`, service role, no caller
  resolution. Appears to let any valid-JWT holder plant `donny_scheduled_posts` drafts +
  `donny_nudges` into three other users' accounts.
- `dragonshare-notify/index.ts:346-361` — identical shape; notifications, nudges, a Donny chat
  message, into arbitrary accounts by id.

Neither returns victim data, so both are cross-user **write/forgery**, not read leaks. Each has
exactly one real caller (`_shared/fulfill-boost.ts`, service-role→service-role), so
`isAuthorizedIngest` — the pattern `auto-approve-content` uses — is the likely fix.

The earlier `donny-orchestrator/agents/dragonshare.ts` lead is also **worse than filed**: beyond the
missing `status='verified'`, it scopes on the denormalized `profiles.org_id` cache with no
`invitation_status='active'` qualifier.

**One reviewer false negative worth keeping.** `agents/billing.ts:80` reads
`(input.org_id) ?? userContext.org_id` where `org_id` is a declared LLM tool argument — textbook
check-4 shape, and **not** a hole: `donny-orchestrator/index.ts:491-499` builds `enrichedInput` as
`{ ...toolInput, org_id: userContext.org_id }`, overwriting it server-side. The fallback is dead
code. Check the call site before believing a tool-argument finding.

## The durable lesson: deleting source is not undeploying

Merging this PR removes the function from the repo. **The deployed function keeps serving requests**
until it is explicitly removed from Supabase. Until then the repo and the live attack surface
disagree — and the repo is the artifact everybody greps.

An orphaned *deployed* function is the worst instance of this class: live, authenticated-reachable,
and owned by no feature, so no test, no user report, and no code-review path ever touches it again.
The remedy is to audit the **deployed** function list against the repo, not the repo alone.

## Changed

- Deleted `supabase/functions/donny-dragonshare-score/index.ts` (the whole function; single file, no
  `_shared` imports beyond the standard two, no `config.toml` entry, no CI-gate entry). The CI
  edge-typecheck count drops 66 → **65 clean**, exactly as predicted.
- Hardened `supabase/functions/landing-clips/{index,lib,lib.test}.ts` — origin-pinned both media
  URLs (**needs a deploy**).
- `docs/wiki/concepts/service-role-data-exposure.md` — new "Resolved by deletion" section + the
  source-vs-deploy lesson.
- `docs/superpowers/specs/2026-08-07-dragonfeed-uplift-design.md` §7 — both leads marked checked,
  with the `landing-clips` correction stated explicitly.
- `docs/superpowers/specs/2026-04-27-dragonshare-design.md` and
  `docs/superpowers/plans/2026-04-27-dragonshare-implementation.md` — removal notes so nobody
  rebuilds it from the old spec (the plan file still contains the full original source).

## Still open

- `donny-orchestrator/agents/dragonshare.ts:69-87` — missing `status='verified'` **and** missing
  `invitation_status='active'` on a denormalized org cache. **Unverified.**
- `fire-dragonshare-social-hook` and `dragonshare-notify` — the two new `[med]` write/forgery leads
  above. **Not reproduced.**
- `CreatorSettings.tsx:44` may save stale form state over stored values. **Observed in code, not
  reproduced.**
- **Undeploying** `donny-dragonshare-score` from Supabase — a separate prod action, not done by this
  PR. Until it happens the hole is still open in production.
- **Deploying** the hardened `landing-clips` — also a separate prod action.
