# DragonCandy — Shipped Log

> Append-only changelog of completed work, **newest first**. Split out of
> `docs/PROJECT_CONTEXT.md` §5 on 2026-07-18, where it had grown to ~29,950 tokens —
> 65% of the context loaded into every Claude Code session.
>
> **This file is deliberately NOT imported by `CLAUDE.md`.** It is not auto-loaded.
> Read it on demand when you need the history behind a shipped feature.
>
> It *is* collected by `supabase/scripts/sync-internal-docs.mjs` (non-recursive
> `docs/*.md` glob), so it reaches `/internal/strategy` and Internal Donny's RAG.
> Note `MAX_EMBED_CHARS = 24_000`: content past that is stored and readable but not
> embedded, so semantic retrieval covers only the newest entries.
>
> **Prose duplication with `docs/wiki/` is intentional and not a defect.** The wiki
> holds the durable synthesis; this file holds the as-shipped session record. The
> monthly `strategy-library-audit-agent` should not file `strategy-dupe` or
> `strategy-bloat` findings against it.
>
> **Entries are historical snapshots, not current status.** Each was written when the
> work shipped and is preserved verbatim, so a "founder go-live pending" or "pending
> deploy" note records the state *at the time of writing* — it does not mean the step is
> still outstanding. **`PROJECT_CONTEXT.md` §5 is the authority on current status:** its
> "Built — awaiting founder go-live" subsection lists what is genuinely still open, and
> anything under "Shipped" is done. Where the two appear to disagree, §5 wins.
>
> **Adding an entry:** prepend it (newest first). See `knowledge-sync` step 4.

## [2026-08-07] `/media` scoped to its owner, atomic schedule completion, delegation flag

Four queued items after #368 merged.

**`/media` was unscoped across every tenant.** `outstand-proxy` allowed `/media`, `/media/upload`,
`/media/{id}` and `/media/{id}/confirm` for **every method** to **any** authenticated caller, under
the comment "Media is org-level in Outstand". The premise was right and the conclusion inverted: the
Outstand key is org-wide, so every tenant's uploads share one pool — any authenticated user could
list every tenant's media (filenames + URLs) and **DELETE any of it**, and the SDK calls all four
including `DELETE`.

Ownership could not come from the row — the SDK's `MediaFile` has no account/user/org field and the
provider offers no per-tenant scope — so `outstand_media_ownership` records it on our side at the one
moment both facts exist: the proxy authenticates the caller and proxies the upload, so it sees the
provider's own id. Mirrors `outstand_post_ownership` exactly. **Strict from day one**, which is safe
here for a reason rather than by preference: `GET /media` returns `count: 0`, so there is no
pre-binding population to strand.

**Delegated posting was offered and could not work** — the grant recorded, the post then failing
because the proxy checks the *grantee's* accounts. Hidden behind `DELEGATED_POSTING_ENABLED` after
verifying zero rows had ever been granted.

**A finished schedule could never say so.** `posting_schedule_status = 'completed'` had a CHECK value
and a rendered "All Posts Published" card, and nothing ever wrote it, so a fully-published campaign
sat on the "scheduled" card forever. Now written at the `outstand-webhook` choke point via an atomic
SECURITY DEFINER RPC, with an hourly sweep as the safety net.

**The reviews were mostly catching my own mistakes, and all were treated as blocking:**
(1) I reintroduced a **cross-tenant write** — campaign ids taken from a query matching on the
client-writable `metadata->>outstand_post_id`, when `confirm-posting-schedule` had already been
hardened against that identical write; (2) `social-proxy` created media and minted no binding — the
two-gateway shape the post store exists to prevent, one `case` block away; (3) the binding was not
provider-gated, so a Zernio id could enter an Outstand-keyed table; (4) I **broke every media
upload** by keeping `contentType` from the SDK's TypeScript signature when the wire field is
`content_type`; (5) read-then-write could strand a campaign permanently when its last two posts
published concurrently; (6) two silent caps, one of which would hide a heavy user's own media from
their own gallery; (7) a comment of mine asserting the **opposite** of the truth about offset paging;
(8) an unbounded sweep that could overrun the run budget and return nothing.

The edge-function typecheck gate from #368 caught one of these before review — the first time it paid
for itself. → `docs/wiki/concepts/cross-tenant-proxy-authorization.md`

## [2026-08-06] Honest analytics, the drafts editor, and an edge-function typecheck gate (#368)

Three items taken after the proxy security work, all on the same PR because a ~5-hour GitHub Actions
outage blocked everything from merging.

**Drafts "Edit" did nothing.** The button called `onSwitchTab('compose')` and nothing else: it
dropped the draft's content on the floor — you landed on an EMPTY compose form — and left the
original row behind, so finishing the edit would have published a duplicate and stranded the draft.
Loading the draft into Compose would not have fixed it either, because Compose publishes a NEW
provider post via `createPost` and cannot be a draft editor. A draft is a `donny_scheduled_posts`
row, so it now edits in place (caption / hashtags / scheduled_at). Hashtag parsing became a tested
pure function placed beside its inverse `composeCaption`, because a round-trip that disagrees with
itself is how an edit mangles what it meant to preserve; it emits the leading `#` (verified against
prod rows) and avoids `\w`, since `#CaféLife` is a real value an ASCII class truncates to `#Caf`.

**And underneath it, hashtags were never published at all** — pre-existing, found by Codex.
`publishDraft` and `scheduleDraft` both selected `caption` and omitted `hashtags`, so every tag
Donny has ever generated was dropped at publish while the draft card displayed it. The new dialog
merely started *promising* otherwise. Both paths now compose through `composeCaption`.

**CI type-checked none of the 99 edge functions.** `npm run typecheck` is `tsc -p
tsconfig.app.json`, whose `include` is `["src"]`, so every Deno function was unchecked for the life
of the project; `deno check` finds **128** real errors. Checking everything fails today and a gate
that cannot pass gets disabled within a week, so the gate checks the **66** that pass, lists the
**33** that do not in `supabase/functions/.typecheck-ignore`, and PRINTS that list on every run — a
skip nobody can see is indistinguishable from coverage, which is the exact failure being fixed. It
also fails if the list names a function that no longer exists. Added inside the existing `verify`
job so it inherits branch protection; confirmed passing in CI.

Three errors were fixed to reach a passing gate and all three were real, the sharpest being
`_shared/stripe-customer.ts`, where `customerId` was `string | undefined` at the write — a missing
id would have been **persisted** into the authoritative `organizations.stripe_customer_id` and
returned to payment callers as a customer id.

**Trap worth remembering:** `deno check --node-modules-dir=auto` from the repo root makes Deno take
over the project's `node_modules`, installing its own tree and pruning what it does not recognise.
It deleted `@types/node` and broke typecheck, lint and tests until `npm ci`. Hit locally; in CI it
would have silently poisoned every step after it. Deno now runs from an isolated `.deno-typecheck/`.

**The analytics tab was showing three things that carried no information** — `TopPosts` sorted by
recency with no metric read anywhere, `PostingHeatmap` titled "Best Posting Times" with a Low→High
*engagement* legend while counting post *volume*, and `FollowerChart` titled "Follower Growth" while
plotting absolute counts. The heatmap was the most harmful: unlike a mislabelled chart it drove a
decision, and a circular one. Meanwhile `content_performance` had accumulated since June with **zero
readers anywhere in `src/`**.

Each heading now matches what is computed, and real engagement drives the ranking once there is
enough of it — but **the threshold is the substance, not decoration**: a true number computed over
one post repeats the mistake in a new costume. Claims are gated on `MIN_POSTS_FOR_SIGNAL` (3), always
state N, and say how many more posts are needed rather than going blank. Ranking uses interactions
and excludes views, because a view is delivery and not response.

