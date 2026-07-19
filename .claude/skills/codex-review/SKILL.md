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

2. From the worktree, run the review against the base branch:
   ```bash
   codex review --base main --title "<short title>"
   ```
   Other modes: `--uncommitted` (staged/unstaged/untracked), `--commit <sha>` (one commit).
   (Codex CLI is installed: `codex-cli`, at `~/AppData/Roaming/npm/codex`.)

3. **Act on findings.** If Codex flags real issues, Claude fixes them, then **re-run** Codex
   until it's clean. Don't merge with unaddressed real findings.

4. **Relay the verdict** to the user — quote Codex's summary line.

## Notes

- Codex's sandbox may reject some of its own shell commands ("blocked by policy"); it falls
  back and still completes a full diff pass — that's expected, not a failure.
- This complements, never replaces, Claude's own reviews — the point is two independent models.
- Docs-only changes (pure markdown) may skip Codex; the standard targets code.
- Distinct from `/code-review ultra` (the user-triggered, billed multi-agent cloud review).
