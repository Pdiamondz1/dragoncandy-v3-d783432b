# Session Handoff Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add session-handoff behavioral rules to CLAUDE.md and PROJECT_CONTEXT.md so every Claude Code session knows when to resume from and when to create handoff documents.

**Architecture:** Documentation-only change. Two existing markdown files receive additive sections that formalize the handoff workflow already in use. No code, no tests, no dependencies.

**Tech Stack:** Markdown, Git

**Spec:** `docs/superpowers/specs/2026-05-04-session-handoff-integration-design.md`

---

### Task 1: Add "Session Continuity" Section to CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:293` (insert between the `\---` after "Important Rules" and the `## Environment Variables` heading)

- [ ] **Step 1: Insert the Session Continuity section**

In `CLAUDE.md`, insert the following block between line 293 (`\---`) and line 295 (`## Environment Variables`). The new section becomes its own `## ` heading between the two existing horizontal rules:

```markdown

## Session Continuity

Work that spans multiple sessions uses handoff documents stored in `.claude/handoffs/`.

### Resuming Work

At the start of every session, check `.claude/handoffs/` for existing handoffs:
- **User explicitly continues** ("pick up where we left off", "continue the audit", "what's next") → Load the freshest relevant handoff and begin working from its "Immediate Next Steps"
- **Ambiguous request that could relate to an active handoff** → Load it and note: "Loaded handoff context for [X]." The user can redirect if wrong
- **Clearly unrelated request** → Do not mention handoffs

When loading a handoff, verify its context still holds: check the branch, confirm referenced files exist, and review git log for commits since the handoff was created.

### Creating Handoffs

Invoke the `session-handoff` skill to create a handoff at these moments:
- Completing a plan phase or task batch with more work remaining
- Before switching to a different workstream
- When context is heavy and the session is ending with pending work

Do NOT create handoffs for:
- Small self-contained fixes (git log is sufficient)
- Work that completed fully within the session
- Sessions with no meaningful state to preserve

### Relationship to Other Persistence

| Layer | Purpose | Update cadence |
|-------|---------|----------------|
| Memory (`.claude/...memory/`) | Durable user/project facts, preferences, feedback | When new facts are learned |
| PROJECT_CONTEXT.md | Project identity, strategy, principles, stack | Monthly or at major milestones |
| Handoffs (`.claude/handoffs/`) | In-flight execution state, next steps, gotchas | Per work session or plan phase |
| Git log | What changed and why | Per commit |

\---

```

The result should be: `## Important Rules` → rules list → `\---` → `## Session Continuity` → subsections → `\---` → `## Environment Variables`.

- [ ] **Step 2: Verify the file parses correctly**

Run: `npm run build`
Expected: Build succeeds (CLAUDE.md is not imported by code, but this confirms no unintended side effects from any file watchers or config that references it).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add Session Continuity rules to CLAUDE.md"
```

---

### Task 2: Update PROJECT_CONTEXT.md Section 5 — Workflow Discipline Line

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md:72-74`

- [ ] **Step 1: Replace the workflow discipline line**

In `docs/PROJECT_CONTEXT.md`, find lines 72-74:

```
**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. OpenClaw multi-agent (Scout/Forge/
Athena/Guardian) deferred to post-launch.
```

Replace with:

```
**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. Session handoffs at plan-phase
boundaries (see `.claude/handoffs/`). OpenClaw multi-agent (Scout/Forge/
Athena/Guardian) deferred to post-launch.
```

- [ ] **Step 2: Commit**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs: add session handoff reference to workflow discipline"
```

---

### Task 3: Add Handoff Paragraph to PROJECT_CONTEXT.md Section 7

**Files:**
- Modify: `docs/PROJECT_CONTEXT.md:108-109` (insert after the "Parallel agents" paragraph)

- [ ] **Step 1: Insert the handoff principle paragraph**

In `docs/PROJECT_CONTEXT.md`, after lines 108-109:

```
**Parallel agents = merge conflict risk during launch week.** Sequential
single-agent workflow until post-launch stabilization.
```

Insert the following new paragraph (with a blank line before it):

```

**Session handoffs preserve multi-session continuity.** Work that spans
multiple sessions (plan execution, multi-task audits, staged rollouts)
produces a handoff document in `.claude/handoffs/` at natural breakpoints.
Fresh sessions check for active handoffs before starting. Handoffs carry
execution state (what's done, what's next, gotchas discovered); they
complement — not replace — memory (durable facts) and git log (change
history).
```

- [ ] **Step 2: Commit**

```bash
git add docs/PROJECT_CONTEXT.md
git commit -m "docs: add session handoff principle to PROJECT_CONTEXT.md"
```

---

### Task 4: Final Verification

- [ ] **Step 1: Run build to confirm no issues**

Run: `npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Verify all three insertions are present**

Run these checks:

```bash
grep -c "## Session Continuity" CLAUDE.md
# Expected: 1

grep -c "Session handoffs at plan-phase" docs/PROJECT_CONTEXT.md
# Expected: 1

grep -c "Session handoffs preserve multi-session continuity" docs/PROJECT_CONTEXT.md
# Expected: 1
```

- [ ] **Step 3: Verify handoff directory exists and is referenced correctly**

```bash
ls .claude/handoffs/
# Expected: at least one file (2026-05-04-232158-code-architecture-audit-remediation.md)
```

All three grep checks return `1` and the handoffs directory exists → implementation complete.
