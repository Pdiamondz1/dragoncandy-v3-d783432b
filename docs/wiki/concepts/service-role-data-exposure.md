---
title: Service-Role Data Exposure
type: concept
created: 2026-07-19
updated: 2026-07-19
sources: [2026-07-19-data-exposure-reviewer.md, 2026-07-19-service-role-remediation.md]
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

## See Also

- [[Service-Role Remediation Session]] — the PR #308 fix, its review rounds, and the deploy
- [[Claude Subagents Audit]] — the 7-dimension rubric and the backlog this resolves
- [[AI Creator Matching]] — the `match-creators`/`donny-chat` instances of this class
- [[Donny Data Visibility & Quick-Action Routing]] — the `org_id` tenant-scoping instance
- [[Creator Groups (Crews)]] — the privacy scope check 6 exists to protect
- [[Claude Skills Framework Audit]] — the sibling capability audit
