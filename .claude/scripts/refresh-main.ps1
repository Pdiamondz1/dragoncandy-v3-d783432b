# Refresh Local Main — unattended, safe-by-construction.
#
# Work happens in worktrees; the local `main` checkout does NOT auto-update, so the
# files you browse there drift behind origin/main (100+ commits is normal). This runs
# automatically after `gh pr merge` and at session start (hooks in .claude/settings.json),
# so nobody has to remember the manual routine in the `refresh-main` skill.
#
# WHY THIS IS NOT JUST `fetch && merge --ff-only`:
# The obvious two-liner never checks WHICH BRANCH the main checkout is on. If that
# checkout sits on a feature branch that is strictly BEHIND origin/main, a bare
# `merge --ff-only origin/main` fast-forwards THAT FEATURE BRANCH onto main — silently
# moving someone's branch pointer. It only feels safe because a diverged branch happens
# to be refused. Automating that flaw means firing it unattended, which is worse than
# typing it. So this asserts the branch first, and never touches a checkout that is
# busy with something else.
#
# THREE STATES, all of which occurred in practice on 2026-08-11:
#   1. A worktree holds `main`      -> do nothing. Git refuses to update a checked-out
#                                      branch from elsewhere, and stealing it from a live
#                                      session is worse than being stale.
#   2. Main checkout IS on `main`   -> fetch + merge --ff-only. This is the only path that
#                                      updates FILES, and the only one that fires the
#                                      committed post-merge hook (which syncs Donny's RAG).
#   3. Main checkout is elsewhere   -> `git fetch origin main:main` advances the main REF
#                                      without a checkout. It cannot touch their branch,
#                                      their files or their working tree, and git refuses
#                                      it unless it is a fast-forward. Files and RAG are
#                                      NOT updated — that is logged, not hidden.
#
# Exits 0 ALWAYS. A refresh is a convenience; it must never fail a turn or block a merge.

$ErrorActionPreference = 'Continue'

function Write-Log {
    param([string]$Message)
    $line = "[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
    Write-Output $line
    if ($script:LogFile) {
        try { Add-Content -Path $script:LogFile -Value $line -Encoding utf8 } catch { }
    }
}

try {
    # --- Locate the repo and the main checkout ------------------------------------
    # The FIRST entry of `git worktree list --porcelain` is always the main working
    # tree. Deliberately NOT derived from $PSScriptRoot: this script lives in the repo,
    # so in a worktree that path resolves to the WORKTREE, not the main checkout.
    $porcelain = & git worktree list --porcelain
    if ($LASTEXITCODE -ne 0 -or -not $porcelain) { exit 0 }   # not a git repo; nothing to do

    $commonDir = & git rev-parse --path-format=absolute --git-common-dir
    if ($LASTEXITCODE -eq 0 -and $commonDir) {
        $script:LogFile = Join-Path $commonDir.Trim() 'refresh-main.log'
    }

    # Parse the porcelain blocks into { Path, Branch } records.
    $worktrees = @()
    $current = $null
    foreach ($line in $porcelain) {
        if ($line -match '^worktree (.+)$') {
            if ($current) { $worktrees += $current }
            $current = [pscustomobject]@{ Path = $Matches[1]; Branch = $null }
        }
        elseif ($line -match '^branch refs/heads/(.+)$' -and $current) {
            $current.Branch = $Matches[1]
        }
    }
    if ($current) { $worktrees += $current }
    if ($worktrees.Count -eq 0) { exit 0 }

    $mainCheckout = $worktrees[0]
    $holder = $worktrees | Where-Object { $_.Branch -eq 'main' } | Select-Object -First 1

    # --- State 1: a worktree (not the main checkout) holds `main` ------------------
    if ($holder -and $holder.Path -ne $mainCheckout.Path) {
        Write-Log "SKIP: worktree '$($holder.Path)' currently holds branch 'main'. Git cannot update a checked-out branch from elsewhere. Detach or switch that worktree, then re-run."
        exit 0
    }

    # --- State 2: the main checkout is on `main` ----------------------------------
    if ($mainCheckout.Branch -eq 'main') {
        $dirty = & git -C $mainCheckout.Path status --porcelain
        if ($LASTEXITCODE -eq 0 -and $dirty) {
            $count = ($dirty | Measure-Object).Count
            Write-Log "SKIP: main checkout is on 'main' but has $count uncommitted change(s). Not touching a dirty tree."
            exit 0
        }

        & git -C $mainCheckout.Path fetch origin --quiet
        if ($LASTEXITCODE -ne 0) { Write-Log "SKIP: fetch failed (offline?)."; exit 0 }

        $before = (& git -C $mainCheckout.Path rev-parse HEAD).Trim()
        $target = (& git -C $mainCheckout.Path rev-parse origin/main).Trim()
        if ($before -eq $target) { Write-Log "OK: already current ($($target.Substring(0,8)))."; exit 0 }

        $mergeOut = & git -C $mainCheckout.Path merge --ff-only origin/main
        if ($LASTEXITCODE -ne 0) {
            Write-Log "SKIP: --ff-only refused (main checkout has diverged or untracked files would be overwritten). Left untouched; resolve by hand. Detail: $($mergeOut -join ' ')"
            exit 0
        }
        Write-Log "UPDATED: main checkout fast-forwarded $($before.Substring(0,8)) -> $($target.Substring(0,8)). Files current; post-merge hook fired (RAG sync)."
        exit 0
    }

    # --- State 3: the main checkout is on some other branch -----------------------
    # Advance the `main` REF without a checkout. Cannot disturb their branch or files,
    # and git refuses a non-fast-forward, so history can never be rewritten here.
    $branchName = if ($mainCheckout.Branch) { $mainCheckout.Branch } else { 'a detached HEAD' }
    $mainBefore = (& git rev-parse --verify --quiet refs/heads/main)

    $fetchOut = & git -C $mainCheckout.Path fetch origin main:main --quiet
    if ($LASTEXITCODE -ne 0) {
        Write-Log "SKIP: main checkout is on '$branchName'; could not fast-forward the 'main' ref (diverged, or offline). Detail: $($fetchOut -join ' ')"
        exit 0
    }

    $mainAfter = (& git rev-parse --verify --quiet refs/heads/main)
    if ($mainBefore -eq $mainAfter) {
        Write-Log "OK: 'main' ref already current; main checkout is on '$branchName' (left alone)."
    } else {
        $short = if ($mainAfter) { $mainAfter.Trim().Substring(0,8) } else { '?' }
        Write-Log "UPDATED (ref only): 'main' ref advanced to $short. The main checkout stays on '$branchName', so its FILES are unchanged and the post-merge RAG sync did NOT run."
    }
    exit 0
}
catch {
    # A refresh is a convenience. Never fail a turn over it.
    try { Write-Log "SKIP: unexpected error - $($_.Exception.Message)" } catch { }
    exit 0
}
