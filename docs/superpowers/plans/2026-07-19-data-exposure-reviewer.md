# Data-Exposure Reviewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a project-scoped, read-only Claude Code subagent that reviews changed backend files for one question — *can this change let one actor reach data that isn't theirs?* — and wire it as a deterministic pre-Codex gate.

**Architecture:** Two markdown files, no code. `.claude/agents/data-exposure-reviewer.md` defines the agent (frontmatter tool-scoping + a body carrying an entry gate, 8 checks, and a fixed output shape). One inserted step in `.claude/skills/codex-review/SKILL.md` is the deterministic backstop, because auto-invocation via `description:` is best-effort and not test-verifiable. Verification is **behavioural, not unit-tested**: three historical defects are re-staged as git worktrees and the agent must catch each; a known-clean backend diff must come back quiet.

**Tech Stack:** Markdown only. Git worktrees for test fixtures. The Agent tool for dispatch. No build, no npm, no migration, no deploy.

Spec: `docs/superpowers/specs/2026-07-19-data-exposure-reviewer-design.md` (approved after 4 independent review rounds).

## Global Constraints

- **Read-only agent.** Frontmatter grants exactly `tools: Read, Grep, Glob`. No `Write`, `Edit`, `Bash`, or any MCP tool. `execute_sql` is excluded because it can run DDL/DML; `list_tables`/`get_advisors` are excluded because no check uses them and `get_advisors` would surface the shelved 149-advisor set.
- **`model: opus`** — asymmetric cost-of-miss (a cross-tenant leak in a live marketplace). Sonnet-tier `edge-function-reviewer` demonstrably missed this class.
- **Project-scoped**, at `.claude/agents/`, never global `~/.claude/agents/`. Confirmed tracked (not gitignored).
- **Never reopen the shelved definer sweep** — `docs/wiki/concepts/security-definer-advisor-triage.md:49` records a deliberate pre-launch deferral of 149 advisors. Only **new** definers in the diff are in scope.
- **No frontend (`src/`) review.** Backend only: `supabase/functions/` and `supabase/migrations/`.
- **Output shape is fixed** and must mirror `edge-function-reviewer`'s. No `{done,checklist,missing}` JSON — that contract is for skills feeding `parseDoneCheck`.
- **Replay fixtures are throwaway.** Worktrees under `.claude/worktrees/replay-<sha>` must be removed in Task 5 and never committed.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `.claude/agents/data-exposure-reviewer.md` | **Create.** The agent: frontmatter tool-scope + entry gate + 8 checks + output contract. The whole deliverable. | 2 |
| `.claude/skills/codex-review/SKILL.md` | **Modify.** Insert one step before the existing step 1; renumber 1→2, 2→3, 3→4. | 5 |
| `.claude/worktrees/replay-bb736e82` | **Fixture (temporary).** `bb736e82^` — `match-creators` before the visibility filter. | 1, 5 |
| `.claude/worktrees/replay-cc9624c2` | **Fixture (temporary).** `cc9624c2^` — `donny-orchestrator` before the ownership gate + `org_id` fix. | 1, 5 |
| `.claude/worktrees/replay-dc827171` | **Fixture (temporary).** `dc827171` with the crew guard reverted — see Task 1 Step 4 for why the `^`-parent pattern does not work here. | 1, 5 |

---

### Task 1: Stage the three replay fixtures

These fixtures **are the tests**. Build them before the agent so the acceptance gate exists before the thing it gates.

**Files:**
- Create: `.claude/worktrees/replay-bb736e82/` (detached worktree)
- Create: `.claude/worktrees/replay-cc9624c2/` (detached worktree)
- Create: `.claude/worktrees/replay-dc827171/` (detached worktree, one file reverted)

**Interfaces:**
- Consumes: nothing.
- Produces: three absolute fixture paths + a dispatch file-list per fixture, consumed by Task 3.

- [ ] **Step 1: Confirm all three SHAs resolve**

```bash
cd "C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-improvements-3"
for s in bb736e82 cc9624c2 dc827171; do printf "%s -> " "$s"; git log -1 --format="%s" "$s"; done
```

