# Session — AI Creator Match auto-run + invitation clarity (PR #382)

**Date:** 2026-08-07
**Branch:** `worktree-dc-improvements-17` · **PR:** #382
**Trigger:** founder screenshot of `/dashboard/business/campaigns/:id` with three complaints.

## What the founder reported

1. "This AI Creator match should launch automatically without pressing the button to refresh
   after a campaign is created, as the app looks more complete from the start."
2. "It's also not clear to the user what happens when the restaurant invites a creator(s).
   You and I know but other users don't… They think: Does it ask the creators to do the work?
   Maybe there should be a button for that? It's unclear that all of that is possible with the
   invite button."
3. "The invite has 3-4 second delay when it appears and when the user selects a creator, maybe
   add an animation so it doesn't feel like it's not working and then appears."

The founder also stated the ground truth to be communicated: "We know published campaigns are
already in the creator marketplace for all the creators to see. The invite gives the creator the
ability to take the job or decline it. However, the user doesn't know this."

## What the audit actually found

### 1. Matching had no automatic trigger anywhere

`match-creators` was invoked from exactly two places, both buttons in
`src/components/campaigns/CreatorMatchingSection.tsx`. Neither campaign-creation path
(`useCampaignCreator.ts` launch, which inserts with `status: 'published'` and navigates) nor
either publish path (`useCampaignMutations.ts` `useCreateCampaign` / `useUpdateCampaign`)
triggered it. No DB trigger creates matches either — the only `campaign_matches` writes in SQL
are the table DDL and the `donny_nudge_on_match` AFTER INSERT trigger, which *reacts* to matches.

So the only way `campaign_matches` ever got rows was a human pressing the button. A brand-new
campaign always landed on a red `AlertCircle` + "No AI matches yet".

### 2. The invite is a nudge, not an assignment — and nothing said so

Verified rather than assumed:

- `usePublicCampaigns.ts` (the browse-campaigns query) filters **only** on `status='published'`
  and `group_id IS NULL`, plus exclusion of already-taken campaigns. **There is no
  invitation-based filter.** Its own comment: "All published campaigns are visible — escrow is
  paid after hire, not before listing."
- `send-campaign-publish-notifications` emails **every** creator with `onboarding_complete=true`
  on publish.
- There is **no "Accept" button anywhere** on the creator side. Accepting *is* applying — the
  `apply_to_campaign` RPC flips a pending invitation to `accepted` as a side effect. The result
  is an ordinary `campaign_applications` row the business must still review.
- The single functional privilege an invitation confers: `useCreateApplication.ts` lets an
  **invited** creator apply to a campaign that is no longer `published` (mirrored in RLS).

So the invite = notification burst (email + in-app bell + Donny DM) + a pinned card in the
creator's Invitations tab + post-`published` apply rights. **Zero priority in the queue.**

Explanatory copy found anywhere on the platform about campaign invitations: **none.** No
tooltip, no help text, no `help_articles` row (the 9 help-article migrations cover *crew*
invitations and *team/org* invitations only). The only near-miss is the invitation **email**,
which says "apply if you're interested" — the one place the truth leaked out.

### 3. The dead click was structural

`CreatorMatchCard.tsx`'s Invite button had **no pending state at all** —
`onClick={() => onInvite(match.creator_id)}` and nothing else. Meanwhile
`send-campaign-invitation` runs campaign lookup → creator lookup → upsert → Resend email →
Donny conversation find-or-create → Donny message insert, **serially**, before the toast fires.

The All Creators tab did have a pending guard, but it was the **global**
`inviteCreator.isPending`, so sending one invite disabled every other creator's button.

## What shipped

**Auto-run.** A guarded `useEffect` fires `generateMatches.mutate({ campaignId, silent: true })`
once when: the matches query has settled (`isFetched && !isLoading`), returned zero matches, the
campaign is `published`/`active`, and no attempt has been recorded. Two guards for two windows —
a `useRef` holding the campaign id (stops a double-fire within one mount, since the effect
re-runs as the mutation flips `isPending`) and a `sessionStorage` key `dc:auto-match:<id>`
(stops a re-fire on navigate-away-and-back). **Deliberately session-scoped, not persistent:** a
campaign still empty in a later session *should* re-run, because the creator pool grows.

