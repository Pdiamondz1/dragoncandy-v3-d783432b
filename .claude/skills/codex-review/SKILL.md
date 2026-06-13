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

1. From the worktree, run the review against the base branch:
   ```bash
   codex review --base main --title "<short title>"
   ```
   Other modes: `--uncommitted` (staged/unstaged/untracked), `--commit <sha>` (one commit).
   (Codex CLI is installed: `codex-cli`, at `~/AppData/Roaming/npm/codex`.)

2. **Act on findings.** If Codex flags real issues, Claude fixes them, then **re-run** Codex
   until it's clean. Don't merge with unaddressed real findings.

3. **Relay the verdict** to the user — quote Codex's summary line.

## Notes

- Codex's sandbox may reject some of its own shell commands ("blocked by policy"); it falls
  back and still completes a full diff pass — that's expected, not a failure.
- This complements, never replaces, Claude's own reviews — the point is two independent models.
- Docs-only changes (pure markdown) may skip Codex; the standard targets code.
- Distinct from `/code-review ultra` (the user-triggered, billed multi-agent cloud review).