Expected — exactly these three subjects:
```
bb736e82 -> fix(match-creators): filter to public creators (service-role RLS-bypass privacy parity) (#247)
cc9624c2 -> fix(donny): stop 404 on quick-actions + make Donny reliably see campaigns/DragonShare (#260)
dc827171 -> Creator Groups + Private Group Campaigns (v1, free collabs) (#226)
```

If any SHA fails to resolve, STOP — the acceptance gate cannot be built and the plan needs revisiting.

- [ ] **Step 2: Stage the two `^`-parent fixtures**

```bash
git worktree add --detach ../replay-bb736e82 bb736e82^
git worktree add --detach ../replay-cc9624c2 cc9624c2^
```

Expected: two "Preparing worktree (detached HEAD ...)" lines, no errors.

- [ ] **Step 3: Verify the two parent fixtures contain the *defective* code**

```bash
printf "match-creators visibility filters at parent (want 0): "
grep -c "profile_visibility" ../replay-bb736e82/supabase/functions/match-creators/index.ts || echo 0
printf "orchestrator org_id destructured from body at parent (want >=1): "
grep -c "org_id," ../replay-cc9624c2/supabase/functions/donny-orchestrator/index.ts || echo 0
```

Expected: first is `0` (the filter is absent — that is the defect the agent must find); second is `>= 1` (the client-supplied `org_id` is still being destructured).

If the first is non-zero, the fixture is wrong — you staged the fix, not the defect. Stop and re-check the `^`.

- [ ] **Step 4: Stage the Crews fixture by reconstruction, NOT by `^`**

`dc827171` is a **squash merge** with a single parent, and `dc827171^` contains **zero** `creator_group` migrations — the crew feature does not exist there, so the `^`-parent pattern used above cannot work. Stage at the merge itself, then restore only the pre-guard version of the notification function (which pre-existed the merge):

```bash
git worktree add --detach ../replay-dc827171 dc827171
git -C ../replay-dc827171 checkout dc827171^ -- supabase/functions/send-campaign-publish-notifications/index.ts
```

This is exact and hand-edit-free: it restores `.select("open_for_sponsorship")`, deletes the `if (campaign?.group_id) { … }` early return, **and deletes the 4-line explanatory comment above it** — which matters, because that comment names both the leak and the fix ("must NEVER be broadcast … would leak the private campaign's title + id to non-members"). Leaving it would hand the agent the answer.

- [ ] **Step 5: Verify the Crews fixture has the feature but not the guard**

```bash
printf "creator_group migrations present (want >=1): "
ls ../replay-dc827171/supabase/migrations/ | grep -ci "creator_group"
printf "group_id guard in notification fn (want 0): "
grep -c "group_id" ../replay-dc827171/supabase/functions/send-campaign-publish-notifications/index.ts || echo 0
```

Expected: first `>= 1`, second `0`. Both must hold — the crew feature present, the guard absent. That is the exact state in which the P1 existed.

- [ ] **Step 6: Record the Crews dispatch file list**

```bash
git show --stat --name-only --format="" dc827171 -- supabase/ \
  | grep -v "send-campaign-publish-notifications" | sort -u
```

Save this list. It is the Task-3 dispatch list for the Crews replay. **`send-campaign-publish-notifications` must be excluded** — the whole point of that replay is that the agent reaches it *unprompted, by grep*.

- [ ] **Step 7: Confirm fixtures are not tracked**

```bash
git status --short | grep -c "replay-" || echo 0
```

Expected: `0`. Git worktrees register in `.git/worktrees`, not the index, so nothing should appear. If anything does, do not commit it.

No commit in this task — fixtures are throwaway.

---

### Task 2: Write the agent file

**Files:**
- Create: `.claude/agents/data-exposure-reviewer.md`

**Interfaces:**
- Consumes: nothing at runtime.
- Produces: a dispatchable `subagent_type: "data-exposure-reviewer"`, used by Task 3, Task 4, and the Task 5 backstop line.

- [ ] **Step 1: Create the agent file with exactly this content**

