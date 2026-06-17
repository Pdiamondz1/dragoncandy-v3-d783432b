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
3. **No live session** — `Get-CimInstance Win32_Process | ? { $_.CommandLine -match "--worktree" }`
   (PowerShell). NEVER remove a worktree (or delete its branch) with a live `claude.exe --worktree X`
   process — it orphans that session. Skip it; tell the user. Never kill the session.
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

- Windows "Permission denied" / "Device or resource busy" on delete usually means a live
  `claude.exe --worktree` process holds the dir — git still unregisters the worktree; the empty
  shell deletes once that session closes.
- See [[feedback_delete_completed_worktrees]] in project memory for the rule's rationale.
