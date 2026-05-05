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

## Changes

### 1. CLAUDE.md — New "Session Continuity" Section

Added after the "Important Rules" section. Contains:

- **Resuming Work**: Tiered behavior at session start (explicit continue → load silently; ambiguous + fresh handoff → load and note; unrelated → ignore).
- **Creating Handoffs**: Invoke `session-handoff` skill at plan-phase boundaries, workstream switches, or heavy-context session endings. Explicitly lists what does NOT need a handoff.
- **Relationship table**: Memory vs PROJECT_CONTEXT vs Handoffs vs Git log — purpose and cadence for each.

### 2. PROJECT_CONTEXT.md — Two Additions

**Section 5 (Active Workstreams)**: Update the "Workflow discipline" line to mention handoffs at plan-phase boundaries.

**Section 7 (Key Principles & Learnings)**: New paragraph documenting session handoffs as the multi-session continuity mechanism, with clear delineation from memory and git log.

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

## Scope

- Two files modified: `CLAUDE.md`, `docs/PROJECT_CONTEXT.md`
- No new dependencies, no scripts added to repo, no schema changes
- Relies on existing `session-handoff` skill installation (user-level, already present)
