---
name: worktree-cleanup
description: "Safely remove completed git worktrees and their branches under .claude/worktrees/. Use when asked to 'clean up worktrees', 'delete old/merged worktrees', or after PRs merge. Runs merged/clean/no-live-session/not-current safety gates before deleting anything."
---

# Worktree Cleanup

Work happens in many worktrees under `.claude/worktrees/`. After a worktree's work
ships, remove it + its branch — but **never blindly**. Reclaims disk (each worktree can
carry its own `node_modules`) and de-clutters `git worktree list`.

A blind hook is the wrong tool — safe deletion needs the judgment below. This is an
agent-followed routine. Related: [[refresh-main]].

## Safety gates — a worktree is safe to delete only if ALL hold

1. **Merged / shipped** — `git merge-base --is-ancestor <head> origin/main`. If it shows
   "ahead" (squash-merge artifact), verify content shipped: `git cherry -v origin/main <branch>`,
   and for any `+` commit check each changed file exists in main
   (`git cat-file -e origin/main:<file>`). **Files absent from main = real unmerged work → KEEP.**
2. **Clean** — `git -C <worktree> status --porcelain` empty. If dirty, first save any non-junk
   untracked `.md` docs onto a `chore/worktree-preserved-docs` branch; screenshots / `.temp/` /
   lockfile noise are disposable. Note `git stash list` (stashes are global, survive removal — but flag them).
3. **No live session** — list the working directory of every running `claude` process and treat
   any worktree that appears as OFF LIMITS:

   ```bash
   lsof -a -d cwd -c claude -Fn | grep '^n' | sed 's/^n//' | sort -u
   ```

   NEVER remove a worktree (or delete its branch) while a session is live in it — it orphans that
   session. Skip it; tell the user. Never kill the session.

   **Do NOT match on a `--worktree` flag.** The old gate here was a PowerShell
   `Get-CimInstance Win32_Process | ? { $_.CommandLine -match "--worktree" }`, and on macOS the
   CLI process is plain `claude` with **no `--worktree` in its command line** — so that test
   returns nothing even when a session IS live, i.e. it **fails open** and licenses exactly the
   deletion this gate exists to prevent. Verified 2026-08-14: `pgrep -f -- --worktree` found
   nothing while a session was demonstrably running in `DC-apple-IOS`, which the `lsof` cwd check
   above found correctly. Match on the process's cwd, not on its arguments.
4. **Not the current worktree** — you can't self-delete the one you're running in.

## Steps

1. `git worktree list` and classify each against the gates above (skip the main checkout root).
2. For safe + clean worktrees: `git worktree remove .claude/worktrees/<name>`.
3. For safe-but-dirty (after saving docs): `git worktree remove --force .claude/worktrees/<name>`.
4. Delete the merged branches: `git branch -D <branch>` (squash-merges need `-D`, not `-d`).
   Skip branches bound to live sessions and any KEEP (unmerged) branches.
5. `git worktree prune` to clear stale metadata.
6. Report what was removed, what was kept (with reason), and any live-session worktrees skipped.

## Notes

- "Permission denied" / "Device or resource busy" on delete usually means a live `claude` process
  holds the dir as its cwd — git still unregisters the worktree; the empty shell deletes once that
  session closes.
- See [[feedback_delete_completed_worktrees]] in project memory for the rule's rationale.
