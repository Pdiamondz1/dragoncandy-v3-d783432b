# Data-Exposure Reviewer — design

**Date:** 2026-07-19
**Status:** design approved, ready for planning
**Scope:** one new project-scoped Claude Code subagent + one dispatch line in an existing skill.
Knowledge-sync at branch finish is the standard per-branch step, not part of this scope.

## Problem

DragonCandy's dominant Codex P1 class is **data exposure through service-role code paths**, and
nothing in the review chain specialises in it.

A Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely**. Every
row-visibility rule the schema enforces for `authenticated`/`anon` evaporates. **86 of 90 edge
functions** instantiate such a client, plus 4 `_shared` modules (`auth.ts`, `fulfill-boost.ts`,
`ingest-auth.ts`, `outstand-mcp.ts`) whose defects inherit into every importer. Any read that (a) is
later returned to a client or an LLM and (b) relied on RLS for scoping is a leak unless the filter is
**re-asserted in the query itself**.

The measured evidence that the existing chain does not catch this:

- `docs/PROJECT_CONTEXT.md:1285` (PR #260, `cc9624c2`) — "edge-function-reviewer **PASS** on both;
  Codex clean (**1 P1 fixed**)". That branch closed a **service-role IDOR** in `campaignDetail` and
  made `org_id` **server-side-only** ("a client value could point at another tenant"). The subagent
  returned PASS on code containing both.
- `docs/wiki/concepts/ai-creator-matching.md:96` — "the tool fetches with the **service-role admin
  client, which bypasses RLS**" (P1, private creators leaking). Fixed in `bb736e82` (PR #247).
- `docs/wiki/concepts/dezzy-agent-playbook-suite.md:63-72` — two P2s: `business_profiles` missing the
  `profile_visibility` filter its `creator_profiles` sibling already had.
- PR #226 (`dc827171`, Crews) — a P1 privacy leak found by an **independent adversarial review**
  after a **14-round** Codex loop, living in a generic notification function the feature branch
  never opened.

The cost is quantified in re-review rounds: **14 rounds** on one branch, **10** on another, 8-fix
loops twice, "clean after 4 fix waves" twice. Each round is a full re-review.

### Why the existing reviewers miss it

`edge-function-reviewer` asks **"will this deploy and run correctly?"** Its auth item (#3) is about
the function 401ing on a credential mismatch; its RLS mention (#6, "Query hygiene") is one clause at
the bottom of a six-item list topped by bundling and `verify_jwt`. **A buried checkbox is not a
specialty.**

The defects in this class *all worked perfectly* — service-role was the correct credential and the
function ran fine. The defect is that bypassing RLS **obligates the query to re-assert what RLS
would have enforced**, and nothing reviews for that.

### Boundary — three non-overlapping questions

| Reviewer | Question | Kind |
|---|---|---|
| `verify-db-schema` (skill) | Will it **work** for the intended actor? | deterministic, prod-grounded |
| `edge-function-reviewer` (agent) | Will it **deploy and run**? | mechanical |
| **`data-exposure-reviewer` (new)** | Will it **leak** to unintended actors? | judgment |

`verify-db-schema` checks RLS *permits* the real caller; this checks RLS and the query *exclude*
everyone else. Same subject, opposite direction. This one-sentence boundary is what the
2026-07-07 audit (`docs/wiki/analyses/claude-subagents-audit.md:132-137`) said the candidate needed
before it could ship — it deferred `rls-migration-reviewer` on exactly this "`~` partial
non-redundancy".

**Precedence where the boundary is genuinely thin.** One area resists the clean split: definer
`EXECUTE` grants are both an "exclude everyone else" concern (this agent) and an existing
deterministic gate in `verify-db-schema` (`SKILL.md:83-86`). The rule is: **`verify-db-schema` owns
the verdict, because it has prod access and gates on it; this agent only flags the one refinement
that skill does not state** — see check 8. Where the two disagree, `verify-db-schema` wins.

The name changes from the audit's `rls-migration-reviewer` because the evidence is mostly **not** in
migrations — it is in service-role query call sites. Naming it for the failure mode rather than the
mechanism keeps its single responsibility legible.

## Non-goals

- **Frontend (`src/`) queries.** Every documented incident in this class is backend. The frontend
  uses the anon/user client where RLS *does* apply, so the "RLS is bypassed" premise does not hold.
  Including it would dilute the single question and add noise.
- **Replacing Codex.** This front-runs the recurring class to cut re-review rounds; the Codex second
  pass remains mandatory per `CLAUDE.md`.
- **Emitting the `{done,checklist,missing}` JSON contract.** That contract exists for *skills* feeding
  `aios-playbook-run`'s `parseDoneCheck`. Agents in this repo return prose verdicts; matching
  `edge-function-reviewer`'s shape keeps the two readable side by side.
- **Re-raising the shelved definer-revoke sweep.** `docs/wiki/concepts/security-definer-advisor-triage.md:49`
  records a deliberate pre-launch deferral of 149 advisors. The agent reviews only **new** definers
  introduced in the diff; it must not reopen that decision. (This is also why the agent is granted
  no `get_advisors` tool — see Tools.)

## Design

### Component: `.claude/agents/data-exposure-reviewer.md`

Project-scoped (not global `~/.claude/agents/`), matching `edge-function-reviewer`'s reasoning: the
gotchas are DragonCandy-specific and would misfire elsewhere. `.claude/agents/` is confirmed tracked
(`git check-ignore` returns nothing; `edge-function-reviewer.md` is already committed).

**Frontmatter**

```yaml
name: data-exposure-reviewer
description: >-
  Use BEFORE the Codex second review, and whenever a change touches a Supabase edge function that
  uses the service-role key, adds/changes an RLS policy, adds a SECURITY DEFINER function, or scopes
  a query by an org/tenant/campaign id. Reviews the changed backend files in an isolated context and
  returns a structured PASS/ISSUES verdict on ONE question: can this change let one actor reach data
  that isn't theirs? Read-only — it never edits, deploys, or migrates.
tools: Read, Grep, Glob
model: opus
```

**Model — `opus`, not `sonnet`.** The framework's "cheap specialists" guidance assumes symmetric
error cost. It does not hold here: a miss is a cross-tenant data leak in a live two-sided
marketplace, and the agent runs a few times per branch. Sonnet-tier `edge-function-reviewer`
demonstrably missed this class. One-line downgrade if practice shows it is overkill.

**Tools — `Read, Grep, Glob` only.** No `Write`/`Edit` (a reviewer must not change what it reviews),
no `Bash`, and deliberately **no Supabase MCP tools**:

- `execute_sql` can run DDL/DML — granting it would break the read-only guarantee.
- `list_tables` / `get_advisors` were considered and **dropped**: no check needs them, and
  `get_advisors` would surface the shelved 149-advisor set that non-goal 4 forbids reopening.

Consequence, stated in the body rather than hidden: **the agent reads RLS policy bodies from
`supabase/migrations/`, which is intent, not prod reality.** Migrations are append-only and a policy
may be redefined across several files, so the agent must **take the latest definition by migration
filename timestamp**. When a verdict depends on a live policy body it must say so and hand off to
`verify-db-schema` (which has prod access) rather than implying it confirmed prod — the same
graceful-degradation pattern `edge-function-reviewer` uses for `verify_jwt`.

### Dispatch contract

The agent has **no `Bash` tool** and cannot compute a diff itself; granting Bash would destroy least
privilege. The dispatcher therefore supplies:

1. the **changed-file list**, and
2. the **unified diff** for any file under `supabase/migrations/` (needed because checks 6 and 8
   trigger on *what changed inside* a file, which a filename cannot convey).

**The changed-file list is a TRIGGER SET, not a READ SET.** This is the single most important
instruction in the body, and it is the **opposite** of `edge-function-reviewer.md:22-23` ("do not fan
out to unrelated functions"). Checks 1, 6 and the `_shared` half of the entry gate all require
reading and grepping files the diff never touched — that is precisely where the Crews P1 lived. An
implementer mirroring `edge-function-reviewer`'s scope constraint would build the wrong agent.

**Entry gate (cheap path first).** Before anything else:

1. If **no supplied path is under `supabase/functions/` or `supabase/migrations/`**, return
   `VERDICT: PASS (N/A)` immediately. This is the cheap test and most diffs exit here.
2. Otherwise, determine whether any supplied file constructs a service-role client — **following
   `_shared/*` imports**, since that is exactly how the 4 shared modules propagate. If none does and
   no migration touches RLS or `SECURITY DEFINER`, return `PASS (N/A)` with the reason.

The entry gate is a **precondition, not a finding** — it never produces a severity-tagged issue.

**No-file-list fallback.** If auto-invocation fires without a supplied list, the agent must **say so
plainly and ask for the changed-file list — never guess a scope**, mirroring
`edge-function-reviewer.md:23`.

### Checklist

Eight checks. Six are traced to a specific incident; check 3 generalises an existing *correct* gate
(`agents/campaign.ts:337`) into a rule, and check 7 is preventive. Every one is reported as a hit,
with severity.

1. **Visibility re-assertion, on every branch and every sibling.** Service-role reads of
   `creator_profiles` / `business_profiles` must carry `.eq('profile_visibility','public')` on
   **every** branch — primary, fallback, retry, widening — and on **both** sibling tables. Grep for
   the table name, not the filter; count query sites and confirm each. *(The `match-creators`
   fallback at `index.ts:428` was the sharp edge: patching only the primary would have re-opened the
   hole. The second Dezzy `business_profiles` query, in a different code path, was the sibling miss.)*
2. **Record-level ownership assertion.** Any id in a service-role query that originated from a
   **request body or an LLM tool call** needs an explicit access assertion before its data is
   returned (owner ∨ org-match ∨ participant). *(`campaignDetail` returned full detail for any
   campaign id.)*
3. **Field-level PII gate.** Authorization to see a record is not authorization to see every field on
   it. PII-bearing joins need their own narrower gate. *(Participants pass check 2 but must not
   receive the applicant list — `agents/campaign.ts` gates that fetch on `isOwnerRole`.)*
4. **Server-derived tenant ids.** Org/tenant ids come from the authenticated user's profile, never
   the request body; absence ⇒ `undefined` ⇒ authz **fails closed**, never `||` a client fallback.
   **Reading guidance, not a finding:** a declared-but-unused id field is evidence of nothing —
   always verify the call site. `donny-orchestrator/types.ts:6` declares `org_id?` while
   `index.ts:323` deliberately ignores it, and **both files are currently correct**. Emitting an
   issue on the declaration alone would produce a standing false positive on every
   `donny-orchestrator` review.
5. **Membership status predicate.** Joins on `org_members` used for authorization or engagement need
   `invitation_status='active'`, not just `user_id`/`org_id`. *(A merely-invited user could otherwise
   spend the org's money — `boost-payment/index.ts:61-67`.)*
6. **New privacy scope ⇒ pre-existing fan-out audit.** **Trigger-scoped:** fires only when the diff
   introduces a new scope column/enum (e.g. `group_id`, a `visibility` enum, a private tier). When it
   fires, grep for every **pre-existing** broadcast / fan-out / notification / digest / export /
   search path on the affected table and prove each honours the new scope. The bug lives in code the
   feature branch never opened; a frontend "we don't call it in that case" is **never** the guard.
   *(The Crews P1 — `send-campaign-publish-notifications` would have emailed a private crew
   campaign's title and id to the entire creator and brand base.)*
   **Known trigger limit:** the dispatcher supplies a diff only for `supabase/migrations/`, so a new
   scope introduced **outside** a migration is out of this trigger's reach. Accepted for v1 — every
   scope in this codebase has arrived as a migration.
7. **No `select('*')`** in any service-role path whose output reaches a client or an LLM — a future
   migration silently widens it. PII exclusion belongs in the `.select()` column list, with the
   output type having no field for it.
8. **Definer grant completeness.** For a **new** SECURITY DEFINER function in the diff: server-only ⇒
   `REVOKE EXECUTE ... FROM public, anon, authenticated` — **all three**, because `FROM PUBLIC` alone
   is a **no-op** against Supabase's direct `anon`/`authenticated` grants. Client-callable ⇒ revoke
   `PUBLIC, anon`, then explicit `GRANT ... TO authenticated`.
   **Scope limiter:** `verify-db-schema/SKILL.md:45-46` already gates on "revoke `EXECUTE` from
   `anon`", and `edge-function-reviewer.md:49-50` states the three-role rule but **only for new
   SECURITY DEFINER *trigger* functions**. This check's genuine delta is three-role completeness for
   definers **generally**. Report it as `low` severity and defer to `verify-db-schema` for the
   verdict; never re-audit existing definers.

### Output

Matches `edge-function-reviewer`'s shape for consistency:

```
VERDICT: PASS | PASS (N/A) | ISSUES

service-role: <yes — N files | no>
scope-change: <none | new scope `<col>` on `<table>` — fan-out audit run>

Issues (omit the list if PASS):
- [high|med|low] <file:line> — <rule name>: <what leaks, to whom> -> <fix>
```

All file-reading detail stays in the agent's context; only the verdict block returns.

**Severity guidance** — all three bands are defined, so the middle is not a dumping ground:

- **high** — a live leak: data reaches an actor who should not see it (cross-tenant, private profile,
  another user's PII).
- **med** — a real gap that is not yet reachable: the guard is missing but a second control currently
  prevents exposure (e.g. an unreached code path, a caller that happens to pass a safe id). Fix
  required; not an active incident.
- **low** — hardening on currently-safe code (e.g. the three-role definer refinement in check 8).
  Must be labelled as hardening, not a live leak, so the operator is not trained to ignore the agent.

**`_shared` blast radius.** When a changed file is itself under `supabase/functions/_shared/`, grep
its importers and use the count to **calibrate severity** — a defect in `auth.ts` or `ingest-auth.ts`
inherits into every importer, so it is rarely `low`.

### Backstop

Auto-invocation via `description:` is best-effort and not test-verifiable — the 2026-07-07 audit's
central operational lesson, which is why `edge-function-reviewer` carries an explicit dispatch line
in `careful`.

This agent's deterministic backstop is **one added line in `.claude/skills/codex-review/SKILL.md`**:
dispatch `data-exposure-reviewer` on the branch's changed backend files *before* running Codex. That
targets the measured cost directly — the 14-round and 10-round Codex loops — by front-running the
class Codex repeatedly catches.

`codex-review` is repo-owned (`.claude/skills/`), so editing it is safe. Superpowers *plugin* skills
are unversioned and overwritten on update, so no plugin skill is touched.

Implementation note: that skill's step 1 is already "run the review", so inserting a pre-step
renumbers the existing steps. Expected, not a conflict.

## Verification

The agent produces no runtime artefact, so verification is behavioural — does it catch known defects
and stay quiet otherwise?

**Replay mechanism (required, and not optional detail).** The agent cannot reach git history. Each
replay must be staged by the operator as a **detached `git worktree` at the pre-fix commit**, created
**under the repo** at `.claude/worktrees/replay-<sha>` (consistent with existing worktree practice —
a worktree outside the project tree may leave the subagent's `Read`/`Grep` scope-restricted or
prompting on every access), with the agent given paths *inside that worktree*. The two cheaper
alternatives are rejected for concrete reasons:

- *Copying the single pre-fix file to a scratch dir* **contaminates the test** — the agent's Grep
  would then read the **current** `docs/wiki/concepts/ai-creator-matching.md:96`, which states the
  exact fix it is being asked to find. It also breaks checks 1 and 6, which are cross-file by design.
- *Pasting file contents inline* destroys the context-isolation payoff that justifies a subagent at
  all.

All three replay SHAs are verified to resolve in this repo.

1. **True-positive replay (the acceptance gate).** Stage a detached worktree at each `<sha>^` and
   dispatch:
   - `bb736e82^` (PR #247, `match-creators`) — expect a check-1 hit covering the **fallback** branch
     at `index.ts:428`, not just the primary.
   - `cc9624c2^` (PR #260, `donny-orchestrator`) — expect a check-2 hit (`campaignDetail` ownership)
     **and** a check-4 hit (client-supplied `org_id`).
   - **Crews (PR #226) — requires reconstruction, not a parent checkout.** Verified: `dc827171` is a
     **squash merge** (single parent `bdcd057c`), and `dc827171^` contains **zero** `creator_group`
     migrations — the crew feature does not exist there, so `dc827171^` cannot be staged and the
     `^`-parent pattern used by the other two replays does not apply here.
     Instead: stage the worktree at **`dc827171`** (crew feature present) and **revert the single
     guard hunk** in `send-campaign-publish-notifications/index.ts` — restore
     `.select("open_for_sponsorship")` and delete the `if (campaign?.group_id) { … }` early return.
     Verified safe: that file **pre-existed** the merge and the guard is one contained hunk.
     **Delete the 4-line explanatory comment above the guard as well** — it names both the leak and
     the fix ("must NEVER be broadcast … would leak the private campaign's title + id to
     non-members"). Leaving it behind contaminates the test exactly as the scratch-dir alternative
     does, by handing the agent the answer it is being asked to find.
     Then dispatch with **only the crew migrations + crew feature files, excluding**
     `send-campaign-publish-notifications`.
     **Pass:** the agent **reaches that function unprompted, by grep**, and flags the broadcast path.
     **Fail:** a verdict reporting only crew-file findings and never naming a fan-out path fails
     check 6 — even if every finding it *did* report is correct.
     This is the sharpest test in the suite and must not be rigged. Handing the agent the
     notification file would make check 6 satisfiable with **zero fan-out capability** — the exact
     capability it exists to add. A file-supplied variant is at best a fallback diagnostic, never the
     gate.
2. **True-negative / noise check.** Dispatch against a merged, Codex-clean **backend** diff — PR #268
   (`landing-clips` edge function) or the post-fix state of PR #260. Expect `PASS` with no invented
   findings. *(Explicitly not PR #288: it is frontend-only presentational work, so it would hit the
   entry gate and test nothing.)* An agent that cries wolf will be ignored, so a clean run on clean
   code is a gating result.
3. **Entry-gate check.** Dispatch on a frontend-only file list; confirm `PASS (N/A)` without reading
   backend files.
4. **Least-privilege check.** Confirm the frontmatter grants no `Write`, `Edit`, `Bash`, or any MCP
   tool.
5. **Backstop check.** Confirm the `codex-review` dispatch line is present and names the agent
   correctly.

Steps 1–3 are the real acceptance gate; a v1 that passes 4–5 but fails 1 is not shippable.

## Risks

- **False-positive fatigue.** The most likely failure. Mitigated by the trigger-scoping on check 6,
  the two-stage entry gate, the severity guidance separating hardening from live leaks, and
  acceptance step 2.
- **Prod-vs-migration drift.** Without prod access the agent reads intent, not reality. Mitigated by
  the latest-definition-by-timestamp rule and by requiring an explicit "confirm with
  `verify-db-schema`" caveat instead of an implied PASS.
- **Overlap creep with `edge-function-reviewer`.** Both read edge functions. Mitigated by the
  one-sentence boundary appearing in both the `description:` and the body, and by this agent carrying
  no bundling / `verify_jwt` / CORS checks at all. Check 7 (`select('*')`) does touch
  `edge-function-reviewer.md:52`'s query-hygiene clause; this agent's version is narrowed to
  *service-role paths whose output reaches a client or an LLM*, which is the exposure lens rather
  than the hygiene one.

## Open items (deliberately deferred — no work in this branch)

- **Harbormill AIOS port.** Harbormill has **no subagents** — the premise that prompted this work
  does not hold. Of its four candidate skills, only `wiki-gardener` is a genuine DragonCandy
  capability gap; `loop-audit` is behind DC's shipped Loop Scout, and `validator-forge` lacks DC's
  `{done,checklist,missing}` contract. `loop-verify`'s context-withholding discipline is worth
  merging into `make-validator`. The higher-value flow is **DC → Harbormill**.
- ~~**PR #288 knowledge-sync gap.**~~ **RETRACTED 2026-07-19 — this gap never existed.** It was
  asserted during design after checking only *this worktree*, which was 15 commits behind
  `origin/main`. On `origin/main` the sync had already shipped as PR #290 and been verified by
  PR #291; `docs/wiki/raw/sessions/2026-07-18-light-theme-polish-phase4.md` exists and
  `light-app-kit.md` reads "Phase 4 (shipped, PR #288)". The durable lesson — **a claimed knowledge
  gap must be verified against `origin/main`, never a worktree** — is recorded in
  `knowledge-sync`'s `MEMORY.md`. Left visible rather than deleted so the error is traceable.
- **`verify-prod` runner subagent** — deferral reasoning from the 2026-07-07 audit is unchanged.
- **Kit-adoption reviewer** — killed, not deferred. The light-app-kit rollout completed at PR #288,
  and the documented residual grep run against Outstand returns **16 hits, all 16 documented keeps**
  (social-platform brand colours). No live need.
