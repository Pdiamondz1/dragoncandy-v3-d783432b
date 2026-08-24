---
name: codex-review
description: "Run Codex as the mandatory independent second reviewer of Claude's code before finishing a branch / opening a PR. Use when wrapping up changes, before 'gh pr create', or when asked to 'run codex', 'second review', 'codex review'. Complements the built-in /code-review."
---

# Codex Second Review

Codex is a **required** second reviewer of Claude Code's work on this project (a second,
independent model catches blind spots a single model's reviews share). Run it AFTER
Claude's own reviews are green (subagent spec + code-quality reviews, or `/code-review`)
and BEFORE finishing a branch / opening a PR. Not optional. See
[[feedback_codex_second_review]].

## Steps

1. **Dispatch `data-exposure-reviewer` first** if the branch touches `supabase/functions/` or
   `supabase/migrations/`. Give it the changed-file list plus the unified diff for any migration
   file. Resolve every `high` and `med` finding before running Codex — service-role RLS bypass is
   the single most common Codex P1 on this project, and front-running it is what keeps the Codex
   loop from running 10+ rounds. Route any `low` definer-grant finding to the `verify-db-schema`
   skill instead of dismissing it — that's the one class `data-exposure-reviewer` explicitly can't
   adjudicate without prod access, and `verify-db-schema` is the reviewer that can. Skip only for a
   frontend-only or docs-only branch.

2. From the worktree, run the review against the base branch — **`origin/main`, never `main`**:
   ```bash
   git fetch origin
   codex review --base origin/main --title "<short title>"
   ```
   Other modes: `--uncommitted` (staged/unstaged/untracked), `--commit <sha>` (one commit).
   (Codex CLI is installed: `codex-cli`, at `~/AppData/Roaming/npm/codex`.)

   **Why the ref matters, from a real false finding (2026-08-24).** `--base main` resolves the
   **local** `main` ref, which in a worktree is whatever it was when the worktree was created and
   is updated by nothing — the repo has 30+ worktrees and a documented habit of local `main` drifting
   100+ commits behind. On PR #498 local `main` was two commits stale, so Codex diffed against a tree
   where the previous PR had never merged. It re-reviewed already-merged work as if new, and filed a
   confident P2 — "the index drops the canonical Instagram connector concept" — about a line sitting
   in the file at that moment. It had reasoned from the diff rather than reading the file, and the
   diff was of the wrong thing.

   Two things follow. **A stale base makes the gate weaker in the direction that matters**: the diff
   grows, attention spreads over code that already shipped, and this branch's actual changes get less
   of it. And a wrong base produces findings that are *coherent* rather than obviously broken, so
   they survive a skim. **Before acting on any finding, check the claim against the file** — the
   refutation here was one `grep`. Same discipline as step 3's "fix real issues": establish the
   finding is real first.

3. **Act on findings.** If Codex flags real issues, Claude fixes them, then **re-run** Codex
   until it's clean. Don't merge with unaddressed real findings.

4. **Relay the verdict** to the user — quote Codex's summary line.

## Notes

- Codex's sandbox may reject some of its own shell commands ("blocked by policy"); it falls
  back and still completes a full diff pass — that's expected, not a failure.
- **Confirm the diff is non-empty before trusting any verdict** (`git diff origin/main...HEAD --stat`).
  A clean verdict over an empty range is false assurance on an unreviewed branch — the worst failure
  a review gate has. This bites on a fresh branch whose work is staged but not committed, where HEAD
  still equals the base.
- This complements, never replaces, Claude's own reviews — the point is two independent models.
- Docs-only changes (pure markdown) may skip Codex; the standard targets code.
- Distinct from `/code-review ultra` (the user-triggered, billed multi-agent cloud review).