New `silent` flag on `useGenerateMatches` suppresses both toasts for the auto-run. An unprompted
"Matches generated successfully!" on page load is noise; a red failure toast for something the
user never asked for is worse. A silent failure falls through to the empty state, which keeps
the manual button.

**Draft campaigns are excluded** from the auto-run — `send-campaign-invitation` requires
`published`/`active`, so auto-spending an OpenAI call on a draft is pure waste.

**Progress UI.** New `MatchingProgress.tsx` + `matchingSteps.ts`: four timer-advanced steps
(done / current / pending icon states) modelled on `landing/BriefGeneratorPreview.tsx`, plus
placeholder cards in the real results grid layout so results don't shift it in. The last step
**never ticks over to done** — the run finishing is what unmounts the component, so it never
claims a completion it cannot observe.

**Split loading flags.** `const isLoading = matchesLoading || generateMatches.isPending` meant an
ordinary load of a campaign that already *had* matches flashed "Analyzing creators…" and hid its
own stat row and sort/filter controls. Now `matchesLoading` → skeletons, `isPending` → progress.

**Invite copy.** New `inviteCopy.ts` as one source of truth. Header states the marketplace
reality in one sentence (replacing algorithm jargon, so net clutter is zero). Button label
"Invite" → **"Invite to apply"** — it names the ask, which is exactly what was missing. A
`WhyExpander` (`expanderKey='campaign_invite'`) carries the detail, placed **once in the section
header** rather than on each card.

**Real post-invite status.** `useCampaignInvitations` already SELECTed `status` and never read
it, so the `Set`-based `invitedCreatorIds` rendered a creator who **declined** identically to one
who **accepted** — a disabled "Invited ✓" with a green check, forever. Replaced with a
`Map<creatorId, status>` and `describeInvitation()` → `AppStatusBadge`:
`pending` → "Invited · waiting" (amber), `accepted`/`counter_offered` → "Applied — review them"
(teal, scrolls to `#applications-section`), `declined` → "Declined" (neutral). A badge, not a
disabled button — a control that can't be clicked shouldn't be one.

**Pending state.** Derived from the mutation itself
(`inviteCreator.variables?.creatorId === creatorId`) rather than new state, using `Button`'s
existing `isLoading` prop. Label "Sending…". Deliberately **not optimistic**: the function has
real failure modes (403 non-owner, not published, crew-campaign rejection), and showing "Invited"
for three seconds before snapping back is worse than an honest spinner.

## Two live defects found in the flow being changed

**Owner gate.** `CreatorMatchingSection` mounted for any `business_client` viewing the page.
Campaigns are publicly readable and both edge functions 403 non-owners, so nothing leaked — but
another business opening the URL saw controls it couldn't use, and *would now have auto-fired a
doomed AI call*. Gated on `isOwnCampaign` in `CampaignDetailsPage.tsx`.

**Expired invitations were permanently un-resendable, silently.** `useCampaignInvitations`
filters out `pending` rows past `expires_at` (7-day TTL), so the button reverts to "Invite to
apply". But `send-campaign-invitation` upserted with `ignoreDuplicates: true` on
`(campaign_id, creator_id)`, so the row was never refreshed: it returned `already_invited: true`,
no new email/bell/Donny fired, and `expires_at` stayed in the past — which also keeps the row
hidden from the creator's own `useCreatorPendingInvitations` query. The owner clicked, got
"Already invited", and **nothing happened, for good.** Same failure *feeling* the founder
reported, in a different place.

Fixed: on conflict the function now reads `status, expires_at`; if the row is `pending` **and**
expired it UPDATEs (`invited_by`, `invitation_message`, `expires_at`) filtered on
`id` + `status='pending'` — so a concurrent accept/decline is not clobbered — and falls through
to the normal fan-out returning `already_invited: false`. Losing the race returns the original
short-circuit.

## What the reviews changed

`data-exposure-reviewer` returned ISSUES on the first pass. Both were verified independently
before being accepted (per the standing "a reviewer finding is a LEAD, not a verdict" rule):