````markdown
---
name: data-exposure-reviewer
description: >-
  Use BEFORE the Codex second review, and whenever a change touches a Supabase edge function that
  uses the service-role key, adds or changes an RLS policy, adds a SECURITY DEFINER function, or
  scopes a query by an org/tenant/campaign id. Reviews the changed backend files in an isolated
  context and returns a structured PASS/ISSUES verdict on ONE question: can this change let one
  actor reach data that isn't theirs? Read-only — it never edits, deploys, or migrates.
tools: Read, Grep, Glob
model: opus
---

# Data-Exposure Reviewer (DragonCandy)

You are a READ-ONLY reviewer. You answer exactly ONE question about a set of changed backend files:

**Can this change let one actor reach data that isn't theirs?**

You never edit, deploy, or run migrations. You return one structured verdict and nothing else.

## Why you exist

A Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely**. 86 of 90 edge
functions build one, plus 4 `_shared` modules (`auth.ts`, `fulfill-boost.ts`, `ingest-auth.ts`,
`outstand-mcp.ts`) whose defects inherit into every importer. Any read that (a) reaches a client or
an LLM and (b) relied on RLS for scoping is a leak unless the filter is **re-asserted in the query
itself**.

Defects in this class **run perfectly** — service-role is usually the correct credential. That is
exactly why the sibling `edge-function-reviewer` ("will this deploy and run?") returned PASS on a
branch containing a service-role IDOR and a client-controlled `org_id`. You are the "does it leak?"
lens that caught nothing before.

## Boundary — stay in your lane

- **`verify-db-schema`** (skill) asks: will it WORK for the intended actor? It has prod access and
  owns any verdict needing live DB state.
- **`edge-function-reviewer`** (agent) asks: will it DEPLOY and RUN? Bundling, `verify_jwt`, CORS.
- **You** ask: will it LEAK to unintended actors?

Never report bundling, `verify_jwt`, or CORS findings — not your job. Where a verdict depends on a
**live** RLS policy body, say so and defer to `verify-db-schema`; never imply you confirmed prod.

## Input

The dispatcher gives you:
1. a **changed-file list**, and
2. the **unified diff** for any file under `supabase/migrations/`.

**The changed-file list is a TRIGGER SET, not a READ SET.** This is the opposite of
`edge-function-reviewer`'s "do not fan out" rule. Checks 1 and 6 REQUIRE you to read and grep files
the diff never touched — that is precisely where this codebase's worst privacy defect lived. Fan out
freely when a check tells you to.

If invoked with **no file list**, say so plainly and ask for one. Never guess a scope.

RLS policy bodies come from `supabase/migrations/`, which is intent, not prod reality. Migrations are
append-only and a policy may be redefined across several files — always take the **latest definition
by migration filename timestamp**.

## Entry gate (cheap path first — a precondition, never a finding)

1. If **no supplied path** is under `supabase/functions/` or `supabase/migrations/`, return
   `VERDICT: PASS (N/A)` immediately with a one-line reason. Most diffs exit here.
2. Otherwise, determine whether any supplied file constructs a service-role client — **following
   `_shared/*` imports**, since that is how the 4 shared modules propagate. If none does AND no
   supplied migration touches RLS or `SECURITY DEFINER`, return `PASS (N/A)` with the reason.

## Checks — report every hit

1. **Visibility re-assertion — every branch, both siblings.** Service-role reads of
   `creator_profiles` / `business_profiles` must carry `.eq('profile_visibility','public')` on
   **every** branch (primary, fallback, retry, widening) and on **both** sibling tables. Grep for the
   table name, not the filter; count the query sites and confirm each one. A filter on
   `creator_profiles` is not done until `business_profiles` has it, including a second query to the
   same table in a different code path.

2. **Record-level ownership assertion.** Any id in a service-role query that originated from a
   **request body or an LLM tool call** needs an explicit access assertion before its data is
   returned — owner ∨ org-match ∨ participant.

3. **Field-level PII gate.** Authorization to see a record is not authorization to see every field
   on it. PII-bearing joins need their own narrower gate (e.g. other creators' ids exposed only to
   the campaign owner, not to a participant who legitimately passed check 2).

