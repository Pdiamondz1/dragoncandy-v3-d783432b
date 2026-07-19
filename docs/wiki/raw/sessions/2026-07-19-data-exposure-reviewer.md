# Session — data-exposure-reviewer subagent (2026-07-19)

Branch: `worktree-dc-improvements-3` · 100% markdown (no code, schema, edge fn, or deploy)
Commits: spec → plan → agent → 2 fix waves → backstop → findings handoff

## What prompted it

The ask was "this project only has 1 sub-agent — can we port the sub-agents from Harbormill AIOS?"

**The premise did not hold.** Harbormill AIOS has **zero** custom subagents: no `.claude/agents/`,
nothing in git history, no plugin manifests. Its entire agent layer is *skills*. On inspection
DragonCandy is ahead on two of the four candidates — `loop-audit` is behind DC's shipped Loop Scout
(which verifies its conditions with live PostgREST probes and dedupes via stable fingerprints, where
`loop-audit` only reasons and writes a dated file), and `validator-forge` grades done-rules as prose
where DC shipped the `{done,checklist,missing}` contract `parseDoneCheck` consumes. Only
`wiki-gardener` is a genuine DC capability gap. **The valuable porting direction is DC → Harbormill.**

That reframed the work: not "add more subagents" but "is there *one* that is actually justified?"

## The evidence that justified exactly one

`PROJECT_CONTEXT.md` (pre-split) recorded, for PR #260:

> "edge-function-reviewer **PASS** on both; Codex clean (**1 P1 fixed**)"

That branch closed a **service-role IDOR** in `campaignDetail` and made `org_id` server-side-only
("a client value could point at another tenant"). The existing subagent returned PASS on code
containing both.

Why: `edge-function-reviewer` asks *"will this deploy and run?"* Its auth item is about the function
401ing; its RLS mention is one clause at the bottom of a six-item list topped by bundling and
`verify_jwt`. **A buried checkbox is not a specialty.** The defects in this class *run perfectly* —
service-role is the correct credential. Bypassing RLS obligates the query to re-assert what RLS would
have enforced, and nothing reviewed for that across **86 of 90** edge functions.

Cost, quantified from the same records: **14 Codex rounds** on one branch, 10 on another, 8-fix loops
twice, "clean after 4 fix waves" twice.

## The boundary (what unblocked the 2026-07-07 deferral)

That audit deferred this candidate (as `rls-migration-reviewer`) on "`~` partial non-redundancy" with
`verify-db-schema`. Resolved with a one-sentence split — three non-overlapping questions:

| Reviewer | Question | Kind |
|---|---|---|
| `verify-db-schema` (skill) | Will it **work** for the intended actor? | deterministic, prod-grounded |
| `edge-function-reviewer` (agent) | Will it **deploy and run**? | mechanical |
| `data-exposure-reviewer` (new) | Will it **leak** to unintended actors? | judgment |

Renamed from `rls-migration-reviewer` because the evidence is mostly **not** in migrations — it is in
service-role query call sites. Name the failure mode, not the mechanism.

## What shipped

- `.claude/agents/data-exposure-reviewer.md` — project-scoped, `tools: Read, Grep, Glob`, `model: opus`.
- One dispatch line in `.claude/skills/codex-review/SKILL.md` (steps renumbered 1→2, 2→3, 3→4).

**`model: opus`, not `sonnet`** — the "cheap specialists" guidance assumes symmetric error cost, which
does not hold when a miss is a cross-tenant leak in a live marketplace. Sonnet-tier
`edge-function-reviewer` demonstrably missed this class.

**No MCP tools.** `execute_sql` was rejected (it runs DDL/DML — breaks the read-only guarantee);
`list_tables`/`get_advisors` were granted then **dropped** in review because no check used them, and
`get_advisors` would surface the deliberately-shelved 149-advisor set. Consequence stated in the body
rather than hidden: policy bodies are read from `supabase/migrations/` (intent, not prod), taking the
**latest definition by filename timestamp**, and any verdict needing live state defers to
`verify-db-schema`.

**Dispatch contract keystone — the changed-file list is a TRIGGER SET, not a READ SET.** This is the
*opposite* of `edge-function-reviewer.md`'s "do not fan out to unrelated functions", and it is stated
emphatically because an implementer mirroring the sibling would build the wrong agent. The agent has
no `Bash`, so the dispatcher supplies the file list plus the unified diff for migration files.

## Validation — the fixtures are the tests

Three historical defects re-staged as detached git worktrees under `.claude/worktrees/replay-<sha>`,
built **before** the agent so the acceptance gate existed before the thing it gated. All three passed:

