# Session Handoff Integration

## Summary

Incorporate the session-handoff system into DragonCandy's standard operating workflow by adding behavioral rules to CLAUDE.md and strategic context to PROJECT_CONTEXT.md. This ensures every Claude Code session knows how to resume multi-session work and when to preserve state for future sessions.

## Motivation

DragonCandy operates with a single-agent sequential workflow. Complex work (15-task audits, multi-section launch playbooks) spans many sessions. Without explicit continuity rules, each new session re-derives context from scratch — reading plan files, git log, and guessing what came before. The session-handoff system already exists as a skill and has been used once (architecture audit). Formalizing it in project docs makes the behavior consistent and automatic.

## Design Decisions

| Decision | Chosen | Alternatives Considered | Rationale |
|----------|--------|------------------------|-----------|
| Integration depth | Skill-referenced (Approach A) | Self-contained in CLAUDE.md (B), Hybrid with repo README (C) | Minimal diff, no duplication, leverages existing skill tooling. Upgrade path to B/C exists if team grows. |
| Handoff triggers | Milestone-based | Proactive/every session, On-request only, Resume-focused only | Matches existing plan-task execution model. Small fixes don't need handoffs (git log suffices). |
| Resume behavior | Always check, tiered response | Always prompt user, Only on explicit "continue" | Respects "less typing = more margin." No question asked — system infers from user's first message. |
| Relationship to memory | Complement (clear separation) | Handoffs absorb memory duties, Minimal overlap concern | Memory holds durable facts; handoffs hold decaying execution state. Different cadences, different purposes. |

## Session-Handoff Skill Output

The `session-handoff` skill produces a markdown file at `.claude/handoffs/YYYY-MM-DD-HHMMSS-[slug].md` containing: Session Metadata (timestamp, branch, recent commits), Current State Summary, Critical Files table, Work Completed, Pending Work (immediate next steps, blockers, deferred items), Important Context, Assumptions, Potential Gotchas, and Environment State. The skill also provides validation (completeness/security checks) and staleness detection (FRESH/SLIGHTLY_STALE/STALE/VERY_STALE based on time and git divergence).

## Changes

### 1. CLAUDE.md — New "Session Continuity" Section

Insert the following verbatim after the "Important Rules" section (before "Environment Variables"):

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
```

### 2. PROJECT_CONTEXT.md — Two Additions

**Section 5 (Active Workstreams)**: Replace the existing "Workflow discipline" line:

Before:
```
**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. OpenClaw multi-agent (Scout/Forge/
Athena/Guardian) deferred to post-launch.
```

After:
```
**Workflow discipline**: Single Claude Code agent, one prompt at a time
→ `npm run build` → verify → push. Session handoffs at plan-phase
boundaries (see `.claude/handoffs/`). OpenClaw multi-agent (Scout/Forge/
Athena/Guardian) deferred to post-launch.
```

**Section 7 (Key Principles & Learnings)**: Add the following paragraph after the "Parallel agents = merge conflict risk" bullet:

```
**Session handoffs preserve multi-session continuity.** Work that spans
multiple sessions (plan execution, multi-task audits, staged rollouts)
produces a handoff document in `.claude/handoffs/` at natural breakpoints.
Fresh sessions check for active handoffs before starting. Handoffs carry
execution state (what's done, what's next, gotchas discovered); they
complement — not replace — memory (durable facts) and git log (change
history).
```

## What This Deletes

Nothing removed from existing docs. The additions are additive rules that codify behavior already being practiced informally.

## What This Simplifies

- New sessions no longer need to guess whether prior work exists — the check is automatic.
- The boundary between memory, handoffs, and git log is explicit — no more ambiguity about where to persist what.

## What This Automates

- Resume detection at session start (tiered inference from user's first message).
- Handoff creation triggered by natural workflow milestones rather than manual memory.

## Keystroke Count Removed

Zero keystrokes removed from the user — this is infrastructure that makes Claude Code's behavior more consistent without additional user input. The user no longer needs to explicitly say "check if there's a handoff" or "save state before we stop."

## Verification

Implementation is complete when:
- [ ] `CLAUDE.md` contains the "Session Continuity" section with all three subsections (Resuming Work, Creating Handoffs, Relationship to Other Persistence)
- [ ] `docs/PROJECT_CONTEXT.md` Section 5 "Workflow discipline" line includes "Session handoffs at plan-phase boundaries"
- [ ] `docs/PROJECT_CONTEXT.md` Section 7 contains the "Session handoffs preserve multi-session continuity" paragraph
- [ ] `npm run build` passes (no syntax/import issues introduced)
- [ ] A fresh Claude Code session reading CLAUDE.md can determine: (a) where handoffs live, (b) when to check for them, (c) when to create them, (d) how handoffs relate to memory and git log

## Scope

- Two files modified: `CLAUDE.md`, `docs/PROJECT_CONTEXT.md`
- No new dependencies, no scripts added to repo, no schema changes
- Relies on existing `session-handoff` skill installation (user-level, already present)
