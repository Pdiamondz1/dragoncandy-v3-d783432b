# Handoff — service-role exposure remediation (in flight)

**Date:** 2026-07-19
**Branch:** `fix/service-role-exposure` in worktree
`C:/GIT/dragoncandy-v3-d783432b/.claude/worktrees/dc-service-role-fixes`
**State:** code complete + 3 review rounds converged. **Not pushed, not PR'd, NOT DEPLOYED.**

## Where this came from

PR #307 shipped the `data-exposure-reviewer` subagent. Its first real runs found service-role
RLS-bypass exposures on `main`; those were filed in
`.claude/handoffs/2026-07-19-service-role-exposure-findings.md` (on the #307 branch) and this
branch is the remediation.

## Commits on this branch (5)

```
6ebb5f72 fix(donny-apply-pitch): drop the visibility filter on the caller's OWN profile
db842c13 fix(donny-chat): re-assert org RLS predicates in get_dragonshare
42878048 fix(security): re-assert authorization on 4 more service-role RLS-bypass sites
0dc08e37 fix(donny-apply-pitch): gate on apply-eligibility, not campaign access
efc524a4 fix(security): re-assert access on 6 service-role RLS-bypass reads
```

New shared module: `supabase/functions/_shared/campaign-access.ts`
(`evaluateCampaignAccess` / `evaluateApplyAccess`, pure, 19 unit tests).
Functions touched: `donny-chat`, `donny-apply-pitch`, `donny-campaign-preview`,
`donny-creator-match`.

Tests: **441/441 pass** (`npx vitest run supabase/functions/`).

## Review history — read before assuming the branch is small

Three rounds of `data-exposure-reviewer` on the fix itself (dogfooding). It kept finding more:

- **Round 1** — 3 additional `[high]` sites the original six missed, plus a design flaw in the new
  helper. The worst was NOT in the original findings: `donny-campaign-preview` `handleRegenerate`
  had no ownership check and **destructively overwrote another tenant's row** while returning their
  campaign brief — a cross-tenant *write*.
- **Round 2** — 2 `[med]` consistency gaps in `donny-chat` (`profiles.org_id` used as an
  unqualified org cache; the org-branch `dragonshare_posts` read dropped the `status='verified'`
  half of `ds_posts_org_select`, exposing pending/flagged/removed submissions).
- **Round 3** — hardening only. Converged.

**Two functional regressions were introduced and caught in review** — both worth remembering,
because a security fix that breaks the feature is its own failure mode:
1. The pitch endpoint was gated on `evaluateCampaignAccess` (owner ∨ org ∨ **participant**), but a
   creator wants a pitch *before* applying, so they are never a participant. Now uses
   `evaluateApplyAccess`.
2. A `profile_visibility='public'` filter was added to the caller's **own** profile read, locking
   private creators out of their own pitch while closing no exposure (ownership was already
   asserted). Removed — the cross-user reads correctly keep theirs.

## Remaining steps, in order

1. ~~**Codex second review.**~~ **DONE — and it earned its keep.** (It buffers output and emits
   nothing until it finishes; ~20 min at 0 bytes is normal, not a stall.)
   It found **one P2 that all three `data-exposure-reviewer` rounds missed** — the clearest
   argument in this branch for keeping a second, independent model in the loop:
   `donny-campaign-preview` collapsed collaborations and applications into one `isParticipant`
   flag, but the `campaigns` SELECT policy treats them differently — an owner or actual
   collaborator keeps visibility regardless of status, while everyone else sees a campaign only
   while it is `published`. A rejected or stale applicant therefore kept service-role access to a
   closed campaign's brief and budget. Fixed in `e9dfda64` by splitting into `isCollaborator`
   (status-independent) and `hasApplication` (requires `status === 'published'`).
   **Re-run Codex after any further change** — the branch has not been re-reviewed since.
2. **Push + PR.** `git push` **hangs** in this environment (env-level, documented in project
   memory). Use the REST path: blob → tree → commit → ref → `gh pr create`.
   **`origin/main` moved twice during the previous session** — re-derive the diff against the
   current tip and verify `removed: 0` on the remote branch BEFORE opening the PR. A stale diff
   nearly clobbered two live migrations and a landing feature.
3. **Deploy 4 edge functions — needs the `careful` gate + explicit founder confirmation.**
   **Trap:** `donny-apply-pitch` is live **`verify_jwt=true`**; the other three are **`false`**.
   A blanket `--no-verify-jwt` loop silently flips it. Deploy `donny-apply-pitch` WITHOUT the flag,
   the other three WITH it. No migration accompanies this branch, so there is no deploy-ordering
   constraint between them.
4. **`verify-db-schema`.** The reviewer explicitly deferred two questions it could not answer from
   files: (a) whether a stale `profiles.org_id` pointer actually exists in prod for a
   suspended/removed member, and (b) whether the live RLS policy bodies match the migrations.
5. **`knowledge-sync`** for this branch at finish.

## Urgency calibration (verified against prod, do not re-panic)

Prod currently has **0 private creators** (13/13 public), **0 private businesses** (17/17),
**0 crew campaigns**, **0 draft campaigns**. So every finding here is **latent, not actively
leaking** — the data that would leak does not exist yet.

But latent means *one user action away*: the first crew built flips the crew findings live; the
first creator set to private flips the visibility ones; the first saved draft flips the campaign
ones. Crews shipped (PR #226/#229) specifically so businesses would build them. **Fix before
launch; no need to deploy at 4am.**

## Deliberately not done

- Two `[low]` hardening items (`select('*')` in own-row-scoped paths in `donny-chat`
  `get_toast_insights` and `donny-campaign-preview` `handleList`). Not leaks; left to avoid
  expanding the branch.
- `donny-creator-match` does not import `campaign-access.ts` — it has no campaign read. If one is
  ever added there, it must route through the helper.
