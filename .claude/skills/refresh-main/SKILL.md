---
name: refresh-main
description: "Fast-forward the local main checkout to origin/main after a PR merges, so its files stop going stale. Use after merging any PR, or when asked to 'refresh main', 'update local main', or when the local checkout looks behind origin."
---

# Refresh Local Main

Work happens in worktrees; the local `main` checkout at `C:\GIT\dragoncandy-v3-d783432b`
does **not** auto-update, so its files drift behind `origin/main` (can be 100+ commits).
Vercel deploys from GitHub `origin/main`, so prod stays current even when local main is
stale — but the files you browse locally go wrong. Run this after every merge. See
[[project_worktree_stale_main]].

## Steps

```bash
MAIN="C:/GIT/dragoncandy-v3-d783432b"
# Stash README if it has local edits (it sometimes does)
git -C "$MAIN" stash push -- README.md 2>/dev/null || true
git -C "$MAIN" fetch origin
git -C "$MAIN" merge --ff-only origin/main
```

## Notes

- If the fast-forward aborts on "untracked working tree files would be overwritten," move
  those untracked files aside first, then retry.
- If the main checkout has its own un-pushed commit (e.g. a preservation branch was created
  on it), `--ff-only` will refuse — switch it back to `main` first.
- Core files (`CLAUDE.md`, `docs/PROJECT_CONTEXT.md`, `docs/wiki/`) looking stale locally
  almost always means this step was skipped, not that a change was lost.