- **`bb736e82^`** (`match-creators`) — caught the missing `profile_visibility` filter on **both** the
  primary and the **fallback** query site. Fallback-only was the explicit fail condition: patching the
  primary alone re-opened the hole in the real incident.
- **`cc9624c2^`** (`donny-orchestrator`) — caught the ungated `campaignDetail` **and** the
  client-supplied `org_id`. Notably it *ruled out* the documented false-positive trap by checking call
  sites, rather than firing on the `types.ts` declaration.
- **Crews (PR #226)** — the sharpest test. It reached `send-campaign-publish-notifications`
  **unprompted, by grep** (that file was deliberately excluded from its input) and flagged the
  platform-wide broadcast leak — the P1 that took an adversarial review to find after 14 Codex rounds.

**The Crews replay needed reconstruction, not a `^` checkout.** `dc827171` is a squash merge whose
parent contains **zero** `creator_group` migrations — the feature does not exist there. Staged instead
at the merge, then `git checkout dc827171^ -- <notification fn>` restored the pre-guard file exactly,
including deleting the 4-line comment that names both the leak and the fix (leaving it would hand the
agent the answer).

Noise gate: clean `PASS` on `landing-clips` with **zero invented findings**, and `PASS (N/A)` in 5
seconds with **0 tool calls** on a frontend-only list.

## The hole the validation suite disguised

The Opus whole-branch review caught what the replays could not: **the entry gate could gate out
check 6**, the flagship capability. The gate exited `PASS (N/A)` unless a file built a service-role
client *or* a migration touched RLS/`SECURITY DEFINER` — but check 6 triggers on a **new scope
column**, which the gate never asked about.

Verified concretely: `20260709120010_campaigns_group_id.sql` is `ALTER TABLE ... ADD COLUMN` plus an
index — **0** occurrences of `policy`, **0** of `security definer`. Dispatched alone it failed both
conditions. The Crews replay passed only because 16 *sibling* migrations happened to hold the gate
open — incidental, not by design.

**Durable lesson: a test suite can appear to cover a capability while exercising it only through an
unrelated precondition.** Fixed (the gate now also opens on a scope column) and regression-tested with
a scope-column-only dispatch, which now fires the fan-out audit and reaches six service-role files.

Also fixed: check 8's `low` definer-grant findings had no route to the one reviewer that can
adjudicate them, so `codex-review` step 1 now routes them to `verify-db-schema`.

## What the agent found on its first real runs

The regression dispatch ran against live code and surfaced a cluster of **unfixed vulnerabilities on
`origin/main`**. Five were independently verified against `origin/main` by the controller; one was not
and is marked as such. Filed in
`.claude/handoffs/2026-07-19-service-role-exposure-findings.md` for a **dedicated branch** — not fixed
here, because each is an edge-function change needing a deploy, the `careful` gate, and Codex.

Sharpest case — `donny-chat/index.ts`, same file, 58 lines apart:
- `:1237` `match_creators` **has** `.eq("profile_visibility","public")`, commented *"don't surface
  private creators via the service role (RLS-bypass)"*
- `:1295` `get_creator_profile` reads by LLM-supplied `creator_id`, selects `base_rate_per_hour` and
  `portfolio_urls`, **no filter**

The fix was applied at one query site and missed at its sibling — precisely the failure the agent was
built to catch. These survived 14 Codex rounds, an adversarial review, and PRs #246/#247/#260.

## Process notes

- **Agent registration needs a session reload.** A newly created `.claude/agents/*.md` is not in the
  roster until then; dispatch fails with "Agent type not found". Tasks 3–4 blocked on this mid-plan.
  The tempting workaround — pasting the body into a `general-purpose` agent — was **refused**: it
  leaves tool-scoping unenforced, so a "passing" replay would prove nothing.
- **Subagents could not reliably resolve the agent roster**, so the two verification tasks were run by
  the controller rather than dispatched. Decided in pre-flight, not discovered mid-plan.
- Spec passed **4 rounds** of independent review. Round 3 hypothesised the `dc827171` squash-merge
  problem without being able to run git; the controller confirmed it. Round 2 caught that the Crews
  replay had been **rigged** by supplying the notification file.

## Correction recorded against this session

An earlier claim in this session — that PR #288 (light-theme Phase 4) shipped without its
knowledge-sync — was **wrong**, and was asserted repeatedly before being caught. It came from checking
*this worktree*, 15 commits behind `origin/main`, where PR #290 had already done the sync and PR #291
verified it. The stale-worktree gotcha is documented, and was walked into anyway. Retracted in the
spec and plan rather than deleted, so the error stays traceable.