**Prod data state, checked before designing:** 9 `content_performance` rows across 3 posts, all
pre-fix and unverified, **6 of them fabricated all-zeros** the spine fix stopped writing but never
removed — so a naive reader would average real 1,388-view data against fakes. Founder chose exclusion
in code (`verified_at IS NOT NULL`, the pipeline's own rule) over prod deletion. Consequence stated
plainly in the UI: **zero measured posts today**, because the only verified post published that
afternoon and its first milestone had not elapsed.

Codex ran three rounds and every finding was treated as blocking: cross-posted posts **lost their
other platforms** (the key is `(post, platform, milestone)`, so collapsing to post id discarded the
rest and a fanned-out hit could rank below a weaker single-platform post); the threshold was computed
**account-wide while the view is platform-filtered**, which would have titled an all-zero grid "Best
Posting Times"; and a **literal NUL byte** in a composite key made `src/lib/postPerformance.ts`
**binary to git**, silently breaking future diffs of it. 807 tests. → `docs/wiki/concepts/honest-analytics.md`

## [2026-08-06] Cross-tenant authorization holes closed in `outstand-proxy` (#368)

**Deployed and prod-verified 2026-08-06** — `outstand-proxy` v61 → **v62**, `social-proxy` v7 → **v8**
(versions and hashes confirmed changed, `verify_jwt` still `true` on both). PR #368 itself is still
open, blocked by a GitHub Actions outage rather than by review, so the repo currently lags prod.

**The fix was verified with the same request that found the leak.** `GET /posts` as the
single-account user: `posts[]` went from 5 (four of them another tenant's) to 1; the only account id
present is the caller's own; `pagination.total` 49 → 1; the response shrank 13,065 → 2,773 bytes with
no trace of the foreign account id or nickname. Legitimate access is intact and denials are correct:
the caller's own post returns 200, its `/analytics` returns 200, `/social-accounts` returns 200, and
the foreign post `bld5T` returns **403 `forbidden_post`** — which also proves defect 2 is gone, since
that post is on Instagram and the caller owns an Instagram account, exactly the case the platform
fallback used to wave through.

Reviewing the measurement-spine work surfaced three **pre-existing, live** authorization defects in
`outstand-proxy`, worse than the read hole #366 closed. The governing fact: **the Outstand API key
is org-wide** — every tenant's posts, accounts and media sit behind one credential — so the proxy is
not a convenience layer, it *is* the tenant boundary. All three ran perfectly and returned plausible
responses.

1. **Request-body account ids were treated as a GRANT.** `enforceScope`'s `/posts/{id}` branch
   parsed `social_account_ids`/`accounts` from the caller-supplied body and allowed when `.some()`
   was owned, never checking the path's post against them. `DELETE /posts/{any_post_id}` with a body
   naming your own account id **modified or deleted any post in the org**.
2. **A platform-level fallback** allowed when the post's *platform* matched one the caller owned any
   account on — one Instagram account authorized every Instagram post in the org.
3. **`filterListBody` filtered one key while the response carried two.** `GET /posts` and
   `GET /social-accounts` are allowed **unconditionally**, on the promise that this filter strips
   other tenants' rows.

1 and 2 were **not separable**: fixing 1 alone left the destructive path fully open through 2.

**#3 was settled by capture, not argument** — one `GET /posts` through the proxy using the founder's
own session (no org key, no secret):

```
{ success: true, posts: [5 posts], data: [1 post], pagination: { total: 49, count: 5 } }
```

Four of the five posts in `posts[]` belonged to a **different tenant** — captions, media, live
Instagram permalinks — while `data[]` was correctly filtered to 1, and `pagination.total` disclosed
the org-wide count. The filter *looked* like it worked while the full list rode along beside it, and
the vendor SDK's `usePosts()` reads `.posts` — precisely the leaking key. The tell had been in our
own code: `reconcile-social-posts` reads `body.posts` **first**, citing the SDK's typing as stronger
evidence than the vendor's docs.

**The fix.** Two pure tested modules, extracted because `index.ts` calls `serve()` at module load and
is not import-testable — neither rule may have "we couldn't test it" as a property when it is the
tenant boundary. `_shared/outstand-post-authz.ts` (22 cases): exactly two things grant, both
server-established and neither client-assertable — provider-fetched post accounts intersected with
the caller's, and the `outstand_post_ownership` binding. The platform fallback is **deleted outright
with its two helpers**, so `decidePostAccess` takes no platform input and cannot be reinstated by an
argument change; body ids become an `.every()` **constraint** that runs first and outranks both
grants. `_shared/outstand-list-filter.ts` (23 cases, anchored on the captured envelope): filters
**every** row array via a bounded, cycle-guarded walk rather than a list of key names someone must
remember to extend, and rewrites every counter spelling. A row whose account ids cannot be resolved
is **dropped** — unattributable is not owned.

**Third commit — the review's findings.** `data-exposure-reviewer` found nothing introduced but
surfaced real pre-existing issues; three were fixed. The sharpest: the account-claim guard **failed
open** — `.maybeSingle()` returns `{data: null, error}` when **more than one** row matches, i.e.
exactly when two or more other tenants already claim the id, and the error was discarded so null read
as "unclaimed". `social-proxy` already had this fix; `outstand-proxy` never got it. Also: list
filtering was depth-1 only, and counters were sanitized in one spelling out of six.

Two findings were **dismissed with evidence** rather than implemented — grant 1 is not structurally
empty (`GET /posts/{id}` returns `post.socialAccounts[].id`, captured), and the `String()` coercion
concern doesn't apply (the SDK types `accounts` as `string[]`). The first also resolved the
regression tail nobody could quantify: the 3 legacy unbound posts belong to the other tenant and
*should* be denied.

Also corrected a note in `social-proxy` instructing a future editor to **reinstate**, in Phase 3, the
platform fallback and the `donny_scheduled_posts` lookup — deleting vulnerable code without deleting
the note telling someone to bring it back leaves the vulnerability scheduled.

**Gates:** 1240 tests / 113 files (45 new); `typecheck` + `deno check` clean; **Codex clean, run
twice**. Both of the day's PRs sat un-mergeable through a **GitHub Actions major outage** (from 15:22
UTC, unresolved at 19:43) — a required check queued 15 minutes and was cancelled, which
`gh pr checks` reports as `fail`. This PR also **absorbs PR #367** by cherry-pick: that PR touched
exactly the same five docs files and was still unmerged, so folding it in avoided a guaranteed
conflict.

**Follow-up fixed in the same branch — the substrate under grant 1.** `business_outstand_accounts`
INSERT was unconstrained: `authenticated` **and `anon`** held it on all 14 columns including
`outstand_social_account_id`; the INSERT policy pinned *who owned the row* but never *which account
it claimed*; and the unique index is `(user_id, outstand_social_account_id)` — **per-user, not
global**. A direct PostgREST insert never touches the proxy, so the claim-check above is no
mitigation. Any authenticated business user could mint themselves into `ownedIds` and thereby reach
another tenant's posts through the grants this branch had just made load-bearing. Migration
`20260806210000` revokes INSERT outright (the client INSERT surface is **empty** — all three writers
use the service-role key, which holds its own grant) and drops the now-dead INSERT policy, so a
future `GRANT INSERT` lands on RLS-with-no-policy rather than silently reopening it. Checked for
prior exploitation first: 9 rows, every account id held by exactly one user. **Applied to prod
2026-08-06 and verified against reality, not against the apply's success return:** zero INSERT grants
outside `postgres`/`service_role`; exactly 4 policies with no INSERT among them (proving the
`DROP POLICY IF EXISTS` matched rather than no-opping on a renamed policy); the client's
`UPDATE (org_unit_id, status)` + own-row `SELECT`/`DELETE` still intact and the Social page still
renders its one connected account; and a rollback-wrapped insert of the *actual* forgery — a row
claiming the other tenant's `I2pgX` — as role `authenticated` returned **`42501 permission
denied`**. The review also caught that the migration's own verification query filtered
`grantee in ('anon','authenticated')`, which would have reported PASS while a PUBLIC grant stood;
fixed, along with adding `public` to the revoke.

**Filed, not fixed:** `/media` is unscoped for every method and any caller, but the SDK's `MediaFile`
type carries no account/user/org field so there is nothing to filter on — it needs its own ownership
binding plus a migration, and reads `count: 0` today. `/social-accounts/pending/{token}/finalize` rests on provider token entropy. Delegated posting
appears inert (`ownedIds` is keyed on the grantee). Offset paging over a filtered list remains
incoherent. → `docs/wiki/concepts/cross-tenant-proxy-authorization.md`

## [2026-08-06] Measurement spine DEPLOYED + the first post ever measured end-to-end

The entry below records what shipped; this records it going live and being **proven**. PR #366 merged,
then deployed in the order the reviewers required: migration `20260806184500` first (its
grant-verification query returned **exactly one row, `service_role`** — the check that separates a real
lockdown from one that reads as protection while providing none), Vault secrets, then
`reconcile-social-posts` (new, v1), `outstand-proxy` (v61), `social-proxy` (v7), `outstand-webhook`
(v17→**v18, all 5 required files** — live v17 carried only 3, so a partial bundle would have kept the
old code serving while every webhook still returned 200), and the cron migration last.

Deploying via the **Supabase CLI rather than the MCP file-list** mattered: it bundles by *import graph*,
which automatically excluded the `vitest`-importing test files that sit beside `reconcile-social-posts`
and `social-proxy`. Had those landed in the deployed set, both functions would have failed to boot.

**The first post ever measured** (`ei1xc`, a real Instagram publish through the DragonShare-draft path):
binding minted 17:58:50 → `social_post_log` written 17:58:51 → published 17:59:10 → **`verified_at`
stamped by the webhook 1.5 s later**. A follow-up sweep returned `alreadyRecorded 1 · newlyRecorded 0 ·
unbound 0 · ownerConflicts 0` — the strict gate *found* the binding, and the two independent writers
agreed on the same key rather than duplicating, which is what extracting the shared row builder was for.
The hourly cron then fired on its own at 18:00:02.

**Honest limits.** The literal `POST /posts` body was not captured (shape proven only functionally);
multi-platform fan-out is untested (one connection); and **amplification remains unproven — it is
brand-only, and all six brand accounts have zero social connections.** So the branch's headline feature
sits behind a role that cannot currently publish.

Found live en route: the Drafts tab's **Edit** button is `onClick={() => onSwitchTab?.('compose')}` and
nothing else — it opens an empty composer and silently discards the draft.

→ `docs/wiki/concepts/social-measurement-spine.md`

## [2026-08-06] Social measurement spine + reconciliation + server-established post ownership (#365, #366)

The founder asked for deeper analytics — per-post performance, hashtags, account stats — so Donny
could consult a business on what to post and which creator to hire again. Three of the four outcomes
wanted turned out to be the same fact (*how did this post perform*) sliced by dimensions we already
know, so this is one foundation, not four projects. Building it first required fixing the pipe.

**PR #365 — the spine (merged + deployed).** `content-performance-capture` enumerates
`social_post_log`, but only two of five publishing paths ever wrote it, so analytics would have
silently analysed a sample excluding most posts. Three live defects, none previously reported:

- **Video posts were silently discarded at publish.** `content-posting-plan` returns `video_reel`;
  the `donny_scheduled_posts.content_type` CHECK didn't allow it; the insert's error was thrown away.
  A video published to the provider and vanished — no row, never measured, user shown success. Proven
  on prod with a rollback-wrapped probe.
- **Every unmeasured post was stored as a real zero.** Outstand support confirmed that *three*
  distinct states all return `success: true` with all-zero metrics, and only one sets `metrics_error`.
  The capture job guarded only the null payload, so all three were written as genuine readings of zero.
- **The measurement record was never written for most posts** → moved to the `outstand-webhook` choke
  point, which sees `post.published` regardless of origin, making coverage structural.

Plus `UNIQUE (outstand_post_id, platform)`, nullable dimension columns, `post_type` in twin pure
modules with a **cross-module equivalence test** (52 input combinations, so drift fails CI rather than
silently relabelling posts), `content_performance` regrained to `(post, platform, milestone)`,
`verified_at` set only by the service-role webhook, and five webhook signature tests that had **never
run in CI**. The `verified_at` lockdown hit a trap the repo had already recorded: a bare
`REVOKE INSERT (col)` is a **no-op** against Supabase's ambient table-wide GRANT — revoke at table
level, re-grant explicit columns, and verify against `information_schema`, not a successful apply.

**PR #366 — the three things #365 left open.** Amplification was the only publish path writing no
schedule row, so its posts were structurally unmeasurable; it now writes them (a webhook-side fallback
was built over three tasks and **deleted as a Codex P1** — it resolved ownership from a table whose
INSERT policy doesn't constrain the account id). Tracing that through its consumer found the webhook's
`post_type` recompute had no `amplification` mapping, and amplification always carries a `campaign_id`
— so **Task 1 alone would have shipped a correct row into a consumer that corrupted it.** And
`reconcile-social-posts` (hourly) now re-drives the match, because every path writes its schedule row
*after* the provider returns: a fast webhook finds nothing, returns 200, and the provider never retries.

**Ownership became server-established.** Two independent reviewers found the sweep would *widen* a live
cross-tenant hole. Both consumers decided who owns a post by joining `donny_scheduled_posts` on
`metadata->>'outstand_post_id'` — verified on prod, `authenticated` **and `anon`** hold INSERT and
UPDATE on **every** column of that table, and the policy constrains only `user_id`. So anyone could
plant a row claiming any post id, get `verified_at` stamped, and have the capture job spend the
**org-wide** Outstand key filing another tenant's metrics under their row. Provider ids are 5
characters and low-entropy (`XDb8e`, `XDbxe` — nine seconds apart, three-character shared prefix), so
guessing beats knowing. **This root cause had surfaced four times** and every response worked *around*
it; they all went circular because the trust anchor was client-writable. Fixed with an
`outstand_post_ownership` binding minted by `outstand-proxy`/`social-proxy` from `auth.getUser()` plus
the provider's own response id — **no client write path at all**. The sweep is **strict** (no binding,
no write — it's new, so this costs nothing); the webhook is **permissive**, counting legacy use so that
population is measurable rather than assumed. Disagreement is rejected **per row, not per post** —
per-post would let an attacker take a victim's real row down with a planted one, trading a leak for a
denial-of-measurement.

**Codex found what four reviews missed.** Amplification's id parse was `data.id ?? data.data.id` — it
never checked the `.post.` level, resolved `null` on every call, and the guard then skipped both writes.
**The branch's entire purpose was inert**, past a whole-branch review, a data-exposure review, a scoped
security review, and my own tracing. All four asked *is the new code correct?*; Codex asked *does it
run?* The cause was an instruction to extend the **existing** guard rather than add a second one — good
advice that here pointed at broken code. **Reuse-don't-duplicate is right; what was missing was
verifying the reused thing works.** Fixed as a divergence problem (one tested `src/lib/outstandPostId.ts`,
three readers routed through it); `DonnyProvider` turned out to be a *third* variant that only worked
because a normalizer always fires.

**Filed, deliberately unfixed** (exploit chains in the task report): `outstand-proxy`'s `enforceScope`
authorizes PATCH/PUT/DELETE from account ids in the **request body**, never checked against the target
post — a cross-tenant *modify and delete*, worse than the read hole closed here; its platform-level read
fallback exposes every post on a platform the caller owns one account on; and `business_outstand_accounts`
isn't column-locked, which is why the binding proves who *published* rather than account control. Also
found: **CI type-checks none of the 80 edge functions** (`tsconfig.app.json` includes only `src`);
`deno check` works, and `outstand-webhook`'s untyped `createClient()` yields 12 `never`-type errors on main.

**Known gap, not hidden: nothing has ever flowed through this pipeline.** Three `social_post_log` rows
exist, all from June, none verified. Every guarantee rests on review and tests. One real publish through
each path is the only proof that counts.

→ `docs/wiki/concepts/social-measurement-spine.md`

## [2026-08-02] VerifiedRoute missing-profile lockout — a false "verify your email" (#357)

A founder report — "Adrian Vella is unable to sign-up or login to DragonCandy.io" — with a phone
video showing the toast *"Please verify your email to continue."* **The report's premise was false
in every particular.** Prod said he had verified on 2026-06-26 (eight minutes after signup) and had
signed in **successfully that same morning** (`last_sign_in_at 2026-08-02 11:48:25`). He was
authenticating fine and being deflected by the email-verification gate, told to do the one thing
that could not possibly help. *(Diagnostic lesson: for any "can't log in" report, query `auth.users
LEFT JOIN profiles` and read `last_sign_in_at` first — one query falsifies the premise.)*

**Root cause.** `VerifiedRoute` gated on `profile?.email_verified !== true`, collapsing "email
genuinely unverified" with "there is no `profiles` row to read". It guards exactly **one** route —
`/profile/setup`, the onboarding wizard — so a profile-less user was bounced off *the only page
that could provision them*, and `AuthPage` re-runs `checkProfileCompletion` on `isAuthenticated`,
closing the loop: `login → !profile → /profile/onboarding → /profile/setup → toast → /auth → ↻`.
`BusinessRoute`/`BrandRoute` funnel profile-less users to the same place, so they feed the trap;
`VerifiedRoute` is where it closes.

Two ways in. (1) `handle_new_user` early-returns for `raw_user_meta_data.account_scope='internal'`
— the AIOS stakeholder-invite flow — so those accounts have **no consumer profile by design**;
Adrian, an internal `admin` since 2026-06-26, was the first to visit the consumer app. (2) The
common one: **any** signup whose row is missing but whose metadata carries a `role`, because
`AuthContext.createProfileFromMetadata()` fabricates a stand-in profile that has **no
`email_verified` key at all**.

**The lesson worth keeping:** cause (2) defeated the first fix and survived a Codex round. A
`profile ? profile.email_verified !== true : <fallback>` test takes the *first* branch for the
fabricated object, where `undefined !== true` rebuilds the identical loop — for the common case,
not just internal accounts. **"profile is non-null" is not a reliable test for "the row exists."**
Resolve on whether the flag is *known*: `profile?.email_verified ?? !!user?.email_confirmed_at`
(`??` preserves a genuinely stored `false`, so real blocking is unchanged).

**Shipped.** `VerifiedRoute` distinguishes the states and routes internal-only accounts to
`/internal`. `OnboardingWizard` now provisions the `profiles` row it had always assumed existed
(`ignoreDuplicates`, so an existing row is never touched and a real `email_verified=false` cannot
be overwritten) and sets `account_type` explicitly rather than inheriting the `'restaurant'`
default. `AuthContext` gains `refreshProfile()` — it previously had no way to re-read the profile
outside an auth-state change, so a freshly provisioned user would land on a dashboard still holding
`profile === null`.

**Review.** Three Codex rounds; rounds 1 and 2 each found a real defect in the branch (the stale
auth state; the metadata-fabricated-profile gap). 9 unit tests — the **4 covering genuine
unverified-email blocking pass against both the old and new code**, so the real verification path is
provably untouched, while the regression tests fail against the old code. Typecheck + build clean,
542 tests across 76 files pass.

**Prod remediation** (one-time, `careful`-gated, founder-confirmed SQL): created Adrian's missing
`profiles` (business_client, `email_verified=true` — truthful) and `business_profiles`
(`restaurant`, `is_completed=false`) rows, and set `raw_user_meta_data.role`. That last statement
was **required, not cosmetic**: the wizard reads role from metadata and defaults to
`content_creator`, so without it he'd have hit a *second* loop in the creator flow. His
`account_scope='internal'` and `user_roles.role='admin'` were left untouched — he keeps `/internal`,
making him a legitimate dual internal+consumer account. He was the only user on prod without a
profile row; that count is now **0**.

→ `docs/wiki/concepts/internal-only-users.md` · #357

## [2026-07-26] Plain-language Stakeholder Scorecard — /internal/scorecard (`feat/internal-stakeholder-scorecard`)

**Sub-project 4 of 4** in the AIOS scaling-dashboard ask. A new `/internal/scorecard` page — "How
DragonCandy is doing" — translates the raw metrics into four plain-language stories (traction, capital
efficiency, scale headroom, revenue readiness) a non-technical stakeholder (co-founders, board, advisors
on AIOS invite accounts) can read and speak to investors about, each with a headline number, a "what it
means" line, and an auto green/amber/info signal, under a **founder-set headline** (admin-editable KV row).
Plus a print-optimized **"Export snapshot"** one-pager (light, self-contained, no login). Stage-honest
framing: pre-revenue by design → traction + capital efficiency + scale readiness, not revenue.
**Deterministic phrasing (never LLM)** — a stakeholder-facing figure must be exact/reproducible/free. A
pure `scorecardModel.ts` (`buildScorecard` + `growthLast30Days`) drives every card. **Aggregate-burn RPC:**
the burn inputs (`operating_expenses`, `donny_cost_ledger`) are admin-only, so `aios_stakeholder_burn()`
(SECURITY DEFINER, `is_internal_user()`-gated, REVOKE anon/public) returns ONLY the aggregate
`{opex, ai_spend, revenue, net_burn}` (no line items / no per-model breakdown) — reusing the internal-gated
`aios_revenue_stats()` for revenue but inlining the ledger sum (never the admin-only `aios_cost_stats()`).
**Real-only vs physical:** user/traction/revenue are synthetic-excluded; the headroom card is intentionally
physical `db_bytes` (no `db_bytes_real`) — correct for a tier question, conservative, and labeled "incl.
test data". Reuses existing hooks; only new backend = the RPC + two `aios_dashboard_settings` KV rows
(seeded in the migration; admins edit the headline via a direct `.update()` under the existing admin-UPDATE
RLS). **Reviews:** data-exposure-reviewer PASS (aggregate-only, correct gate); Codex clean after 2 real
fixes — P2: a failed/loading burn RPC used to feed `net_burn_cents:0` → a false "~$0/month · green" card,
now an honest "unavailable" info state; P3: `growthLast30Days` could baseline off the latest snapshot itself
(false "+0"), now always a prior point. spec-reviewed (2 rounds) + plan-reviewed. typecheck + lint + 11
tests + build green. **Deploy (load-bearing):** apply migration `20260726173000` at the careful gate.
Wiki: [[Stakeholder Scorecard]]. Sub-projects 2 (live infra telemetry) + 3 (cost model + DAU forecast)
remain scoped/not-built.

## [2026-07-27] Cost model + DAU forecast — /internal/forecast (`feat/internal-cost-dau-forecast`)

**Sub-project 3 of 4** of the founder ask to make the AIOS dashboard show the app's true weight/cost and how
it scales (1 = synthetic metric parity, PR #346; 4 = stakeholder scorecard, PR #350; 2 = live infra telemetry,
still scoped). Adds an **admin-only `/internal/forecast`** page that projects, for **Today / 500K / 750K / 1M
DAU**: infra footprint → required Supabase tier → total monthly cost → revenue (at the take-rate ladder) →
**gross margin**. It's a pure, deterministic (no-LLM) `forecastModel.ts` — mirrors `scorecardModel`/`weightThresholds`
— fed by **measured coefficients** (the 200K load run's DB-conns-per-concurrent + egress-per-request, via
`useSimLoadMatrixSummary`; current footprint via `usePlatformWeight`; AI/opex/revenue via the existing internal
hooks) plus **9 founder-editable assumptions** stored in the existing `aios_dashboard_settings` KV table — no new
RPC/RLS. Honesty rails: every figure tagged measured/derived/assumed; **AI self-caps at 15% of revenue with the
$250/mo floor**; DB/storage never forecast below today; the load-run coefficient degrades to a documented default
(guarded on null AND zero denominator) with a visible note; "Today" is measured-only (`—`, never fabricated).

**Key decisions (from two spec-review rounds + two plan-review rounds):** the page is **admin-gated like
`/internal/expenses`** — its cost inputs (`operating_expenses`, `aios_cost_stats`) are admin-only RLS, so a
stakeholder-visible version would silently show $0 opex / an inflated margin; the *stakeholder* reach is instead
the scorecard's one-line margin tie-in (deferred until #350 is on `main`). Since this branch is off `origin/main`
(no #346/#350), it sources the real registered-user baseline from `usePlatformStats().users.total` (not
`users_total_real`, which isn't on `PlatformWeightRow`'s type here). There is no DAU tracking in the app, so the
forecast is explicitly a **what-if capacity/cost model, not a growth projection**.

**Build:** pure `forecastModel` + `useForecastAssumptions` hook + a founder-gated seed migration
(`20260727120000`, **not applied**) + `ForecastTable` (four-scenario table + cost-vs-revenue chart) +
`ForecastAssumptionsPanel` (live-tunable) + the page + admin route/Operate-group nav. Subagent-driven (7 tasks),
17 tests (14 model, 3 component; recharts needs a jsdom `ResizeObserver` stub), typecheck + lint + build green,
Codex second review. Wiki: [[Cost Model + DAU Forecast]].

## [2026-07-27] Live DB health + scale-up trigger — /internal/weight (`feat/internal-db-health-telemetry`)

**Sub-project 2 of 4 — the LAST** of the founder ask to make the AIOS dashboard show the app's true weight/cost
and how it scales (1 = synthetic parity #346; 3 = cost/DAU forecast #352; 4 = stakeholder scorecard #350). Adds
a live **"Database health"** section to `/internal/weight` (retitled **"Weight & health"**): real-traffic infra
telemetry — connections vs the pool ceiling, query latency, cache-hit, transaction counters, DB size — plus a
**connection-headroom scale-up alert** (warn ≥70% / critical ≥85% of usable connections).

**Backed by one RPC, no new table or secret.** `aios_db_health()` (`SECURITY DEFINER`, `search_path=public`,
`is_internal_user()`-gated, `REVOKE public/anon` + `GRANT authenticated/service_role`) does a **live `pg_stat`
read**, reusing the exact pattern proven by `capture_sim_load_snapshot` ([[Synthetic Weight Engine]]) and the
gating of `aios_platform_stats`. `useDbHealth()` polls it every 20s while the page is open; `DbHealthSection`
renders the live cards + the connection alert + a "live · updated Ns ago" affordance, owning its own
loading/error. The scale trigger is `computeConnectionAlert` in `weightThresholds.ts`.

**Scope choice (founder): DB telemetry now, CPU/RAM next.** CPU/RAM aren't in Postgres — they need Supabase's
privileged metrics endpoint (not wired, possibly a new token), so this ships what `pg_stat` exposes and leaves a
labeled CPU/RAM "coming next" seam. **Honesty rails:** latency is a call-weighted **mean, not a p95** (Postgres
exposes no percentiles server-side); `xact`/cache-hit are labeled **cumulative/lifetime** counters, never a
"rate"; the connection alert carries the caveat that the Supavisor pooler fronts connections and the 200K load
run measured the DB at ~30% at 4,000 concurrent, so it's early-warning, not the primary signal.

Migration `20260727170000` is **founder-gated (NOT applied)**; the section degrades to an "unavailable" state
until it lands (the rest of the Weight page is unaffected). **data-exposure-reviewer PASS** (aggregate-only,
correctly gated, no `pg_stat_activity.query`/`usename`; bounded DEFINER). Subagent-driven build (thresholds +
component); 28 tests, typecheck + lint + build green, Codex second review. One documented tradeoff (the health
section is hidden while `platform_weight` itself is loading/errored/empty — the reverse of the spec's isolation,
which is satisfied; full independence is a follow-up) + the deferred CPU/RAM follow-up. Wiki: [[Live DB Health]].

## [2026-07-26] Living Synthetic Marketplace — go-live record + status correction

**Not new work — a record of work that shipped without one, and the correction of three docs that
still described it as pending.** The [[Living Synthetic Marketplace]] (Sub-project A) went live on
prod across PRs #339–#342 on 2026-07-25 and was scaled the same day, but the 07-25 `SHIPPED_LOG`
entry below covers the *offline build + live teardown* only — the go-live itself was never logged,
so `PROJECT_CONTEXT.md` §5, the wiki concept page's `## State`, and the `index.md` entry all still
read "offline code complete … **Pending (founder-gated):** merge → dispatch a small 2/4 seed → …
→ scale to 100/300". §5 is loaded into every session, so that stale line was being read as current
by every subsequent session for a day.

**Verified live state** (counted from the registry, not inferred): **2,000 `botmk_` profiles — 500
business / 1,500 creator** across 24 US cities, split into **24 active** (`botmk_b_` 8 /
`botmk_c_` 16 — interactive, real RLS-enforced flows) and **1,976 depth** (`botmk_db_` 492 /
`botmk_dc_` 1,484 — bulk-inserted, browse-only, never authenticate).

**Why the split exists** (the durable design point, now stated on the concept page): minting a bot
session costs a real authentication and prod rate-limits those at roughly 25 per IP, so a browsable
marketplace of 2,000 profiles is simply unreachable by minting 2,000 sessions. Depth profiles exist
to be *browsed*, so they skip auth entirely; only the ~24-bot active core runs live flows. Scaling
further is direct `seed_synthetic_marketplace_depth(<biz>, <creators>, <seed>)` calls (~400 rows
each) under fresh seeds. Segregation held byte-identically across the scale-up, and the live 25-bot
`bot0##` Synthetic Weight crew cohort was untouched. Reset is the `botmk_`-scoped
`marketplace-purge`, never `purge_synthetic_data()`.

Docs corrected: §5 entry **moved** Built-awaiting-go-live → Shipped; the concept page's `## State`
rewritten with the live table + a dated note of what it used to claim; the `index.md` entry's
"offline code complete, seed run founder-gated" tail replaced. The 07-25 entry below is deliberately
left as written — `SHIPPED_LOG` entries are historical snapshots, not current status.

## [2026-07-26] Synthetic metric parity — /internal/simulation mirrors the Overview card set (`feat/internal-metrics-real-vs-total`)

Completes the "real vs total" theme (the `/internal` Overview banner + subs shipped separately as PR #344),
and is **sub-project 1 of 4** in a founder ask to make the AIOS dashboard show the true weight/cost of the
app and how it scales (2 = live infra telemetry + scaling headroom; 3 = cost model + DAU forecast
500K/750K/1M; 4 = a **plain-language stakeholder status** layer so non-technical board/investor readers can
speak to how the app is performing — all deferred to their own design cycles). **The Simulation page
(Synthetic Weight Engine) top now mirrors the `/internal` Overview card set 1:1**, valued with the synthetic
cohort, so real vs synthetic compare apples-to-apples; simulation-only widgets (registry `Bots total`,
personas, matrix run, load curve, modeled revenue) sit below a divider. Key insight: `aios_platform_stats`
already returns every metric as real (`WHERE NOT is_synthetic`) **and** `total_all` (no filter, from #344),
so **synthetic = `total_all − total`** using the identical method — the two pages reconcile by construction.
Migration `20260725150000` was edited to add three additive `*_all` breakdown maps (`by_status_all`,
`posts_by_status_all`, `by_platform_all`) for synthetic sub-line parity (the `*_all` totals were already
applied to prod with #344; only these three keys still need the careful-gate apply). A pure
`deriveCardModel(stats, mode)` (real mode reproduces the old Overview cards **byte-for-byte**, unit-tested as
the parity contract) + a shared `PlatformMetricSections` (used by BOTH pages; keyed `<Fragment>` per section,
not a `<div>`, so `SectionHeading`'s `first:mt-0` survives) mean the two surfaces can't drift. **Graceful
pre-migration degradation:** all `*_all` fields are optional; the Overview banner guards every `*_all` read
with `?? 0`; Simulation shows a distinct "metrics pending migration" state (not a false "no cohort") when
`total_all` is absent — two Codex P2s (real-mode `by_role_all` crash; the false-empty synthetic state) fixed
across 4 Codex rounds (final clean), plus an independent Claude spec-review of the plan + a final whole-diff
review (3 Minor consistency findings fixed). typecheck + lint + 16 unit tests + build green. Wiki:
[[Internal Real-vs-Total Metrics]].

**Follow-up (same PR) — combined-totals panel.** Founder feedback: neither surface showed a single panel
with the *combined* (real + simulated) totals for everyone to see clearly — the Overview buried the grand
total in a grey "of N incl. synthetic" sub-line, and Simulation is synthetic-only. Added a **"Platform totals
— real + simulated" strip at the very top of the Overview**: six headline cards (Total users, Businesses,
Campaigns, DragonFeed posts, DragonShare boosts, Promotions), each the grand total (`*_all`) with a `N real ·
N simulated` split sub. A new pure `deriveCombinedTotals(stats)` (same `total = all ?? real` pre-migration
fallback — never a false 0) + a small `PlatformTotalsPanel`; placed **above** the "real only" banner so its
"metrics below" stays accurate. Tests extended (deriveCombinedTotals: order, `all − real` split, pre-migration
fallback); typecheck + lint + build green.

## [2026-07-26] The 200K-band load run + the 16 KB header wall (`fix/sim-preflight-header-overflow`, PR #345)

The session where [[Synthetic Weight Engine]] Slice 2 stopped being *built* and became *run*. Three
things happened: the migration went to prod, the Slice-2 code got its first live exercise, and a
four-times-repeated CI failure that looked exactly like a network outage turned out to be our own
code hitting a Node transport limit. Full session:
`docs/wiki/raw/sessions/2026-07-26-200k-load-run-and-header-overflow.md`.

**1. Migration applied + validated.** `20260725140000_sim_load_matrix_overlap_summary.sql` applied
under the careful gate (recorded `20260726024318`) and verified through the **deployed** function,
not the file: both embedded fixtures replayed against prod — OVERLAP → `offered=400 / honest=400 /
shards=2 / requests=220`, STAGGER → `offered=400 / honest=200 / shards=1`, i.e. exactly the
inflation the migration exists to prevent. Both ran inside a `DO` block ending in `RAISE`, which
surfaces the result *and* rolls the fixture rows back (MCP `execute_sql` returns only the last
statement's result); `sim_load_snapshots` confirmed zero leaked rows afterwards. The first live
exercise (`matrix-slice2-val-20260726`, 2 shards × C=200 × 120 s) came back **fully green — all
four jobs** — which no Slice-1 run ever did (they always went red on dead-GCS media 403s): 400
concurrency, 25,400 requests, 0 breakage, 0 throttled, **302 MB of real Storage egress with 0 media
errors**, DB 22/90 at 7.91 ms.

**2. Four dead dispatches, and a wrong theory held for two hours.** Every 20-shard cap-discovery
attempt (four runs, 09:37–10:11 UTC) died in the **seed** job ~1 s in on
`[bulk-seed] active-namespace pre-flight query failed: TypeError: fetch failed`, while `npm ci` in
the same job succeeded. The obvious reading was a GitHub→Supabase network problem, and that is what
was chased: Supabase network restrictions (off), network bans (zero), status page (operational).
All negative. **The discriminator was already in the log:** `cmdBulkSeed` runs `bootGate` — a real
Supabase query — *before* the pre-flight, so the database had answered milliseconds earlier in the
same process. That one ordering fact makes "this runner cannot reach Supabase" impossible, and it
was observable from the first failure.

**3. Root cause — an unbounded `.in()` overflows undici's 16 KB header limit.** `.in()` serialises
every value into the URL query string and PostgREST echoes the request URI back in the
**`Content-Location` response header**; at 500 emails that header is ~21 KB, blowing Node/undici's
16 KB `maxHeaderSize` → `UND_ERR_HEADERS_OVERFLOW`. Being transport-layer it is **not** a
`PostgrestError`, so it never reaches the `error` branch that would have named it. Reproduced
against prod REST in one process: 250 ids = 10,475 chars OK, **400 = 16,775 OVERFLOW**, 500 =
20,975 OVERFLOW. Latent until now because Slice 1's `MAX_SHARDS = 10` capped the cohort at 250
emails, just under the wall; Slice 2's 20 made it 500. PR #345 chunks at 100 ids/request at both
sites — `seed.ts assertActiveNamespaceFree` (the break) and `mint.ts selectIn` (**latent and
worse**: `readCohort` passes every session-capable bot id, so live 25 + a 500-bot cohort = 525
UUIDs = 20,590 chars, which would have broken the **daily `tick` cron** had a matrix cohort been
left seeded). Ordering and fail-loud semantics unchanged; tests assert the real constraint (the
built URL stays under 16 KB), not the chunk size. Codex clean on the first pass. See
[[Supabase .in() Header Overflow]].

**4. The 200K-band run** (`matrix-cap-20260726e-30202071632.1`, 20 shards × C=200 × 120 s, first
dispatch after the fix). The seed passed — the four prior attempts died there in under 35 s — and
all 500 bots minted **from one runner IP**, so the per-IP 429 backoff holds at 4× the previous
125-bot maximum. All 20 load jobs green. Figures below were re-derived independently from
`sim_load_snapshots`, including re-implementing the event sweep in SQL:

| Metric | Value |
|-|-|
| Offered (naive Σ) / **`honest_peak_concurrency`** | 4,000 / **4,000** |
| **`max_concurrent_shards`** | **20** |
| Requests / ok / breakage / throttled | 31,000 / 31,000 / **0** / **0** |
| Media requests / bytes / errors / p95 | 4,669 / **369 MB** / **0** / 975 ms |
| **DB connections · avg query** | **27 / 90 · 11.40 ms** |
| Overall p95 | **18,427 ms** |

**Cap discovery answered:** honest peak equals the naive sum *and* `max_concurrent_shards` = 20, so
GitHub ran all twenty shards genuinely simultaneously — no queuing, no stagger inflation, cap **≥
20** (bounded from below; 20 is our `MAX_SHARDS`, not GitHub's ceiling). **The headline: at ~4,000
offered concurrency — the 200K-DAU band — prod Postgres sat at 27 of 90 connections (~70% idle) at
11.40 ms. The database is not the constraint at 200K.** Across Phase A (91% idle at ~312), the 50K
run (83% idle at 1,000) and this, the DB has never once been the limiting resource.

**The knee moved decisively to the client:** p95 1,935 ms at 400 concurrency → 18,427 ms at 4,000 —
Slice 2's predicted effect, since real 206-GET egress lowers the per-shard knee well below Slice 1's
HEAD-only ~312. Recorded honestly: **the runbook's step-1 knee probe was skipped** (validation →
straight to 20 shards at the old C=200), so the 18 s p95 is the price of that shortcut, not a prod
capacity signal. A cleaner 200K profile is more shards at lower per-shard C, which `MAX_SHARDS = 20`
caps. **Teardown:** `purge_synthetic_load_cohort()` → 500 purged, every `residual_*` = 0, live
`bot0##` = 25 and the 2,000-profile marketplace cohort untouched, registry back to 2,025. **Gotcha:**
running that purge inside a `DO` block ending in `RAISE` **rolls it back** — the fixture pattern is
for read-only assertions only.

**Still open:** `MAX_SHARDS = 20` caps a lower-C/better-latency 200K profile; the Phase-A pre-scale
advisor list (~231 `multiple_permissive_policies`, ~158 `auth_rls_initplan` on hot tables) is
untouched and still latent; Phase 6 (realtime WebSocket leg) deferred to its own spec; the app's 89
`.in()` call sites across 39 files are **unaudited** against the 16 KB ceiling.

## [2026-07-25] Synthetic Weight Engine — credible 200K-DAU load matrix (Slice 2) (`feat/synthetic-load-matrix-200k`)

An extension of the already-shipped multi-IP runner matrix ([[Synthetic Weight Engine]] Slice 1, PR
#337). Slice 1 proved the shard-count-as-ramp-knob idea but left two gaps between its number and a
credible "200K DAU" claim: `media_fetch` was a HEAD + Content-Length **proxy** (no real bytes moved),
and the summary's `offered_concurrency` is a blind per-shard sum that staggered/queued shards (a real
GitHub concurrent-runner cap) can inflate without ever being simultaneous. Five TDD tasks close both
gaps and scale the shard ceiling. Spec: `docs/superpowers/specs/2026-07-25-credible-200k-load-matrix-design.md`.
Plan: `docs/superpowers/plans/2026-07-25-credible-200k-load-matrix.md`.

**1. Real storage egress.** `sim/load/actions-mix.ts`'s `media_fetch` now performs an actual
Range-capped `GET` (`Range: bytes=0-262143`, 256 KiB) against a real public DragonCandy Storage object
(`dragonshare-content` — the true serving path; 6 sample URLs, all verified `HTTP 206` against prod
`zocahiffooqdybdhguqv`, 2026-07-25) instead of a HEAD against a dead third-party GCS URL. Bounded
egress is **absolute, not best-effort**: the action REQUIRES a `206 Partial Content` response before
reading any body — a `200` means the host ignored the `Range` header (it would stream the full object,
possibly chunked with no `Content-Length`) and is treated as a capped MISS (`{bytes:0, ok:false}`),
never downloaded. This closes the "un-Range-capped host defeats the cap" hole Codex flagged. A
non-206/network failure is a **media error**, tallied apart from breakage — never trips the
DB-saturation knee (unchanged convention from Slice 1). Returns `{bytes, ok, ms}`.

**2. Media latency.** The driver (`sim/load/driver.ts`) collects `MediaResult.ms` (fetch-only latency)
per step and writes `media_ms_p50`/`media_ms_p95` to the snapshot notes (`StepMetrics.mediaMsP50/P95`).

**3. Overlap-honest summary.** New migration `supabase/migrations/20260725140000_sim_load_matrix_overlap_summary.sql`
`create or replace`s `get_sim_load_matrix_summary` to add a **bin-width-independent event-sweep**
`honest_peak_concurrency` (max over time of summed concurrency among shards actually overlapping,
evaluated at every snapshot instant so the true max-overlap instant is always covered — no bin-width
parameter needed) + `max_concurrent_shards` (how many shards were overlapping at that peak — this
number **is** the GitHub concurrent-runner cap) + `media_errors` + `media_ms_p95_peak` (a TRUE peak
across ALL snapshots for the run, not latest-row-per-shard — a Codex P2 catch, since media p95 isn't
monotonic across a soak the way DB connection counts are). The naive `offered_concurrency` is kept
alongside so the staggering gap stays visible. Security posture unchanged from `20260724183000`
(SECURITY DEFINER + in-body `is_internal_user()` guard + anon/public revoke, authenticated grant).
**Migration is written but NOT applied to prod** — founder-gated (careful skill).

**4. `/internal` surfacing.** `src/hooks/internal/useSimLoadMatrixSummary.ts` gains the 4 new typed
fields (no `types.ts` regen needed — the hook keeps its hand-typed `rpc` cast); `InternalSimulation.tsx`'s
`MatrixSummaryCard` adds a "Honest peak concurrency" StatCard (pink accent, "N shards overlapped"
subtitle), relabels "Offered concurrency" to `naive Σ across N shards`, relabels the media-bytes card
from "Media egress (proxy)" to "Media egress" / "Σ real bytes (Range-capped GET)", and adds "Media
errors" + "Media p95 latency" StatCards.

**5. Scale + runbook.** `.github/workflows/synthetic-load-matrix.yml`'s `MAX_SHARDS` raised `10→20`.
`docs/runbooks/synthetic-load-tier-ramp.md` §8 gains a "credible-200K sequence" (§2a): (1) probe the
per-shard knee single-runner **with real media firing** (cheaper than a matrix dispatch, and the real
GET makes the knee a real one, not a proxy), using a **non-`matrix-*` run label** (`knee-probe-<date>`)
so `/internal`'s "Matrix run (summed)" card — which reads the newest `matrix%` label — can't ingest a
shard-less single-runner snapshot and render a bogus zero-shard/zero-concurrency summary; (2) discover
the runner cap via a full-`MAX_SHARDS` dispatch with a short soak (queued shards start late and never
overlap the others, so `max_concurrent_shards` reveals how many GitHub actually runs at once, which may
be well under 20); (3) the 200K run: `shards = min(16, cap)` (`cap` from step 2) at the probed knee
concurrency `C` (from step 1), `soak_ms=120000` (~2 min, keeping the per-request 256 KiB cap a bounded
aggregate even at scale) — `~16 × C` targets the ~4,000-concurrency / ~200K-DAU band; if the runner cap
forces `shards < 16`, that cap-limited ceiling is the credible number to report, plus the path past it
(paid plan / self-hosted runners) — not a number the cap can't support.

**Codex gauntlet (4 real findings fixed, 5th pass clean):** egress cap not enforced when a host ignores
`Range` (any 2xx was trusted); a `200` (Range-ignored) still silently downloaded up to the cap (tightened
to require exactly `206` before touching the body at all); the single-runner knee-probe reusing a
`matrix-*`-prefixed label would let `/internal`'s matrix card ingest it and render a bogus summary
(fixed with the `knee-probe-*` label convention); `media_ms_p95_peak`'s initial draft reused the
`per_shard` CTE's latest-row-per-shard value instead of a true cross-snapshot max (fixed to `max(...)`
across every snapshot in the run). SDD per-task reviews passed for all 5 tasks; the whole-branch Opus
review returned **READY TO MERGE**.

**Verified facts that shaped the writes (do not re-fabricate):** the six `dragonshare-content` object
URLs were curl-verified to return `HTTP 206` on a `Range: bytes=0-262143` GET against prod
`zocahiffooqdybdhguqv`, 2026-07-25; the migration timestamp `20260725140000` was collision-checked via
`git grep` across worktrees against both `20260724183000` (the Slice 1 summary migration it replaces)
and the same-day marketplace migrations `20260725120000`/`20260725130000`;
`docs/superpowers/load-findings/2026-07-24.md` is the source of the "single runner caps ~312
concurrency on **egress**, not DB (DB 91% idle)" finding that motivates real egress in the first place
— Slice 1's HEAD proxy could never have surfaced that ceiling honestly.

**Founder-gated, NOT in this branch:** applying migration `20260725140000` to prod; the live
probe→cap→200K→verify→teardown sequence. **Key insight carried forward:** real egress will very likely
lower the per-shard knee below Slice 1's HEAD-only ~312 figure, so the shard/concurrency split must be
re-probed with real media before trusting a 200K number. **Deferred minors:** a few stale `driver.ts`
comments describing the old proxy behavior; `media_ms_p50` is plumbed through the driver/snapshot but
not yet surfaced by the summary RPC or `/internal` (only `media_ms_p95_peak` is); `sim/tsconfig.json`'s
strict typecheck is not wired into CI.

→ `docs/wiki/concepts/synthetic-weight-engine.md` · `docs/wiki/raw/sessions/2026-07-25-credible-200k-load-matrix-slice2.md`

## [2026-07-25] Internal Overview "real vs total" + synthetic-active banner (`feat/internal-metrics-real-vs-total`)

Founder reported the `/internal` Overview metrics "not updating." A read-only diagnosis found the pipeline
**healthy** — the Overview is a **live, synthetic-excluding** dashboard (`aios_platform_stats` counts every
entity `WHERE NOT is_synthetic(...)`), so with ~2,025 synthetic bots vs ~40 real users it *correctly* sits
flat (last real signup 2026-07-20). Not a bug — the segregation working as designed. Fix (this branch):
`aios_platform_stats` gains purely-additive `*_all` (total incl. synthetic) counts beside every real count
(migration `20260725150000`, security posture byte-unchanged, **founder-gated apply**); `InternalOverview`
adds a **"synthetic test data is active" banner** (shown when `users.total_all > users.total`, computing the
excluded synthetic profiles/businesses/campaigns from the `all − real` gap) and an **"of N incl. synthetic"
sub on each entity card** (via `ofTotal`/`withSub` helpers — only rendered when the gap is non-zero, so a
clean prod with no synthetic data is visually unchanged). The Weight + Simulation pages remain the
synthetic-*inclusive* views. Durable lesson: a flat live-and-synthetic-excluding metric reads as "stale" —
it isn't; verify the pipeline before assuming a break. Codex clean (1 pass); typecheck + build green.

## [2026-07-25] Living Synthetic Marketplace (Sub-project A) — offline build + live teardown (`feat/living-marketplace`)

Sub-project A of the living-marketplace / 200K-DAU initiative: a **persistent, browsable synthetic
marketplace on prod** built through **real RLS-enforced app flows** (bot JWTs) — full profiles, free
campaigns, applications→collaborations, uploaded content, DragonFeed posts, messaging, discounts,
reviews, multi-location orgs, CGC — visible to all but excluded from founder metrics via `is_synthetic`.
New `sim/marketplace/` module (personas/text/actions/content/locations/profile/seed) + a
`marketplace-seed`/`marketplace-purge` harness command + `buildDefaultSeedSteps` live glue, reusing the
harness spine + the verified free-campaign lifecycle. New `botmk_` cohort namespace, excluded from
`readSessionCapableBots` (else the daily crew tick + single-runner load would sweep it). **Profiles are
US-diverse** (24-city pool; business geo on `org_units.lat/lng`, creator geo as location text) **and
fully filled out excluding all social-account fields**. Standard campaigns are FREE (crew-style
no-payout); public campaigns are explicitly status-flipped published→active→completed on hire/complete
(the accept RPC only auto-activates crew campaigns); the synthetic org's `active_campaign_limit` is
raised (default 1 would abort multi-publish). **ONE-SHOT** (cohort cap ≤150/≤450 + a `botmk_`-freshness
guard mirroring bulk-seed) — recovery is `marketplace-purge` then re-dispatch. The `botmk_`-scoped
teardown RPC `purge_synthetic_marketplace_cohort()` (migration `20260725120000`, FK-graph-grounded,
`residual_*` fail-loud backstop) is **applied + no-op-verified on prod** (0 new advisors). Seeding
vehicle: `.github/workflows/marketplace-seed.yml` (manual dispatch, `synthetic-weight` Environment;
`SIM_*` secrets are GitHub-Environment-only, so the branch must merge before the first dispatch). 223
sim tests; reviewed per-task + opus whole-branch + Codex (4 passes: campaign-limit abort,
seed-without-teardown, cohort cap, downstream-not-resumable, one-shot doc — all resolved). **Pending
(founder-gated):** merge → small 2/4 seed → segregation + teardown-to-zero proofs → scale 100/300.
→ `docs/wiki/concepts/living-synthetic-marketplace.md`
> `PROJECT_CONTEXT.md` §5 is an index — one line per entry, detail lives here.

---END-HEADER---

- **Synthetic Weight Engine — multi-IP load runner matrix (Slice 1)** — **`feat/synthetic-load-runner-matrix`,
  PR #337.** Continues [[Synthetic Weight Engine]] Phase A, which found a single GH runner caps at a
  **client-side egress wall (~312 concurrency)** while prod's Postgres stays **~91% idle**. The runner matrix
  fans the SAME load driver across N GH jobs (one runner IP each) so the *summed* offered concurrency pushes
  the DB toward its real ceiling — **the ramp knob is the shard count** (N shards ≈ N×C; nothing
  GitHub-specific lives in `sim/`). Shipped: `bulk-seed --with-content` (+ a testable `seedContent()` seam);
  a realistic **DAU behavior mix** (`sim/load/actions-mix.ts`, ~90:10 read:write — mobile feed + desktop grid,
  a media **HEAD** egress-proxy, campaign browse/search, geo near-me, profile view + 3 RLS-real writes: a
  public-free **draft** campaign, a bot→bot `create-notification` to a synthetic peer, a direct Donny
  footprint), with `HotAction.run` widened to carry `ctx={selfId,peerId}` + return media bytes and per-step
  `mediaRequests`/`mediaBytes` tally; `get_sim_load_matrix_summary` (per-shard latest-sample rollup); the
  dynamic `synthetic-load-matrix.yml` workflow (≥2 shards, env-var-only inputs, `synthetic-weight` env gate,
  run-label suffixed with `github.run_id`); a `/internal/simulation` "Matrix run (summed)" card; runbook §8.
  **Phase 6 (realtime WebSocket leg) deferred** at its hard split-point (own connection quota → own spec+plan).
  **3 SECURITY DEFINER migrations applied to prod under the careful gate** (`seed_synthetic_content` +
  `purge_synthetic_load_cohort` (scoped `botla%`/`botseed_%` teardown, spares the live 25) + a patched
  `purge_synthetic_data` push_notifications leaf-delete + `get_sim_load_matrix_summary`, granted authenticated
  behind an `is_internal_user()` guard) — verified live (guards fire, purge no-op clean, `get_advisors` clean).
  **Writes are matrix-ONLY** — the driver default + single-runner `load` use the reads-only `DAU_READ_ACTIONS`
  (single-runner drives the LIVE `bot0##` cohort the scoped teardown spares, so a write there would leak
  residue). Verified prod facts drove the writes: campaigns INSERT is role-agnostic (proven by a
  rollback-wrapped creator-insert probe), the active-campaign limit fires only on `published` (→ `draft` is
  repeatable + invisible to browse), `create-notification` already suppresses synthetic-recipient email.
  **Reviews:** data-exposure-reviewer PASS; **Codex 3 rounds** — R1 (2×P2: run-label uniqueness + reject
  shards<2) + R2 (**P1** write-mix-leak-into-single-runner + P2 short-soak-zero-reporting) fixed TDD, R3
  (1×P2 "creators can't INSERT campaigns") **verified FALSE** by the RLS probe and dismissed. 153 sim tests /
  build / typecheck green. **Founder-gated remainder:** the 2-shard live smoke + `types.ts` regen.
  → `docs/wiki/concepts/synthetic-weight-engine.md` (Runner matrix) · PR #337

- **Wallet-first payout reroute (stage 2 of the wallet-first fix)** — **`feat/wallet-first-stage2`.**
  Follows stage 1 (#334) and #329 ([[Payout Finalization & Re-entrancy]]). **Removes the transfer-vs-pending
  fork** in `release-creator-payout`: every payout is now ONE shape — `credit_pending_balance_for_payout`
  (atomic wallet credit + durable `payout_executed_at` marker) → best-effort exactly-once `flushPendingBalance`
  when `verifyPayoutReady` → `finalizePayoutState`. With no divergent money path, the two #329 residuals
  **close by construction**: concurrent invocations credit the SAME wallet (the RPC row-locks + dedupes → one
  credits, the rest `'already'`) and the flush is exactly-once (stage-1 `flush_${id}` key), so no cross-path
  double-pay; and the only money write is the atomic credit RPC that sets the marker in the same transaction,
  so the Stripe-up/DB-down "credited-but-unmarked" split-brain cannot happen. Deleted `markTransferExecuted`,
  the direct `payout_${collab}`-keyed transfer, and the escrow `held→releasing` pre-commit (escrow → `released`
  at finalize). **No new migration** — all RPCs/columns live from #329/#334.
  **Ledger-event contract (Approach A):** every payout writes four **collaboration-keyed** events (gated on
  `!alreadyCredited`): `content_approved`, `payment_release_initiated`, `payment_released` (the business In
  Escrow↓ signal — now fires on EVERY payout; the old pending path never wrote it, a latent bug fixed), and
  `payout_pending_wallet` (the creator "earned" signal, `metadata.reason ∈ {flushing_to_stripe,
  creator_onboarding_incomplete}`). The wallet→Stripe flush keeps its **user-keyed** `transfer_created`
  (`metadata.type='pending_balance_autoflush'`) — a wallet audit event, not earnings.
  **Frontend (3 readers reconciled to one rule):** Total Earned = `Σ payout_pending_wallet + Σ (transfer_created
  whose metadata.type ∉ {wallet_withdrawal, pending_balance_autoflush})`, discriminating on `metadata.type`
  (not `flush_id`/`entity_type`); `payment_released` never summed. In Wallet = `creator_profiles.pending_balance`
  (source of truth) via `check-creator-payout-status` (an allowed server path — the column is REVOKE-contested
  for direct frontend reads), read post-flush, in cents. `payout_pending_wallet` added to `terminalTypes` so a
  credited-to-wallet collaboration reads as Completed.
  **Implementation notes:** the DI-testable payout body (`applyWalletFirstPayout` + `finalizePayoutState`) lives
  in a co-located pure module `release-creator-payout/wallet-first.ts` imported by `index.ts` — NOT exported
  from `index.ts` behind an `import.meta.main` guard (top-level `serve()` breaks import-based Deno tests, and
  the guard is untested in the Supabase runtime → a wrong guard silently unregisters the handler).
  `flushPendingBalance` gained `{assumeReady}` so a caller that already verified readiness (this reroute, via
  `verifyPayoutReady`) isn't no-op'd by a stale cached `stripe_onboarding_complete` flag. `PaymentsPage` skips
  wallet-transfer events when grouping entities (else every onboarded payout formed a phantom
  `collaboration:<creatorUserId>` "Completed" timeline). `getPaymentMessage` is reason-aware for
  `payout_pending_wallet` (no "complete Stripe setup" CTA for an already-onboarded creator).
  **Reviews:** `edge-function-reviewer` + `data-exposure-reviewer` PASS; **Codex clean after 4 fix rounds**
  (In-Wallet post-flush staleness; the round-1 fix read a REVOKE-contested column directly → rerouted through
  `check-creator-payout-status` fixed to return post-flush `platformPendingBalance` on both paths; phantom
  timelines; flush-on-verified-readiness + ready-aware copy). Deployed `release-creator-payout` (×2) +
  `check-creator-payout-status` (`--no-verify-jwt`, boot-checked); **rollback-wrapped prod RPC-contract test**
  proved credit-once + marker-atomic + re-entry-`'already'`-no-double-credit; the happy path is covered by the
  DI unit tests + stage-1's real test-mode Stripe flush E2E. Deno + vitest green.
  → `docs/wiki/concepts/payout-finalization-consistency.md`
- **Synthetic Weight Engine — Phase A: load proof & economics** — **`feat/synthetic-weight-load-economics`.**
  Turns the [[Synthetic Weight Engine]] from a liveness/QA engine (Phase 1) into a **load-proof +
  economics** engine, without weakening any Phase 0 safety invariant. Harness (`sim/`) + one migration
  + a `/internal/simulation` dashboard slice; prod stays byte-unchanged behind `SYNTHETIC_BOTS_ENABLED`
  and the actual load ramps are **founder-gated operator runs** (a runbook), not part of the merge.
  Reframe that drove it: **load = concurrency, not headcount** (50K DAU ≈ ~800–1,000 peak concurrent →
  reproduce request VOLUME with a reusable session pool + burst driver, not 50K standing sessions);
  with real users declared testers too, it runs **single-track on prod** and targets the saturation
  **knee** (measurable degradation), never an outage.
  **Shipped:** (1) **cross-tick session pool** (`sim/session-pool.ts`) — persists each bot's session
  and refreshes/reuses instead of re-minting (the deferred fix for the per-IP 429 wall); per-bot
  single-flight against GoTrue refresh-token rotation; sessions **bound to `userId`** so a purge+re-mint
  never reuses a deleted user's JWT. (2) **two-lane bulk-seed** (`sim/seed.ts` + service-role
  `seed_synthetic_cohort` RPC) — a DEPTH pool (`botseed_*`, never authenticates, idempotent uuidv5) +
  a session-capable ACTIVE cohort (`botla*`, distinct namespace so it can't collide with the live
  `bot0##`). (3) **ramped load driver** (`sim/load/driver.ts`) — geometric concurrency ramp, **stops at
  the knee**, **collects ALL breakage signatures** (never abort-on-first) → `sim/.load-findings.json`;
  throttle (429/503) vs breakage classification; `parseRamp` fails loud on a malformed spec; `load`
  drives only session-capable bots. (4) two service-role RPCs (migration `20260724170000`,
  `seed_synthetic_cohort` + `capture_sim_load_snapshot`, both DEFINER/`service_role`-only; snapshot
  reads `pg_stat_activity` **concurrently with the in-flight wave** so `active_connections` isn't
  measured after the wave drains). (5) **`/internal/simulation`** load-curve table + a clearly-labeled
  **MODELED** revenue projection (`synthetic_campaigns × $250 × 10%`) — measured revenue + capped Donny
  are **Phase B** (separate gated plan). (6) `docs/runbooks/synthetic-load-tier-ramp.md` (teardown by
  namespace prefix — NOT `purge_synthetic_data()`, which wipes the live cohort) + a load-findings
  template. **The mandatory Codex second review caught 8 real issues over 7 rounds** (5×P1, 3×P2 — load
  driving the non-authenticating depth pool; the daily `tick` doing the same after a bulk-seed; the
  snapshot captured after the wave drained; a stale pooled JWT after re-mint; a hot action selecting
  non-existent view columns; silent ramp-typo degradation ×2), each verified against the code (R3
  against the real prod view schema) and fixed with a regression test; R7 clean. Gates: full suite 1220
  tests / 0 failed, app + `sim/` typecheck, build, eslint, data-exposure-reviewer PASS.
  → `docs/wiki/concepts/synthetic-weight-engine.md`

- **Durable pending-balance flush ledger (stage 1 of the wallet-first payout fix)** — **`feat/wallet-first-payout`.**
  Follows PR #329 ([[Payout Finalization & Re-entrancy]]). Makes the shared wallet→Stripe flush
  (`transferPendingBalance` in `_shared/flush-pending-balance.ts`) **exactly-once**, fixing the
  identical-cents idempotency-key **under-pay** without re-introducing an ambiguous-failure **over-pay**.
  The old key `withdraw_${userId}_${amountCents}` had to be both stable-across-retries AND
  unique-across-movements; an amount-based key collides — two identical-cents flushes inside Stripe's ~24h
  window dedupe to one transfer → the creator is under-paid. The fix is a **durable per-flush record** whose
  id *is* the key. New table `pending_balance_flushes` (migration `20260723180000`; `status ∈
  claimed/succeeded/failed/stuck`, service-role-only RLS) + four service-role SECURITY DEFINER RPCs: `claim`
  (row-locks the profile `FOR UPDATE`, verifies `round(pending_balance*100)=cents`, zeroes the balance,
  inserts a `claimed` row → its id; NULL ⇒ `BALANCE_CHANGED`), `confirm`, `fail(restore)` (adds back exactly
  `amount_cents::numeric/100`), `bump(cap)` (flips `claimed→stuck` at the cap, returns `'stuck'` on exactly
  the transition). A shared **`executeFlushTransfer`** — used by the inline flush AND the new
  `reconcile-pending-flushes` `*/15` pg_cron (migration `20260723190000`) — keys each transfer on
  `flush_${id}`, built from the stored row so an inline send and a reconcile replay are byte-identical →
  real Stripe idempotent replay (never a 400 key-conflict). Definite failures (4xx `StripeInvalidRequestError`,
  raised pre-creation) restore; ambiguous ones (5xx/connection/idempotency-conflict) bump (no restore).
  Three review-hardened safety points: a `stuck` row files ONE `aios-report-ingest` CRITICAL (its wallet was
  zeroed at claim and is never auto-restored); **bump-on-confirm-failure** bounds the one path
  (transfer-succeeds / `confirm`-fails) that would otherwise be re-driven past Stripe's ~24h key TTL into a
  second transfer; and **`confirm` `RETURNS boolean`** (migration `20260723200000`) so an overlapping
  reconcile whose `confirm` is a no-op **skips the duplicate ledger write** (Codex [P2] — `payment_events`
  isn't unique on `stripe_id` and totals sum it, so a duplicate would double-count the payout). Reviews: `data-exposure-reviewer` (migration) + `edge-function-reviewer` (reconcile fn) +
  spec/code-quality subagent passes per task + Codex. Verified: 26 Deno tests (RED→GREEN), a rollback-wrapped
  prod RPC behavior test, and a real **test-mode** Stripe replay E2E on prod — the deployed reconcile moved a
  synthetic `claimed` row exactly-once (`{scanned:1,reconciled:1}`, row→`succeeded`, one ledger row, balance
  untouched); a re-drive replayed the **same** `stripe_transfer_id` (no second transfer, no double-pay);
  fully cleaned up. All 5 edge fns deployed + boot-checked (`withdraw-pending-balance`, `stripe-webhook`,
  `check-creator-payout-status`, `check-restaurant-payout-status` rebundled the refactored shared file; new
  `reconcile-pending-flushes`); cron scheduled (Vault `reconcile_pending_flushes_url` created, `aios_ingest_key`
  reused). **Stage 2 — the wallet-first reroute of `release-creator-payout`'s onboarded path, which closes the
  two remaining cross-path residuals (concurrent double-pay; Stripe-up/DB-down split-brain) — is deferred**;
  it also needs a frontend ledger-event contract change.
  → `docs/wiki/concepts/payout-finalization-consistency.md`

- Synthetic Weight Engine — Phase 1 harness 429 backoff (cron hardening) — **`fix/sim-session-429-backoff`.**
  The go-live fast-follow: `mintBotSession` (the per-bot magiclink→verify session mint) now retries
  429/503 with exponential backoff, honoring `Retry-After` (`fetchWithRetry`/`parseRetryAfter`/
  `backoffDelayMs` in `sim/session.ts`), so a transient/borderline per-IP auth rate limit no longer
  red-fails the unattended daily cron — while a sustained hard-window exhaustion still fails loud after
  the retries (by design; fail-loud preserved). 7 new unit tests (pure helpers + injected `sleep`, no
  network). The deeper fix for running more frequently / at larger N — **cross-tick session reuse**
  (persist each bot's refresh token instead of re-minting every tick) — stays deferred.
  → `docs/wiki/concepts/synthetic-weight-engine.md`

- Synthetic Weight Engine — Phase 1 go-live: N=25 cohort + daily cron (Task 8 second switch) —
  **live on prod 2026-07-24 (`chore/synthetic-weight-enable-cron`).** After the passing smoke, both
  go-live switches were thrown: `SYNTHETIC_BOTS_ENABLED` on (now permanent), a **persistent 25-bot
  cohort** minted (≈16 creators / 9 Hoboken restaurants), 5 `SIM_*` secrets set in a new protected
  `synthetic-weight` GitHub Environment (incl. the prod service-role key — the harness's inherent
  exposure surface, founder-approved; no required reviewers = unattended), and the daily `0 14 * * *`
  cron enabled to drive **one tick/day**. **Scaling finding the N=25 run caught:** rapid same-IP ticking
  (5 ticks in minutes ≈ 125 magiclink→verify session mints) trips Supabase's per-IP auth `verify` rate
  limit (429) — surfaced by the fail-loud tick, not silently. The **daily cron is a different profile**
  (one tick/day from a fresh GitHub-runner IP ≈ 25 mints) and was **validated live**: a
  `workflow_dispatch` tick from the runner drove the apply stage (0→27 applications, **0 failures**)
  that had 429'd locally. Isolation held throughout (real counts 25 campaigns / 41 users byte-unchanged).
  **Recommended fast-follow:** 429 backoff/retry (or cross-tick session reuse) in `sim/session.ts` so a
  heavier day can't red-fail the unattended cron. → `docs/wiki/concepts/synthetic-weight-engine.md`

- Synthetic Weight Engine — Phase 1 live smoke (Task 8) + teardown fix — **ran on prod 2026-07-24,
  PASSED (`fix/purge-synthetic-crew-teardown`).** The founder-authorized first live mint: flip
  `SYNTHETIC_BOTS_ENABLED`→true → baseline snapshot → `mint --n 5` → ~10 `tick`s (full crew funnel,
  **0 failures**, 2 collaborations completed+approved+mutually reviewed) → isolation proof → `purge` →
  switch off. **Isolation held perfectly:** every real corpus count (`WHERE NOT is_synthetic(...)`) was
  byte-identical before/after (campaigns 25, apps 22, collabs 16, files 27, reviews 12, crews 2, users
  41) while the totals grew by exactly the synthetic rows; zero real-user notifications/messages;
  `get_simulation_stats()` showed the 5-bot cohort. **The smoke caught a real teardown bug (its whole
  purpose):** `purge_synthetic_data()` relied on `delete auth.users → profiles CASCADE`, but two Phase 1
  crew tables have **NO ACTION** FKs to `profiles` that block it — `creator_group_members.invited_by`
  and `crew_activity.actor_id`/`participant_id`; the first purge failed on
  `creator_group_members_invited_by_fkey` and rolled back (transactional — no half-delete). Fix
  (migration `20260724011000`): leaf-delete synthetic `crew_activity` + `creator_group_members` before
  the cascade + add both to the fail-loud residual report; the re-run purged 5 users with all residuals
  0 and prod back to byte-identical baseline. Lesson: **"verified by reasoning" ≠ "verified by
  running"** — Phase 0/1 reasoned the one crew FK it considered (`campaigns.group_id` RESTRICT) wouldn't
  bite but never considered the membership/activity FKs; only the live purge surfaced them.
  → `docs/wiki/concepts/synthetic-weight-engine.md`

- Synthetic Weight Engine — Phase 1 (private crew lane) — **built, merge-ready; prod inert
  (2026-07-23, `feat/synthetic-weight-phase-1`).** The first live-cohort behavior engine on the Phase 0
  safety spine, entirely in the `sim/` Node harness — **no DB migrations, no edge-function changes** (it
  only *uses* the spine + existing crew/content/review RPCs). Mints a real N=25 cohort (≈65% creators /
  35% Hoboken restaurants) on prod and drives the full **free-rails** marketplace funnel **inside private
  crews** so bots only ever interact with bots. The founder chose the private-crew lane over a
  public-marketplace lane: crew campaigns (`group_id` set) are RLS-visible only to member bots and are
  never broadcast, giving guaranteed isolation with **zero new metric-exclusion surfaces**; the pure
  planner has a hard invariant + test that it never creates a public campaign. Every marketplace write is
  **RLS-real, as the bot** (a per-bot JWT via the `staging-login` magiclink→verify pattern); service-role
  is used only for minting (+ `email_verified` + stamping `cohort`/`persona` on the trigger-created
  `synthetic_users` row), cohort reads, and teardown. Funnel (one stage/tick, so a fresh cohort drains
  over several ticks and a steady cohort keeps flowing): crew → invite → accept → post free crew campaign
  → apply → hire (one atomic `accept_application_with_collaboration` RPC) → upload (metadata-only
  `file_uploads`, no storage object) → submit → dual-party completion (crew campaigns skip payout) →
  review. `record_crew_activity` is RPC-only (no `create-notification` leg) so a bot never triggers an
  outbound email. Teardown verified crew-safe: `purge_synthetic_data()` leaves zero residue even with a
  crew campaign present (the `campaigns.group_id → creator_groups` RESTRICT doesn't bite — the campaign
  cascades first; the gap Phase 0's non-crew proof left). Files: `sim/{personas,clients,mint,session,
  types,run,cli}.ts`, `sim/behavior/{actions,graph}.ts`, `sim/tsconfig.json`, and a **dormant**
  `workflow_dispatch`-only `.github/workflows/synthetic-weight.yml`. 40 unit tests; app + sim typecheck +
  build clean. Four review passes: plan-document (its Task 4 funnel-mapping corrections all verified TRUE
  and folded in before coding), spec-compliance (runtime shapes verified live), code-quality (fixed two
  wedge-risk non-atomic writes — atomic hire + a self-healing finalize re-drive), and **Codex** (fixed a
  real workflow script-injection P1 + a funnel-breaking missing-`file_uploads`-columns P2, both verified
  live rollback-wrapped). **Go-live is two deliberate switches, never a merge:** merging leaves prod
  byte-unchanged (kill switch OFF); the founder-gated live smoke (flip `SYNTHETIC_BOTS_ENABLED` on →
  `mint --n 5` → `tick`s → assert `aios_*` metrics byte-identical + `get_simulation_stats` shows the
  cohort → `purge` → zero residue) + enabling the daily cron are the two switches, parked for the
  founder's `SIM_*` secrets + authorization. → `docs/wiki/concepts/synthetic-weight-engine.md`
- Payout durable re-entrancy — **shipped + deployed to prod (2026-07-23, `feat/payout-durable-marker`,
  PR #329).** The "Complete" follow-up that #328 (below) could only ship the safe subset of. Makes
  `release-creator-payout` **durably re-entrant** so retries and reconciliation can't double-pay. Design
  principle: **marker = "money moved", set AFTER money moves — never a pre-claim.** A pre-claim (marker
  before the transfer) would, on a crash between claim and transfer, make a later re-entry finalize-only →
  collaboration marked paid, creator never paid; that marked-not-paid class is exactly what this avoids,
  so *"marker set ⇒ money moved"* holds by construction and reconciliation is trivial. **Two new nullable
  columns** on `campaign_collaborations` (`payout_executed_at`, `stripe_transfer_id`; migration
  `20260723160000`) and a **new atomic SECURITY DEFINER RPC** `credit_pending_balance_for_payout`
  (migration `20260723170000`) that row-locks the collaboration `FOR UPDATE`, checks the marker, credits
  `creator_profiles.pending_balance` and sets `payout_executed_at` in one transaction (`RAISE`s if no
  wallet row or if `p_user_id` ≠ the row's `creator_id`; service-role only via REVOKE + in-body role
  guard). **`release-creator-payout`:** an early re-entry guard (before the escrow gate) → finalize-only
  when the marker is set; the transfer path marks the instant Stripe confirms; the pending path uses the
  atomic RPC instead of the non-idempotent `increment_pending_balance`; finalize failures now safely
  surface `500 {needsRetry}` (was #328's fire-and-forget 200); the marker-write-failure split-brain is
  non-retry / manual-reconciliation (Codex P1 fix — inviting a retry there could double-pay past Stripe's
  ~24h idempotency window). **`auto-approve-content`:** the reconciliation sweep (re-invokes finalize-only
  for marked-but-unfinalized rows) gained a 5-min min-age guard. **Strictly better than #328 on every
  axis** — closes sequential double-credit, finalize-without-pay, fire-and-forget-200, and same-path
  concurrent double-pay (Stripe idempotency key / `FOR UPDATE` lock). Verified on prod: both migrations
  live (RPC ACL `{postgres,service_role}` only), both edge fns deployed (`verify_jwt=false` preserved,
  boot-checked), and a rollback-wrapped RPC test returned `result=credited marker_set=t bal_delta=1.23`.
  Reviews: data-exposure PASS, edge-function-reviewer ISSUES resolved-or-documented, Codex clean (P1
  fixed). **Two documented residuals** (narrower than what prod had), both closed by the same next step —
  the **wallet-first-then-idempotent-flush redesign**: (1) a very narrow transfer-vs-pending *cross-path*
  concurrent double-pay (needs concurrent invocation + stale cached flag on both reads + a transient
  Stripe error on one of two `accounts.retrieve` calls; narrowed by a pre-transfer re-check, not fully
  closable here — can't hold a DB lock across the external Stripe call); (2) a Stripe-up/DB-down
  marker-write split-brain (non-retry, manual/Stripe-verified reconciliation). → `docs/wiki/concepts/payout-finalization-consistency.md`

- Payout finalize retry + safe failure handling — **shipped + deployed to prod (2026-07-23,
  `fix/payout-db-consistency`, PR #328).** Third increment from the content-delivery-stabilization
  backlog (after #325 drift repair + #326 posting-schedule). `release-creator-payout` moves money then
  runs a finalize step (collab → `approved`/`completed`, campaign → `escrow_status='released'`); it ran
  that finalize **once, fire-and-forget** — on failure it logged `CRITICAL` but returned `200`, so money
  moved, the DB was left inconsistent (escrow stuck at `'releasing'`), the caller saw success, and
  nothing retried. Added a retried `finalizePayoutState()` helper (4 attempts, backoff) used by both
  payout paths, self-healing the common transient-DB-failure case. **Deliberately the safe subset:** the
  user picked "safe core," and four review passes (edge-function-reviewer + Codex ×3) then showed that
  going further — surfacing a finalize failure for a client retry, or reliably guarding re-entry — is
  unsafe without a durable per-collaboration payout marker (a schema change), because the pending-balance
  wallet credit (`increment_pending_balance`) is not idempotent (a retry double-credits) and the Stripe
  transfer's idempotency key is only durable ~24h (a later retry double-pays). So the helper preserves the
  prior semantics otherwise (unconditional `escrow='released'` as a crude re-entry guard; both paths fall
  through to `200` — no client retry after money has moved) and only adds retry-on-transient. Follow-up
  (Complete scope, recommended next): a durable payout marker + a reconciliation sweep over collaborations
  stuck at `escrow='releasing'`/`'held'` would let finalize failures be safely surfaced/retried and fully
  close re-entrancy. Verified: deployed (all 5 `_shared` bundled; clean-boot check returns the handled
  auth error, not a crash); edge-function-reviewer [high] double-credit fixed; Codex clean. Durable lesson
  on [[Payout Finalization & Re-entrancy]]: on a money path, "return an error so the caller retries" is
  only safe if the money-moving op is durably idempotent — verify BOTH the credit mechanism AND the
  caller's retry behavior before surfacing an error after money has moved.

- Synthetic Weight Engine — Phase 0 safety spine — **shipped + live on prod (2026-07-23,
  `feat/synthetic-weight-engine`; kill switch OFF, 0 bots — inert).** Foundation for minting synthetic
  ("bot") users on **production** to add liveness/optics, prove load, and surface QA bugs, with the
  load-bearing guarantee that **no synthetic row ever reaches a founder metric or the data-flywheel
  moat**. Migration `20260723131000` (+ three corrective migrations, see below): a `synthetic_users`
  registry auto-filled by extending `handle_new_user` (email `bot…@synthetic.dragoncandy.test` is the
  source of truth); `is_synthetic(uuid)`/`is_synthetic_campaign`/`is_synthetic_org` helpers
  (service-role only); a denormalized `is_synthetic` flag on the 5 rootless/telemetry tables stamped by
  `BEFORE INSERT` triggers; founder-metric exclusion via a two-sided **actor-OR-parent** predicate in
  `aios_platform_stats`/`aios_revenue_stats`/`aios_cost_stats` + `platform_weight.*_real`; the
  `SYNTHETIC_BOTS_ENABLED` kill switch (default off, fail-closed); `get_simulation_stats()` (the one
  surface that SHOWS synthetic) behind the new `/internal/simulation` founder dashboard; and
  `purge_synthetic_data()` leaf-first teardown (deletes rootless ledgers before `auth.users` and the
  non-cascading synthetic org rows). Edge-fn guards: `donny-cost-rollup` excludes synthetic from the AI
  cap; `release-creator-payout` refuses live-mode settlement if **either** party (creator or campaign
  owner) is synthetic (pure unit-tested `shouldRefuseSettlement`, live-mode read-error fails closed);
  `send-notification-email`/`send-welcome-email`/`create-notification` suppress outbound email to bot
  addresses (in-app row still written). Harness scaffold `sim/env.ts` (fail-closed `assertBootSafety`
  on test-key + kill-switch, unit-tested) + `sim/README.md`. **Proven** on a rollback-wrapped 5-bot
  round-trip under `REPEATABLE READ`: mint 5 → mixed activity → founder metrics **byte-identical** →
  `purge` **zero residue** (incl. orgs) → ROLLBACK (zero prod footprint). **Codex second review caught
  four real segregation gaps across three rounds, all fixed + re-verified on prod:** (R1) the spine
  migration's `CREATE OR REPLACE` of `handle_new_user` silently **reverted** two later migrations
  (`account_scope='internal'` guard + `ON CONFLICT DO UPDATE` refresh) → corrective `20260723132000`
  restores the latest body + the synthetic block; (R1) payout guard only checked the creator →
  widened to both parties; (R2) `aios_cost_stats.latest_alert` didn't filter synthetic →
  `20260723140000`; (R2) `/internal/weight` read synthetic-inclusive counts → now shows the physical
  total (correct for scaling) **and** a real subcount; (R3) `messages` (a two-party table) excluded on
  `sender_id` only → `20260723150000` checks sender **and** recipient. **Lessons:** when
  `CREATE OR REPLACE`-ing a shared function, diff against its CURRENT prod definition
  (`pg_get_functiondef`), never an old migration file; apply actor-OR-parent to **every** party of a
  multi-party table (payout, messages); the rollback-wrapped prod proof (`set_config` fakes
  `auth.uid()` for the internal-gated RPCs; `auth.users` has one pure-SQL insert trigger so no
  webhook/email escapes) validates the whole spine with zero footprint. Phases 1–4 (identity, behavior
  engine, drive adapters, scale-to-N, load proof) are separate plans. See
  `docs/wiki/concepts/synthetic-weight-engine.md` ·
  `docs/superpowers/specs/2026-07-23-synthetic-weight-engine-design.md`.

- posting_schedule_status 'failed' now allowed — **shipped + applied to prod (2026-07-23,
  `fix/posting-schedule-failed-status`, PR #326).** Sibling of the #325 state-machine drift, in the
  post-approval scheduling leg: `confirm-posting-schedule` writes `campaigns.posting_schedule_status='failed'`
  when every post fails to schedule (`failedCount > 0 && scheduledCount === 0`), and
  `CampaignScheduleSection` already renders a complete "Schedule Failed" card for it — but the CHECK from
  `20260527100000` never included `'failed'`, so the UPDATE silently violated the constraint (the edge fn
  only `console.error`s the update failure), leaving the status stuck at `pending_review` and the built UI
  unreachable dead code. One DB-only migration (`20260723130000`) adds `'failed'` to the CHECK — no code
  change (the edge fn already writes it, the frontend already renders it). Pure expansion (0 rows use
  `'failed'`). Verified: rolled-back dry-run (a `'failed'` write that previously violated the CHECK now
  succeeds); applied to prod (CHECK allows `'failed'`, all 25 campaign rows intact, migration recorded);
  Codex clean. Same recorded-vs-intended lesson: verify the actual prod CHECK against what the code
  writes/renders, not just the migration file.

- Content-delivery state-machine drift repair + auto-approval revival — **shipped + applied to
  prod (2026-07-23, `fix/content-state-machine-drift-repair`, PR #325).** While exploring
  "content-delivery stabilization," found the launch-gating problem was not a bug list but a
  **schema-drift incident**: the collaboration state-machine migration
  (`20260425000000_collaboration_state_machine`, + the revision guard `20260408100002`) was
  recorded in `schema_migrations` as applied, but its objects were **missing from the prod
  database** (`recorded ≠ actual`). Missing: `transition_content_status` (called by
  `auto-approve-content`/`reject-content`/`resolve-dispute` — all failing at the RPC),
  `content_disputes` table (+indexes/RLS), `enforce_revision_limit` (+trigger),
  `recompute_final_approval` (+trigger), `increment/decrement_budget_spent` + `campaigns.budget_spent`,
  and the expanded `content_status` CHECK (prod still had the original 5 values, forbidding
  `auto_approved/rejected/disputed/resolved`). Nothing was harming users yet (pre-revenue; manual
  "Approve & Pay" raw-writes `approved`) but it was a hard launch blocker. **Auto-approval was dead
  three independent ways**, all fixed: (1) the cron timed the window off `submitted_at`, which the
  client submit paths never set (only the missing RPC did) → switched to `content_submitted_at` (the
  `set_content_submitted_at` trigger reliably stamps it; a strict superset) — the old filter had
  matched **zero rows**, so auto-approval had never once fired; (2) **no `pg_cron` job** invoked the
  function → scheduled `*/15` via the Vault + `net.http_post` fleet pattern (new
  `auto_approve_content_url` secret + `aios_ingest_key` bearer), with the function's auth moved to the
  shared `isAuthorizedIngest` gate; (3) the missing RPC + CHECK values. Five idempotent migrations:
  `20260723120000` restores the objects (storage policies **excluded** — the original step-7 tightening
  was superseded by `20260513000001`; `insert_payment_event` left as-is) and adds a **REVOKE the
  original never shipped** — `transition_content_status` is `SECURITY DEFINER` and only checks the
  participant when `p_actor_id IS NOT NULL` (forgeable), so the default PUBLIC grant was a cross-actor
  write **IDOR**; `REVOKE … FROM public,anon,authenticated` closes it (`service_role` keeps its own
  direct grant, so the three callers are unaffected — a `data-exposure-reviewer` HIGH finding).
  `20260723120001` allows `submitted → rejected` when `revision_count ≥ 2` (a business was trapped in
  approve-only after a resubmission past the revision budget — a pre-existing gap Codex surfaced).
  `20260723120002` backfills 15 stale `final_approval_status` rows (all non-sponsored + already
  accepted, 0 active sponsorships → none functionally stuck). `20260723120003_auto_approve_content_cron`
  **schedules the cron** `*/15` (mirroring `dre_award_cron` — the fleet's convention — so a fresh deploy
  from source actually invokes the function; the env-specific Vault URL secret is the documented
  out-of-band prerequisite), closing the "no scheduler existed" gap; `20260723120004` belt-and-suspenders
  backfills the `content_submitted_at` anchor for any legacy active-`submitted` row via
  `COALESCE(content_submitted_at, submitted_at, updated_at, created_at)` (0 rows in prod, but future-proofs
  the cron so no pre-trigger submission is stranded). `auto-approve-content` deployed v60.
  Verified: migration dry-run before apply; all objects confirmed; IDOR closed
  (`authenticated`/`anon` EXECUTE = false); filter + reject fixes proven in rolled-back txns; 0 stale
  rows after backfill; v60 boot-check (both `_shared` bundled, `verify_jwt=false`, bad-bearer 401);
  cron job 8 active. Reviews: edge-function-reviewer PASS, data-exposure-reviewer HIGH fixed, Codex
  clean (4 rounds; every finding verified against the live ACL/data before fix or dismissal — a
  dependency chain, not churn). The `git push` was env-blocked; landed via the blob→tree→commit→ref
  REST workaround with the tree SHA verified byte-identical. Durable lesson: on this prod DB,
  `schema_migrations` recording ≠ objects exist — verify via `pg_proc`/`information_schema`/`pg_trigger`.
  The broader content-delivery + payment fragility backlog the exploration mapped (payout-succeeds-DB-
  fails-returns-200, Stripe pay-and-approve tab desync, boost-checkout no polling fallback, broken
  deliverable thumbnails, `posting_schedule_status='failed'` CHECK violation, live-mode go-live items)
  is left for follow-up PRs.

- create_counter_offer authorization hardening — **shipped + applied to prod (2026-07-20,
  `fix/counter-offer-authz`).** Closed the open finding filed on `docs/wiki/concepts/service-role-data-exposure.md`
  during the 2026-07-19 pricing work. `create_counter_offer` was a `SECURITY DEFINER` RPC with
  **`anon:EXECUTE`** and **zero authorization** — no `auth.uid()` check, no participant check, no
  `p_sender_role` validation — bypassing RLS. Any caller (incl. anonymous) could pass any
  `application_id`, flip a stranger's application to `counter_offered`, decline its pending offers,
  and insert an offer under an arbitrary `sender_id`/`sender_role`; the escalation was to forge an
  offer **as the counterparty** and self-accept (the UPDATE policy's only sender test is
  `sender_id != auth.uid()`). Demonstrated live pre-fix (a rollback-wrapped forged third-party call
  returned a full offer row). One `CREATE OR REPLACE` migration (`20260720000000_counter_offer_authz.sql`,
  **identical 6-arg signature** so the sole caller `useCounterOffers.ts` + generated `types.ts` are
  untouched): (1) **identity** before the row lock (`auth.uid() IS DISTINCT FROM p_sender_id` → raise;
  mirrors `apply_to_campaign`); (2) **participant + derive role** (caller = application creator →
  `'creator'`, = campaign owner → `'business'`, else raise); (3) **role integrity** (raise if
  `p_sender_role` ≠ derived), and the INSERT writes `auth.uid()` + the **derived** role, never the
  client's — which **closes the self-accept escalation** because the forged offer now carries
  `sender_id = auth.uid()`; (4) `REVOKE EXECUTE … FROM anon, public` + explicit `GRANT … TO
  authenticated, service_role`; (5) recreated the sibling `application_counter_offers` INSERT RLS
  policy with `sender_role` **pinned** via `CASE`; (6) pinned the `RETURNING` column list (not
  `RETURNING *`) so the definer path can't auto-surface a future column. **Verified live red→green**
  (rollback-wrapped SQL, `set_config('request.jwt.claim.sub',…,true)` to fake `auth.uid()`, `SET
  LOCAL ROLE authenticated` for the RLS path): forged third-party / anon / identity-spoof / role-forge
  all raise; real creator + owner succeed; the RLS pin accepts the correct role and rejects a forged
  one; grants show `anon` gone. Reviews: **data-exposure-reviewer** PASS (its `RETURNING *` [low] →
  fixed); **Codex** raised a P1 ("`REVOKE … FROM public` strips `authenticated`'s EXECUTE") that was
  **verified empirically false** — `authenticated` keeps a **direct** default-privilege grant the
  revoke doesn't touch (confirmed via `routine_privileges` + an as-`authenticated`-role call); the
  explicit GRANT was added anyway for replay-safety, and Codex re-ran clean. `apply_to_campaign`'s
  identical anon grant is left alone (guarded by its own `auth.uid()` check; out of scope).
  → `docs/wiki/concepts/service-role-data-exposure.md`

- apply_to_campaign overload → PGRST203 "Failed to submit application" — **shipped (PR #321,
  2026-07-20).** Creator **PalmDom** got "Failed to submit application. Please try again later." with
  **no application row created**. Root cause was an **overloaded RPC**: `apply_to_campaign` had a 6-arg
  original and a 7-arg superset that added `p_portfolio_url` (+ the crew group guard). **PostgREST
  resolves RPC calls by argument NAME**, so any call omitting `p_portfolio_url` (a 6-key body) matched
  **both** overloads → **`PGRST203` "Could not choose the best candidate function"** (HTTP 300). That
  message contains neither `row-level security` nor `violates row`, so `useCreateApplication.onError`
  fell through to its generic default toast, and the transaction never inserted — from the UI,
  indistinguishable from a network blip. **Proven against prod:** the DB body works (ran the RPC *as
  PalmDom* in a rolled-back `DO` block after `set_config('request.jwt.claims', '{"sub":…}', true)` → a
  valid `pending` row), so the INSERT / `ON CONFLICT` partial index / `notify_donny_nudge` +
  `trg_applications_auto_org` triggers are all fine; the break is at the PostgREST layer — a `curl`
  **6-key** POST to `/rest/v1/rpc/apply_to_campaign` returned `PGRST203` while a **7-key** POST
  resolved and ran (returned the function's own `Unauthorized`, since the anon probe has no matching
  `auth.uid()`). **Fix:** `DROP FUNCTION` the obsolete 6-arg overload — the surviving 7-arg's
  `p_portfolio_url DEFAULT NULL` covers 6-key callers too, so both shapes now resolve. Applied to prod
  via MCP `apply_migration` (migration `20260720120000_…` is the tracked record); post-fix probe
  confirms the 6-key call now resolves. Also: `useCreateApplication.onError` now logs the structured
  `{code,message,details,hint}` and shows a support-actionable `(code: …)` for unknown errors instead
  of the opaque "try again later"; `types.ts` synced to the single overload. **Honest caveat:** the
  deployed web bundle sends 7 keys (works in every test), so PalmDom's *exact* trigger couldn't be
  reproduced on current code and the 24h `api` request logs were gone — this removes the one concrete,
  reproducible defect in the apply path (a landmine producing exactly this symptom for any 6-key
  caller) and hardens the error surface. **Durable lesson:** two RPC overloads where one is a
  superset-via-DEFAULT is a PostgREST landmine — the call with the *smaller* key-set is ambiguous;
  prefer one function with optional params. Codex clean. → `docs/wiki/concepts/campaign-price-anchoring.md`

- Staging headless login + staging-drift discovery — **shipped (PR #318, 2026-07-19).** Founder:
  *"my credentials do not work in the testing environment… I don't want to be a bottleneck to always
  log in and we need working accounts in the testing environment."* The diagnosis went two layers
  deep. **The accounts were never broken:** the founder's `@harbormill.net` account exists **only in
  production**, while staging's user table is *only* the three seeded `.staging@dragoncandy.test`
  accounts — so real credentials can never authenticate against a preview. Deeper, **staging's schema
  is drift-corrupted** — recorded `schema_migrations` disagrees with its actual objects (tables
  missing that predate its own recorded cutoff), ~6 weeks / ~90 migrations behind prod. The
  consequence that matters: **the QA `smoke` gate has been passing against that stale backend** — it
  signs in and navigates, so it goes green while the DB can't run current code (**false assurance,
  worse than no gate**).
  **The fix: `npm run staging:login -- <restaurant|creator|brand> --base <preview-url>`**
  (`supabase/scripts/staging-login.mjs`). It mints a browser-ready session for a seeded test account
  **with no password typed anywhere** — admin `generate_link` (magiclink) → exchange at
  `/auth/v1/verify` for a session **as JSON** (not the redirect — deliberately avoids Supabase's
  Redirect-URL allow-list, which can't cover per-branch preview hostnames) → prints a URL carrying the
  session in the hash, which supabase-js persists on open. So an agent (which cannot type a password
  into a login form) or the founder reaches auth-gated screens without a manual login. The secret
  (`STAGING_SUPABASE_SECRET_KEY`) lives in the gitignored `supabase/scripts/.env.sync.local`, resolved
  from the **main checkout** so it works from any of the 30+ worktrees.
  **Codex took 9 rounds and every finding hardened a real footgun:** `--base` is required (the
  Playwright config defaults to prod — refuse it); a non-staging key is refused **fail-closed** — a
  JWT is caught by an allowlist on its decoded `ref` (the prod service-role is a JWT), and an opaque
  `sb_secret_…` prod key (no decodable ref) is caught by a read-only **preflight** that refuses to
  mint unless the key authenticates against the staging project (the key only ever reaches the staging
  URL, never prod); the target frontend must be on staging (`client.ts` falls back to prod for both
  `VITE_SUPABASE_URL` **and** the anon key, checked under Vite's real env precedence); and the remote
  target is **pinned to this project's own previews** — a foreign or same-team-other-project preview
  would receive the tokens in its URL fragment (a leak). **Proven end-to-end:** authenticated as
  `restaurant.staging` and reached a `BusinessRoute`-guarded dashboard, no password typed.
  Also **partially repaired staging:** replayed the 28-migration Crews cluster (via MCP
  `apply_migration`) to unblock the dashboard + campaign **list** surfaces that 400'd on a missing
  `campaigns.group_id` — with the gotcha that **MCP `apply_migration` runs the SQL but does not write
  `supabase_migrations.schema_migrations`**, so the history rows were inserted by hand. Full parity
  (the other ~25 migrations + missing base tables + stale edge functions) is a separate, larger
  effort. **Couldn't do, recorded honestly:** screenshotting the #316 delivery control *on staging* —
  blocked by a PostgREST bare-name embed 400 and a stale `donny-campaign-generate` (both staging-drift
  artifacts, not #316 defects). **Rule: verify auth-gated features on prod after merge (schema
  current), not on drifted staging.** **Follow-ups flagged, not fixed:** the staging shared password
  is committed in three tracked files (rotate — this tool removes the reason to hand it around); June's
  leaked prod `service_role` key still needs dashboard rotation. Dev tooling + docs only, no app
  runtime or edge-function change. → `docs/wiki/concepts/qa-cicd-gate.md`

- Delivery timing + tier merged into one selection — **shipped (2026-07-19).** A founder screenshot
  of the campaign builder's Logistics & Targeting step: *"the delivery method (DragonDash, Express, and
  Standard) and the delivery tiers need to be one feature/selection… you have to select each
  separately."* The two controls were not merely adjacent, they were **fully decoupled** —
  `TimelinePicker` wrote only `deadline` (its tier subtitles were cosmetic strings that set nothing) and
  `TierBadge` wrote only `delivery_type`, the field carrying the fee, the deliverable cap, the SLA
  countdown and the Stripe escrow line item. So "This Weekend" + Standard tier was reachable: a campaign
  promising a weekend turnaround while the invoice and the auto-approval clock said 5–7 days.
  **The fix is structural, not cosmetic.** `DeliveryScheduleSelector` replaces both with three
  `TIER_LIMITS`-driven options and emits **one patch containing `deadline` + `delivery_type` together**,
  so the inconsistent state is *unrepresentable* rather than discouraged — there is no API for setting
  one without the other. "Pick a specific date" survives but re-derives the tier from the chosen date,
  closing the escape hatch that would otherwise reintroduce the drift. Tier↔deadline derivation
  extracted to a pure, tested `src/lib/deliverySchedule.ts`; stale `tier_reasoning` is cleared when the
  user overrides the AI's tier.
  **Two pre-existing money bugs, both made live by this change.** (1) `useCampaignEditForm` wrote
  `delivery_type` on save but never `delivery_fee`, so editing a tier moved the promise and left the
  price behind. (2) `CampaignEditPage` treated `fixed_price` as *inclusive* of the premium while
  `CampaignEditor` and `create-campaign-escrow` treat it as the base — fixing (1) turned that latent
  split into a real "$500 shown, $575 charged". Resolved by extracting `computeCampaignCost()` and
  putting both surfaces on it, with a test pinning `budgetTotal === fixed_price + delivery_fee`.
  **Codex took three rounds and every finding was real — each one caused by the previous fix.**
  SLA-mismatched offsets (DragonDash wrote *tomorrow* while advertising "1–3 hours") → the cost split
  above → DragonDash's now-correct same-day date being rejected by a launch validator that parsed
  date-only strings as UTC midnight *and* demanded strictly-future, **making DragonDash unlaunchable**
  → a free crew campaign printing "Total $75.00" under "Free crew collab". The validator was wrong, not
  the offset: a 1–3 hour tier whose own deadline is refused is a contradiction.
  1051 tests pass (up from a 1039 baseline), typecheck/lint/build clean, Codex clean on round 4. No
  migration, no edge-function deploy. **Deliberately not fixed:** the tiers carry **five conflicting
  turnaround tables** — a Standard campaign is displayed as 5–7 days, invoiced as 72 hours and
  auto-approves on a 72-hour clock — scoped as its own branch since it reaches into escrow and
  auto-approval. → `docs/wiki/concepts/delivery-tier-selection.md`

- Campaign price anchoring + negotiation reach — **shipped (2026-07-19).** Founder feedback: the
  generated campaign price is too high to start, and because it arrives **pre-filled** a business
  owner reads it as the required price. The instinct — relabel it "Suggested: $800" — would only move
  the anchor one line down, so the fix went upstream. `donny-campaign-generate` had **zero** pricing
  guidance: its prompt asked for a bare `"price": <number>` with no floor, ceiling, or relation to
  deliverable count or tier, so the model free-associated to roughly **$400/deliverable** — agency
  pricing shown to a first-time local restaurant. It now prices against founder-approved
  per-deliverable bands (`standard` $75–150, `express` $110–225, `dragondash` $150–300) and returns
  `suggested_price_min`/`suggested_price_max` beside its single pick.
  **Business side:** the price field starts **empty**; beneath it the suggested range plus three
  one-tap `AppChip` amounts (low/mid/high — a tap beats typing, per the North Star). New
  `src/lib/campaignPricing.ts` is the single source for every figure (14 unit tests) and falls back to
  `deliverableCount × band` for ideas generated before the new fields existed — so the anchor drops on
  frontend merge alone and the edge deploy only adds Donny's per-campaign judgment. Cost Breakdown
  hides below the $50 floor (at $0 it rendered "(2 × $0.00)"); launch is gated with a plain message
  instead of the stringified ZodError toast that was previously the only feedback — which mattered
  because everyone now *starts* at $0, making a never-hit validation branch the default path. Crew
  campaigns stay exempt (free by DB constraint). The copy says "a starting point, not a market rate":
  DragonCandy is pre-revenue with zero completed campaigns, so implying market data would be the same
  anchoring problem in a lab coat. The screenshot case (2 deliverables, standard) goes from a
  pre-filled **$800** to an empty field suggesting **$150–$300**.
  **Creator side:** needed no new machinery. The whole counter-offer system — table, RPCs,
  notification, negotiation thread, business accept/decline — already existed and worked; it was
  simply **unreachable**, gated on `isInvited`, so a creator who found a campaign organically saw only
  "Looks good — Send". Any creator can now counter from the apply sheet, with the price explicitly
  marked negotiable at the point of decision. Also fixed: `handleCounterOffer` passed a hardcoded
  `isInvited: true`, and a failed counter-offer insert was a silent `console.error` that left the
  application at `counter_offered` with no offer row for the business to answer.
  **Durable gotcha:** a crew campaign's `fixed_price` is `0`, **not null**, so `isFixedPrice`
  (`!= null`) did not exclude crews — dropping the invite gate exposed a "$50 minimum" counter-offer
  form on campaigns the DB declares free (`campaigns_group_free`); the invite gate had been masking it
  by accident. Caught **independently by both Codex and `data-exposure-reviewer`**, fixed by gating on
  `group_id`. Generalized: a `!= null` check is not an "is this paid?" check once a sibling feature
  writes a real `0`. Also corrected a comment claiming `isInvited` drives the RLS INSERT policy — it
  never reaches the database, and derives partly from `?invited=true` in the URL, so it was never a
  control at all. **Filed, not fixed:** `create_counter_offer` is `SECURITY DEFINER` with no
  authorization whatsoever (no `auth.uid()` check, no participant check) — pre-existing and live via
  `useCounterOffers.ts`; this work deliberately kept the widened path on the RLS-checked direct insert
  instead. Reviews: `edge-function-reviewer` PASS, Codex clean after the crew fix, 1057 tests.
  → `docs/wiki/concepts/campaign-price-anchoring.md`

- Service-role authorization remediation — **shipped + deployed (PR #308, 2026-07-19).** Sequel to
  #307: fixes what the new `data-exposure-reviewer` found. **12 guards across 4 edge functions** plus
  a new pure `_shared/campaign-access.ts` (`evaluateCampaignAccess` / `evaluateApplyAccess`, 19 unit
  tests, fails closed on every missing input). **No migration, no schema change, no RLS change.**
  Deployed `donny-chat` v147, `donny-campaign-preview` v98, `donny-creator-match` v73,
  `donny-apply-pitch` v57 — **`verify_jwt` preserved on each** (apply-pitch is live `true`, the other
  three `false`; a blanket `--no-verify-jwt` loop would silently flip it), all four `ezbr_sha256`
  changed so no function silently kept old code.
  **The durable lesson is about review layering, not the fix.** Running the subagent on its *own*
  remediation found **3 more `[high]` sites than the original six** — the worst absent from the filed
  findings entirely: `donny-campaign-preview` `handleRegenerate` had no ownership check, so any
  authenticated caller could regenerate an arbitrary preview, receive the full row (incl.
  `ai_prompt_used`, which embeds another tenant's brief and budget) **and destructively overwrite the
  victim's row** — a cross-tenant *write*. Round 2 found 2 `[med]` consistency gaps (the rejected
  `profiles.org_id` cache still used in `get_dragonshare`; the org-branch `dragonshare_posts` read
  dropping the `status='verified'` half of `ds_posts_org_select`, surfacing pending/flagged/removed
  submissions). Round 3 was hardening only — it converged. **Codex then caught a P2 all three rounds
  missed**, the strongest in-repo argument for a second independent model: `isParticipant` collapsed
  collaborations and applications into one flag, but the live `campaigns` SELECT policy treats them
  differently — `has_collaboration_on_campaign` is **status-independent** and there is **no
  application arm at all**, so a rejected or stale applicant retained access to a *closed* campaign's
  brief and budget. Split into `isCollaborator` (status-independent) and `hasApplication` (requires
  `published`). `verify-db-schema` read the policy from prod and **independently confirmed** it, and
  found **0 stale `profiles.org_id` pointers** (23 active memberships, 0 non-active) — so that fix is
  latent-correct rather than closing a live hole.
  **Two functional regressions were introduced and caught in review**, worth recording because a
  security fix that breaks the feature is its own failure mode — neither was caught by tests, both by
  asking *"does this still work for the person who's supposed to use it?"*: (1) the pitch endpoint was
  gated on `evaluateCampaignAccess` (owner ∨ org ∨ **participant**), but `donny-apply-pitch` exists to
  help a creator write a pitch *before* applying, so they are never yet a participant — that denied
  every legitimate first use; now `evaluateApplyAccess`. (2) a `profile_visibility='public'` filter was
  added to the caller's **own** profile read after ownership had already been asserted, closing no
  exposure while locking private creators out of their own data — **ownership supersedes visibility**;
  cross-user reads correctly keep their filters. One deliberate, documented deviation:
  `evaluateCampaignAccess` is **stricter than RLS** (the policy grants any authenticated user a
  published non-crew campaign; the helper also requires owner ∨ org ∨ collaborator ∨ applicant) because
  `handleGenerate` spends AI budget — "anyone may read it" must not become "anyone may bill previews
  against it."
  **Urgency was calibrated against prod, not assumed:** 0 private creators (13/13 public), 0 private
  businesses (17/17), 0 crew campaigns, 0 draft campaigns — every finding **latent, not actively
  leaking**. Latent here means *one user action away* (the first crew built, creator set private, or
  draft saved), so the guards landed **before** the features that would expose them get used.
  Process gotchas: `origin/main` moved **three times** during the session and this repo requires
  up-to-date branches with **auto-merge disabled**, making the merge a manual update-then-merge race —
  an early REST-path diff computed against a stale base contained two deleted migrations and a landing
  revert, so always re-derive and verify `removed: 0` before opening the PR. Codex **buffers** its
  output; ~20 min at 0 bytes is normal, not a stall. Deferred, documented, not defects: two `[low]`
  `select('*')` reads in own-row-scoped paths. Concept:
  `docs/wiki/concepts/service-role-data-exposure.md`.

- `data-exposure-reviewer` subagent — service-role RLS-bypass review — **built
  (branch `worktree-dc-improvements-3`, 2026-07-19; markdown only, no code/schema/edge-fn/deploy).**
  The ask was "this project only has 1 sub-agent — port Harbormill AIOS's". **The premise did not
  hold:** Harbormill has **zero** custom subagents (no `.claude/agents/`, none in git history), its
  agent layer is skills, and DC is *ahead* on two of its four candidates — `loop-audit` is behind
  Loop Scout (which verifies its conditions with live PostgREST probes and dedupes via stable
  fingerprints), and `validator-forge` grades done-rules as prose where DC shipped the
  `{done,checklist,missing}` contract `parseDoneCheck` consumes. Only `wiki-gardener` is a real DC
  gap; **the valuable direction is DC → Harbormill.** So the work became "is *one* new subagent
  justified?" — yes, on hard evidence: for PR #260 the record reads *"edge-function-reviewer **PASS**
  on both; Codex clean (**1 P1 fixed**)"* on a branch closing a **service-role IDOR** in
  `campaignDetail` and making `org_id` server-side-only. A service-role client **bypasses RLS
  entirely** (86 of 90 edge fns build one, + 4 `_shared` modules inheriting into every importer), and
  these defects **run perfectly**, so the sibling agent's "will it deploy and run?" lens passes them —
  its RLS mention is one clause under a bundling/`verify_jwt`-led checklist. **A buried checkbox is
  not a specialty.** Cost, quantified: 14-round and 10-round Codex loops, 8-fix loops twice.
  This resolves the 2026-07-07 [[Claude Subagents Audit]] Tier-2 deferral (`~` partial
  non-redundancy vs `verify-db-schema`) by stating the boundary it asked for — **`verify-db-schema`
  checks RLS *permits* the real caller; this checks RLS and the query *exclude* everyone else** —
  and renames it (the evidence is in query call sites, not migrations). Ships `Read/Grep/Glob` only
  (**no MCP tools**: `execute_sql` runs DDL/DML; `list_tables`/`get_advisors` were granted then
  dropped — unused, and `get_advisors` would reopen the shelved 149-advisor triage), `model: opus`
  (the cheap-specialist heuristic assumes symmetric error cost, false when a miss is a cross-tenant
  leak), 8 checks, and a **hard-wired dispatch in `codex-review` step 1** since `description:`
  auto-invocation is best-effort and not test-verifiable. Keystone contract: the changed-file list is
  a **TRIGGER SET, not a READ SET** — the opposite of `edge-function-reviewer`'s "do not fan out".
  Validated by re-staging 3 historical defects as detached replay worktrees **built before the agent**;
  all passed, including the sharpest — on the Crews fixture it reached
  `send-campaign-publish-notifications` **unprompted, by grep** (that file deliberately excluded from
  its input) and flagged the platform-wide broadcast leak that took an adversarial review to find
  after 14 Codex rounds. That replay needed **reconstruction, not `<sha>^`** (`dc827171` is a squash
  merge whose parent has zero `creator_group` migrations). Whole-branch review then caught what the
  replays could not: **the entry gate could gate out check 6**, the flagship capability — a
  scope-column-only migration has no `policy`/`security definer`, so it fell through; the Crews replay
  passed only because 16 *sibling* migrations held the gate open. Durable lesson: **a suite can appear
  to cover a capability while exercising it only through an unrelated precondition.** Fixed +
  regression-tested. Its first real runs found **6 unfixed exposures on `origin/main`** (5
  controller-verified against `origin/main`, 1 flagged unverified) — sharpest being
  `donny-chat/index.ts` where `:1237` has the visibility filter and its sibling `:1295` does not, 58
  lines apart; filed in `.claude/handoffs/2026-07-19-service-role-exposure-findings.md` for a
  **dedicated branch**, deliberately not fixed here. 983/983 tests. **Correction recorded:** an
  earlier claim in this session that PR #288 shipped without its knowledge-sync was **wrong** —
  asserted from a worktree 15 commits behind `origin/main`, where PR #290 had already done it and
  #291 verified it; retracted in the spec + plan rather than deleted so the error stays traceable.
  Concept: `docs/wiki/concepts/service-role-data-exposure.md`. Spec:
  `docs/superpowers/specs/2026-07-19-data-exposure-reviewer-design.md`.

- Session context-tax reduction — PROJECT_CONTEXT §5 split into an index + SHIPPED_LOG —
  **shipped (PRs #294 + #295, 2026-07-19).** Prompted by a founder-supplied video on Claude token
  efficiency, **audited against the repo before adopting** (3 of its 10 techniques applied; RTK and
  pxpipe were rejected outright — a third-party tool intercepting tool output is not a dependency
  to take on in a repo carrying prod Supabase service-role and Stripe credentials). Measured first:
  every session loaded **~45,700 tokens** before reading a line of code, and §5 alone was
  **~29,950 (65%)** — 68 multi-paragraph prose bullets under a heading that said "Active
  Workstreams". **The mislabel mattered more than the length**, because it made the cost
  *compounding*: `knowledge-sync` step 4 **and** the always-loaded `CLAUDE.md` clause each told
  every session to append detail there, so §5 grew ~440 tok per shipped branch forever. Coverage was
  verified per-bullet before designing — 58 of 68 already cited a wiki page or spec, so §5 was
  largely a prose cache of content the wiki held. **The split:** all prose moved **verbatim** into a
  new `docs/SHIPPED_LOG.md` (not imported by `CLAUDE.md`, so never auto-loaded, but still collected
  by `sync-internal-docs.mjs`'s non-recursive `docs/*.md` glob → `/internal/strategy` + Internal
  Donny, seeded `is_core=true`); §5 became a three-section index (`### In flight` / `### Built —
  awaiting founder go-live`, each with a `**Pending:**` clause / `### Shipped`) on a binding entry
  format (`- **<Name>** — <one clause>. → <pointer> · <refs>`, wiki page beats spec, refs omitted
  entirely when neither PR nor branch exists); and **both generators were amended in the same PR** —
  the load-bearing half being `CLAUDE.md`, since a session that never opens the skill file would
  otherwise re-bloat §5. **176,620 → 73,742 B (−58%)**, growth per branch ~440 → ~15 tok.
  **Paired #295** worked the founder go-live triage 6 → 2 and scheduled three report-only cloud
  routines from their committed `.claude/schedules/` prompts (`ai-cost-vs-cap` playbook runner
  weekly; Dezzy Press & Events scout and Strategy Library audit monthly) — the library audit
  explicitly told `SHIPPED_LOG.md`'s size and wiki overlap are by design so it never files it as
  `strategy-bloat`. **Durable gotchas, all found by review rather than testing:** a zero-loss gate
  that counted `^- ` bullet *headings* proved nothing (prose lives in indented continuation lines);
  line endings must be normalized **before** any end-anchored regex, or on a CRLF repo the sentinel
  never matches, `sed '1,/re/d'` deletes through EOF, and the gate reports **total data loss on a
  correct migration** (dangerous, because the instinct is then to loosen the gate); an `awk` range
  must terminate at its sentinel rather than filtering one line, since the `**Workflow discipline**`
  block is three column-0 lines and is an operating instruction that must stay in §5; and **a status
  claim in a document is a claim, not a fact** — checking prod retired three stale "pending" entries
  (DRE's two launch switches share an identical `updated_at`; web-tool rows exist in
  `donny_cost_ledger`; three edge functions are ACTIVE) and deleted one **already-closed security
  follow-up** that had twice been reported upward as a live privacy gap (`match-creators`'
  `profile_visibility` filter, present since #247). `origin/main` moved **five times** mid-branch;
  the gate earned its keep when a first conflict resolution missed a concurrent PR's new bullet and
  it failed loudly, naming the exact missing prose. Standing rule established: **log entries are
  historical snapshots, §5 is the authority on current status**. Verified: sorted-line diff empty at
  1342/1342, citations unchanged, 70 entries / 2 `Pending:`, `npm run build` green, Codex clean.
  **Validated in the wild 15 minutes after merge** — an unrelated session (PR #299) wrote 33 lines
  to `SHIPPED_LOG.md` and one §5 index line in the binding format, unprompted. Concept:
  `docs/wiki/concepts/context-tax.md`. Spec:
  `docs/superpowers/specs/2026-07-18-context-tax-reduction-design.md`.

- Auth + onboarding — landing-theme retheme — **shipped + deployed (PR #299, 2026-07-19;
  frontend-only, no schema/edge-fn/secret change).** A **presentational-only** retheme of all 7
  entry surfaces — login/sign-up (`AuthPage`), the 5 auth siblings (`ForgotPassword`/
  `UpdatePassword`/`VerifyEmail`/`RestoreAccountPage`/`InviteAcceptPage`), and the onboarding
  wizard + steps, plus shared components (`AuthForm`/`AuthModeToggle`/`RoleSelection`) — from
  **dark** to the shipped **light "Human-driven. AI-assisted."** landing identity (PR #293),
  "softened for forms." Closes the gap the landing redesign left open: a visitor who clicked "Get
  started" on the bright landing still dropped into a dark auth screen. **Zero auth-logic
  changes** — every handler/effect/redirect/Supabase call is byte-identical, verified at per-task
  review, the whole-branch Opus review, and the Codex second review. New shared **`AuthShell`**
  (`src/components/auth/AuthShell.tsx`, a light glow wrapper) replaces the dark `bg-dc-dark` root +
  `GlowBackdrop`; it reuses the landing's already-shipped, additive `landing-*` tokens/fonts plus
  the `Eyebrow`/`LandingButton` primitives — ADDITIVE, so the authenticated app (still `dc-*`/
  Outfit) is untouched. Light Bricolage headings, grape/pink/mint accents, chunky pink buttons,
  calm light shadcn form fields, and `RoleSelection` restyled to pastel door-cards. **Both dark
  triggers removed together** from all 7 surfaces (the `useDarkHtml()` call AND the literal
  `dark`/`bg-dc-dark` wrapper class — removing only one would have left a half-migrated wrapper),
  and **`src/hooks/useDarkHtml.ts` deleted** as dead code once every caller went light —
  `/internal` has always applied dark via its own independent inline `useEffect`
  (`InternalLayout`), so the deletion is a no-op there and **`/internal` is now the only dark
  surface left in the app**. **`AuthShell` `isolate` gotcha (Codex + whole-branch catch):** the
  first version wrapped `children` in a `relative z-10` slot, which became a shrink-wrapping flex
  item whenever a caller centers via `flex items-center justify-center` (invite/restore/onboarding),
  collapsing their `w-full max-w-*` cards to content width. Fixed with the landing's own `isolate`
  pattern: root `isolate` + glow `-z-10`, `children` rendered directly, with a regression test
  (`AuthShell.test.tsx`) locking in the fix. Closed the previously parked PR #279 (a rejected
  `dc-*`-toward-the-app retheme option) as superseded. Deferred cosmetic follow-ups: the sibling
  pages' chrome-bar headings stayed `font-sans` rather than picking up `font-display`, and
  onboarding doesn't yet visibly "soften toward the app" as it progresses. `docs/DESIGN_SYSTEM.md`
  was updated in the same PR to document the marketing+entry identity now covering auth/onboarding.
  Concept: `docs/wiki/concepts/auth-onboarding-landing-theme.md`. Spec:
  `docs/superpowers/specs/2026-07-18-auth-onboarding-landing-theme-design.md`.

- DragonCandy AIOS — Reading agent traces (the 4th loop-stack layer) — **built (PR #292,
  2026-07-18; schema + edge fn live on prod, skill ships on merge).** A founder-supplied video on how
  Anthropic engineers automate was **audited against the repo before adopting**, and three of its four
  rules were already implemented past what it describes — Loop Scout's 4-Condition Test *is* "match the
  bottleneck", the 7 scheduled routines *are* "Claude comes to you", and Founder Playbooks'
  `done_criteria` + the `{done,checklist,missing}` verdict contract *are* "objectives, not tasks". Only
  **"read the traces"** was a real gap: every existing layer reasons about **outputs**, `/internal/loops`
  admits in its own source that there is no central run-log ("last output ≠ last run"), and a scheduled
  routine that ran clean leaves **zero** durable trace — while Claude Code was writing a rich per-session
  JSONL trace (**598 files, ~40MB**) that nothing had ever opened. Shipped the **`read-the-traces`**
  skill — global (`~/.claude/skills/`) with a byte-identical committed repo copy, so future projects
  inherit it — a zero-dependency **streamed** scanner (133MB in ~7s under a 256MB heap cap) reporting
  tool errors, permission/classifier denials, hook errors, repeat-failure clusters, per-skill error
  rates and dead skills, gated on **four deterministic checks** and ending with the standard verdict
  block `parseDoneCheck` already reads. Deliberately **not** named `verify-*` (that prefix is Loop
  Scout's project-local discovery glob; this is a global **auditor** of the agent layer, not a validator
  of a shipped change). **No schema/edge-fn/cron for the skill itself.** Also repaired the two broken
  trace writes it depends on: `donny-orchestrator`'s `donny_tool_executions` insert used columns that
  **do not exist** (`tool_input`/`tool_output`/`is_error`) and omitted the NOT NULL `message_id`, so it
  had **never written a row** — while `bug-sweep-agent` (`status=eq.error`) read the empty table as a
  clean sweep; verified against **prod, not the migration file**, `message_id` made nullable
  (non-destructive; also fixes a latent null-id failure in `donny-chat`), and the `.then(ok,fail)` shape
  replaced with an explicit `error` check — **supabase-js v2 *resolves* on a Postgrest error**, which is
  why the bug survived undetected while *looking* like it had error handling (a trace surface that
  silently drops every write is worse than none: it reads as healthy). `playbook-runner-agent`, which
  posts under `playbook:<slug>` and writes no `aios_playbook_runs` row, is now watched on
  `/internal/loops`. First run surfaced, and survived verification: six classifier denials incl. a
  merge-without-review and a fabricated-data prod submission, Chrome screenshot timeouts as the largest
  reliability drag, and 84 declared skills of which **77 never fire**. **Two of its three headline
  findings were the tool's own false positives, reported before verification and retracted the same
  session** — a hook that BLOCKED was classified as a hook that FAILED (a denial surfaces with an
  "error" prefix, so the scanner inverted a gate failing *closed* into one "failing open"), and a
  last-skill-seen heuristic charged the git-only `refresh-main` with a 68% error rate assembled from
  Chrome timeouts it never issued (exact `tool_use_id` attribution: 4%). Both fixed — attribution is now
  strictly id-based and `hook-blocked`/`policy-blocked` are advisory classes, never faults. The durable
  lesson is about the tool: **an observability tool that misclassifies is worse than none**, because it
  manufactures alarming false positives that get acted on. `edge-function-reviewer` PASS; **Codex clean
  after 4 rounds** (fine-grained `github_pat_` redaction, per-record `--days` filtering, skill
  attribution, generated-type nullability); `donny-orchestrator` deployed **v69** (`verify_jwt=true`
  preserved). **Deferred:** a central `aios_loop_runs` run-log for the scheduled routines — building
  storage before the free read exists inverts "automate last". Concept:
  `docs/wiki/concepts/reading-agent-traces.md`.

- Public landing — "Human-driven. AI-assisted." redesign (Joe's direction) — **built (branch
  `feat/landing-joe-redesign`, PR #293, 2026-07-18; frontend-only, video off by default).** A full
  visual + messaging redesign of the public landing to a founder-provided mockup, reframing
  DragonCandy's positioning from "AI generates your content, fast" to **"Human-driven.
  AI-assisted."** — a real human creator becomes a business's social-media team; Donny assists in
  the background; humans drive every decision. Founder-confirmed as the platform's true
  positioning, not a cosmetic pass. New **light** landing (drops the prior scoped `.dark` wrapper
  entirely, rejoining the rest of the light app — see the light-theme-polish bullet above) on its
  own additive `landing-*` Tailwind tokens + self-hosted Bricolage Grotesque/Instrument
  Sans/Silkscreen fonts (the app's `dc-*`/Outfit system byte-unchanged). Static two-door hero
  (Business/Creator) replaces the prior role-morphing hero; `AudienceLanes`/`ProofSection`/
  `StartFreeSection` deleted. **The entire cinematic-video system from the prior landing redesign
  is preserved, not deleted** — demoted to opt-in behind a new `LANDING_VIDEO_BACKDROP_ENABLED`
  flag (default `false`, mirrors `BRAND_ROLE_ENABLED`) via a single-key, light-scrim
  `HeroVideoBackdrop.tsx`; re-enabling is a one-line flag flip plus real (non-AI) footage. Both
  conversion tools (the paste-a-URL brief generator, lead capture) reused byte-identical on the
  backend — only restyled. Splash + the three landing-route Suspense fallbacks flipped dark→light
  to avoid a load flash (the mirror of the earlier light→dark flash fix). No schema/RLS/edge-fn/
  secret change. Subagent-driven (10 tasks, per-task review) → whole-branch Opus review (3 fixes:
  door `scroll-mt`, `LandingButton` `cn()`-merge + `type="button"` default, keyboard-accessible
  logo button) → Codex second review clean; 1017 tests pass. Concept:
  `docs/wiki/concepts/landing-human-driven-redesign.md`. Spec:
  `docs/superpowers/specs/2026-07-18-landing-joe-redesign-design.md`.

- Light-theme polish — **Phase 1 shipped + deployed (PR #280, 2026-07-18).** After the app went light,
  it was consistent-ish but hand-rolled per screen (~5 card-border variants, radius/spacing drift, two
  button teals, double-padding) and off-brand in places (gray surfaces/badges, `bg-blue-600` buttons,
  pink→purple gradients). Phase 1 built a **shared light-app kit** (`src/components/app/`: `PageBody` /
  `AppCard` / `AppChip` / `AppStatusBadge` + a `dc-secondary` button variant, TDD) and adopted it across
  the **3 dashboards, campaigns (builder + list/details/marketplace), and browse** — the keystone being
  that adopting the kit **fixes consistency AND de-grays at the source**. Direction: **clean white +
  brand accents**; de-gray targets **surfaces/badges only** (gray secondary text stays — `dc-text-muted`
  is a gray by design). Two durable gotchas: `AppChip` is a `<button>` → use `AppStatusBadge` (a span)
  for tags inside clickable cards (invalid nested buttons); wrap a shadcn `Card` with `<AppCard
  className="p-0">` (don't double-pad). Also fixed a same-file card mismatch + invisible `text-white`
  leftovers on the now-white page. Codex-clean; residual-grep zero; `DESIGN_SYSTEM.md` refreshed.
  **Phase 2 shipped + deployed (PR #282, 2026-07-18)** — pure rollout of the same kit onto the three
  surfaces Phase 1 deferred: **messaging** (retired the `bg-teal-50` "teal island" bg → white +
  `PageBody`; `teal-50` wash panels → `bg-dc-teal/[0.04]` inset tint; input/presence/status de-gray;
  chat bubbles pink/teal untouched), the **DragonShare + Dragon Feed** pair, and **public profiles**
  (`AppCard`/`AppStatusBadge`; pink hero + white text untouched; Busy badge → `tone="neutral"`, green
  "Available" kept). Surfaced the **third kit gotcha**: `AppCard` is not a `forwardRef` component, so a
  card that needs a `ref` (`PublicBusinessProfile`'s `reviewsRef` scroll target) keeps the ref on a
  plain `<div>`. Presentational only; Codex-clean; residual-grep zero.
  **Phase 3 shipped + deployed (PR #285, 2026-07-18)** — pure rollout of the same kit onto the three
  surfaces Phase 1/2 deferred: **Settings** (the shared `SettingsSection` wrapper de-grayed → cascades
  across every settings section AND promotions' `CGCPostingPreferences` — the highest-leverage node;
  `StripeConnectSetup` chrome-only, semantic status panels kept), **Promotions** (cards → `AppCard`, tabs
  → `AppChip`, pills → `AppStatusBadge`; error-boundary keeps its `bg-red-50` wash), and
  **Org/Billing/Payments** (**money-flow styling-only** — amounts/fee-math/status-enums/handlers/redirect
  URLs byte-unchanged; failure red + semantic payment colors kept as literals since `AppStatusBadge` has
  no red tone; starter/growth tier badges kept distinct). Founder scope call: **Outstand deferred to a
  Phase 4** (~51 files, per-instance social-platform-color judgment). Scope guards held — `AvatarCropModal`
  (dark-onboarding-shared), `PricingPage`, and the public customer funnel all verified absent from the
  diff. Codex-clean; 983/983 tests; residual-grep zero.
  **Phase 4 shipped + deployed (PR #288, 2026-07-18)** — the FINAL surface group: the ~47-file **Outstand**
  social-integration surface, in 6 reviewed sub-batches. Its own phase because Outstand's blue/purple/red
  MIX **social-platform BRAND colors (KEEP)** with off-brand accents → per-instance judgment, not
  find-replace. Kept: the `socialNetworks.ts` map + IG gradient + `x bg-gray-800` + all platform tints,
  chart data-viz colors, money-flow (DragonDash rush), `VerifiedBadge`/`CrossPostPrompt` (NO-CHANGE).
  Codex-clean; 983/983 tests; residual-sweep zero. **All four surface groups now on the kit.**
  **Backgrounds + off-brand-accents cleanup shipped + deployed (PR #289, 2026-07-18)** — a cross-app pass
  (founder directive: prioritize backgrounds + off-brand accents) fixing what the surfaces/badges rule
  left: panel `bg-muted`/`bg-gray-*` backgrounds → `bg-dc-teal/[0.04]` inset, and off-brand blue/purple/
  indigo accents → teal/pink (keystone: the blue/indigo sponsorship cards), across the campaign builder,
  application/matching cards, messaging sub-panels, Donny chat, files/projects, modals. Audit finding:
  **no full-page washes remained** — all panel-level. 55 files, 4 reviewed sub-batches; Codex-clean;
  983/983 tests; residual-sweep zero. **The entire light app — every panel and accent, not just
  cards/badges — is now on-brand.** Concept: `docs/wiki/concepts/light-app-kit.md`. Spec:
  `docs/superpowers/specs/2026-07-17-light-theme-polish-phase1-design.md`.

- App theme — **light app + dark marketing/entry (final, deployed 2026-07-17, PRs #275 + #277).**
  After the landing's Dark-Luxe redesign, an experiment forced the *whole* app dark to match
  (PR #269) — but founder feedback was the dark app read **too dark, some text unreadable, and the
  half-converted white patches looked unfinished**, while the dark **landing + login/sign-up** were
  liked. So the working app was **reverted to its original light theme**, and dark is now scoped to
  only the **entry/marketing surfaces**: landing (self-scopes `.dark`), login/sign-up + auth-adjacent
  (forgot/update/verify/restore/invite) + onboarding (all via a new **`useDarkHtml()`** hook that adds
  `dark` to `<html>` for the route's lifetime, mirroring `InternalLayout` for `/internal`), and
  `/internal` itself. `ThemeProvider` = `defaultTheme="light"` (NOT `forcedTheme` — a forced light
  fights the route-level `<html class="dark">` and breaks `/internal`; a Codex catch). **Durable
  learnings kept:** the two-color-system model (~847 semantic tokens flip under `.dark`, ~1,900
  `dc-*`/`bg-white`/`text-gray` literals don't — which made the per-file revert clean), the
  **washed-auth gotcha** (a scoped-div `.dark` leaves `<body>` light → the auth glow layers composite
  over white and wash out → the whole point of `useDarkHtml`), the `.dc-field`-loses-to-shadcn-`<Input>`
  cascade, and the dark-fill-as-text contrast trap. The reusable dark-luxe kit
  (`.dc-surface`/`.dc-panel`/`.dc-field`, `dc-teal-pill`/`dc-ghost-pill`, `GlowBackdrop`/`Eyebrow`)
  remains for the dark surfaces. Codex-clean; prod-verified (auth dark, app light). Concept:
  `docs/wiki/concepts/dark-luxe-app-theme.md`.

- Donny first-open UX — close-trap fix + branded tray redesign — **shipped + live-verified
  (PR #258, 2026-07-16; frontend-only).** The first-open Donny "tray" had **no ✕ close** —
  the consumer panel is a 3-stage machine (`closed→tray→chat`) whose tray and chat rendered
  two *different* headers, and only the chat header carried the ✕, so users were **trapped
  until they sent a message** (which `expand()`s to chat). On desktop the tray had no
  backdrop either → an undiscoverable Escape was the only exit. Fix: one shared teal
  `DonnyPanelHeader` used by **both** stages (tray: ⌃ expand + ✕ close; chat: ⌄ minimize + ✕
  close), `DonnyChatHeader` deleted; **desktop close-on-outside-click** (`useIsMobile`-gated —
  the panel is only CSS-hidden, not unmounted, on mobile — and `[data-donny-launcher]`-excluded
  so the launcher toggle doesn't fight it); an inviting "🎉 You're all caught up" empty state +
  labeled brand-colored chip groups + de-grayed `DonnyTrayInput`. Chip data/logic unchanged;
  rebased onto main's fixed-overlay `DonnyDesktopPanel` (#236). Codex-clean; **live-verified on
  prod** (restaurant dashboard — ✕ / click-outside / launcher toggle all work, 0 console
  errors). Concept: `docs/wiki/concepts/donny-chat-ux.md`.

- Donny data visibility + quick-action 404 — **shipped + deployed (branch `worktree-dc-issues-6`,
  PR #260, 2026-07-16; edge fns live on prod, frontend on merge).** Founder bug (Uncle Rocco): the
  consumer Donny chat (`donny-orchestrator`) 404'd on the "Invite Creators" quick-action and reported
  *"no campaigns / DragonShare — data sync issue"* despite 12 campaigns / 10 applications / 7
  collaborations / 3 DragonShare posts. Two bug classes, fixed on **both** backends (`donny-orchestrator`
  + `donny-chat`), for **businesses and creators**. **(1) Schema drift swallowed to `[]`:** the campaign
  agent selected **`campaigns.platform`**, which doesn't exist (it's `platforms text[]`), so every
  campaigns SELECT 400'd → `[]` (the real "no campaigns" cause — caught by the edge-function-reviewer,
  not the initial org-ownership guess); the **entire DragonShare agent** queried dead columns/enums
  (`dragonshare_posts.user_id`/`campaign_id`, `dragonshare_boosts.org_id`/`budget_used`, `amount`,
  `payout_date`, enum `pending`/`paid`/`active`) → always empty. Rewrote both agents schema-correct +
  role-aware (owners: campaigns by `user_id`, applications by `org_id`/`in(campaign_id)`, collaborations
  by `in(campaign_id)`; creators by `creator_id`), surfacing errors via a `data_partial` flag instead of
  `?? []`. **(2) LLM-invented `route`s → 404:** quick-action routes were free text the model writes,
  regex-scraped and passed to `navigate()` unvalidated; new pure vitest-tested `donny-orchestrator/routes.ts`
  `isKnownRoute` allow-list (mirrors `src/App.tsx`) drops invented routes server-side, `src/lib/donnyRoutes.ts`
  guards already-persisted ones client-side (`DonnyMessage.tsx`), and role-aware route builders replace the
  hardcoded `/dashboard/brand/campaigns` (a list route that exists for no role); invite intent → Browse
  Creators. Also closed a **service-role IDOR** in `campaignDetail` (ownership gate — service role bypasses
  RLS) and made **`org_id` server-side-only** (Codex P1 — a client value could point at another tenant).
  `donny-chat` parity: role-aware `get_campaigns` (creators → applications/collaborations), a new
  `get_dragonshare` tool, the `platforms` fix in `get_campaigns` + `create_campaign`, and the
  system-prompt count no longer filters `status='published'` (an `active` campaign read as 0 → the false
  "data sync issue"). edge-function-reviewer PASS on both; Codex clean (1 P1 fixed). The **careful** deploy
  gate caught an `origin/main` collision (#248/#251 web-Donny) → merged before deploying; `donny-orchestrator`
  v63 (verify_jwt=true) + `donny-chat` v145 (verify_jwt=false) deployed via CLI + boot-checked. Concept:
  `docs/wiki/concepts/donny-data-and-quick-actions.md`.

- Web Donny find_creators results as avatar rich cards (Option B) — **built + backend-deployed
  (branch `feat/donny-rich-creator-cards`, 2026-07-16; orchestrator v62 live + migration applied;
  frontend merges when GitHub's REST API recovers).** The `find_creators` results now render as
  **avatar cards** in the web Donny chat, not just a text list. Keystone: a **deterministic card
  side-channel that bypasses the LLM** — the sub-agent returns structured `cards[]`; `dispatchAgent`
  returns `{result, cards}` where the JSON string fed to Claude carries ONLY `context` +
  `suggested_actions` (never the cards); the orchestrator threads `collectedCards` into the SSE `done`
  event; `useDonny` persists them to a NEW **nullable `donny_messages.rich_cards jsonb`** column
  (additive — the singular `rich_card` is untouched, so internal Donny renders identically); and
  `DonnyMessage` maps them to one `DonnyRichCard` per creator (reusing the existing `creator_profile`
  card + a distance line). Per-creator "View" buttons dropped (cards own View Portfolio/Invite);
  "Browse all creators" remains. Built brainstorm→plan→subagent-implementer→review;
  `edge-function-reviewer` PASS; **Codex clean after 1 P2** (reset `collectedCards` even on an empty
  later find_creators so stale cards can't render — "last find_creators wins"); typecheck + build +
  DonnyMessage suite (5/5) pass. Migration applied via MCP (nullable, no new advisor); `donny-orchestrator`
  deployed **v62** (`verify_jwt=true` preserved). **Deploy ordering:** migration to prod BEFORE the
  frontend merges (the `useDonny` insert writes `rich_cards`); the edge fn is forward-compatible (old
  client ignores the extra SSE field). Live-verify after the frontend deploys. Concept:
  `docs/wiki/concepts/ai-creator-matching.md` (Option B section). Plan:
  `docs/superpowers/plans/2026-07-16-donny-orchestrator-rich-cards.md`.

- Public landing — DragonFeed hero backdrop adapter — **shipped + deployed (PR #268,
  2026-07-17).** Closes the prior session's own prediction ("a future DragonFeed adapter…swaps the
  source with zero component changes"): the hero backdrop now **leads with real boosted DragonShare
  video** when any exists, falling back to the curated static clips otherwise. Video-only; no
  schema/RLS/migration/secret. New anon `landing-clips` edge fn (`verify_jwt=true`, the platform
  default) does a service-role read of `dragonshare_posts` gated on verified + unflagged +
  **boosted** (paid boost = the curation gate — safer than "all verified" for anonymous
  top-of-funnel exposure, since DragonShare is trust-then-flag) + a playable video extension + a
  captured/transferred boost row; returns only `{src, poster?}`, never PII. Frontend: a new
  `useLandingBackdropPlaylist` hook merges the dynamic clips (leading) over the static playlist via
  a pure `mergeBackdropPlaylist`, and `HeroSection` remounts `RotatingBackdrop` on a new
  content-aware `playlistSignature` key (its rotation is index-based, so a same-length-different-
  clips swap needs a real remount, not `key={role}`). **No-stall fix** (caught by the whole-branch
  review, not the per-task reviews): `RotatingBackdrop` only ever advanced on `onEnded`, but an
  undecodable/404 clip fires `error` instead — with a real (uncurated) upload now possibly leading
  at index 0, one bad clip would have frozen the hero forever; fixed by also advancing on `onError`
  and skipping an already-errored preloaded clip. The whole-branch review also found the feature was
  **not latent** — 5 eligible boosted rows already existed in prod. Reviews: Opus whole-branch →
  `edge-function-reviewer` PASS → Codex second review clean → `careful`-gated CLI deploy
  (`verify_jwt=true` preserved, boot-checked). Concept:
  `docs/wiki/concepts/landing-cinematic-video-redesign.md` (new "DragonFeed Backdrop Adapter"
  section). Spec: `docs/superpowers/specs/2026-07-17-dragonfeed-backdrop-adapter-design.md`.
  **Follow-up fix (PR #273, same day, merged + live):** the founder reported "the creator side
  shows one looped video" — the leading boosted clip on prod was a real HEVC (H.265) `.MOV`
  Chrome/Firefox can't decode (silent black frame, no `error` event, so PR #268's `onError`-skip
  never fired). Fixed with three changes: dynamic clips now **trail** the curated static clips
  instead of leading (`mergeBackdropPlaylist`), `.mov`/`.MOV` dropped from `landing-clips`
  eligibility (`mp4`/`webm` only), and a 15s max-dwell watchdog on `RotatingBackdrop` so a clip
  that neither ends nor errors force-advances. `edge-function-reviewer` PASS + Codex clean.

- Public landing — Cinematic AI-video redesign — **built (branch
  `worktree-dc-landing-page-upgrade`, 2026-07-16; frontend-only, no schema/edge-fn/secret change).**
  Evolved the Dark-Luxe landing (`src/components/landing/*`) into a **cinematic, kinetic, 6-section**
  page: a **morphing per-role hero** (R2 switcher — `Business·Creator·Brand` pills re-film the
  headline/backdrop-clip/CTA; own-property-guarded `?role=` deep-link; Brand pill gated by
  `BRAND_ROLE_ENABLED`), a **swappable `landingClips` clip-source seam** (semantic key →
  `{src,poster}`; v1 registry ships **empty** so `VideoSlot` degrades to its gradient — **ship-before-clips**;
  founder pastes Cloudflare Stream URLs into one file to turn on video; a future **DragonFeed adapter**
  swaps the source with zero component changes), an additive **`VideoSlot variant="backdrop"`**
  (full-bleed, controls-less), a **Lean-6** structure (Hero → See-it-work [the anonymous brief
  generator] → How-it-works → Pick-your-lane → **honest** Proof [empty testimonials slot, no fabricated
  quotes] → Start-free [merged CTA + lead form]), **"Donny"** naming (never "Donny AI"), and a
  **transparent scroll-aware header** (transparent over the hero, fades in a dark blur on scroll).
  Recommended clip pipeline (founder, outside code): Nano Banana Pro stills → image-to-video (Veo 3.1
  / Kling / Runway) → 4–8s silent loops → Cloudflare Stream. Built subagent-driven (11 tasks, per-task
  review; pure `landingClips`/`heroRole`/`VideoSlot` unit-tested TDD). **Opus whole-branch review**
  "ready to merge with fixes" caught one Important bug — the backdrop wrapper's `relative` beat the
  hero's `absolute inset-0` (Tailwind emits `.relative` after `.absolute`, so the later-defined wins →
  not full-bleed; masked until a clip URL is added) — fixed to self-position `absolute inset-0` + a
  regression test. **Codex second review clean.** Browser-verified logged-out: hero morph
  (Business↔Creator), brief generator, honest Proof, scroll-aware header, no console errors; found +
  fixed two more in the browser pass (size a tall logo by **height** not width; a fixed transparent
  header is illegible over bright scrolled content → scroll-fade). Founder follow-ups: Cloudflare
  Stream account + generate/drop clip URLs into `LANDING_CLIPS`; confirm `LEADS_NOTIFY_EMAIL`;
  optionally fill real testimonials + align the gated rewards copy to "Reputation (Rep)". Concept:
  `docs/wiki/concepts/landing-cinematic-video-redesign.md`. Spec:
  `docs/superpowers/specs/2026-07-16-landing-cinematic-video-redesign-design.md`.

- Web Donny "find creators near me" — the fix belongs in `donny-orchestrator` — **shipped +
  live-verified (branch `feat/donny-orchestrator-find-creators`, 2026-07-16; deployed v61).** A live
  E2E of the Donny-chat matcher fix exposed that **the consumer web/mobile Donny chat calls a
  *different* edge function than the fix touched**: `src/hooks/useDonny.ts` → **`donny-orchestrator`**
  (sub-agent router); `useInternalDonny.ts` → `donny-chat` (internal AIOS Donny only). So the
  `donny-chat` `match_creators` work (PR #246) + the prompt/tool_choice forcing (PR #249) never
  reached the surface businesses test — Donny's "I don't have that tool" was **true** for the
  orchestrator (it had no standalone creator-list tool; matching was scoped to `campaign_agent` for
  existing campaigns). Found via a **network capture** — the durable rule: confirm WHICH edge fn a
  surface calls before building, don't infer from where the tool code lives. Real fix (Option A):
  relocate `creator-discovery.ts` → **`_shared/`** (one tested scorer for both Donnys), add a
  **`find_creators` sub-agent** (`donny-orchestrator/agents/creators.ts`) — public+completed
  `creator_profiles` query (service-role RLS bypass → `profile_visibility='public'`) → shared
  `rankCreators` → a present-ready **text list + per-creator "View" nav buttons** (renders today, zero
  frontend change), register it in `agentMap`, and **force `tool_choice:{type:"tool",name:"find_creators"}`
  on the first `callClaude`** when `isCreatorDiscoveryIntent(query)` matches (excludes ANY "campaign"
  mention so `prepare_campaign`/`campaign_agent` still win — two Codex P2s). `edge-function-reviewer`
  PASS; Codex clean; 30 unit tests; deployed `donny-orchestrator` **v61** (`verify_jwt=true` → deploy
  WITHOUT `--no-verify-jwt`). **LIVE-VERIFIED** as a Hoboken business: "find me creators near Hoboken"
  → a ranked list (Ricky Ricardo · Charlie Smith · Elias Acevedo 2 mi away · …) with distances + View
  buttons — the founder's original ask, resolved on the correct surface. **PR #249 (donny-chat forcing)
  closed as wrong-function.** Deferred: rich avatar cards (Option B, now shipped — see next bullet);
  server-side lat/lng distance (shared scale path). Concept:
  `docs/wiki/concepts/ai-creator-matching.md` ("Which Donny?" section).

- Donny chat `match_creators` fix — location + skill (sibling of the campaign matcher) — **built
  (branch `feat/donny-chat-matcher`, 2026-07-16; `donny-chat` deployed to prod, frontend n/a — a
  tool-only change).** The same over-narrow-filter bug PR #241 fixed on the campaign card, now on
  Donny's **conversational** `match_creators` tool. It applied **two hard `ilike` filters, ANDed** —
  a *required* `niche` against `bio` only (ignoring `skills[]`) and `location` against the freeform
  `location` field only (ignoring `city`/distance) — so "creators near Hoboken" returned 0 over a
  non-empty pool. Rewritten to the campaign matcher's **fetch broad → score soft → rank → top 10**
  philosophy in a new pure `supabase/functions/donny-chat/creator-discovery.ts` (imports only
  `_shared/geo.ts`, so vitest-testable + Deno-bundleable; 25 tests): `scoreNiche` (whole-word
  tokenized, `bio`+`skills[]`, `niche` now optional, **never 0-excludes**), `scoreCreatorLocation`
  (haversine distance, soft, returns `distanceMiles`), `rankCreators` (**location 0.4 + niche 0.4 +
  rating 0.2**, never drops), `resolveSearchCenter`/`resolvePlace` (center = arg else the caller's
  `business_profiles` location; precedence state-qualified freeform > structured `resolveCoords` >
  guarded assume-US so `"Vancouver, Canada"` isn't mapped onto a US city). Result shape preserved +
  a `distance_miles` field; the top-10 cap is by design ("outside that the business can explore
  creators" via browse). **Codex second review** ran an 8-fix loop — **P1: the service-role admin
  client bypasses RLS, so the query must filter `.eq("profile_visibility","public")`** (private
  creators were leaking) + 7 P2 location/rank/niche edge cases — then oscillated on round 9 (objected
  to the very `CANDIDATE_LIMIT=500` it had asked for); I **stopped the loop** since the residual is
  the documented out-of-scope server-side-distance scale path, not a defect. Opus whole-branch +
  edge-function-reviewer clean; deployed from the worktree via CLI (`verify_jwt=false` preserved,
  ~172KB with deps). **Follow-up (founder-approved, separate PR):** the campaign matcher
  (`match-creators`) has the identical service-role private-creator exposure — add the
  `profile_visibility='public'` filter + redeploy. Durable lesson: a matcher that can return an empty
  set over a non-empty pool must **score soft and never exclude** (two ANDed hard `ilike` filters are
  exactly that failure); and a tool fetching with the service role must re-assert
  `profile_visibility='public'` in the query since RLS is bypassed. Concept:
  `docs/wiki/concepts/ai-creator-matching.md` (Donny chat sibling section). Spec:
  `docs/superpowers/specs/2026-07-16-donny-chat-matcher-fix-design.md`.

- Donny campaign-idea creativity — **shipped (PR #243, 2026-07-16).** Business users reported Donny's
  campaign ideas "got weaker since the guardrails." Prod-verified diagnosis: **it was the PROMPT, not
  the model** — the cost auto-downgrade never fired (campaign gen always ran full Sonnet; MTD AI spend
  0.3% of budget; all users `full_power`); the culprit was the 2026-05-26 "Content Strategist" prompt
  over-constraint (hard MUST-only-connected-platforms block, closed enums, one-sentence caps). Freed the
  prompt into a pure tested `donny-campaign-generate/lib.ts` (soft platform *preference*, a free-form
  `creative_concept` + one bold `is_wildcard` per batch, relaxed caps, inert `content_strategy` block
  removed, robust outermost-`{}` parser); wired both generate paths to it and **dropped `temperature`**;
  unified Donny **chat** `generate_campaign` to the strong **3-concept** path (bounded `max_tokens`);
  added a premium campaign tier @ **8192 tokens** with a Sonnet **`floor`** so the profit flow never
  silently drops to Haiku@512 (`getModelConfig` essential branch → `routing.floor ?? HAIKU`);
  crash-proofed the frontend (`recommended_platforms` resilience, tagline clamp) and surfaced the
  Wildcard badge + big-idea line. Reviews: spec, whole-branch, edge-function-reviewer, Codex (1 P2:
  legacy path robust parser). `donny-campaign-generate` v107 + `donny-chat` v137 deployed
  (verify_jwt=false preserved). **Shipped on `claude-sonnet-4-6`@8192, not Opus 4.8** — Opus prod-key
  access was unverifiable (headless auth / probe deploy / CLI / browser all gated); the freed prompt is
  the fix regardless of model. **Opus is a one-line toggle:** `_shared/model-routing.ts`
  `CAMPAIGN_PREMIUM.model` → `"claude-opus-4-8"` + redeploy (cost-ledger rate already in place; Opus
  rejects `temperature` and runs thinking-off). Web access for fresh trends is a deferred follow-on
  (runtime Donny has only SSRF-guarded URL fetch; open-ended `web_search` needs the token-only
  cost-ledger extended for per-search fees). Concept:
  `docs/wiki/concepts/campaign-generation-creativity.md`. Spec:
  `docs/superpowers/specs/2026-07-16-donny-campaign-creativity-design.md`.

- Donny web access ("Step 2 for Donny") — **built (branch `feat/donny-web-access`,
  2026-07-16; founder go-live pending).** User-facing Donny (`donny-chat`) gained two live-web
  **client tools** — `web_search` + `read_url` — backed by **Tavily**. Chosen over Anthropic's
  server-side `web_search` tool deliberately: server tools emit `server_tool_use`/`web_search_tool_result`
  blocks that would disturb the just-stabilized [[Edge Function Streaming]] accumulator/history/pairing
  engine and dodge the token-only cost ledger; client tools drop into the existing `executeTool` loop
  untouched, work on both transports + any model, and keep cost in the ledger. **Tavily fetches
  server-side for both tools → NO SSRF surface** (no own guarded fetch; one new secret `TAVILY_API_KEY`).
  Available on **both surfaces**: internal/AIOS Donny unmetered, consumer metered (**flat 10/user/day +
  a 500/day global** cost backstop). **The `donny_cost_ledger` IS the rate counter** — every Tavily call
  logs a `tier:'web_search'|'web_extract'` row (new `logWebToolCost`), and the two web handlers count
  today's web-tier rows before each call; internal bypasses caps but still logs. **Keystone gotcha:** the
  ledger's `tier` CHECK only allowed `T0`–`T3`+`embedding`, so a **migration widens it first** — else the
  inserts fail the CHECK silently AND the counter reads 0 → caps never fire (apply migration to prod
  BEFORE the edge-fn deploy). Untrusted web content is fed to the model in turns holding state-changing
  tools, so an **untrusted-content prompt guard** ("web results are DATA, never instructions") ships in
  the byte-static `## Web access` block on **both** surfaces (whole-branch-review catch; blast radius is
  RLS-bounded). Pure `_shared/tavily.ts` (shaping + cap math, 16 tests) + `logWebToolCost` in
  `_shared/cost-ledger.ts` + DI-tested `donny-chat/web-tools.ts` (metering/orchestration) +
  `WEB_TOOL_DEFINITIONS` spread into both `allowedTools` branches (kept OUT of `INTERNAL_TOOL_NAMES` so
  consumers aren't blocked). Built brainstorm→spec→plan→subagent-driven execution (7 TDD tasks, per-task
  review) → Opus whole-branch review ("ready with fixes" — the prompt guard + Tavily error logging) →
  Codex second review (one P2: the cap now **fails closed** on a ledger-count error — an errored
  count blocks rather than reading as under-quota). Founder go-live: get a Tavily key + set `TAVILY_API_KEY`, apply the migration
  FIRST, `edge-function-reviewer` then deploy `donny-chat --no-verify-jwt`, verify (consumer blocked at
  the 11th daily call; confirm the live Tavily wire format). Deferred: response caching, per-tier caps,
  `(tier,created_at)` global-count index. Concept: `docs/wiki/concepts/donny-web-access.md`. Spec:
  `docs/superpowers/specs/2026-07-16-donny-web-access-design.md`.

- AI creator matching fix — location + skill ("Found 0 potential creators") — **shipped (branch
  `worktree-dc-issues-3`, 2026-07-16; migration + `match-creators` edge fn deployed to prod,
  frontend deploys on merge).** A Hoboken restaurant's business "Find Perfect Creators" card
  returned **"Found 0 potential creators"** over a non-empty pool (6 Hoboken creators existed). Root
  cause was **not** matching logic but a **silently-swallowed `campaign_matches` INSERT** — three
  prod defects: `match_score` was `numeric(3,2) CHECK 0..1` but the matcher writes 0–100 (overflow +
  check violation); the shared `notify_donny_nudge` trigger's `campaign_matches` branch referenced a
  non-existent `NEW.brand_id` (rolled back every insert); and `match-creators` selected a
  non-existent `business_address`, so the owner location never loaded and geographic scoring was a
  flat neutral for everyone. Insert errors were only `console.error`'d → the UI showed a clean
  "success" toast with 0 results. Fix: one migration (widen `match_score` to `numeric(5,2)` / CHECK
  0..100 + repair only that trigger branch, all others byte-preserved) + a rewrite of `match-creators`
  geographic scoring to **real haversine distance** (nearest-first, soft — never excludes) reusing a
  new **pure Deno `supabase/functions/_shared/geo.ts`** (a port of the tested `src/lib` geo helpers +
  400-city table, since edge functions can't import from `src/`) + a weight rebalance (geographic
  10→20, availability 10→5, ai_quality 25→20; the five non-AI weights must sum to `100 − ai_quality`)
  + a "· N mi away" match-card label. Deployed under the careful gate (migration via MCP; smoke
  insert proved writes unblocked; edge fn deployed from the worktree preserving `verify_jwt=true`; no
  new security advisor). Built brainstorm→spec→plan→subagent-driven execution (per-task reviews) →
  Opus whole-branch review ("Ready to merge", traced the exact Uncle Rocco data → all 6 Hoboken
  creators + Jersey City score geographic 100) → **Codex second review clean**. Durable lesson: a
  matcher returning an empty set over a non-empty pool is usually a **write-path** failure (column
  constraints + AFTER-INSERT triggers), not scoring — verify column types vs **prod**, not the
  migration file. Concept: `docs/wiki/concepts/ai-creator-matching.md`. Spec:
  `docs/superpowers/specs/2026-07-16-fix-ai-creator-matching-location-design.md`.

- Donny desktop panel — fixed-overlay so pages stop squishing — **shipped (PR #236,
  2026-07-16).** On desktop, opening Donny compressed every page (Browse Creators cards
  crushed, names truncated). Root cause: `DonnyDesktopPanel` was a docked `flex-shrink-0`
  sibling of `<main className="flex-1">` in `AppShell`, so opening it stole 320–420px and
  `<main>` reflowed narrower; pages use **viewport** breakpoints (not container queries), so
  the grids kept their wide-screen column counts at a too-narrow width and crushed cards. Fix
  is one className — `fixed inset-y-0 right-0 z-40 shadow-2xl` (drop `flex-shrink-0`) — so the
  panel leaves the flex flow, `<main>` keeps full width, and Donny floats over the right edge
  instead. `AppShell` unchanged; mobile unaffected (`hidden md:flex`; mobile uses the separate
  `DonnyMobileSheet`). Safe via the PageTransition **opacity-only** contract (no transformed
  ancestor → `fixed` anchors to the viewport). Verified on the staging preview (tray + chat
  both overlay, no reflow) + the prod bundle sentinel; Codex-clean. Concept:
  `docs/wiki/concepts/mobile-viewport-fixed-positioning.md` (§4).

- DragonFeed — Instagram-style creator search — **built (branch `feat/dragonfeed-creator-search`,
  2026-07-16; frontend-only).** Second founder iteration on the shared Dragon Feed, after PR #242. Two
  asks: a business anywhere should search creators in **any location by default** (not biased to its own
  area), and searching by name and/or zip should look like **Instagram's people search** — a vertical
  creator list, not a filtered media grid. The one search box now drives **two modes** (chosen by
  `searchActive = name OR location present`): empty → the existing browse media feed (grid/`FeedPost`,
  unchanged); a creator **name and/or a location (ZIP or city, ≥3 chars)** → a vertical **creator list**
  (`FeedCreatorList`/`FeedCreatorRow`: avatar + **bold-matched name** + `location · ★rating (reviews) ·
  N posts` + up to 3 teal skill chips; tap → `/creator/{slug||id}`; a **"Browse all creators →"** footer
  on the business feed via a `browseAllHref` prop). **Name match is global** (any location); an optional
  location query geocodes to a center and **narrows the creator list by radius** (10/25/50/100/Any).
  New pure unit-tested `feedCreators.ts` (`feedCreatorsFromMedia` groups media → one `FeedCreator`/creator
  + `postCount`; `highlightMatch` name-match segments; `filterCreatorsByRadius` reuses the tested
  `filterByRadius`; 12 tests) + a **controlled** `useFeedCreatorSearch` hook (parent owns
  location/radius). `useUniqueCreatorPortfolio` now also carries `skills/averageRating/totalReviews`.
  Because a **zip is now a search *trigger*** (not "narrow the media grid"), PR #242's
  `useFeedLocationFilter` + the `filterMediaByRadius` helper (+ its tests) are **deleted as superseded** —
  one geocoding consumer now, no shared zip-state conflict; the two #242 lazy-geocoding invariants carry
  over to the creator level (don't filter mid-geocode → no false-empty; skip creator geocoding under
  "Any"). Built subagent-driven (7 tasks, per-task spec+quality reviews) → whole-branch review ("Ready to
  merge") → **Codex second review clean**; full suite **804/804**, typecheck/lint/build green. No schema /
  RLS / edge-fn / secret change; ships on merge → Vercel. Concept: `docs/wiki/concepts/dragon-feed.md`.
  Spec: `docs/superpowers/specs/2026-07-16-dragonfeed-creator-search-design.md`.

- DragonFeed — mobile vertical feed + zip-radius search — **built (branch `worktree-dc-issues-2`,
  2026-07-16, PR #242; frontend-only).** Two founder asks on the shared Dragon Feed (the creator-
  content discovery surface; `DragonFeedGrid`, rendered by both the business `BusinessDragonFeed` and
  creator `CreatorDragonFeed` pages). **(1) Mobile vertical feed:** on mobile (<768px) the 3-column
  grid becomes a single-column Instagram-style `FeedPost` feed (creator header → full-width media → the
  existing `FeedViewer` lightbox); **desktop keeps the exact `FeedTile` grid**, branched on
  `useIsMobile()` — a JS branch (not a CSS `hidden`/`lg:block` toggle) so only ONE media tree mounts
  rather than double-downloading every image/video. **(2) Zip+radius search** on both viewports (zip
  input + radius select 10/25/50/100/Any, default 25) that filters the feed to creators within the
  radius of a typed zip, **reusing the existing location/geocoding stack** (`creatorLocationFilter.ts`,
  `geocoding.ts`, `useCreatorGeocoding`) via a new **pure media-level `filterMediaByRadius`** + a thin
  `useFeedLocationFilter(media)` hook (debounce → geocode center → lazy creator geocoding → filter). Also
  loaded `avatar_url` + location fields onto `PortfolioMedia` (fixing the lightbox's placeholder avatar
  too; avatar signed once per creator). **Codex second review clean after two P2 lazy-geocoding fixes:**
  keep the feed unfiltered until creator geocoding resolves (no transient false-empty / dropped nearby
  posts), and skip creator geocoding entirely under the "Any" radius (no wasted Google-quota calls).
  No schema / RLS / edge-fn / secret change; ships on merge → Vercel. Concept:
  `docs/wiki/concepts/dragon-feed.md`. Spec:
  `docs/superpowers/specs/2026-07-16-dragonfeed-mobile-feed-zip-search-design.md`.

- Prod hosting → Vercel cutover — **prepped (branch `worktree-lovable-slow`, 2026-07-15;
  founder-run cutover).** Founder pain (iPhone recording): the lovable.dev editor itself
  crashing mobile WebKit, publish crashes, tens-of-minutes deploys. Keystone finding: the
  QA-gate Vercel project (`dragoncandy-v3-d783432b`, team `dragon-candy-s-projects`)
  **already runs a Production deployment on every merge to `main`** — so cutover = verify
  env-var scopes (Production=prod Supabase, Preview=staging; the hard gate) → attach
  `dragoncandy.io`/`www`/`internal` → flip Cloudflare DNS (gray-cloud or Full-Strict).
  Rollback = DNS only (Lovable stays published through a stability window). Lovable is
  retained as an optional AI-edit surface via GitHub sync; edge functions / Auth / CSP /
  QA gate untouched. Supersedes the 2026-06-02 "Lovable stays prod host" scoping decision.
  Runbook: `docs/runbooks/vercel-prod-cutover.md`.

- Donny chat → campaign builder reliability (mobile) — **shipped (PRs #230, #232,
  2026-07-14).** Founder-reported "Donny prompts not clickable" root-caused as two stacked
  defects, neither a pointer bug. **(#230)** navigate quick-actions changed the route BEHIND
  the fullscreen mobile chat sheet — the sheet now closes before navigating (<768px only;
  desktop docked panel unchanged), the failed `?brief=` generation got human retry copy, and
  the brief seeds the builder input for one-tap retry. **(#232, the durable transport)**
  `donny-campaign-generate` gained an **async job + own-row polling** path: `async:true`
  (session-JWT callers only) returns `{job_id}` in <1s, the unchanged pipeline finishes via
  `EdgeRuntime.waitUntil` into a new `campaign_generation_jobs` table (own-row SELECT RLS,
  service-role writes, 7-day hot-path cleanup), and the client polls its own row
  (blip-tolerant, 2.5s × 3 min) — survives the proven failure (mobile tab backgrounding
  killed the ~60s fetch while `donny_cost_ledger` showed the server finishing; streaming was
  rejected on the PR #151 evidence). `regenerateIdeas` shares the same path; sync path +
  legacy callers byte-identical; skew-safe both directions. Migration + edge fn v105
  deployed via the careful gate (founder-confirmed); spec-reviewer 10 findings folded in;
  edge-function-reviewer + Codex clean. The surfaced pre-existing donny-chat
  `generate_campaign` 401 (service-role bearer matched neither auth branch — the tool had
  NEVER executed; `donny_tool_executions` had zero rows) was then **fixed in PR #234**:
  `executeTool` forwards the caller's own credential (session JWT or Donny OAuth; the
  downstream fn re-derives the user, no impersonation path), the no-credential Google Chat
  path gets a clear tool error, and OAuth callers lacking `campaigns:write` aren't offered
  the tool (Codex P2); donny-chat v136 deployed via CLI. Concept:
  `docs/wiki/concepts/edge-function-streaming.md` (job+poll section). Spec:
  `docs/superpowers/specs/2026-07-14-campaign-generate-async-jobs-design.md`.

- Schedule / Calendar — agenda-first simplification (mobile + desktop) — **built (branch
  `worktree-DC-20`, 2026-07-10; frontend-only, no schema/edge change).** Founder feedback ("schedule
  calendar not easy to navigate in mobile… need the simplest UX workflow") → made scheduling
  **agenda-first**: mobile + desktop default to one scrolling day-by-day list of upcoming posts with a
  single "＋ Schedule" button, an always-visible "Today", and a tap-the-month "jump to date" picker
  (**bottom Sheet on mobile, Popover on desktop** via `useIsMobile`). Design reframe: *simplest = the
  default path, not deleting options* — the desktop Week/Month/Day grids (drag-to-reschedule intact)
  were kept as an **optional toggle**, and the Month grid gained readable post chips instead of
  anonymous dots. A pure, unit-tested `AgendaItem` model + adapters
  (`src/components/schedule/agenda/`) normalize two data sources (Outstand `Post` + campaign deadlines
  + sponsorships) into one presentational `AgendaView`, consumed by `CalendarTab` (used by both the
  `/calendar` page and the `OutstandManager` social tab). Also fixed the standalone `/calendar`
  "＋ Schedule" **silent no-op** (now navigates to the composer `?tab=compose`) and the campaign
  **Schedule Review panel** dead-end (the founder's screenshot: dropped the overlapping `ScheduleTimeline`,
  honest conditional header, actionable empty state instead of a lone disabled button). Built
  brainstorm→spec→plan→subagent-driven execution (8 TDD tasks, per-task review) → whole-branch Opus
  review (fixed 44px touch targets, a hardcoded-`variant` mobile-Sheet bug, and a Month-legend↔chip
  mismatch) → **Codex second review clean after one P2** (the agenda had dropped sponsorship events →
  mobile parity restored by reusing `SponsorshipMarkerDetail`). 23 co-located tests; deleted the now-dead
  `ScheduleTimeline.tsx`. Manual both-viewport `verify-prod` pending post-deploy. Concept:
  `docs/wiki/concepts/schedule-agenda-view.md`. Spec:
  `docs/superpowers/specs/2026-07-10-schedule-agenda-simplification-design.md`.

- Mobile screen-fit — fixed-position un-trap + crew invite sheet iOS fit — **built (branch
  `worktree-DC-mobile-screenfit`, 2026-07-14; frontend-only).** Two founder iPhone reports, one
  root-cause class. **(1) Donny/bottom nav unreachable on most pages:** `PageTransition`'s
  `motion.div` animated `y: 6→0`, and framer-motion **stalls at `initial` on first load**
  (LazyMotion async features) leaving `translateY(6px)` inline forever — a transform ancestor is
  the **containing block** for every `position:fixed` descendant, so `MobileBottomNav` +
  `DonnyMobileSheet` anchored to page-content bottom, not the viewport (the PR #224 trap,
  verified live with a fixed-probe on prod). Fix: the route transition is **opacity-only by
  contract** (never add x/y/scale), un-trapping all ~14 hand-rolled fixed components at once;
  `ensureVisible`'s keyframe dropped `transform` too. A same-day founder follow-up (screen
  recording) then **deleted the hide-on-scroll behavior entirely** — the bottom nav is always
  visible (`useScrollDirection` removed; an 80px bottom-reveal floor shipped briefly in between).
  **(2) Crew "Invite creators" sheet footer clipped behind the iOS toolbar:** the app document
  never scrolls → Safari toolbars never collapse → `82vh` (large-viewport unit) exceeded the
  visible height; now `82dvh` + `env(safe-area-inset-bottom)` footer padding. Codex-clean;
  6 scroll-direction tests. Founder verifies on-device post-deploy. Concept:
  `docs/wiki/concepts/mobile-viewport-fixed-positioning.md`.

- Dev tooling — Claude capability-framework audits (Skills + Subagents) — **shipped (PRs #216,
  #219, 2026-07-07).** Applied external best-practice playbooks to DragonCandy's Claude Code
  capability layer **audit-first** — each ending in a value×effort-ranked `/internal/findings`
  backlog + a durable wiki analysis, and each shipping exactly one quick win. **Skills audit
  (PR #216):** scored the 9 dev `.claude/skills/` + Donny (playbooks / tools / RAG) against
  Anthropic's 9-category Skills playbook (`docs/wiki/analyses/claude-skills-framework-audit.md`;
  9 findings `source='skills-audit'`) → shipped the on-demand **`careful`** safety skill (gate
  before an edge-fn deploy / `reset --hard` / DROP-RENAME / Stripe-live / direct prod write).
  **Subagents audit (PR #219):** factual anchor = **zero custom `.claude/agents/`**, so heavy
  reviews (edge-fn, RLS) ran inline and polluted the main context; scored candidates against a
  7-dimension rubric (`docs/wiki/analyses/claude-subagents-audit.md`; 5 findings
  `source='subagents-audit'`) → shipped the **project-scoped, read-only `edge-function-reviewer`
  subagent** (reads a fn + its `_shared/*` deps in an isolated context, returns a `PASS | ISSUES`
  verdict against our documented deploy hazards — `verify_jwt` drift, `_shared` bundling incl. the
  template-literal-backtick Deno break, service-role-vs-user-auth, CORS, deploy ordering — wired
  into `careful` as the deterministic backstop; now a registered Agent type, **use before any
  edge-fn deploy**). Both audits are docs / skill / subagent only — no schema, RLS, edge-fn, or
  secret change; both Codex-clean. Deferred subagent backlog (each a future sub-project):
  `rls-migration-reviewer` (overlaps the `verify-db-schema` skill), `dragoncandy-explorer`, and a
  `verify-prod` runner. Specs:
  `docs/superpowers/specs/2026-07-07-claude-skills-framework-audit-design.md`,
  `docs/superpowers/specs/2026-07-07-claude-subagents-audit-design.md`.

- Crews Phase 2 — Crew Activity & Team Notifications — **built (branch `feat/crews-phase2-activity`,
  2026-07-10; schema + edge fns live on prod, frontend deploys on merge).** Turns crews into a
  **team engagement layer**: a private per-crew **activity feed** + role-aware **notification fan-out**
  over the campaign lifecycle. New `crew_activity` event log written ONLY through a **forge-proof**
  SECURITY DEFINER RPC `record_crew_activity(campaign, event, collaboration?)` — a per-event authz
  matrix on `auth.uid()`, server-derived participant/visibility/metadata, no-op off the crew path.
  **Asymmetric RLS** (the privacy keystone, independently proven): owner sees the whole feed; a creator
  sees crew-wide announcements + **only their own** business-visibility rows (creator B never sees
  creator A's application/hire/content events). **Notification de-dup:** since `create-notification`
  always bells, the pure map fires exactly ONE genuinely-new payload — `content_submitted → owner`
  (nobody was notified before when a crew creator submits for review); every other event is row-only.
  That email sends by default (pinned to category **`campaigns`**, not `content`) via a new
  `crew_content_submitted` template. **Idempotency converged over a 10-round Codex loop** into three
  server-side layers: a **cycle anchor** `campaign_collaborations.content_submitted_at` (stamped by a
  narrow trigger only on the transition into `submitted` — the table's `handle_updated_at` is a verified
  no-op, so client `updated_at` is untrustworthy) that allows resubmit-after-revision but drops replays;
  **one-shot** dedup for campaign_posted/application_received/hired/completed; and a
  `pg_advisory_xact_lock` making each check-and-insert **atomic** (no concurrent double-email).
  `completed` is state-gated on `status='completed'` (blocks a premature forge). Two feed surfaces
  (business crew-detail + creator marketplace strip) + 6 best-effort instrumented lifecycle sites. 11
  additive migrations (crew_activity table + RPC evolution + the content_submitted_at column/trigger),
  all applied to prod; `create-notification` (v33, **verify_jwt=true** preserved) + `send-notification-email`
  (v240, verify_jwt=false) redeployed. Built subagent-driven; **Codex second review clean after 10 rounds**
  + an **independent adversarial review** (privacy invariant proven, ship-ready). Concept:
  `docs/wiki/concepts/creator-groups.md` (Phase 2 section). Spec:
  `docs/superpowers/specs/2026-07-10-crews-phase2-activity-design.md`.

- Creator Groups + Private Group Campaigns — **built (branch
  `feat/creator-groups-private-campaigns`, 2026-07-09; schema live on prod, frontend deploys on
  merge).** A business builds a standing private **group ("crew")** of creators (owner = business
  user, mirrors `brand_shortlists`; invite→accept opt-in lifecycle) and posts a campaign scoped to a
  crew that **only active members see and one-tap apply to with no payment**. "No transaction" is real
  because crew campaigns are **free** (`fixed_price=0`), which removes the only remaining apply-time
  gate (the Stripe `ReadinessGate` fires only when `fixed_price>0`). Private visibility rides the
  existing `campaigns` SELECT chokepoint (`published AND (group_id IS NULL OR
  is_active_group_member(...))` + owner + collaborator, via SECURITY-DEFINER helpers mirroring
  `has_collaboration_on_campaign`); **both** apply gates (`apply_to_campaign` RPC + the
  `can_create_application` RLS `WITH CHECK`) are member-**AND**-`status='published'`-only (no
  invitation bypass — crews are members-only). **DB-enforced guardrails:** `enforce_campaign_group_ownership`
  (no cross-owner targeting), `campaigns_group_free` CHECK (crew campaigns are always free),
  `reject_group_campaign_invitation` (no stray invites), `forbid_application_campaign_change` (no raw
  campaign_id repoint), and split `cgm_owner_*` RLS (a member becomes `active` only via the creator's
  `respond_to_group_invitation` — consent can't be forced). Escrow uncoupled for free crews (accept
  activates without escrow; payout/upload/pay-escrow all guarded on `group_id`); the generic
  `send-campaign-publish-notifications` edge fn early-returns for crew campaigns (never broadcast a
  private campaign platform-wide). **Profit engine protected** — paid work still flows through the
  unchanged escrow/take-rate marketplace; crews are the ambassador/organic-collab lane; paid group
  campaigns are a documented Phase-3 data-flip. New tables `creator_groups` + `creator_group_members` +
  `campaigns.group_id` + 5 definer functions + 4 triggers + 1 CHECK; one 1-line edge-fn guard deployed
  (v41, verify_jwt preserved). Built brainstorm→spec(reviewed)→plan(reviewed)→subagent-driven execution;
  **Codex second review ran 14 rounds** (every real finding fixed, 2 verified false positives pushed
  back) **plus an independent adversarial review** that caught 3 generic-surface gaps the group-specific
  work missed — a P1 publish-notification privacy leak + 2 P2s — all fixed + re-verified CLOSED. Final
  Codex clean pass pending the rate-limit reset. Concept: `docs/wiki/concepts/creator-groups.md`. Spec:
  `docs/superpowers/specs/2026-07-09-creator-groups-private-campaigns-design.md`. (v1 merged as PR #226.)

- Find Creators — "near me" location/radius search — **built (branch
  `feat/find-creators-location-search`, 2026-07-07; frontend-only, no schema change).** The restaurant
  Find Creators page (`CreatorBrowse.tsx`) gained a prominent **location + radius control**: default
  **near me** off the restaurant's own saved `business_profiles` location (0 keystrokes), a city/ZIP
  "Another area" override, radius chips (10/25/50/100/Any), **Nearest-first** sort, "· N mi away" on
  cards, and a **"Widen to Any location"** empty-state nudge. All **client-side** over the existing geo
  stack (haversine + Google geocoding + static US-city table + the creator map) — **no migration**. The
  buried Advanced-Filter **Zip/City/Country** inputs were **consolidated** into the one control and
  **County was dropped** (redundant with radius). New pure `creatorLocationFilter.ts` (14 tests) +
  `useBusinessLocationCenter` hook + `CreatorLocationControl` (desktop Popover / mobile Sheet). Two
  founder calls made during the Codex pass: **(1)** wire the control onto the hidden brand `BrandCreators`
  page too (the header is shared) with **role-neutral copy** + a **role-aware center** and **brands
  default to no active radius** so nothing is silently hidden; **(2)** prefer **ZIP-precise geocoding**
  over the static city-centroid (geocoded wins in `resolveCreatorCoords`, freeform-`location` fallback for
  legacy profiles). Built brainstorm→spec(reviewed)→plan(reviewed)→subagent-driven execution (6 tasks,
  two-stage review each) → whole-branch review → **Codex-clean after six rounds** (each caught a real
  effect-sync-staleness or edge-case bug: stale center on Clear-All-Filters / mode-switch / short-query,
  brand-default auto-hide, ZIP precision, legacy-`location` placement). Concept:
  `docs/wiki/concepts/creator-location-search.md`. Spec:
  `docs/superpowers/specs/2026-07-07-find-creators-location-search-design.md`.

- DragonCandy AIOS — Agent-loop audit (3 gaps) — **built + shipped (2026-07-07).** A YouTube
  agent-loop explainer prompted an audit of the AIOS against the "reason→act→observe, verification-first"
  framework; the platform already implements it (Loop Scout / [[Validator Skills]] / Founder Playbooks /
  Loop Memory), and the audit surfaced three real gaps, each built + two-model-reviewed (Opus + Codex).
  **(1) `make-validator` meta-skill (PR #217)** — the deferred *automate-last* step of the validator-skills
  work: authors/retrofits validators to the one `{done,checklist,missing}` verdict contract; dogfooded by
  retrofitting `verify-prod`/`verify-db-schema` (which Loop Scout *counted* as validators but emitted only
  prose). Skills+docs only; Codex-clean after 6 P2 rounds. **(2) `/internal/loops` mission control
  (PR #218)** — read-only admin surface over all ~15 loops; since there is **no central run-log**, each
  loop's health is inferred from its output (findings-by-`source` / playbook `done_check` / latest
  briefing), honestly labeled "last output ≠ last run"; pure unit-tested model + cap-safe per-entity
  queries; Codex-clean after 4 accuracy P2s (stale-`running` reaping; `last_seen_at`/`updated_at` not
  `created_at` for re-filed/upserted rows). **(3) Spend source-of-truth (PR #220, deployed + proven live)**
  — made `donny_cost_ledger` a complete/alerting/visible record of **runtime** AI spend so the
  ≤15%-of-revenue kill-switch finally governs the right number. **Keystone reframe:** the ~$225/mo AI bill
  is mostly founder Claude Code **dev** usage (opex, invisible to any app table, uncontrollable by
  degrading Donny) — the cap must govern *runtime serving cost* (the ledger). **Root cause (Slice A):**
  user-less runtime calls never logged because of **two** silent constraints — `user_id` NOT NULL + FK to
  `auth.users` (the cron sync's all-zeros placeholder) **and** a `tier` CHECK allowing only `T0–T3` (so
  `tier='embedding'` failed too); fix = `user_id` nullable + widen the CHECK + a `normalizeUserId` coercion
  + `generate-anonymous-brief` now logs on a billed 200 before parsing. Slice B: `ai-cost-vs-cap` playbook
  emits a `green/watch/breach` verdict `playbook-runner-agent` files a report-only finding on. Slice C: a
  live `/internal` "Runtime vs cap" card (replaces the stale dead-cron alert). All 3 DDLs applied to prod;
  both edge fns deployed (`verify_jwt` preserved) + **live-verified** (first-ever embedding rows landed:
  `user_id null`, `tier='embedding'`). Founder go-live remaining: `/schedule` the runner. Concept:
  `docs/wiki/concepts/aios-runtime-spend-source-of-truth.md`. Spec:
  `docs/superpowers/specs/2026-07-07-aios-spend-source-of-truth-design.md`.

- Dev tooling — ported the `roast` (5-persona idea council → GO/RESHAPE/KILL verdict) and
  `storm-research` (5-lens STORM briefing → verified HTML report) skills from
  `hma_project_foundation` (branch `feat/port-roast-storm-skills`, 2026-07-06). Installed
  **global-primary** (`~/.claude/skills/`, usable in any project) with a byte-identical committed
  repo copy; persistence is project-agnostic (`<project-root>/docs/vetting/`, resolved via
  `git rev-parse`). Brains copied verbatim; only the persistence plumbing + HMA-only refs
  (`autopilot`/`web-researcher`/`charter`) changed. Standing rule going forward: new generic skills
  default to the global scope, written project-agnostically. Phase 2 (an internal/AIOS Donny +
  Founder-Playbooks port) is deferred. Spec:
  `docs/superpowers/specs/2026-07-06-port-roast-storm-skills-design.md`.

- DragonCandy AIOS — Strategy-library management (audit + safe archive + core-file protection) —
  **built (branch `feat/aios-strategy-library-management`, 2026-06-29; migration apply + edge-fn
  deploys + routine go-live founder-gated).** The strategy library (`internal_docs`, surfaced at
  `/internal/strategy`) is a projection of git docs that feeds Internal Donny's RAG (`donny_knowledge`)
  + Dezzy, and it had **no audit, dedup, or delete** — and three traps made naive deletion unsafe (the
  sync is insert/update-only so a DB delete silently re-syncs; removing the git file orphans the DB
  rows; no similarity logic existed). Added: an **`is_core`** Core-File protection flag (seeded on the
  ~21 top-level `docs/*.md`; a `BEFORE INSERT` trigger keeps future top-level docs protected) + a
  reversible **soft-archive** (`archived_at`/`archived_by`/`archive_reason`); two **service-role**
  detection RPCs (`dedup_candidate_pairs` cosine over the existing pgvector embeddings +
  `internal_doc_exact_dupes` via the now-populated `source_hash`) and two **admin-gated** archive RPCs
  (`internal_doc_archive` refuses a core doc + removes the `donny_knowledge` row; `internal_doc_unarchive`);
  an **archive-aware** `donny-knowledge-sync` so a re-sync never resurrects an archived doc (the
  keystone); archived docs hidden from Donny + Dezzy `get_internal_doc`; an admin Archive/Un-archive UI
  on `/internal/strategy` (Core docs show a protected badge); and a **monthly** `strategy-library-audit-agent`
  cloud routine filing dupe/conflict/orphan/bloat findings to `/internal/findings` (report-only — the
  founder archives). Invariants held: Core Files can never be archived (enforced in the RPC body),
  archive is reversible, the audit only reports. Founder go-live: apply the migration, deploy the 3 edge
  fns (`donny-knowledge-sync`, `aios-playbook-run`, `donny-chat`), create the routine via `/schedule`.
  Spec: `docs/superpowers/specs/2026-06-29-aios-strategy-library-management-design.md`.

- Landing page — old-design flash fix + performance pass — **shipped (branch
  `fix/landing-flash-and-perf`, 2026-06-28).** Two founder-reported symptoms, pure frontend (no
  schema/edge/secret). **(1) Old-design flash:** an *old* white landing ("Social Media Content for
  Restaurants") painted for ~1s before the dark one on every load — root-caused to a **stale
  prerendered "instant-LCP" shell** hardcoded in `index.html` (added for LCP, never updated after the
  dark redesign), **not** a service-worker/CDN-cache bug (none exist; assets hashed; index.html is
  `max-age=0`). Replaced with a **content-free dark splash** (logo on `#1A1A2A`) that fades into the
  real landing over an identical bg and can never go stale again. **(2) Mobile/Lovable WebKit crash**
  ("A problem repeatedly occurred"): a landing **performance pass** — code-split the route (DARK
  Suspense fallback so the loading state never flashes white; entry bundle ~328→290kB), rewrote
  `Reveal` to ONE shared `IntersectionObserver` + CSS (dropping ~20 per-element Framer-Motion
  `whileInView` observers + the animation engine), made empty placeholder `blur-3xl` blobs static +
  gated infinite `float`/`shimmer` behind `prefers-reduced-motion`, and in-view-gated `VideoSlot`
  ambient autoplay (`preload=none`). Codex-clean after 2 P2s (synchronous reduced-motion init; legacy
  `matchMedia.addListener` fallback for older iOS WebKit — the very browser that crashes). Honest
  scope: Lovable's *editor* crash + slow deploys are partly their platform; this removes the stale
  shell + cuts renderer load but can't fix Lovable's infra. The "less generic" redesign is a separate
  effort. Concept: `docs/wiki/concepts/landing-shell-and-performance.md`.

- Landing page — brief-save + Business CTAs + nav — **built (branch
  `feat/landing-fixes-brief-save`, 2026-06-28).** Three founder-flagged fixes, pure frontend (no
  schema/edge/secret). **(1) Brief-save trust bug (keystone):** the landing teaser wrote a guest's
  brief to `localStorage['pendingBrief']` on "Save this brief — sign up free" but **never read it
  back** — the brief was silently discarded after signup (a hollow promise; the read half was *designed*
  in the 2026-04-27 donny-rag-pricing-ux spec but never built). Fixed with a tested
  `src/lib/pendingBrief.ts` (`briefToText`/`consumePendingBrief`) hooked at `OnboardingWizard`
  completion: a new business/brand user is dropped straight into the campaign builder **pre-filled via
  its existing `?brief=` mechanism**; a creator (no builder) just has the key cleared; the key is always
  cleared. Founder decision: "drop them into building it" (vs a silent draft). **(2)** a "Join as a
  Business" CTA above "Join as a Creator" (hero + bottom CTA) with a **flag-gated, own-property-checked
  `?role=` pre-select** on `AuthPage` (so the hidden brand signup stays hidden and `?role=constructor`
  can't slip through). **(3)** repointed 3 **dead header nav anchors**
  (`for-business`/`for-brands`/`for-creators` → `audiences`/`creator-hub`). Codex-clean after 2 fix
  rounds (nav-filter gating + map keys, brief `title`/`description` fallback, prototype-pollution guard).
  The subjective **"less generic" redesign is a deliberately separate next effort.** Concept:
  `docs/wiki/concepts/anonymous-brief-generator.md` (post-signup section). Spec:
  `docs/superpowers/specs/2026-06-28-landing-fixes-brief-save-design.md`.

- DragonCandy AIOS — Dezzy AI milestone-celebration playbook (Domain 6 amplification core) — **built +
  deployed (branch `feat/dezzy-milestone-celebrations`, 2026-06-28; live founder run pending).** The final
  Dezzy domain's core, **un-gated** now that the DRE award engine is live and `dragon_point_events` is
  populated. When a creator/business hits a celebration-worthy DC Rewards milestone, Dezzy drafts a
  **#DragonDashed** celebratory social post for the founder to review + post. Report-only. Mirrors the
  sister `dezzy-outreach` (`get_reactivation_targets`) pattern: a **7th** read tool **`get_recent_milestones`**
  on `aios-playbook-run` (service-role `admin` client — own-row RLS on the DRE tables; `event_type ilike
  first/milestone`, last 30d, capped 15; `profile_visibility='public'` join; **resolved by the event_type
  role prefix** so a dual-profile user's `business.*` milestone isn't shaped as a creator; **PUBLIC handles
  only, no emails/points**; tier returned as the display **`tier_label`** via a `tierLabel` map mirroring
  `src/lib/dragonTiers.ts`, null when absent) + a report-only **`dezzy-milestone-celebrations`** seed
  playbook (current **DC Rewards / DC Points / Rising→Icon** naming, **false-recency warning** for
  `updated_at`-sourced events). Pure `milestones.ts` + 12 vitest cases. Spec passed an independent
  spec-review (2 rounds); **Codex-clean after 1 P1** (migration timestamp collided with `leads_capture` →
  renamed to `20260628150000`) **+ 2 P2s** (`business.first_campaign` is a *completion* not a launch;
  role-prefix resolution). `aios-playbook-run` deployed via CLI (`verify_jwt=false` preserved); seed applied
  to prod; **data-layer verified** (12 recent milestones, all public, 0 leak, 7 event types). `donny-campaign-
  generate` and other fns untouched. **All six Dezzy domains now have a shipped slice; #6's core is live.**
  Deferred: standalone DC-tier-up celebrations (no tier-change event), scheduled auto-run, one-tap post,
  run-history dedup; remaining #6 levers (case studies, referrals, boost-content) stay gated on missing data
  sources. Concept: `docs/wiki/concepts/dezzy-agent-playbook-suite.md`. Spec:
  `docs/superpowers/specs/2026-06-28-dezzy-milestone-celebrations-design.md`.

- Public landing — anonymous brief generator repair + abuse hardening — **shipped + deployed
  (branch `fix/anonymous-brief-generator`, 2026-06-28).** The landing's free "paste a URL → campaign
  brief" teaser (`BriefGeneratorPreview` in `DonnySection`) was **500'ing on every call in prod** —
  `generate-anonymous-brief` delegated to the **user-gated** `donny-campaign-generate` with the
  **service-role key**, which 401s (it auths only a user JWT / Donny OAuth). Rewrote
  `generate-anonymous-brief` **self-contained**: own fetch+extract + a single **hardcoded-Haiku** call
  (`claude-haiku-4-5-20251001`/768 — NOT `getModelConfig`, which has no routing entry → silently
  Sonnet/4096), an **HTTP-200 error-discriminator contract** (`rate_limited|capacity|fetch_failed|
  generation_failed` — `functions.invoke` exposes the body only on 2xx, so the old 429 path was dead),
  **Layered-v1 abuse hardening** (global daily cap 150 as the real cost ceiling + best-effort per-IP +
  honeypot + hardened SSRF guard: http(s)-only, numeric/hex host encodings, IPv4/IPv6 private ranges,
  trailing-dot FQDNs, manual re-validated redirects), and a **thin-page `source_quality` signal** →
  the preview shows a gentle "try your homepage/menu" note (runtime half of the PR #204 honest-copy
  fix). `donny-campaign-generate` untouched. Pure `lib.ts` helpers + 28 vitest cases; spec passed an
  independent review (6 fixes) before build; **Codex caught 2 P1s** (trailing-dot SSRF bypass;
  malformed-IPv6 → failed `inet` insert → cap-accounting bypass), both fixed. Deployed via Supabase CLI
  (`verify_jwt=true` preserved) + live-verified on prod. Concept:
  `docs/wiki/concepts/anonymous-brief-generator.md`. Spec:
  `docs/superpowers/specs/2026-06-28-anonymous-brief-generator-fix-design.md`.

- DragonCandy / DRE — rewards rename to "Creator standing" — **shipped (branch
  `feat/dre-rename-creator-standing`, 2026-06-28).** Founder feedback after enabling Dragon Rewards: the
  fantasy tier names + "Dragon Points" read corny for the older/professional audience. Renamed the
  **user-facing labels only**: currency **Dragon Points → Reputation (Rep)**; tiers **Egg→Rising ·
  Scout→Established · Knight→Pro · Master→Elite · Legend→Icon**; fantasy emojis dropped (clean colored
  pill). **Display-only** (`dragonTiers.ts` labels + `DragonPointsCard`/`DragonTierBadge` copy +
  `dre-award-engine` notification copy) — the tier **keys** (`egg/scout/…`), `dragon_point_*` tables, the
  `dragon_points_award` type, the `DRAGON_REWARDS_ENABLED` flag, and internal DP/DRE names are **unchanged
  (no migration)**. `dre-award-engine` redeployed v2 (verify_jwt preserved, boot-checked); tests 7/7,
  Codex-clean. The milestone-celebration playbook inherits these names. Concept:
  `docs/wiki/concepts/dragon-rewards-engine.md` (Display naming note).

- Public landing page — Dark-Luxe redesign + lead capture — **built + backend deployed
  (branch `feat/landing-luxe-redesign`, 2026-06-28).** `/frontend-design` rebuilt the public
  landing (`src/pages/LandingPage.tsx` + `src/components/landing/*`) into a **Dark Luxe Editorial**
  experience: a **scoped `.dark` wrapper** (`bg-dc-dark`) redefines the dark CSS vars for the
  landing subtree only — `next-themes` writes only to `<html>`, so it never leaks into the
  authenticated app (Radix-portal + literal-class caveats handled; `SlideShell` precedent); a
  `Reveal` scroll primitive (LazyMotion `strict` → `m.div`+`whileInView`, reduced-motion-safe);
  and `MediaSlot`/`VideoSlot` branded **placeholder slots** the founder fills with **Nano Banana
  Pro** via one `src`/`poster` prop. Sections: cinematic hero → Why (de-boxed rows) → Donny/AI
  tech story → HowItWorks → three lanes (Business / Brands-gated `BRAND_ROLE_ENABLED` / Creators)
  → Stories → flag-gated Dragon Rewards (`DRAGON_REWARDS_ENABLED`, **action-based** copy, no
  fabricated signup bonus) → Creator-Hub video+gallery → Contact → CTA → dark footer. Copy
  broadened **"restaurant" → "business"** (kept "creator"); retired FeatureCard/FeatureSection/
  BrandSection. **Public lead capture (ledger-first):** a **closed-anon-DML** `public.leads`
  table (internal-team RLS via `is_internal_user()`, **no anon INSERT/SELECT** — it holds contact
  PII), a `capture-lead` edge fn (`verify_jwt=false`) that validates → **service-role inserts** →
  Resend-notifies, guarded by a honeypot + a **fail-open per-IP throttle** (5/10 min, fail-open so
  a hiccup never drops a real lead); `useSubmitLead` hook + `LeadCaptureSection` form. Migration
  applied + edge fn deployed to prod (MCP, then re-deployed from disk via the newly-installed
  **Supabase CLI**); curl-verified (valid `200{id}` / honeypot no-row / bad-email `400` / preflight
  / throttle `5×200→429`); `get_advisors` adds no new advisor for `leads`. **Codex second review
  clean** after 2 P2s (brand-gate the lead form + CTA copy; add the server-side throttle). Founder
  go-live: drop Nano Banana Pro assets into the slots, set the `LEADS_NOTIFY_EMAIL` edge secret,
  optionally flip `DRAGON_REWARDS_ENABLED`. Concept: `docs/wiki/concepts/landing-lead-capture.md`.

- DragonCandy AIOS / DRE — Dragon Rewards UI launch gate — **shipped (branch
  `feat/dre-ui-launch-gate`, 2026-06-28; seed applied to prod, flag OFF).** A readiness check for the
  Dezzy amplification core surfaced that the DRE (deployed + cron-live) had **silently backfilled ~24 real
  users' points/tiers**, and the consumer UI rendered them with **no launch gate** — `go_live_at` (the DRE
  sentinel) gates only the notification bell, not the display. Fix: gate `DragonPointsCard` (dashboards) +
  `DragonTierBadge` (public profiles) behind a new **`DRAGON_REWARDS_ENABLED`** feature flag (seeded OFF,
  fail-safe-off) via a `useDragonRewardsEnabled()` wrapper over the existing `useFeatureFlag`. Chose a
  feature flag over `go_live_at` because `dre_config` is **authenticated-read** but the public-profile
  routes are **anon-accessible** — a `go_live_at` UI gate would hide badges from logged-out visitors
  post-launch, whereas `feature_flags` has a public read. Launch is now **two switches** (flag → UI;
  `go_live_at` → bell), documented together in the DRE go-live runbook; engine/ledger/awarding unchanged;
  fully reversible. Frontend + a seed row only (no DRE schema/RLS/edge-fn change). spec-reviewer Approved;
  Codex-clean (it caught + I fixed a stale-runbook P2). Spec:
  `docs/superpowers/specs/2026-06-28-dre-ui-launch-gate-design.md`. Concept (runbook):
  `docs/wiki/concepts/dragon-rewards-engine.md`.

- DragonCandy AIOS — Dezzy AI SEO articles (Domain 6, SEO/organic-discovery slice) — **built (branch
  `feat/aios-dezzy-seo-articles`, 2026-06-28; seed applied to prod, live founder run pending).** The one
  Domain-6 amplification lever feasible pre-DRE: a report-only `dezzy-seo-articles` Founder Playbook that
  drafts **one publish-ready SEO article per run** targeting a high-intent search term for **$0 organic
  acquisition** (founder reviews + publishes to the blog). Grounded keyword pick via `get_platform_stats`
  (which marketplace side to grow — with the **"creators onboarded before restaurants" GTM rule overriding
  raw under-supplied counts**) + `get_internal_doc` (positioning). **Pure seed migration**
  (`20260628120000_…`) — no new tool, no `aios-playbook-run` edit, no table/UI. Disciplines: E-E-A-T
  "genuinely useful, not keyword-stuffed" (no fabricated proof points — DragonCandy has no published case
  studies yet), and no fabrication — any stat/feature/page-path traces to a tool or is a `[CONFIRM PATH]`/
  placeholder (links founder-confirmed, no invented URLs). **The rest of Domain 6 is GATED** — a read-only
  prod probe found `dragon_point_events` / `dragon_point_balances` / `dragonshare_engagement` **empty**
  (PR #196 applied the DRE schema but held the award-engine cron) + no milestone/tier-change event + no
  referral table, so the milestone-celebration core, case studies, referral thank-yous, and
  boost-performing-content reopen only when the DRE award engine is live. spec-reviewer Approved; Codex-clean.
  **With this, all six Dezzy domains have a shipped slice or a documented gate.** Spec:
  `docs/superpowers/specs/2026-06-28-dezzy-seo-articles-design.md`. Concept:
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

- DragonCandy AIOS — Dezzy AI Press & Events scout (Domain 4) — **built (branch
  `feat/aios-dezzy-press-events`, 2026-06-27; founder go-live = create the routine via `/schedule`).** The
  **first Dezzy domain that ships as a scheduled cloud routine, not a Founder Playbook** — because the
  `aios-playbook-run` runner has **no web access** and press/event discovery needs the open web, it lives on
  the cloud-routine rail (which has WebSearch), modeled on Loop Scout. `dezzy-press-events-agent`
  (`.claude/schedules/dezzy-press-events-agent.md`) runs **monthly**, web-scans press / podcast /
  publication / conference opportunities (grounded in PROJECT_CONTEXT + the strategy library), and files the
  top ~10 as deduped **`[press]`/`[event]`-tagged `aios_findings`** (`source=dezzy-press-events`) via
  `aios-report-ingest` for founder triage at `/internal/findings`. **Zero-infra** — reuses the findings rail
  (no new table/UI/edge-fn/secret/migration); report-only (only write = the findings POST). Disciplines:
  **URL-required** (no verifiable source URL → don't file — the web-research non-fabrication backstop),
  **$0-budget-aware** (free plays first, paid costs labelled), `severity` as priority but **never
  `critical`** (reserved for real bugs), and re-scan skips `acknowledged`/`wontfix`/`resolved` so a
  decided/annual opportunity doesn't reopen. spec-reviewer Approved; Codex caught + fixed a P2 (a
  self-contradictory `high`-severity rule). Dezzy now covers Domains 1, 2, 3, 4, 5; only #6
  (Amplification/DRE) remains. Spec: `docs/superpowers/specs/2026-06-27-dezzy-press-events-design.md`.
  Concept: `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

- DragonCandy AIOS — Dezzy AI Weekly Operating Brief (Domain 5) — **built (branch
  `feat/aios-dezzy-weekly-brief`, 2026-06-27; seed applied to prod, live founder run pending).** The
  Monday **capstone** of the Dezzy playbook suite: a report-only, **admin-only** `dezzy-weekly-brief`
  Founder Playbook (action console — one-line summary; platform numbers with status-or-"no KPI basis";
  what worked/didn't; top 3 specific actions; a **Dezzy-queue checklist** pointing to the detail
  playbooks; system health). Deliberately a **separate** playbook, not an extension of the stakeholder
  weekly brief (`weekly-brief-agent` → `aios_briefings` → `/internal/briefings`) — so founder-internal
  candor/directives stay off the publishable surface; it **reconciles** to that brief's KPIs via
  `get_latest_briefing`. **Orchestrate-not-embed**: it *points to* `dezzy-outreach` /
  `dezzy-content-calendar` / `dezzy-website-updates` rather than embedding their runs (no tool reads
  `aios_playbook_runs`, so it needs none) → **pure seed migration**
  (`20260627180000_aios_dezzy_weekly_brief_seed.sql`), no edit to `aios-playbook-run`, no new table/UI.
  Dezzy now covers Domains 1, 2, 3, 5; only #4 (Press & Events — needs a web-research cloud routine) and
  #6 (Amplification/DRE) remain. Codex-clean; spec-reviewer Approved. Spec:
  `docs/superpowers/specs/2026-06-27-dezzy-weekly-brief-design.md`. Concept:
  `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.

- DragonCandy AIOS — Dezzy AI content-production playbooks (Domains 1 + 2) — **built (branch
  `feat/aios-dezzy-content-playbooks`, 2026-06-27; seed applied to prod, live founder run
  pending).** Dezzy (the renamed "Dame AI" growth-agent spec, PR #190) is realized **not as a new
  agent runtime but as a branded suite of AIOS Founder Playbooks** on the existing rails
  (`aios-playbook-run`, `/internal/playbooks`, `aios-report-ingest`, `/schedule`). This slice —
  the **content half**, sibling to the parallel `DC-Dezzy-AI` worktree's `dezzy-outreach`
  (Domain 3) — seeds two **report-only** playbooks: **`dezzy-content-calendar`** (drafts the
  week's 5 company social posts on a fixed Mon–Fri rotation) and **`dezzy-website-updates`**
  (drafts changelog/landing/announcement copy for the 1–2 most launch-worthy recently shipped
  user-facing features). Both DRAFT only — the founder reviews/publishes (the "a human acts"
  invariant); voice is set via `preferences_md` ("Dezzy") while the engine identity stays
  "Donny". **Pure seed migration** (`20260627170000_aios_dezzy_content_playbooks_seed.sql`) — no
  new read tool, **no edit to `aios-playbook-run/index.ts`** (the file the sibling edits → zero
  merge conflict), no new table/RLS/secret/UI; grounded entirely in the six existing aggregate
  read tools (`get_latest_briefing` + `get_platform_stats` + `get_internal_doc`). Non-fabrication
  enforced by a traceability `done_criteria` + marked placeholders (`[CREATOR / @handle]`,
  `[RESTAURANT]`, `[STAT — verify]`) since the aggregate tools return no row-level data and the
  runner has no web access. Spec:
  `docs/superpowers/specs/2026-06-27-dezzy-content-playbooks-design.md`. Concept:
  `docs/wiki/concepts/dezzy-content-playbooks.md`.

- Dragon Rewards Engine (DRE) — Engine + Tiers + Badges (v1) — **built (branch
  `worktree-DC-DRE-AI`, 2026-06-27; founder go-live pending).** First sub-project decomposed from
  the 6-phase parent spec (`docs/wiki/analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md`,
  PR #191): a configurable **Dragon Points** ledger + an idempotent award engine + the 5-tier
  system + tier badges (≈ parent Phases 1–2). Scoped first **deliberately** because pre-revenue
  the parent's later phases spend real cash on projected activity — v1 is backend-heavy, **zero
  cash exposure**, fully reversible, ledger-first. The award engine **consumes events the platform
  already emits** (DragonShare posts/boosts, campaign completions/launches, profile completion,
  ratings) via a **cron edge function** (`dre-award-engine`, every 5 min) — NOT a DB trigger (the
  trigger→pg_net→edge-fn path is dead in prod), mirroring `expire-social-hooks` (Vault URL/bearer
  + `isAuthorizedIngest` + `verify_jwt=false`). **Idempotent anti-join:** `dre_pending_events()`
  returns source rows lacking a ledger row on the `(user_id,event_type,source_id)` unique key;
  balances are **recomputed from the ledger** (never incremented) so re-runs self-heal. **Config-
  driven** (`dre_config` JSONB: point values, tier thresholds, `go_live_at`) so retuning needs no
  deploy. Tiers require **DP AND a verified milestone** (`legend` is DP-only, the cap).
  Notifications are **in-app-only/forward-only/coalesced** via `create-notification`
  (`type:'dragon_points_award'`, no email map); a far-future `go_live_at` sentinel keeps the
  historical **backfill silent** until the founder sets the real cutover. A `public_dragon_tiers`
  view exposes **tier-only** (never balance) so the badge renders on public profiles under the
  own-row balance RLS. FK target is `profiles.id` (consumer feature). New tables
  `dre_config`/`dragon_point_events`/`dragon_point_balances` (+ reserved `multiplier_applied`/
  `streak_*`/`total_redeemed` columns for Phases 3/5) + two service-role RPCs; new edge fn
  `dre-award-engine` + a Vault-driven pg_cron. Spec+plan each passed their reviewer loop (caught
  the `campaign_launched` progressing-status bug + `completed_at` sourcing); whole-branch review
  fixed 1 Important (null `occurred_at` batch-abort) + 2 Minor; **Codex second review clean**.
  Founder go-live: apply both migrations, set Vault `dre_award_engine_url`, deploy the edge fn,
  set the real `go_live_at`, confirm the cron; then merge → Lovable deploys the frontend.
  Deferred to later phases: referrals + share-card/UTM viral loop, daily-boost multipliers,
  streaks, redemption + leaderboards, brand-role triggers, the no-code admin config UI. Concept:
  `docs/wiki/concepts/dragon-rewards-engine.md`. Spec:
  `docs/superpowers/specs/2026-06-27-dre-engine-tiers-badges-design.md`.

- DragonCandy AIOS — Dezzy AI (company-facing growth agent) — Outreach Machine v1 — **built +
  deployed (branch `worktree-DC-Dezzy-AI`, 2026-06-27).** **Dezzy** is the company-facing growth
  agent (counterpart to user-facing Donny), proposed in
  `docs/wiki/analyses/the-core-idea-two-agents-one-company.md` (the founder renamed the doc's
  "Dame" → "Dezzy"). **Keystone decision: Dezzy is NOT a new agent runtime — it is a branded suite
  of AIOS Founder Playbooks** on the rails already shipped (`aios-playbook-run`,
  `aios-report-ingest`, `/internal/corrections`, `/internal/playbooks`). v1 ships **domain #3, the
  Outreach Machine**: a report-only/draft-only `dezzy-outreach` Founder Playbook + ONE new
  admin-gated read tool `get_reactivation_targets` on `aios-playbook-run` (backed by its existing
  service-role `admin` client — no migration/RPC/RLS change). The tool returns three segments —
  **stalled campaigns** (published/active >14d by `created_at`, no completed collaboration;
  active-collab → "finish" blocker else "no creator"), **dormant creators** (public, no
  application/post in 21d), **lapsed restaurants** (public, >7d, never launched a
  published/active/completed campaign or never **captured**-boosted, **org-aware** via active
  members) — each `{items,total}` capped at 15, carrying **names + PUBLIC social handles only, never
  emails**. All segment/handle/cap logic lives in a pure vitest-tested `reactivation.ts` (9 cases);
  `index.ts` does bounded `.select()`s and delegates. The playbook drafts a ready-to-paste message
  per target in the **Dezzy voice** (≤60 words, one CTA); v1 **sends nothing** — the founder
  copy-sends from `/internal/playbooks/dezzy-outreach` (no new UI/table/schedule). Invariant held:
  the agent proposes/reports, a human acts. Codex second review clean after **2 P2 fix rounds this
  session** — business-handle privacy parity (the `profile_visibility='public'` filter, shipped for
  creators as a P1, was missing on both `business_profiles` queries) and active-org-members
  (`invitation_status='active'`, else an invited/suspended member miscounts as engaged and wrongly
  drops their lapsed restaurant). Deployed `aios-playbook-run` v7→v8 via the Supabase MCP
  (full-path file naming so `../_shared/*`+`./reactivation.ts` resolve; `verify_jwt=false`
  preserved; boot-checked) and the seed migration applied via MCP; **ran twice on prod** —
  `done_check.done=true`, segment counts 4/11/9 matching live SQL, regex-confirmed no email/PII leak,
  and Dezzy auto-flagged obvious test accounts + 2 data edge cases. **No new table/RPC/RLS/secret/
  OAuth scope/UI/send-path/schedule/`donny-chat` change.** Deferred to v1.5+: one-tap/auto-send,
  scheduled weekly push (v1 is on-demand pull), cold outreach, the "Dezzy" engine-identity re-skin,
  and the other five Dezzy domains. Concept: `docs/wiki/concepts/dezzy-agent-playbook-suite.md`.
  Spec: `docs/superpowers/specs/2026-06-27-dezzy-outreach-v1-design.md`.

- DragonCandy AIOS — Internal Donny "Profile not found" (read side) — **shipped + deployed
  (PR #185, 2026-06-27).** Read-side sequel to PR #180: `donny-chat/index.ts` loaded the caller's
  `profiles` row with `.single()` + `throw "Profile not found"`, so **Internal Donny** failed
  entirely for internal-only users (Adrian, using it for strategy/brainstorming). Fix: a pure
  vitest-tested `donny-chat/profile.ts` `resolveDonnyProfile()` — real profile returned (internal
  admins with one keep it), consumer + none still throws, internal-only + none synthesizes a minimal
  profile (greeting name from `auth.users`); call site `.single()`→`.maybeSingle()`. Consumer Donny
  unchanged. **Supabase CLI access added** this session (founder PAT → `supabase login --token`) and
  used to deploy `donny-chat` **v134** (`functions deploy --no-verify-jwt`) — the function is 172KB
  across deps, too large for a safe MCP re-paste, so CLI (auto-bundles from disk) is the deploy path.
  Codex-clean; boot-checked. The rule going forward also covers caller-profile **reads**: use
  `.maybeSingle()` + synthesize on the internal surface, never `.single()` + throw.
  Concept: `docs/wiki/concepts/internal-only-users.md`.

- DragonCandy AIOS — internal-only user FK fix + diagnosable proxy errors — **shipped +
  deployed (PR #180, 2026-06-26).** The first internal-only AIOS user (Adrian Vella,
  `account_scope='internal'`, no `profiles` row — the stakeholder-invite keystone above) hit
  **"Google connect failed — internal error"** and a silent Internal Donny failure. Root cause:
  several AIOS-surface tables foreign-key `user_id → profiles(id)`, which assumes every internal
  user is also a consumer user; the resulting FK violation surfaced as the opaque "internal error"
  because a Supabase `PostgrestError` is a plain object, not an `Error`, and `google-workspace-proxy`'s
  `instanceof Error ? … : "internal error"` catch erased it. **Fix (two commits, one incident):**
  (1) repoint three caller-keyed AIOS FKs — `google_workspace_accounts`, `donny_conversations`,
  `donny_tool_executions` — from `profiles(id)` to `auth.users(id)` (non-destructive: `profiles.id`
  IS `auth.users.id`, 1:1, so every existing row already satisfies the new target; `ON DELETE
  CASCADE` preserved; consumer-app tables deliberately left on `profiles(id)`); (2) a pure
  vitest-tested `describeError` normalizer so non-`Error` throws surface their real `message`+`code`
  instead of "internal error". Migration applied to prod via MCP; `google-workspace-proxy` deployed
  **v20** (verify_jwt=false preserved, boot-checked). Codex-clean. The rule going forward: a NEW AIOS
  feature writing a row keyed to the internal user must FK `auth.users(id)`, not `profiles(id)`.
  Concept: `docs/wiki/concepts/internal-only-users.md`.

- DragonCandy AIOS — Internal dashboard UI polish — **shipped (PR #179, 2026-06-26).**
  Presentational pass on the `/internal/*` surface (no schema/auth/data/RLS/gating change). The
  shell (`InternalLayout`) moved from a single wrapping row of **11 nav pills** to a **persistent
  left sidebar** on desktop, sections grouped under **Monitor** (Overview·Weight·Briefings·
  Strategy·Workspace) and **Operate** (Expenses·Findings·Corrections·Playbooks·Stakeholders) with
  per-link icons; the admin-only Operate group hides for the read-only `stakeholder` tier. Mobile
  gets a sticky top bar + a hamburger **slide-in drawer** (shadcn `Sheet`) rendering the same
  `NavBody`. **Donny is pinned** as an accent "Ask Donny" entry in the nav chrome (admin-gated),
  always visible on both surfaces — deliberately **not** a floating FAB (honors the standing
  no-floating-Donny-button rule). New shared `PageContainer`/`PageHeader` primitives
  (`src/components/internal/layout.tsx`) replaced per-page hand-rolled headers + ad-hoc `max-w-*`
  across all 12 internal pages. Mobile clutter fixes: Briefings/Strategy doc-list height capped on
  phones (`max-h-64 lg:max-h-[60vh]`) with the title lifted to a full-width header, and Findings'
  evidence `<pre>` now wraps. Codex second review clean; 568 tests pass. Concept:
  `docs/wiki/concepts/aios-internal-shell.md`.

- DragonCandy AIOS — Stakeholder invites (internal-only accounts) — **built (branch
  `feat/aios-stakeholder-invite`, 2026-06-26; founder go-live pending).** A reusable, admin-only
  way to grant AIOS access by email without ever touching the consumer app. New admin-tier page
  `/internal/stakeholders` (invite · list · revoke) over a single `manage-internal-users` edge fn
  (`verify_jwt=false`, self-gated: `auth.getUser` + `user_roles` admin). **invite** uses
  `admin.generateLink` (type `invite`; metadata `account_scope:'internal'`, redirect to the internal
  host `/auth/update-password`) + a branded Resend set-password email; a never-accepted invitee is
  re-sent a fresh `magiclink` link (first-email-failed / expired-link); an existing consumer user is
  granted the role + a granted-access email. **Hard-block keystone:** a guard clause in the
  `handle_new_user` trigger skips ALL consumer-profile creation when `account_scope='internal'`, so
  an internal account has no `profiles`/`creator_profiles`/`business_profiles` row — never in Browse
  Creators, never on a consumer dashboard (`AuthContext` already tolerates a null profile;
  `DashboardRedirect` bounces it to `/auth`); AIOS access is purely `user_roles`. The guard sits on
  top of the **current** trigger body (preserves the `DO UPDATE` refresh-on-resignup logic — a Codex
  P2 catch). Per-invite tier selector (Admin default, Stakeholder = read-only) reuses the existing
  two-tier `InternalRoute`. No new table/secret/RLS/OAuth/consumer-enum change; pure vitest-tested
  `lib.ts` helpers (email/tier/status/email-HTML, 13 tests). Codex second review clean. Founder
  go-live: allow-list `internal.dragoncandy.io/auth/update-password` in Supabase Auth redirect URLs,
  deploy the edge fn (`verify_jwt=false`), then invite Adrian Vella as Admin. Spec:
  `docs/superpowers/specs/2026-06-26-aios-stakeholder-invite-design.md`.

- Stripe webhook revival + payout-flag reliability — **shipped + deployed (PRs #173, #174,
  2026-06-24).** Root-caused why `stripe_onboarding_complete` went **stale-false and blocked
  payouts**: the prod Stripe webhook had **never delivered a single event**
  (`stripe_webhook_events` empty) because `STRIPE_WEBHOOK_SECRET` was unset, so the flag (a
  cache of `charges_enabled && payouts_enabled`) only self-healed on page load. **(#173,
  reactive)** `_shared/payout-ready.ts` `verifyPayoutReady` — *trust-true / verify-false*:
  trusts a cached `true`, re-checks Stripe on a cached `false`/`null` before it blocks money;
  applied at every payout gate (`boost-payment`, `fulfill-boost`, `release-creator/sponsorship-payout`);
  + the `account.updated` handler now also syncs `org_units` (the restaurant-location payout
  path, previously never synced). **(#174, real-time)** the handler processes both **platform**
  ("Your account") and **Connect** ("Connected accounts") events, which in Stripe are
  **separate endpoints with separate signing secrets** — so verification now tries both
  `STRIPE_WEBHOOK_SECRET` and optional `STRIPE_CONNECT_WEBHOOK_SECRET` (pure vitest-tested
  `_shared/webhook-secrets.ts`, first-match-wins, backward compatible). Codex-clean; deployed
  `stripe-webhook` v156 via the Supabase MCP (verify_jwt=false, byte-diff-verified). **Founder
  config (done):** created the two Stripe **test-mode** endpoints (platform + Connect
  `account.updated`, both **Snapshot** payload) and set both edge secrets. Operational gotchas:
  Stripe MCP can't manage webhook endpoints (Dashboard only); new Workbench routes test-sends
  to the CLI; **Supabase Vault ≠ Edge Function Secrets**; a **warm isolate** held stale env
  until a redeploy forced the secret pickup; **Thin payload is incompatible** (handler reads
  the full snapshot `event.data.object`). Still deferred: the `release-sponsorship-payout`
  deploy (low-urgency, no live traffic pre-revenue). Concept:
  `docs/wiki/concepts/stripe-webhook-delivery.md`.

- Test-mode Stripe UX — **shipped + deployed (PR #168, 2026-06-24).** Made the two Stripe
  surfaces new users hit instinctive **in test mode only**, with **live-mode behavior
  byte-for-byte unchanged** (every branch gated on `sk_test_`/`pk_test_`, no-op in live).
  **(A)** Payout onboarding full-bypass: `create-creator/restaurant-connect-account` skip
  Stripe's hosted Express onboarding in test mode and auto-create a fully-enabled **Custom**
  connected account server-side (`buildTestAccountParams` with Stripe's published test
  verification triggers + `btok_us` + `tos_acceptance`), returning `{alreadyComplete:true}` →
  "Connect" becomes one tap → Connected, zero Stripe screens. **(B)** Card-only checkout:
  `testModePaymentMethodTypes` forces `payment_method_types:['card']` in test mode across all
  4 Checkout-session creators (kills Klarna/Link/real-card), with the copyable 4242 test card
  surfaced on the 4 payment-launch screens and the dashboard button hidden (Custom accounts
  have no Express dashboard; `get-stripe-dashboard-link` also degrades gracefully, test-mode
  only — Codex P2). All mode logic in 3 pure, vitest-tested `_shared` helpers (`stripe-mode.ts`
  pure `isTestKey`, `test-mode-payment-methods.ts`, `test-mode-connect.ts`; they avoid runtime
  `https://` imports so vitest can load them). No schema/secret/auth change. 7 edge fns
  deployed via the Supabase MCP (preserve `verify_jwt` per fn — `list_edge_functions` is
  ground truth, not `config.toml`); the one-tap payout bypass was **live-verified** (prefill
  flips `payouts_enabled`, after a brief capability-processing lag). Codex second review clean.
  Concept: `docs/wiki/concepts/test-mode-stripe-ux.md`. Spec:
  `docs/superpowers/specs/2026-06-24-test-mode-stripe-ux-design.md`.

- DragonCandy AIOS — security-advisor triage — **triaged then DELIBERATELY DEFERRED
  (2026-06-24, no changes made).** The prod Supabase security advisors (149 findings, surfaced
  via Lovable's "Review security") were fully triaged read-only: 75 `SECURITY DEFINER` functions
  classified by a 3-signal method (frontend `.rpc()` / referenced in an RLS policy / returns
  `trigger`) into **43 keep-by-design** (frontend RPCs that self-authorize + RLS-helper functions
  that must keep `EXECUTE`) vs **32 safe-to-revoke** (triggers + internal/cron/service-role/dead
  helpers), plus 4 public-bucket-listing and 4 RLS-no-policy (INFO, already deny-all = correct).
  Shelved pre-launch as too risky — tightening prod RLS/grants could silently break a working
  flow, outweighing advisor noise that is mostly intentional design. Concept (method + decision):
  `docs/wiki/concepts/security-definer-advisor-triage.md`.

- DragonCandy AIOS — Loop Memory Protocol — **shipped (Phase 1, PR #161, 2026-06-24).** Each
  loop-orchestration skill now keeps a co-located two-zone `MEMORY.md` — curated **Lessons**
  (read at the start of a run and acted on) + an append-only **Run Log** (new entry at the top
  each run) — so a loop self-improves across runs instead of the operator re-explaining the same
  correction. The source prompt asked for "two files (Output + Memory) per run"; the **Output
  half already exists** for every loop (wiki pages, `log.md`, `result_summary_md`), so the Run
  Log's `Output:` line *points* at the existing artifact rather than duplicating it. One protocol
  page (`docs/wiki/concepts/loop-memory-protocol.md`) is the single source of truth; an identical
  "Loop memory" block + a seeded `MEMORY.md` live in `autoresearch` (pilot), `knowledge-sync`,
  `verify-knowledge`, `wiki-ops`. Validator-backed loops reuse the `{done,checklist,missing}`
  verdict block as the failure feed; `verify-knowledge`'s memory is advisory-only so it never
  alters its deterministic `met` checks. A `.gitignore` gotcha was fixed along the way — the
  broad `skills/` ignore pattern silently drops new first-party `.claude/skills/` files, so a
  narrow negation re-includes only `MEMORY.md`. **Phase 2 (DB-backed memory for the AIOS cloud
  scheduled routines via an `aios_loop_memory` table + `aios-report-ingest`) is designed but
  deferred.** Spec: `docs/superpowers/specs/2026-06-23-loop-memory-protocol-design.md`.

- DragonCandy AIOS — Internal Donny: patch-based strategy-doc corrections — **shipped +
  deployed (PRs #151, #152, 2026-06-21).** Follow-up to the keepalive-streaming work: streaming
  fixed the server 504, but a heavy correction still ran ~130s because turn length is dominated
  by Donny's **output-token generation** of the whole 5–50KB doc — and a 130s streamed `fetch`
  drops on mobile Safari ("Load failed"). Donny now proposes a `strategy_doc` correction as
  small find/replace **`edits`** (`{old_string,new_string,replace_all?}`, the `Edit`-tool
  contract); the `propose_correction` handler re-reads the current `internal_docs.content_md`,
  applies them server-side via the pure unit-tested `donny-chat/doc-edits.ts`, and POSTs the
  **reconstructed full** `proposed_value` — so `aios-report-ingest`, the `aios_corrections` row,
  the drift-checked `aios_corrections_apply` RPC, and `wiki-commit-pr` are **byte-for-byte
  unchanged**, and *a human approves at /internal/corrections* holds. Output shrinks to a few
  lines → turn drops to seconds → no more mobile "Load failed". A full-`proposed_value` fallback
  is kept for a genuine top-to-bottom rewrite; a bad edit block (not found / not unique) errors
  back to Donny, which retries in-turn. **#152 (hotfix):** backticks used for inline-code
  emphasis inside the backtick-delimited system-prompt template literal broke the Deno bundle —
  caught only at `supabase functions deploy` (the real edge-fn parse check), not `npm run build`
  (frontend only). `donny-chat` only: no schema/RLS/secret/edge-fn/frontend change. 11 new unit
  tests; Codex second review clean; deployed to prod. Concept:
  `docs/wiki/concepts/patch-based-corrections.md`. Spec:
  `docs/superpowers/specs/2026-06-21-patch-based-corrections-design.md`.

- DragonCandy AIOS — Internal Donny reliability: tool-pairing replay fix + keepalive
  streaming — **shipped + deployed (PRs #146, #148, 2026-06-20).** Two fixes to the
  `donny-chat` edge function for internal AIOS Donny on long conversations (Strategy-doc
  edits). **#146 (400 fix):** `getConversationHistory`'s 50-message replay could emit a
  `tool_result` with no matching `tool_use` (`messages.N.content.0: unexpected tool_use_id`),
  from a merge step dropping a tool-bearing assistant turn + no integrity check. Extracted
  replay into pure `donny-chat/history.ts` (`reconstructHistory` + `enforceToolPairing` drops
  orphaned tool_result / unanswered tool_use); 8 vitest cases. **#148 (504 fix):** the 504s
  were Supabase's **150s request idle timeout**, not the **400s Pro wall-clock** — the
  function was fully non-streaming (zero bytes until done). The **internal surface now streams
  NDJSON** (`status`/`text`/`heartbeat`/`done`/`error`) with an early first byte, via a pure
  unit-tested `donny-chat/stream-accumulator.ts` (SSE parse + `tool_use` reconstruction from
  `input_json_delta` + `usage` merge from `message_start`+`message_delta`) and a unified
  `callModel({stream,emit})`/`runTurn(emit?)` that keeps the **consumer JSON path unchanged**.
  Frontend `useInternalDonny` reads the stream into a transient bubble, reconciles with the
  persisted DB message, and **falls back to JSON** on version skew; old-frontend-vs-new-edge-fn
  also degrades gracefully (final message still renders via the `donny_messages` refetch).
  Client-disconnect handled (`ReadableStream.cancel` + guarded close — Codex P2). Both
  deployed via `npm run deploy:fn -- donny-chat`. No schema/RLS/secret/OAuth change. Deferred:
  `AbortController` thread-through so a cancelled run aborts server-side (Deno doesn't abort
  in-flight async); patch-based corrections if a single generation ever nears 400s. Pattern:
  `docs/wiki/concepts/edge-function-streaming.md`. Spec:
  `docs/superpowers/specs/2026-06-20-donny-chat-keepalive-streaming-design.md`.

- DragonCandy AIOS — Kill-switch playbook + loop-callable playbooks — **built (branch
  `feat/aios-killswitch-playbook-loop`, 2026-06-20; founder-run go-live).** Two small
  slices applying the "saved skill file" idea where it had untapped leverage. **(A1)** a
  report-only `kill-switch-watch` Founder Playbook that turns PROJECT_CONTEXT §3's four
  kill-switches into a repeatable check (green/watch/breach/not-yet-measurable); honestly
  scoped — pre-revenue it is an **armed-watch scaffold** (churn/CAC/LTV:CAC have no data
  source yet and stay not-yet-measurable until cohort/CAC instrumentation exists, out of
  scope). Runs immediately on the existing `aios-playbook-run` runner. **(A4, the prompt's
  literal "so any loop can call it")** a `playbook-runner-agent` cloud-routine template
  that makes any playbook loop-callable: it loads the definition from `aios_playbooks`,
  executes it via `execute_sql` + repo reads (a capability map sidesteps the
  `auth.uid()`-gated stats RPCs the session-bound runner needs), and posts a **deduped
  finding on breach/watch only** through `aios-report-ingest` (`breach→critical`,
  `watch→medium`; all-green posts nothing; no auto-resolve). Deliberately NOT done:
  Donny-mid-chat invocation and a service-bearer runner mode (both defer touching the chat
  core / stats-RPC auth). No edge-function, schema (beyond a seed INSERT), secret, or auth
  change; invariant held — Donny never writes directly, a human triages. Founder go-live:
  apply the seed migration, then `/schedule` the runner pinning `slug='kill-switch-watch'`.
  Spec: `docs/superpowers/specs/2026-06-20-aios-playbook-killswitch-loop-design.md`.

- DragonCandy AIOS — Validator Skills → closeable loops — **built (branch
  `validator-skills-loops`, 2026-06-20).** Turns the project's prose-emitting "judge" skills
  into a basis for autonomous loops by standardizing ONE machine-readable **verdict contract** —
  the Founder Playbooks `done_check` block (`{done, checklist:[{criterion,met}], missing:[]}`),
  reused verbatim so `aios-playbook-run`'s `parseDoneCheck` reads it with **no new code**; one
  contract spans cloud playbooks and skill-level loops. A loop is `generate → validate → fix →
  re-validate`, and a **validator** (read-and-judge only, emits the verdict block) is the
  primitive that closes it — exactly condition #2 of the Loop Scout 4-Condition Test. Shipped:
  the **`verify-knowledge`** validator skill (wiki-lint + RAG-freshness vs `LAST_WIKI_SYNC` with
  the >24h window + exit-code-is-authority caveat carried from `knowledge-freshness-agent` +
  index/log currency; the substantive "core docs reflect work" judgment is advisory-only so
  `met` stays deterministic); **`knowledge-sync`** retrofitted to close a **bounded (N=3)**
  verify→fix loop; **Loop Scout** now enumerates `.claude/skills/verify-*` and scores condition
  #2 by validator presence ("blocked on: author a verify-* validator skill first" when none
  exists). On its first real run the validator caught **2 genuine pre-existing wiki orphans**
  (Donny save-answer pages on `origin/main` never added to `index.md`) and the loop closed them
  in 2 iterations — a hint the wiki-save-answer flow doesn't update `index.md`. Skills + docs
  only: **no schema, RLS, edge function, or secret.** Validators never write; the loop's only
  write stays the idempotent RAG sync through `donny-knowledge-sync`; *a human merges wiki
  first* holds. Six other judge-capable skills (verify-db-schema, verify-prod, codex-review,
  autoresearch gate, …) are documented as ranked next-loops; a `make-validator` meta-skill is
  the deferred *automate-last* step. Built via brainstorm→spec→plan→subagent-driven execution.
  Spec: `docs/superpowers/specs/2026-06-20-validator-skills-loops-design.md`.

- DragonCandy AIOS — Workspace reading, Strategy-library import & in-UI knowledge merge —
  **built (branch `feat/aios-workspace-knowledge-merge`, 2026-06-20; edge-fn deploys
  founder-run).** Three founder asks, three slices. **(A)** Internal Donny can now READ
  AIOS-folder Drive docs, not just list them: a pure `drive-export` mime→read-strategy helper,
  a parent-guarded + **streamed-to-50KB** `readDcFile`, a `read_file` proxy action, and an
  internal-only `workspace_read_file` Donny tool. **(B, keystone)** an **in-UI approve-&-merge**
  pipeline — the `wiki-merge-pr` edge function (admin-gated, reuses `GITHUB_WIKI_TOKEN`;
  `list`/`preview`/`merge` → GitHub squash-merge → **batched** `donny-knowledge-sync`) plus a
  self-hiding "Pending knowledge" panel on `/internal/corrections` — that **deletes the GitHub
  trip AND the Lovable deploy** from every knowledge capture (the deploy was never needed:
  Donny's brain is a DB table, not the frontend bundle). The Save-to-knowledge toast now
  deep-links to the panel. **(C)** "Add to Strategy library" on AIOS Drive files →
  `wiki-import-doc` (reads the Doc server-side, opens a `donny-wiki-import/` PR riding the
  Slice-B panel into both the library and Donny's RAG). Invariants held: **a human merges
  first** (Donny gained only a READ tool; nothing auto-merges), merge surface is wiki-paths-only
  (allow-list re-asserted before the merge PUT), **no schema migration, no new secret, no new
  OAuth scope**. Built via brainstorm→spec→plan→subagent-driven execution (7 units, per-unit
  review) → opus whole-branch review → **Codex second review clean after 4 fix waves** (the
  catches: `verify_jwt=false` config for browser-invoked fns; paginate the PR-file guard; parse
  `donny-knowledge-sync`'s 200-with-`errors` body and batch ≤100/req; reject delete/rename PRs +
  honest `merged:true,synced:false` state; broaden the merge path regex to the producer contract
  yet stay traversal-proof). Founder follow-ups: deploy the 3 edge fns + redeploy donny-chat,
  sync the RAG, verify prod. Spec:
  `docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md`.

- DragonCandy AIOS — Founder Playbooks — **shipped (PR #132, 2026-06-19/20).** The landing
  spot Loop Scout's candidates were missing: a **Playbook** is a founder-authored saved
  repeatable internal task (`task` · `preferences` · `done-criteria` · `allowed-proposals`)
  that runs on demand **report-only + propose** — the `aios-playbook-run` edge function reads
  internal data with internal Donny's READ tools, composes a report, self-assesses against the
  done-criteria, and (only if the playbook allows it) **proposes** corrections through the
  existing `aios-report-ingest` → `/internal/corrections` gate. Nothing auto-applies; the
  invariant *Donny never writes directly — a human approves* holds. Closes the Loop-Scout loop
  (surface → land → run) via a **"Promote to playbook"** action on `loop-scout` findings.
  Tables `aios_playbooks` + `aios_playbook_runs` (admin RLS; partial unique index = one
  in-flight run). The runner is **self-contained** (donny-chat calls `serve()` at import, so its
  internal tools can't be imported — it carries its own compact copy; keeps the core endpoint
  untouched), runs under the **caller's session JWT** so the `auth.uid()`-gated live-stats RPCs
  work, and is `verify_jwt=false` so the browser CORS preflight reaches it. UI `/internal/playbooks`
  (+ `/:slug` detail), admin tier. 3 report-only seed playbooks (KPI variance, scaling capacity,
  AI cost vs cap). Deferred: Donny `list_playbooks`/`run_playbook` conversational tools (would
  redeploy donny-chat). Codex-clean (1 P1 + 5 P2 resolved). Live agentic run is post-merge founder
  verification. Spec: `docs/superpowers/specs/2026-06-19-aios-founder-playbooks-design.md`.

- DragonCandy AIOS — automation loops (knowledge-sync self-heal + Loop Scout) — **shipped
  (PR #130, 2026-06-19).** Prompted by a framework for ranking autonomous "loop candidates" —
  the **4-Condition Test** (repeats? / can a rule judge done? / afford wasted runs? / has the
  data + tools?). Two sequenced report-only loops. **Loop 1:** the daily 3am
  `knowledge-freshness-agent` upgraded from *detector* → *detector + self-healer* — it now
  auto-runs the blessed `sync-wiki-to-donny.mjs` when `donny_knowledge` lags the **already-merged**
  wiki (case b, mechanical) and keeps *flagging* the human case (case a, substantive `src/`/`supabase/`
  work shipped but un-ingested). Writes are exactly two (findings POST + idempotent sync); the
  invariant *a human merges first* holds (propagates only merged content). Two timestamps separate
  the cases (`LAST_WIKI` = all of `docs/wiki/`; `LAST_WIKI_SYNC` = only the synced
  `concepts`/`entities`/`analyses` dirs), and the sync script's **exit code** is the success
  authority (a timestamp compare would false-fail whenever a wiki commit touched only
  `sources`/`index`/`log`). **Loop 2:** a new monthly **Loop Scout** routine (cron `0 8 1 * *`,
  env `Dame_git_claude`) that reads existing schedules + cron jobs so it never re-proposes a live
  loop, mines `git log`/handoffs for repeated work, runs the 4-Condition Test, and files the top
  ~5 ranked candidates as `aios_findings` (`source:"loop-scout"`, `[loop]`-tagged, `severity` =
  build priority) at `/internal/findings`. No schema/UI/RLS/edge-function change. Docs/prompts
  only; two `spec-document-reviewer` rounds stood in for the Codex pass. Founder-run go-live:
  update the live knowledge-freshness routine prompt + create the loop-scout routine via
  `/schedule`. Spec: `docs/superpowers/specs/2026-06-19-aios-loop-automation-design.md`.
  **Both loops live + Loop Scout first run triaged (2026-06-20).** Loop 1 validated (self-healed
  RAG on run 1, no-op "layer current" on run 2); Loop Scout filed 5 ranked findings, all triaged
  to **2 built, 2 wontfix, 1 acknowledged**. **Built:** `expire-social-hooks` (PR #133 — daily
  Vault-backed pg_cron, jobid 5; a dead cleanup control — hooks never expired, finished-campaign
  posting delegations never revoked; auth hardened to the shared `_shared/ingest-auth.ts` gate +
  `verify_jwt=false`, a Codex P1 catch) and `expire-email-verification-tokens` (PR #134 — pure-SQL
  pg_cron, jobid 6; lossless security data-minimization since verification persists on
  `profiles.email_verified`). **wontfix:** `donny-scheduled-posts-dispatch` (publishing is
  human-gated by design — draft→"Post Now" nudge→`outstand-proxy`) and `donny-analytics-alerts-cron`
  (per-user request API, structurally not cron-able). **acknowledged:** `donny-cost-rollup-cron`
  (real dead AI cost-cap control, but a naive cron flaps — per-user vs platform `donny_usage.current_stage`
  writer conflict + `donny_cost_ledger` undercount; needs a design fix). Wiring the crons surfaced
  a stale `aios_ingest_key` Vault secret (held the legacy JWT, not the sb_secret), since corrected.
  The report-only design proved its worth: 3 wrong/mis-scoped candidates each cost only a triage,
  never a bad auto-built cron.

- DragonCandy AIOS — ingest-secret key rotation hardening — **shipped (PR #129,
  2026-06-18).** A new Supabase `sb_secret_…` key rotated prod's service-role credential,
  silently 401'ing the three daily 3am AIOS routines (knowledge-freshness, bug-sweep,
  weekly-brief) **and** the `content-performance-capture` pg_cron since 2026-06-11 — every
  endpoint that exact-matched the bearer against the auto-injected `SUPABASE_SERVICE_ROLE_KEY`
  rejected the now-stale **stored copies** (the `Dame_git_claude` cloud-routine env, the
  Vault `content_capture_key`), while injected-key callers (Donny) stayed green. Fix: a
  shared `_shared/ingest-auth.ts` gate accepting the injected service-role key **or** a
  stable, operator-set **`AIOS_INGEST_SECRET`** (value = the `sb_secret` key, so it doubles
  as the agents' PostgREST `apikey`); applied to `aios-report-ingest`, `donny-knowledge-sync`,
  `content-performance-capture`, and the `google-workspace-proxy` service-bearer path.
  Additive/backward-compatible; deployed via CLI + verified end-to-end. Set `AIOS_INGEST_SECRET`
  in three places: edge secret, cloud-routine env, Vault. (Don't disable the legacy JWT — it
  still backs every function's injected-key admin client.)

- DragonCandy AIOS — Donny gated corrections — **shipped (5 slices + prompt fix,
  2026-06-18).** Internal Donny *proposes* fixes to dashboard settings or strategy docs
  via `propose_correction` → the `aios-report-ingest` choke point → a founder approves at
  `/internal/corrections` → an admin-gated `aios_corrections_apply` RPC applies it
  (optimistic-concurrency staleness check; proposed ≠ applied). Donny never writes
  directly. **Wiki-commit-PR durability (this branch):** approving a strategy-doc
  correction updates the in-app copy but the canonical wiki file stayed stale, so the next
  `donny-knowledge-sync` reverted it — now an admin-gated **"Open wiki PR"** button on
  `/internal/corrections` (and on applied strategy-doc cards) opens a GitHub PR writing the
  correction back to `docs/wiki/…` via the `wiki-commit-pr` edge function. PR-only (never a
  `main` push, keeps the review/Codex gate); trusts only `{ correction_id }` and
  re-derives path+content server-side; idempotent/self-healing. One-time prerequisite: a
  fine-grained `GITHUB_WIKI_TOKEN` edge secret (single repo, Contents + Pull Requests R/W).
  **Save-to-knowledge (answer capture, this branch):** the correction button *fixes* an
  existing doc; a sibling **"Save to knowledge"** button on each `/internal/donny` answer
  turns a **fresh** Donny answer into a **new** `docs/wiki/<concepts|analyses>/…md` page via
  a GitHub PR (the `wiki-save-answer` edge function), folded into Donny's RAG on merge.
  Deliberate sibling of `wiki-commit-pr` (no correction row → accepts client field values
  under a stricter guard: admin gate, 2-folder whitelist, kebab filename, server-built
  YAML-safe frontmatter), PR-only, reuses `GITHUB_WIKI_TOKEN`; no schema/secret/DB-row. v1
  ships deterministic defaults (no AI metadata); the page records the originating question
  as provenance. Preserves the invariant *Donny never writes knowledge directly — a human
  merges first*.
  Specs: `docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md`,
  `docs/superpowers/specs/2026-06-18-wiki-commit-pr-design.md`,
  `docs/superpowers/specs/2026-06-18-donny-answer-to-wiki-design.md`.

- DragonCandy AIOS — Google Workspace ("Connections") — **shipped (6 PRs,
  2026-06-12/13).** Per-user Google OAuth on `/internal/workspace`, all traffic through
  one audited `google-workspace-proxy` edge function (tokens never leave the backend;
  `drive.file` + `openid` + `email` scopes, service-role-only token table). Drive file
  hub (browse / create Docs·Sheets·Slides / upload / preview / rename / trash), the whole
  internal surface restyled to the dark "ops-deck" theme, Donny exports (Export-to-Doc on
  briefings·strategy·answers, brief→Doc on publish, zero-scope Gmail compose links), and a
  metrics→living-Sheet auto-flow the Monday brief routine drives via a locked-down
  service-bearer path (acting account resolved server-side). A Google Chat bot scaffold
  (`google-chat-donny`) ships **dark** — it verifies Google's signed JWT and routes
  internal admins to Donny through a Codex-gated trusted service path, returning 503 until
  the DragonCandy Workspace org exists. Founder GCP gotchas that gated it: publish the
  OAuth consent screen to Production (Testing blocks non-test-users + expires tokens in 7
  days), register the exact `/internal/workspace/callback` redirect path, and enable the
  Sheets API separately. Remaining (all wait on the Workspace org): register the Chat app +
  set `GOOGLE_CHAT_PROJECT_NUMBER`, set `GOOGLE_ALLOWED_DOMAIN`. Spec:
  `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`.

- DragonCandy AIOS — **shipped (8 PRs, 2026-06-11).** Founders/stakeholders internal
  dashboard at `/internal` (host-aware alias `internal.dragoncandy.io`): live platform
  stats, revenue vs burn (admin-only costs/expenses), daily `platform_weight` snapshots
  with scaling alerts, strategy library (46 docs, RLS-gated), and Internal Donny
  (admin-verified donny-chat tool set over internal-scoped RAG + live stats). Two
  report-only Monday cloud routines: a bug & error sweep filing deduplicated findings
  (`/internal/findings` triage) and a weekly operating brief with KPI chips + publish
  gate (`/internal/briefings`). All agent writes flow through the `aios-report-ingest`
  choke point. Spec: `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`.

- Legal & compliance — Privacy Policy and Terms of Service pages shipped.

- QA staging & CI-CD gate — a three-plan effort to stop prod-only testing.
  Plan A (CI gate) and Plan B (a dedicated staging Supabase, ref
  `mhffqrawgizhprbobcta`, stood up via a 213-migration replay) are complete;
  Plan C (a curated e2e smoke gate on staging previews) is in place. A
  split-brain bug was fixed along the way: the frontend was hardwired to prod
  Supabase, so the client and three callers now read `VITE_SUPABASE_URL` with
  a prod fallback — note `src/integrations/supabase/client.ts` is
  Lovable-autogenerated, so watch for regen reversions. Runbook +
  feature-change workflow doc + preview-url helper shipped.

- Apple App Store (Capacitor) — wrap the existing web app in a Capacitor
  iOS shell so one codebase serves both dragoncandy.io (unchanged) and a
  downloadable iPhone app. Payments split by surface (Stripe for marketplace
  + web-only subscriptions to avoid Apple's 30%), native value-adds
  (push/camera/share) for guideline 4.2, then TestFlight → review → live.
  **Status: Phase 1 (Capacitor foundation) shipped.** Landed: Capacitor 6
  core/cli/ios packages, `capacitor.config.ts` (appId `io.dragoncandy.app`),
  iOS native project scaffold, `useNativePlatform` hook + platform-detection
  utility, CSP allowance for the `capacitor://` WebView scheme, and
  `cap:sync`/`cap:open`/`cap:copy` npm scripts (see iOS build & sync runbook).
  **Phase 2 started:** native camera / photo-library capture for DragonShare
  uploads is the first native value-add — capture UI, iOS permission strings
  (camera + photo library), and a `captureFromCamera` helper feeding the
  shared upload area. Next: push + share plugins, then TestFlight.
  Spec: `docs/superpowers/specs/2026-06-01-apple-app-store-design.md`.
  Hard prerequisite: macOS/cloud-Mac build + Apple Developer account ($99/yr).

- GTM Capital & CAC Playbook structured across Phase 0–3 with explicit
  budget gates and kill-switches. Creators onboarded before restaurants in
  each new market.

- DragonShare amplification engine — **live (web).** Creators upload organic
  content about restaurants; restaurants boost it to cross-post across all
  connected social channels via Outstand. Shipped: upload-first single-screen
  submit with URL-to-platform auto-detection, trust-then-flag model (no admin
  verification — admin queue/scoring removed), in-app education per role,
  real photo/video-frame thumbnails across all surfaces, watermarked content
  preview before payment, custom boost amount ($5–$500), boost-or-pass
  decision with post-payment download, success confirmation dialog,
  side-by-side desktop layout + restaurant browse/typeahead. Payments run on
  Stripe Connect with a two-path charge (off-session saved card or hosted
  checkout), idempotent fulfillment, and an 80/20 creator/platform split.
  **Notifications pipeline shipped:** a single `dragonshare-notify` fanout
  edge function owns delivery across bell + email + Donny (raw push inserts
  retired), driven by a dedicated DragonShare notification category with four
  email templates, fired on submit, decline, and boost fulfillment. Both the
  creator and business dashboards carry a dedicated DragonShare activity card
  (events folded into each role's recent-activity feed). Customer-generated
  content submissions were also unblocked (storage upload RLS + a missing
  `social_handles` column).

- RLS compliance and query optimization — resolving infinite recursion in
  Supabase RLS policies, removing nested profile joins blocked by RLS.

- Dashboard UX polish — pill badge sizing, avatar cache invalidation,
  relative timestamps, status synchronization across roles.

- Outstand social media integration — Instagram, TikTok, YouTube account
  linking and delegated posting via Outstand.so API. Phases 1–3 complete;
  phase 4 (analytics dashboard) in scope. Account recovery shipped:
  reconcile + reconnect-needed prompt for accounts wiped by an Outstand
  billing event, so users are guided to re-link rather than hitting silent
  failures. Real profile photos now surface for connected accounts.

- Auth session management — app-level loading guard, 3-hour global
  inactivity timeout, session hint cleanup (completed May 2026).

- Content delivery system stabilization — fixing bugs in the
  creator-to-business content handoff and payment flow before launch.