- **[med] The revive is the first-ever UPDATE path on `campaign_invitations`**, and the trigger
  keeping private crew campaigns out of the invitation fan-out,
  `trg_reject_group_campaign_invitation`, is **`BEFORE INSERT` only** — despite its own migration
  comment claiming it "fires for every write path (incl. service-role)". Confirmed directly: no
  later redefinition exists, and nothing in `src/` sets `group_id` on an existing campaign (it is
  INSERT-only in `useCampaignCreator`), so this was a gap rather than a live incident. Closed by
  re-asserting `campaign.group_id` in code (400) immediately after the owner 403 — mirroring
  `send-campaign-publish-notifications` — so the guarantee no longer depends on the trigger
  existing in prod. Side benefit: a crew campaign previously produced a **500** from the
  trigger's `RAISE`; it now returns a clean 400 through the same `result.error` path.
- **[low] Bare `.select()`** on the write paths returned every column to the browser. Closed with
  a module-level `INVITATION_COLUMNS` matching the client's declared `CampaignInvitation` type,
  applied to all three response paths (the `edge-function-reviewer` pre-deploy pass caught that
  the "already invited" / "lost the race" branches still returned a narrower shape).

Both reviewers returned **PASS** on re-review. Codex returned clean with no actionable findings.

**One self-caught issue:** the results grid was first written using the shared
`staggerContainer`/`staggerItem` variants from `src/lib/motion.tsx`. A grep showed this change
would have been their **first consumer anywhere in `src/`** — they were dead code. Variant
propagation resolves by label through the parent, and its failure mode is children stuck at
`initial` opacity 0: **invisible match cards, on the exact panel this branch exists to fix.**
Replaced with explicit per-item `initial`/`animate`/`transition` props (delay derived from index,
capped at 300ms), whose worst case is "no animation" rather than "no content".

## Deploy state

`send-campaign-invitation` deployed to prod **v62 → v63**, `verify_jwt: true` preserved,
`_shared/cors.ts` bundled, served source verified via `get_edge_function`, and boot-checked (it
returns its own body-level `{"error":"Unauthorized"}` with a valid anon JWT, not a gateway
rejection). Additive and frontend-independent, so deploying ahead of the frontend merge is safe.
**No migration. No schema change. No RLS change.**

## Gotchas worth keeping

- **`WhyExpander`'s root is `inline-flex`**, so the expanded body's `block w-full` resolves
  against the trigger icon, not the row. It renders acceptably in a wide container but badly in a
  narrow card column. This is why the invite explainer sits once in the full-width section header
  instead of on each 2-column card. A `className` prop was added and then **reverted** once the
  placement made it unnecessary — don't ship a prop no caller needs.
- **`docs/DATABASE_SCHEMA.md`'s `updated_at` warning applies here**: `campaign_invitations` has no
  reliable `updated_at`. The revive path's freshness signal is `expires_at`, which is set
  explicitly, not a trigger-stamped column.
- **The pre-push hook runs `typecheck` + `build`**, so a push on a loaded machine can exceed a
  7-minute foreground timeout. `git ls-remote` proves transport; retry in the background rather
  than reaching for the REST workaround.

## Not verified

The **both-viewport visual pass on a live signed-in session was not completed.** The dev machine
sat at 100% CPU (many concurrent worktree dev servers, a `codex` process, and the pre-push build
across 8 logical cores), so the authenticated page never reached `document_idle` for the browser
automation, and browser sessions do not cross ports — the founder was signed in on a different
dev-server port. Per the standing rule that staging previews are drift-corrupted and give false
assurance, the intended path is `verify-prod` on dragoncandy.io after merge.

## Files

**Added:** `src/components/campaigns/MatchingProgress.tsx` (+ test),
`src/components/campaigns/matchingSteps.ts`, `src/components/campaigns/inviteCopy.ts` (+ test)

**Modified:** `src/components/campaigns/CreatorMatchingSection.tsx`,
`src/components/campaigns/CreatorMatchCard.tsx`, `src/hooks/useCampaignMatches.ts`,
`src/pages/CampaignDetailsPage.tsx`, `supabase/functions/send-campaign-invitation/index.ts`

**Gates:** typecheck · build · ESLint · 11 new unit tests · `typecheck:functions` (66 gated) ·
`edge-function-reviewer` PASS · `data-exposure-reviewer` PASS · Codex clean.
