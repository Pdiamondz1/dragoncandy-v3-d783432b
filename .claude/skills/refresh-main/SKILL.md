---
name: refresh-main
description: "Fast-forward the local main checkout to origin/main after a PR merges, so its files stop going stale. Mostly AUTOMATIC now (hooks run it after `gh pr merge` and at session start) — invoke this when the automatic run SKIPPED and you need to clear the blocker, or when asked to 'refresh main', 'update local main', or when the local checkout looks behind origin."
---

# Refresh Local Main

Work happens in worktrees; the local `main` checkout at `C:\GIT\dragoncandy-v3-d783432b`
does **not** auto-update, so its files drift behind `origin/main` (100+ commits happens).
Vercel deploys from GitHub `origin/main`, so prod stays current even when local main is
stale — but the files you browse locally go wrong. See [[project_worktree_stale_main]].

## This is automatic now — read this before running anything

Two hooks in `.claude/settings.json` run `.claude/scripts/refresh-main.ps1`:

| Hook | Fires | Covers |
|---|---|---|
| `PostToolUse` (`if: Bash(gh pr merge *)`) | right after a CLI merge | the normal path |
| `SessionStart` | once per session | merges via the GitHub web UI, or by someone else |

Both are `async: true`, so they never block a turn, and the script **always exits 0** — a
refresh is a convenience and must never fail a merge. It logs every run to
`<git-common-dir>/refresh-main.log`; read that before assuming it did or did not act.

**So the usual reason to invoke this skill is that the automatic run SKIPPED.** Check the
log first — the message names the blocker.

## Why the obvious two-liner is NOT what the script runs

```bash
git -C "$MAIN" fetch origin
git -C "$MAIN" merge --ff-only origin/main     # <-- DO NOT automate this as-is
```

That never checks **which branch the main checkout is on**. If that checkout is sitting on
a feature branch that is strictly *behind* `origin/main`, this fast-forwards **that feature
branch** onto main, silently moving its pointer. It only feels safe because a *diverged*
branch happens to be refused — that is luck, not a guard. The script asserts the branch
first.

## The three states, and what the script does in each

1. **A worktree holds `main`** → skip. Git flatly refuses to update a checked-out branch
   from elsewhere (`fatal: refusing to fetch into branch 'refs/heads/main' checked out at
   …`), and stealing it from a live session is worse than being stale.
   **Fix:** in that worktree, `git checkout --detach origin/main` (or switch to another
   branch), then re-run. `git worktree list` names the holder.
2. **Main checkout IS on `main`, clean** → `fetch` + `merge --ff-only`. This is the only
   path that updates **files**, and the only one that fires the committed `post-merge` hook
   (which syncs Donny's RAG — see [[Knowledge-Sync Automation]]).
   - **Dirty tree → skip.** Nothing is stashed automatically; unattended stashing of
     someone's work is not a trade worth making.
     **Fix:** commit, stash, or discard in the main checkout, then re-run.
3. **Main checkout is on another branch** → `git fetch origin main:main`, which advances
   the `main` **ref** without a checkout. It cannot touch their branch, files, or working
   tree, and git refuses a non-fast-forward, so history can never be rewritten.
   **Files and the RAG are NOT updated** in this state — the log says so explicitly rather
   than implying success. A later `git checkout main` is then instant.

## Manual run

```bash
powershell -NoProfile -File .claude/scripts/refresh-main.ps1
```

Safe from any worktree and idempotent. It locates the main checkout from the **first entry
of `git worktree list --porcelain`** — deliberately *not* from `$PSScriptRoot`, which in a
worktree resolves to the worktree, not the main checkout (the trap `session-context.ps1`'s
pattern would walk into).

## Notes

- Core files (`CLAUDE.md`, `docs/PROJECT_CONTEXT.md`, `docs/wiki/`) looking stale locally
  almost always means a refresh was skipped, **not** that a change was lost. Read the log.
- State 3 leaves the RAG un-synced because the `post-merge` hook only fires on a real merge
  in the main checkout. If `docs/` changed, run `npm run sync:internal` by hand from a
  checkout whose `docs/` is current — see [[Knowledge-Sync Automation]].
- If `--ff-only` aborts on "untracked working tree files would be overwritten," move those
  files aside and re-run.