4. **Server-derived tenant ids.** Org/tenant ids come from the authenticated user's profile, never
   the request body; absence ⇒ `undefined` ⇒ authz **fails closed**, never `||` a client fallback.
   **Reading guidance, not a finding:** a declared-but-unused id field is evidence of nothing —
   always verify the call site. `donny-orchestrator/types.ts` declares `org_id?` while `index.ts`
   deliberately ignores it, and **both are correct**. Emitting an issue on the declaration alone
   would be a standing false positive.

5. **Membership status predicate.** Joins on `org_members` used for authorization or engagement need
   `invitation_status='active'`, not just `user_id`/`org_id` — otherwise a merely-invited user counts
   as a member.

6. **New privacy scope ⇒ pre-existing fan-out audit.** **Trigger-scoped:** fires only when the diff
   introduces a new scope column/enum (`group_id`, a `visibility` enum, a private tier). When it
   fires, grep for every **pre-existing** broadcast / fan-out / notification / digest / export /
   search path touching the affected table and prove each honours the new scope. The bug lives in
   code the feature branch never opened. A frontend "we don't call it in that case" is **never** the
   guard — the server-side check is.
   *Known limit:* you receive a diff only for `supabase/migrations/`, so a scope introduced outside a
   migration is out of this trigger's reach.

7. **No `select('*')`** in any service-role path whose output reaches a client or an LLM — a future
   migration silently widens it. PII exclusion belongs in the `.select()` column list, with the
   output type having no field for it.

8. **Definer grant completeness.** For a **new** SECURITY DEFINER function in the diff: server-only ⇒
   `REVOKE EXECUTE ... FROM public, anon, authenticated` — **all three**, because `FROM PUBLIC` alone
   is a **no-op** against Supabase's direct `anon`/`authenticated` grants. Client-callable ⇒ revoke
   `PUBLIC, anon`, then explicit `GRANT ... TO authenticated`.
   Report at `low` and defer to `verify-db-schema` for the verdict. **Never re-audit existing
   definers** — a 149-advisor sweep was deliberately shelved pre-launch.

## Severity

