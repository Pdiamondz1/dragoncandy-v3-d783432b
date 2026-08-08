---
title: Service-Role Data Exposure
type: concept
created: 2026-07-19
updated: 2026-08-08
sources: [2026-07-19-data-exposure-reviewer.md, 2026-07-19-service-role-remediation.md, 2026-07-20-counter-offer-authz.md, 2026-08-08-dragonshare-score-removal.md]
tags: [security, rls, service-role, edge-functions, subagents, review, privacy, gotcha]
---
# Service-Role Data Exposure

DragonCandy's most expensive recurring defect class, and the `data-exposure-reviewer` subagent built
to catch it. Sibling of [[AI Creator Matching]] and [[Donny Data Visibility & Quick-Action Routing]],
both of which record individual instances; this page is the **class**.

## The defect

A Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely**. Every
row-visibility rule the schema enforces for `authenticated`/`anon` evaporates. **86 of 90** edge
functions build one, plus 4 `_shared` modules (`auth.ts`, `fulfill-boost.ts`, `ingest-auth.ts`,
`outstand-mcp.ts`) whose defects inherit into every importer.

Any read that (a) reaches a client or an LLM and (b) relied on RLS for scoping is a leak **unless the
filter is re-asserted in the query itself**.

The trap is that these defects **run perfectly**. Service-role is usually the correct credential; the
function returns 200 and the feature works. Nothing fails, so nothing draws attention.

## Why the existing reviewers missed it

`edge-function-reviewer` asks *"will this deploy and run?"* Its auth item concerns the function 401ing
on a credential mismatch; its RLS mention is one clause at the bottom of a six-item list topped by
bundling and `verify_jwt`.

The record is explicit — for PR #260: **"edge-function-reviewer PASS on both; Codex clean (1 P1
fixed)"**. That branch closed a service-role IDOR in `campaignDetail` and made `org_id`
server-side-only. The subagent passed code containing both.

**A buried checkbox is not a specialty.** That is the whole finding.

## The three-reviewer boundary

| Reviewer | Question | Kind |
|---|---|---|
| `verify-db-schema` (skill) | Will it **work** for the intended actor? | deterministic, prod-grounded |
| `edge-function-reviewer` (agent) | Will it **deploy and run**? | mechanical |
| `data-exposure-reviewer` (agent) | Will it **leak** to unintended actors? | judgment |

`verify-db-schema` checks RLS *permits* the real caller; `data-exposure-reviewer` checks RLS and the
query *exclude* everyone else. Same subject, opposite direction. Stating this boundary is what
unblocked the candidate [[Claude Subagents Audit]] had deferred on "`~` partial non-redundancy".

Renamed from that audit's `rls-migration-reviewer` because the evidence is mostly **not** in
migrations — it is in service-role query call sites. Name the failure mode, not the mechanism.

## The eight checks

1. **Visibility re-assertion — every branch, both siblings.** `.eq('profile_visibility','public')` on
   `creator_profiles`/`business_profiles`, on **every** branch (primary, fallback, retry, widening)
   and on **both** sibling tables. Grep the table name, not the filter; count query sites.
2. **Record-level ownership assertion.** Any id from a request body *or an LLM tool call* needs an
   explicit access assertion (owner ∨ org-match ∨ participant) before its data returns.
3. **Field-level PII gate.** Authorization to see a record ≠ authorization to see every field on it.
4. **Server-derived tenant ids.** Org ids come from the authenticated profile, never the body; absence
   ⇒ fails closed, never `|| clientValue`.
5. **Membership status predicate.** `org_members` joins need `invitation_status='active'`.
6. **New privacy scope ⇒ pre-existing fan-out audit.** When a diff adds a scope column/enum, every
   *pre-existing* broadcast/notification/export/search path on that table must honour it.
