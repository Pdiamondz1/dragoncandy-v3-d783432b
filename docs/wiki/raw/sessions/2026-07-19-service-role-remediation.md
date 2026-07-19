# Session — service-role authorization remediation (2026-07-19)

PR #308 (`45fed140`), merged + **deployed to prod**. Sequel to PR #307, which shipped the
`data-exposure-reviewer` subagent; this is the remediation of what that subagent found.

## Scope

12 authorization guards across 4 edge functions + one new pure shared module. **No migration, no
schema change, no RLS change.** Deployed: `donny-chat` v147, `donny-campaign-preview` v98,
`donny-creator-match` v73, `donny-apply-pitch` v57 — `verify_jwt` preserved on every one.

## The unifying defect

A Supabase client built with `SUPABASE_SERVICE_ROLE_KEY` **bypasses RLS entirely**, so every read
must re-assert in the query what the policy would have enforced. These defects **run perfectly** —
service-role is usually the correct credential — which is why they survived 14 Codex rounds, an
adversarial review, and the whole PR #246/#247/#260 privacy sweep.

## New module: `_shared/campaign-access.ts`

Pure, dependency-free (no `https://` imports, so vitest can load it), 19 unit tests, fails closed on
every missing input. Two exports:

- `evaluateCampaignAccess` — may this actor SEE this campaign's detail?
- `evaluateApplyAccess` — may this actor APPLY to it?

Both mirror the live `campaigns` SELECT policy, which was read from prod during `verify-db-schema`:

```
(user_id = auth.uid())
OR (status = 'published' AND (group_id IS NULL OR is_active_group_member(group_id, auth.uid())))
OR has_collaboration_on_campaign(id, auth.uid())
```

## What was fixed

**Round 0 — the six filed findings.** Three `creator_profiles` reads gained
`profile_visibility='public'` (`donny-creator-match`, `donny-chat` `get_creator_profile`,
`donny-apply-pitch`); `donny-apply-pitch` gained a `creator_id === user.id` assertion;
`donny-apply-pitch` and `donny-campaign-preview` gained campaign-access gates; `donny-chat`
`apply_to_campaign` gained a crew guard on its raw service-role INSERT.

**Round 1 — 3 more `[high]` + a design flaw**, found by running the subagent on its own fix. The
worst was **not** in the original six: `donny-campaign-preview` `handleRegenerate` had no ownership
check, so any authenticated caller could regenerate an arbitrary preview — receiving the full row
including `ai_prompt_used` (which embeds another tenant's brief and budget) **and destructively
overwriting the victim's row while resetting `is_approved`**. A cross-tenant *write*, not just a
read. Also `get_applications` (enumerate another business's applicant list) and `get_submissions`
(read another collaboration's deliverable file paths). The design flaw: the helper matched on
`profiles.org_id`, a denormalized cache with no status qualifier, where the canonical predicate
everywhere else is `org_members … invitation_status='active'`.

**Round 2 — 2 `[med]` consistency gaps**, both in `donny-chat`: `get_dragonshare` still used the
rejected `profiles.org_id` cache, and its org-branch `dragonshare_posts` read dropped the
`status='verified'` half of `ds_posts_org_select`, surfacing pending/flagged/removed submissions —
undoing the trust-then-flag model's deliberate withholding.

**Round 3 — hardening only.** Converged.

**Codex — 1 P2 all three rounds missed.** `isParticipant` collapsed collaborations and applications
into one flag, but the policy treats them differently: an owner or actual collaborator keeps
visibility regardless of status, while everyone else sees a campaign only while `published`. So a
**rejected or stale applicant retained service-role access to a closed campaign's brief and budget**.
Split into `isCollaborator` (status-independent) and `hasApplication` (requires `published`).

## Two functional regressions — introduced, then caught in review

Worth recording because a security fix that breaks the feature is its own failure mode, and both were
caught by a reviewer asking *"does this still work for the person who's supposed to use it?"* — not
by tests, and not by the author.

1. **The pitch endpoint was gated on `evaluateCampaignAccess`** (owner ∨ org ∨ **participant**). But
   `donny-apply-pitch` exists to help a creator write a pitch *before* applying, so they are by
   definition not yet a participant — that gate denied every legitimate first-time use. The right
   question is `evaluateApplyAccess` ("may this creator apply?"), which still blocks unpublished
   campaigns and keeps a private crew campaign invisible to a non-member.
2. **A `profile_visibility='public'` filter was added to the caller's OWN profile read**, after the
   `creator_id === user.id` assertion had already proved ownership. It closed no exposure — a caller
   can only ever reach their own row on that path — while locking a creator with a private profile
   out of generating their own pitch. **Ownership is the stronger guard and supersedes visibility.**
   The cross-user reads correctly keep their filters.

## `verify-db-schema` against prod

Both questions the reviewer deferred as un-answerable from files:

- **No stale `profiles.org_id` pointer exists** — 0 rows where the cache names an org the user is not
  an active member of (`org_members`: 23 active, 0 non-active). The org-cache fix is
  *latent-correct*, not closing a live hole.
- **Live RLS bodies match the migrations** — `ds_posts_org_select` contains the `verified` predicate,
  and the `campaigns` SELECT policy is as quoted above. That third clause **independently confirms
  the Codex P2**: `has_collaboration_on_campaign` is status-independent and there is **no application
  arm at all**.

One deliberate deviation, flagged for reviewers rather than hidden: `evaluateCampaignAccess` is
**stricter than RLS** — the policy grants any authenticated user a published non-crew campaign,
whereas the helper additionally requires owner ∨ org ∨ collaborator ∨ applicant. `handleGenerate`
spends AI budget, so "anyone may read it" must not mean "anyone may bill previews against it." Its
siblings `handleList` and `handleApprove` are owner-only, so this sits between the two.

## Urgency calibration (verified, not assumed)

Prod at time of shipping: **0 private creators** (13/13 public), **0 private businesses** (17/17),
**0 crew campaigns**, **0 draft campaigns**. Every finding was therefore **latent, not actively
leaking** — the data that would leak did not exist yet.

Latent here means *one user action away*: the first crew built, the first creator set private, or the
first saved draft flips them live. Crews shipped (#226/#229) specifically so businesses would build
them. The guards landed **before** the features that would expose them get used, which is the right
order — and the reason this did not need an emergency deploy.

## Deploy notes

`donny-apply-pitch` is live **`verify_jwt=true`** while the other three are **`false`**. A blanket
`--no-verify-jwt` loop would silently flip it, so it was deployed **without** the flag and the other
three **with** it. Confirmed post-deploy via `list_edge_functions`: all four `ACTIVE`, all four
`ezbr_sha256` changed (real new bundles, not silent old-code retention), `verify_jwt` intact on each.

No migration accompanies the branch, so there was no deploy-ordering constraint between the four.

## Process gotchas

- **`origin/main` moved three times during the session** (#305/#306, #309/#310, #311). Branch
  protection requires up-to-date branches and **auto-merge is disabled on this repo**, so merging is
  a manual update-then-merge race — poll and merge in the window. An early REST-path diff computed
  against a stale base contained **two deleted migrations and a landing revert**; building a tree
  from it would have clobbered live work. Always re-derive and verify `removed: 0` on the remote
  branch before opening the PR.
- **Codex buffers its output** — ~20 minutes at 0 bytes is normal, not a stall.
- Deferred, documented, not defects: two `[low]` `select('*')` reads in own-row-scoped paths
  (`donny-chat` `get_toast_insights`, `donny-campaign-preview` `handleList`).