- **high** — a live leak: data reaches an actor who should not see it (cross-tenant, private
  profile, another user's PII).
- **med** — a real gap not yet reachable: the guard is missing but a second control currently
  prevents exposure. Fix required; not an active incident.
- **low** — hardening on currently-safe code. Label it as hardening, not a live leak.

**`_shared` blast radius:** when a changed file is itself under `supabase/functions/_shared/`, grep
its importers and use the count to calibrate severity — a defect in `auth.ts` or `ingest-auth.ts`
inherits into every importer, so it is rarely `low`.

## Output — return EXACTLY this shape, nothing else

```
VERDICT: PASS | PASS (N/A) | ISSUES

service-role: <yes — N files | no>
scope-change: <none | new scope `<col>` on `<table>` — fan-out audit run>

Issues (omit the list if PASS):
- [high|med|low] <file:line> — <rule name>: <what leaks, to whom> -> <fix>
```

Keep all file-reading detail in your own context; return only the verdict block.

## Gotchas (your own judgment)

- The most valuable finding is usually in a file the diff never touched. If check 6 fires and you
  only looked at the changed files, you have not run it.
- A fallback / retry / widening query is a separate query site. Patching the primary and missing the
  fallback re-opens the hole — that is a real incident here, not a hypothetical.
- Absence of a hit is not proof of safety. If you could not verify something, say so in the verdict
  rather than implying PASS.
- Do not invent findings to look useful. A clean PASS on clean code is the correct and valuable
  output; crying wolf trains the operator to ignore you.
````

- [ ] **Step 2: Verify least privilege (acceptance step 4)**

```bash
grep -E "^(tools|model):" .claude/agents/data-exposure-reviewer.md
grep -cE "Write|Edit|Bash|execute_sql|apply_migration|deploy_edge_function|mcp__" .claude/agents/data-exposure-reviewer.md
```

Expected:
```
tools: Read, Grep, Glob
model: opus
0
```

The `0` is the gate: no forbidden tool name may appear anywhere in the file, including prose.

- [ ] **Step 3: Verify the agent registers as a dispatchable type**

Attempt a trivial dispatch: `Agent(subagent_type: "data-exposure-reviewer", prompt: "Reply with exactly: REGISTERED")`.

Expected: it returns. **Known gotcha** — a newly created `.claude/agents/*.md` may not be picked up until the session reloads agent definitions. If dispatch errors with an unknown-agent-type, restart the session and retry. Do **not** substitute a `general-purpose` agent with the body pasted in as a workaround for Tasks 3–4: that path leaves tool-scoping unenforced, so a "passing" replay would prove nothing about the real agent.

- [ ] **Step 4: Commit**

```bash
git add .claude/agents/data-exposure-reviewer.md
git commit -m "feat(agents): data-exposure-reviewer subagent

Read-only reviewer for the dominant Codex P1 class — service-role RLS
bypass. Asks one question: can this change let one actor reach data that
isn't theirs? Complements edge-function-reviewer (does it run) and
verify-db-schema (does it work for the intended actor).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gv9HXydS5YD95EJP9wLNBn"
```

---

### Task 3: True-positive replay gate

**This is the acceptance gate.** A v1 that passes every other task but fails this one is not shippable. Expect to iterate the agent body here; that is the intended loop.

**Files:**
- Modify (as needed): `.claude/agents/data-exposure-reviewer.md`

**Interfaces:**
- Consumes: the three fixture paths and the Crews file list from Task 1; the dispatchable agent from Task 2.
- Produces: a validated agent. No new artefact.

- [ ] **Step 1: Replay A — `match-creators` (check 1)**

Dispatch `data-exposure-reviewer` with this prompt:

> Changed files (paths are inside a staged replay worktree — read them there):
> `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/replay-bb736e82/supabase/functions/match-creators/index.ts`
> No migration files changed.

Expected: `VERDICT: ISSUES` with a **check-1** hit on the `creator_profiles` fetch missing
`profile_visibility='public'`, naming **both** the primary and the **fallback** query site.

**Fail if** it reports only the primary. The fallback is the documented sharp edge — patching only the primary re-opened the hole in the real incident.

- [ ] **Step 2: Replay B — `donny-orchestrator` (checks 2 and 4)**

Dispatch with:

> Changed files (inside a staged replay worktree):
> `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/replay-cc9624c2/supabase/functions/donny-orchestrator/index.ts`
> `C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/replay-cc9624c2/supabase/functions/donny-orchestrator/agents/campaign.ts`
> No migration files changed.

Expected: `VERDICT: ISSUES` with **both**:
- a **check-2** hit — `campaignDetail` returns campaign data and applicant ids for a caller-supplied `campaignId` with no ownership assertion;
- a **check-4** hit — `org_id` is taken from the request body and used to scope service-role reads.

**Fail if** only one of the two appears.

- [ ] **Step 3: Replay C — Crews fan-out (check 6) — the sharpest test**

Dispatch with **the Task-1 Step-6 file list**, paths rewritten into `replay-dc827171`, and — critically — **without** `send-campaign-publish-notifications`. Include the crew migration diff, since check 6 triggers on a new scope column.

Expected: `VERDICT: ISSUES` with a **check-6** hit naming `send-campaign-publish-notifications` as a pre-existing broadcast path that does not honour `campaigns.group_id`, and stating the consequence — a private crew campaign's title and id emailed to the entire creator and brand base.

**Fail if** the verdict reports only crew-file findings and never names a fan-out path — *even if every finding it did report is correct*. Reaching that file unprompted, by grep, is the entire capability under test. Do not "fix" a failure here by adding the file to the dispatch list; that makes the check satisfiable with zero fan-out capability and voids the gate.

- [ ] **Step 4: Iterate until all three pass**

If any replay fails, edit `.claude/agents/data-exposure-reviewer.md` — sharpen the relevant check's wording, or strengthen the "TRIGGER SET, not a READ SET" instruction if the failure is a fan-out failure — then re-run **all three** replays (a wording change to fix one can weaken another).

Do not change the fixtures to make a replay pass. The fixtures encode real historical defects; if a fixture looks wrong, re-verify it against Task 1's expected output.

- [ ] **Step 5: Commit any agent revisions**

```bash
git add .claude/agents/data-exposure-reviewer.md
git commit -m "fix(agents): tune data-exposure-reviewer against replay gate

All three true-positive replays (match-creators #247, donny-orchestrator
#260, crews #226) now catch their documented defect.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gv9HXydS5YD95EJP9wLNBn"
```

Skip this step if Task 2's file needed no changes.

---

### Task 4: Noise gate

An agent that cries wolf gets ignored, so a clean run on clean code is a gating result, not a nicety.

**Files:**
- Modify (as needed): `.claude/agents/data-exposure-reviewer.md`

**Interfaces:**
- Consumes: the agent from Tasks 2–3.
- Produces: a noise-validated agent.

- [ ] **Step 1: True-negative — a known-clean backend diff (acceptance step 2)**

Dispatch against the **current** (post-fix) `landing-clips` edge function, which is Codex-clean and passes all 8 checks by inspection:

> Changed files:
> `supabase/functions/landing-clips/index.ts`
> `supabase/functions/landing-clips/lib.ts`
> No migration files changed.

Expected: `VERDICT: PASS` with **no issues**.

**Fail on any invented finding.** Deliberately not PR #288 — that is frontend-only presentational work, so it would hit the entry gate and test nothing.

- [ ] **Step 2: Entry gate — frontend-only list (acceptance step 3)**

Dispatch with:

> Changed files:
> `src/components/app/AppCard.tsx`
> `src/components/app/AppChip.tsx`

Expected: `VERDICT: PASS (N/A)` with a one-line reason, and **no backend files read**. The verdict should arrive fast — this is the cheap path that makes routine dispatch affordable.

- [ ] **Step 3: Regression check**

If Step 1 or 2 required an agent edit, re-run **all three Task-3 replays**. Tightening for noise can blunt a true positive; both gates must hold simultaneously.

- [ ] **Step 4: Commit any revisions**

```bash
git add .claude/agents/data-exposure-reviewer.md
git commit -m "fix(agents): data-exposure-reviewer noise gate

Clean PASS on a known-clean backend diff (landing-clips) and PASS (N/A)
on a frontend-only file list, with the true-positive replays re-verified.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gv9HXydS5YD95EJP9wLNBn"
```

Skip if no changes were needed.

---

### Task 5: Wire the backstop, remove fixtures, finish

**Files:**
- Modify: `.claude/skills/codex-review/SKILL.md:14-27` (the `## Steps` block)
- Remove: all three `.claude/worktrees/replay-*` worktrees

**Interfaces:**
- Consumes: the validated agent.
- Produces: the deterministic dispatch path. Nothing downstream.

- [ ] **Step 1: Insert the dispatch step**

In `.claude/skills/codex-review/SKILL.md`, replace the `## Steps` block (currently steps 1–3, lines 14–27) with this. The existing steps shift 1→2, 2→3, 3→4 — expected, not a conflict:

````markdown
## Steps

1. **Dispatch `data-exposure-reviewer` first** if the branch touches `supabase/functions/` or
   `supabase/migrations/`. Give it the changed-file list plus the unified diff for any migration
   file. Resolve every `high` and `med` finding before running Codex — service-role RLS bypass is
   the single most common Codex P1 on this project, and front-running it is what keeps the Codex
   loop from running 10+ rounds. Skip only for a frontend-only or docs-only branch.

2. From the worktree, run the review against the base branch:
   ```bash
   codex review --base main --title "<short title>"
   ```
   Other modes: `--uncommitted` (staged/unstaged/untracked), `--commit <sha>` (one commit).
   (Codex CLI is installed: `codex-cli`, at `~/AppData/Roaming/npm/codex`.)

3. **Act on findings.** If Codex flags real issues, Claude fixes them, then **re-run** Codex
   until it's clean. Don't merge with unaddressed real findings.

4. **Relay the verdict** to the user — quote Codex's summary line.
````

- [ ] **Step 2: Verify the backstop (acceptance step 5)**

```bash
grep -n "data-exposure-reviewer" .claude/skills/codex-review/SKILL.md
grep -nE "^[0-9]\." .claude/skills/codex-review/SKILL.md
```

Expected: the agent named once in step 1, and steps numbered `1.` `2.` `3.` `4.` with no duplicates or gaps.

- [ ] **Step 3: Remove the fixture worktrees**

```bash
git worktree remove --force ../replay-bb736e82
git worktree remove --force ../replay-cc9624c2
git worktree remove --force ../replay-dc827171
git worktree list
```

Expected: no `replay-` entries remain. `--force` is required because the Crews fixture has a modified file by design.

- [ ] **Step 4: Confirm the branch contains only the two intended files**

```bash
git diff --stat main...HEAD
```

Expected: exactly `.claude/agents/data-exposure-reviewer.md`, `.claude/skills/codex-review/SKILL.md`, and `docs/superpowers/specs/2026-07-19-data-exposure-reviewer-design.md` (committed during brainstorming), plus this plan file. **No `replay-` paths, no `supabase/` changes.** If any `supabase/` file appears, a fixture edit leaked into the branch — revert it.

- [ ] **Step 5: Commit**

```bash
git add .claude/skills/codex-review/SKILL.md
git commit -m "feat(skills): dispatch data-exposure-reviewer before Codex

Deterministic backstop — auto-invocation via description: is best-effort
and not test-verifiable, so the pre-Codex dispatch is hard-wired the same
way edge-function-reviewer's is wired into careful.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Gv9HXydS5YD95EJP9wLNBn"
```

- [ ] **Step 6: Branch finish**

This branch is **pure markdown** — no code, no schema, no edge function, no deploy. Two consequences:

- `codex-review/SKILL.md` itself says "Docs-only changes (pure markdown) may skip Codex; the standard targets code." Confirm with the user whether to run Codex anyway rather than assuming either way.
- No `npm run build` / `typecheck` gate applies (nothing in `src/` or `supabase/` changed), but run `npm run test` once to confirm the branch broke nothing incidentally.

Then invoke the **`knowledge-sync`** skill per `CLAUDE.md:162`. **One** raw session source is due: this work.

> **Correction (2026-07-19).** This step originally called for a second source — a "PR #288 backfill" for a missing light-theme Phase 4 sync. **That gap never existed.** It was asserted from this worktree, which was 15 commits behind `origin/main`, where PR #290 had already done the sync and PR #291 verified it. Writing a second source would have duplicated PR #290. Verify a claimed knowledge gap against `origin/main`, never a worktree.

---

## Self-Review

**Spec coverage.** Component/frontmatter → Task 2 Step 1. Tool least-privilege → Task 2 Step 2 + Global Constraints. Dispatch contract (trigger-set-not-read-set, unified diff for migrations, no-file-list fallback) → agent body, exercised by Task 3 Step 3. Entry gate (path-prefix first, then `_shared`-following) → agent body + Task 4 Step 2. All 8 checks → agent body; checks 1, 2, 4, 6 have dedicated replays; checks 3, 5, 7, 8 are covered by the body and by Task 4's noise gate (they must not false-positive on clean code). Output shape + three severity bands + `_shared` blast radius → agent body. Backstop → Task 5 Steps 1–2. All five spec acceptance steps map: 1→Task 3, 2→Task 4 Step 1, 3→Task 4 Step 2, 4→Task 2 Step 2, 5→Task 5 Step 2. Deferred open items are carried into Task 5 Step 6 (PR #288) or left untouched (Harbormill port, verify-prod runner, killed kit reviewer).

**Known coverage gap, stated rather than hidden:** checks 3, 5, 7, 8 have no true-positive replay — the incidents behind them (`isOwnerRole` gate, `invitation_status`, `select('*')`, three-role revoke) are either already-correct code or preventive, so no pre-fix commit stages them. They are validated negatively (no false positives) but not positively. Acceptable for v1; building fixtures for them would cost more than the checks are worth until one of them fires in anger.

**Placeholder scan:** clean. Every step carries its literal command or the full file content; no "TBD", no "similar to Task N", no "add appropriate handling".

**Consistency:** agent name `data-exposure-reviewer` is identical in the frontmatter, all dispatch prompts, the `codex-review` step, and both verification greps. Fixture paths use one form (`.claude/worktrees/replay-<sha>`) throughout. Check numbering in the replay expectations matches the body's numbering 1–8.