7. **No `select('*')`** in a service-role path reaching a client or an LLM.
8. **Definer grant completeness.** `REVOKE ... FROM public, anon, authenticated` — all three;
   `FROM PUBLIC` alone is a **no-op** against Supabase's direct grants. Reported `low` and routed to
   `verify-db-schema`, which owns the verdict because only it has prod access.

## Design decisions worth keeping

- **`model: opus`, not `sonnet`.** The "cheap specialists" heuristic assumes symmetric error cost.
  That fails when a miss is a cross-tenant leak in a live marketplace, and a Sonnet-tier reviewer
  demonstrably missed this class.
- **No MCP tools at all.** `execute_sql` runs DDL/DML, so granting it breaks the guarantee that a
  reviewer cannot change what it reviews. `list_tables`/`get_advisors` were granted then **dropped** —
  no check used them, and `get_advisors` would reopen the deliberately-shelved 149-advisor triage.
  Consequence stated, not hidden: policy bodies come from `supabase/migrations/` (intent, not prod),
  **latest definition by filename timestamp**, and live-state verdicts defer to `verify-db-schema`.
- **The changed-file list is a TRIGGER SET, not a READ SET** — the *opposite* of
  `edge-function-reviewer`'s "do not fan out to unrelated functions". Checks 1 and 6 require reading
  files the diff never touched. An implementer mirroring the sibling builds the wrong agent.
- **Deterministic backstop.** Auto-invocation via `description:` is best-effort and not
  test-verifiable, so dispatch is hard-wired into `codex-review` step 1 — front-running the class that
  drove **14-round** and **10-round** Codex loops.

## Gotchas

- **A test suite can appear to cover a capability while exercising it only through an unrelated
  precondition.** The entry gate opened on "service-role client OR RLS/definer migration", but check 6
  triggers on a **new scope column**. `20260709120010_campaigns_group_id.sql` is `ALTER TABLE ... ADD
  COLUMN` plus an index — 0 `policy`, 0 `security definer` — so alone it fell straight through the
  gate and check 6 never ran. The Crews replay passed only because 16 *sibling* migrations happened to
  hold the gate open. Caught by whole-branch review, not by the replays.
- **A new `.claude/agents/*.md` is not dispatchable until the session reloads** — dispatch fails with
  "Agent type not found". Do **not** work around it by pasting the body into a `general-purpose`
  agent: that leaves tool-scoping unenforced, so a "passing" test proves nothing.
- **Replaying a squash-merged feature needs reconstruction, not `<sha>^`.** `dc827171^` contains zero
  `creator_group` migrations — the feature does not exist at the parent. Stage at the merge, then
  `git checkout <sha>^ -- <one file>` to restore the pre-fix version. Delete any comment that names
  the leak and the fix, or the fixture hands the agent its answer.
- **Verify a claimed knowledge gap against `origin/main`, never a worktree.** A "missing" doc was
  asserted from a worktree 15 commits behind `origin/main`; the work had already shipped there. A
  worktree drifts silently — absence in one proves nothing.

## What it found on its first runs

Six findings on `origin/main` (five controller-verified, one flagged unverified), filed in
`.claude/handoffs/2026-07-19-service-role-exposure-findings.md` for a dedicated branch. The clearest —
`donny-chat/index.ts`, same file, 58 lines apart:

- `:1237` `match_creators` **has** the visibility filter, commented *"don't surface private creators
  via the service role (RLS-bypass)"*
- `:1295` `get_creator_profile` reads by LLM-supplied `creator_id`, returns `base_rate_per_hour` and
  `portfolio_urls`, **no filter**

The fix was applied at one query site and missed at its sibling — check 1's exact failure mode. These
survived 14 Codex rounds, an adversarial review, and PRs #246/#247/#260.

## Resolved — `create_counter_offer` authorization (found 2026-07-19, fixed 2026-07-20)

Surfaced by the `data-exposure-reviewer` while reviewing the campaign-pricing work
([[Campaign Price Anchoring & Negotiation Reach]]), **not** introduced by it, and fixed the next
day in its own migration (`20260720000000_counter_offer_authz.sql`, `fix/counter-offer-authz`).

**The hole.** `create_counter_offer` was `SECURITY DEFINER` with **`anon:EXECUTE`** (confirmed
live) and **no authorization of any kind** — no `auth.uid()` check, no participant check, no
`p_sender_role` validation. Being definer it bypassed RLS on both `campaign_applications` and
`application_counter_offers`. Any caller (including anonymous) could flip a stranger's application
to `counter_offered`, mass-decline its pending offers, and insert an offer under an arbitrary
`sender_id`/`sender_role`. The escalation: forge an offer **as the counterparty**, then self-accept
(the UPDATE policy's only sender test is `sender_id != auth.uid()`). Scoped honestly, the forged
value feeds `agreed_rate` → `increment_budget_spent` (budget accounting), not Stripe movement.
The 2026-07-19 pricing work had deliberately kept its widened apply path on the **direct,
RLS-checked insert** rather than routing new traffic through this RPC — the right call.

**The fix (one `CREATE OR REPLACE` migration, identical 6-arg signature — the sole caller
`useCounterOffers.ts` untouched):**
- **Identity**, before the row lock: `IF auth.uid() IS DISTINCT FROM p_sender_id THEN RAISE`
  (mirrors `apply_to_campaign`). Rejects anon (`auth.uid()` is null).
- **Participant + derive role**: caller must be the application's `creator_id` → `'creator'`, or
  the campaign `user_id` → `'business'`; else raise. Server-derived, `IF/ELSIF/ELSE`.
- **Role integrity**: raise if `p_sender_role` ≠ the derived role. The INSERT then writes
  `auth.uid()` and the **derived** role — never the client's — which **closes the self-accept
  escalation**: a forged offer now always carries `sender_id = auth.uid()`, so the UPDATE policy's
  `sender_id != auth.uid()` blocks the inserter from accepting it.
- **Grants**: `REVOKE EXECUTE … FROM anon, public` + explicit `GRANT … TO authenticated,
  service_role`. (The confirm-live-grants todo resolved: it *was* anon-executable; `authenticated`
  keeps a **direct** default-privilege grant that the revoke doesn't touch — verified via
  `routine_privileges` **and** an as-`authenticated`-role call, which is why Codex's "authenticated
  loses EXECUTE" flag was empirically false. The explicit GRANT was added anyway so the migration
  doesn't depend on default privileges on a fresh replay.)
- **Sibling RLS**: recreated the `application_counter_offers` INSERT policy with `sender_role`
  pinned via `CASE` (creator→`'creator'`, else→`'business'`), closing the low-sev forged-role gap
  on the direct-insert path too.
- **`RETURNING` column list pinned** (not `RETURNING *`) so this RLS-bypassing definer path can't
  auto-surface a future sensitive column (data-exposure-reviewer catch).

**Verified live, red→green** (rollback-wrapped SQL, `set_config('request.jwt.claim.sub',…,true)`
to fake `auth.uid()`; `SET LOCAL ROLE authenticated` for the RLS path): the forged third-party
call **succeeded pre-fix** and now **raises**; anon, identity-spoof, and role-forge all raise;
real creator + owner still succeed; the RLS pin accepts the correct role and rejects a forged one.
See [[Counter-Offer Authorization Session]].

## Resolved by deletion — `donny-dragonshare-score` (found 2026-08-07, removed 2026-08-08)

Filed as an **unverified lead** during the DragonFeed uplift and checked the next day, as
[[Verify Before Reporting]] requires. The lead was right, and the remedy was still *delete*, not fix.

**The hole.** `caller` was bound on line 32 (`supabaseAnon.auth.getUser(token)` → 401 on failure) and
**never referenced again**. Everything after ran on the service-role client, keyed only on a
body-supplied `post_id` — check 2 (record-level ownership assertion) missing outright:

- **Cross-tenant read.** `select("*")` on any `dragonshare_posts` row (also check 7). The response
  leaked the victim post's `platform`, `content_type`, and — stated in plain text in `rationale` —
  the creator's verified post count.
- **A solvable aggregate.** `matchQuality = min(100, 50 + orgBoostCount×5 + creatorPostCount×3)`,
  with `creatorPostCount` disclosed in the same response, is one equation in one unknown. That
  yields the target org's **total captured/transferred boost count** — which `ds_boosts_org_select`
  restricts to org members and `ds_boosts_creator_select` restricts to a creator's own posts. It
  saturates at 100 and is a count, not an amount.
- **Cross-tenant write.** Overwrote `donny_recommended_tier` / `donny_score` /
  `donny_reach_estimate` on the victim's post.
- **Audit misattribution.** The `dragonshare_events` row was stamped
  `actor_user_id: post.creator_id` — the **victim**. Since `ds_events_select` is
  `actor_user_id = auth.uid()`, the victim sees a phantom event they didn't cause and the real
  caller leaves no trace anywhere.

**It was the hole in the DB's own guard.** `trg_ds_posts_block_self_verify` (migration
`20260601160000`) explicitly forbids an authenticated non-admin from changing exactly those three
`donny_*` columns — then waves through `auth.uid() is null`, i.e. the service role, because the
boost-payment function legitimately needs that. A service-role function with no authorization of its
own therefore converted a *closed* client path into an open one. **Defense-in-depth at the DB
protects you only from the credentials it can see.**

**Why deletion, not an org-membership check** (Musk's algorithm step 2 before step 3):

- **Zero callers.** Nothing in `src/`, no other edge function, no `config.toml` entry, no CI gate,
  no script. The `dragonshare_posts` INSERT webhook the 2026-04-27 plan specified was **never
  wired** — checked against **prod**, not the repo: no `cron.job` command mentions dragonshare, no
  `pg_proc` body mentions `dragonshare-score`, and all four triggers on `dragonshare_posts`
  (`ds_posts_block_self_verify`, `trg_ds_post_submitted`, `trg_ds_post_verified`,
  `trg_ds_posts_updated_at`) call local plpgsql functions, none of them
  `supabase_functions.http_request`.
- **Never executed.** Confirmed on prod twice (2026-08-07 and 2026-08-08): 10 posts, `0` with a
  tier, `0` with a score, `0` with a reach estimate, `0` `donny_score_generated` events.
- Nothing reads the three columns either — they appear only in `types.ts` and the guard trigger.

Reachability was genuinely limited: `post_id` is a uuid and RLS blocks listing foreign post ids, so
cross-tenant use needed an id obtained out of band. But **one variant needed no foreign id at all** —
a creator calling it on their *own* post still solves for the target business's boost count. Being
hard to aim is not the same as being closed.

Columns kept (never drop a column); the two historical DragonShare planning docs now carry a
removal note so nobody rebuilds it from the old spec.

### Found while confirming the sibling lead: `landing-clips` origin pinning

The same lead list called `landing-clips` "orphaned"; checking that turned up a **wrong claim and a
real defect**, in opposite directions.

**The claim was wrong.** It has a wired consumer (`useLandingBackdropPlaylist` →
`HeroVideoBackdrop`), lazy-loaded behind `LANDING_VIDEO_BACKDROP_ENABLED = false` — deliberate
preservation, since `DESIGN_SYSTEM.md` promises the flag re-enables video "with zero other code
changes". Deleting it would have broken that **silently**: `fetchLandingBackdropClips` swallows every
error and returns `[]`, so the hero falls back to static with nothing logged. **A lazy dynamic
`import()` behind a false flag looks exactly like dead code to a grep of runtime call sites** —
"orphaned" is a claim about the whole consumer chain, flag-gated links included.

**The defect was real, and bigger than the reviewer flagged.** `data-exposure-reviewer` raised
`screenshot_url`; the same reasoning covers `content_file_path` too. Both are **creator-writable free
text** — `ds_posts_creator_insert` / `ds_posts_creator_update` gate only on `creator_id = auth.uid()`
with **no column constraint**, and `trg_ds_posts_block_self_verify` lists neither column. The SQL
filter (boosted + verified + unflagged) decides *whose row is eligible*; it says nothing about *where
the bytes come from*, and the extension guard checks only the suffix. So a creator whose post got
boosted could make the anonymous homepage fetch an arbitrary third-party URL from every visitor's
browser — an IP/UA beacon on the marketing page.

`buildClips` now takes a **required** `allowedPrefix` (required, not optional: an optional security
control invites omission) derived from `SUPABASE_URL`, and pins both fields to the public
`dragonshare-content` prefix. An off-bucket **poster is dropped but the clip is kept** — the video
still plays, it just loses its still frame. All 9 real rows already carry the prefix, so behaviour is
unchanged today. 16 tests, including a prefix-lookalike host, a sibling public bucket, and a
non-http scheme.

**Codex caught that in-code filtering alone was starvable** — a genuine second-model catch. The query
takes the newest 20 eligible rows and `buildClips` filtered *after* that, so enough recent off-bucket
boosted rows would push every valid clip out of the window and the hero would silently lose its
dynamic clips. The predicate now runs **in the query too**
(`.like("content_file_path", likePrefixPattern(prefix))`), with `\ % _` escaped — `_` is a LIKE
single-character wildcard and would otherwise *loosen* the filter it exists to tighten. Both layers
are kept on purpose: SQL so the window can't be starved, in-code because that is what covers
`screenshot_url` and what protects any future caller of the pure helper.

**The generalizable bit:** a row-level eligibility filter is not a content filter. Whenever a
service-role endpoint echoes a **URL** that any user can write, the origin must be pinned separately
from whatever decides the row is allowed.

### The durable lesson: deleting source is not undeploying

A merged deletion removes the function from the repo. **The deployed function keeps serving** until
it is explicitly removed from Supabase — so the repo and the live attack surface disagree, and the
repo is the one everybody greps. An orphaned deployed function is the worst case of this class: live,
authenticated-reachable, and owned by no feature, so no test, no user report, and no code review path
ever touches it again. Audit the *deployed* function list against the repo, not the repo alone.

## The remediation (PR #308 — shipped + deployed)

12 guards across 4 edge functions, plus the pure `_shared/campaign-access.ts`
(`evaluateCampaignAccess` / `evaluateApplyAccess`, 19 tests, fails closed). No migration, no schema
change. See [[Service-Role Remediation Session]].

**Running the reviewer on its own remediation found more than the original six.** Round 1 surfaced 3
additional `[high]` sites — the worst not in the original set at all: `donny-campaign-preview`
`handleRegenerate` had no ownership check, so any caller could regenerate an arbitrary preview,
receive the full row (incl. `ai_prompt_used`, which embeds another tenant's brief and budget) **and
destructively overwrite the victim's row**. A cross-tenant *write*. Round 2 found 2 `[med]`
consistency gaps; round 3 was hardening only.

**Then Codex found one all three rounds missed** — the strongest in-repo argument for a second
independent model. `isParticipant` collapsed collaborations and applications into one flag, but the
live `campaigns` SELECT policy treats them differently:

```
(user_id = auth.uid())
OR (status = 'published' AND (group_id IS NULL OR is_active_group_member(group_id, auth.uid())))
OR has_collaboration_on_campaign(id, auth.uid())
```

`has_collaboration_on_campaign` is **status-independent**, and there is **no application arm at
all** — so a rejected or stale applicant retained access to a *closed* campaign's brief and budget.
Split into `isCollaborator` (status-independent) and `hasApplication` (requires `published`).
`verify-db-schema` read that policy from prod and independently confirmed it.

### A security fix that breaks the feature is its own failure mode

Two functional regressions were introduced during remediation and caught in review — neither by
tests, both by asking *"does this still work for the person who's supposed to use it?"*

1. **Gating a pre-application endpoint on participation.** `donny-apply-pitch` exists to help a
   creator write a pitch *before* applying, so they are by definition not yet a participant —
   `evaluateCampaignAccess` denied every legitimate first use. The right question was
   `evaluateApplyAccess`.
2. **Filtering the caller's OWN row on visibility.** After `creator_id === user.id` had already
   proved ownership, a `profile_visibility='public'` filter closed no exposure (a caller can only
   reach their own row there) while locking private creators out of their own data. **Ownership is
   the stronger guard and supersedes visibility** — cross-user reads correctly keep their filters.

### Stricter-than-RLS, on purpose

`evaluateCampaignAccess` denies some access the policy would allow: RLS grants any authenticated user
a published non-crew campaign, while the helper also requires owner ∨ org ∨ collaborator ∨ applicant.
`handleGenerate` spends AI budget, so "anyone may read it" must not become "anyone may bill previews
against it." Documented rather than silently diverging.

## Open instances (found 2026-08-08, NOT fixed — leads, not verdicts)

Surfaced by fanning `data-exposure-reviewer` across all 90 functions while reviewing the deletion
above. All **pre-existing**; none introduced by that change. Corroborated mechanically only — a
`grep -c "getUser\|isAuthorizedIngest"` returns **0** for both files below — but **not reproduced
end-to-end**, so treat them as leads ([[Verify Before Reporting]]).

| Site | Shape | Why it is not a read leak |
|---|---|---|
| `fire-dragonshare-social-hook/index.ts:26-54` | body `boost_id`/`post_id` + service role + **no caller resolution** | returns `{ok, drafts_created, parties}` — no victim data |
| `dragonshare-notify/index.ts:346-361` | identical | returns `{ok:true}` |

Both are cross-user **write/forgery** rather than exposure: planting `donny_scheduled_posts` drafts,
`donny_nudges`, notifications and a Donny chat message into other users' accounts by id. Each has
exactly one real caller — `_shared/fulfill-boost.ts`, service-role→service-role — so the likely fix
is `isAuthorizedIngest`, the pattern `auto-approve-content` already uses.

Also revised: the `donny-orchestrator/agents/dragonshare.ts` lead is **worse than first filed**.
Beyond omitting `.eq("status","verified")` (which `donny-chat/index.ts:1209` applies specifically to
mirror `ds_posts_org_select`), it scopes on `userContext.org_id` — the denormalized `profiles.org_id`
cache — with **no `invitation_status='active'` qualifier** (check 5). Whether a removed member's
`profiles.org_id` is actually cleared is live state; no migration clears it on member removal, so
route that to `verify-db-schema` before acting.

**A false negative worth recording:** `donny-orchestrator/agents/billing.ts:80` reads
`(input.org_id) ?? userContext.org_id` where `org_id` is a declared **LLM tool argument** — which
looks exactly like check 4's violation and is **not** one. `donny-orchestrator/index.ts:491-499`
builds `enrichedInput` as `{ ...toolInput, org_id: userContext.org_id }`, so the server-derived value
overwrites whatever the model supplies. **Check the call site before believing a tool-argument
finding** — the fallback is dead code, not a hole.

## See Also

- [[Service-Role Remediation Session]] — the PR #308 fix, its review rounds, and the deploy
- [[Claude Subagents Audit]] — the 7-dimension rubric and the backlog this resolves
- [[AI Creator Matching]] — the `match-creators`/`donny-chat` instances of this class
- [[Donny Data Visibility & Quick-Action Routing]] — the `org_id` tenant-scoping instance
- [[Creator Groups (Crews)]] — the privacy scope check 6 exists to protect
- [[Claude Skills Framework Audit]] — the sibling capability audit
