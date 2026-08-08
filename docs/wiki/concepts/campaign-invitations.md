---
title: Campaign Invitations
type: concept
created: 2026-08-07
updated: 2026-08-07
sources: [2026-08-07-creator-match-autorun-and-invite-clarity.md]
tags: [campaigns, invitations, marketplace, ux, edge-functions]
---
# Campaign Invitations

What a campaign invitation **actually is** on DragonCandy, why every user got it wrong, and the
2026-08-07 pass (PR #382) that made the product say so out loud.

## The one-sentence answer

**An invitation is a direct nudge to apply, not an assignment and not a queue-jump.** The
campaign is already visible to every creator; the invite adds a notification burst and the right
to apply after the campaign leaves `published`. The creator "accepts" by applying, and the
business still picks from the ordinary application queue.

## Why nobody knew that

The founder's report, 2026-08-07: *"It's not clear what happens when the restaurant invites a
creator. You and I know but other users don't. They think: Does it ask the creators to do the
work? Maybe there should be a button for that?"*

That misreading was entirely reasonable, because the product said nothing. Before PR #382 there
was **no tooltip, no help text, and no `help_articles` row** anywhere about campaign invitations
— the 9 help-article migrations cover *crew* invitations ([[Creator Groups (Crews)]]) and
team/org invitations only. The single place the truth leaked out was the invitation **email**,
which says "apply if you're interested."

## The mechanics (verified against code, not assumed)

| Claim | Where it's enforced |
|---|---|
| A published campaign is already in the marketplace for everyone | `usePublicCampaigns.ts` filters **only** `status='published'` + `group_id IS NULL` + already-taken exclusion. **No invitation filter exists.** |
| Every onboarded creator is emailed at publish anyway | `send-campaign-publish-notifications` mails all creators with a completed profile — **but see the correction below: this leg was dead in production until 2026-08-08** |
| There is no "Accept" button | Accepting **is** applying — `apply_to_campaign` flips a pending invitation to `accepted` as a side effect |
| An invite grants no priority | The result is an ordinary `campaign_applications` row the business must review |
| The one real privilege | `useCreateApplication.ts` (+ RLS) lets an **invited** creator apply once the campaign is no longer `published` |

### Correction (2026-08-08): the "emailed at publish anyway" row was false

The second row above was written from the code's *intent*, not its behaviour. The function
filtered `creator_profiles` on `onboarding_complete`, a column that has never existed on that
table. PostgREST returned `42703` on every call, the error was discarded (`const { data: creators }`
with no `error` binding), the list came back `null`, and the whole creator fan-out was skipped —
while the function still returned `ok: true` and the business was told "Creators and brands have
been notified!". **No creator has ever received a new-campaign email in production.** Owner and
brand emails were unaffected, which is why it looked like it worked. Fixed 2026-08-08
(`is_completed`, error bound and reported).

**The conclusion in this doc still stands, but it now rests on one pillar instead of two.** An
invite confers no priority because the campaign is genuinely already in the marketplace for every
creator — `usePublicCampaigns` has no invitation filter, and that was verified directly. The email
claim was never a load-bearing part of that argument, but it was quoted as supporting evidence in
the #382 write-up and in `SHIPPED_LOG`, so treat those two mentions as inaccurate for their date.

Design intent is on the record — the 2026-04-26 invitations spec chose "the creator 'accepts' by
applying; 'declines' by doing nothing… no separate accept/decline UI flow" deliberately, to avoid
a parallel workflow. The defect was never the model; it was that the model was never explained.

### What actually fires on invite

`send-campaign-invitation` (service-role, `verify_jwt: true`, owner-gated) upserts one
`campaign_invitations` row (`status='pending'`, `expires_at = now + INVITATION_TTL_DAYS`, default
7) and then fans out **three** things: a Resend email (`campaign_invitation` template), an in-app
bell via `create-notification` (which deliberately sends no email for this type, to avoid
duplicating the richer one), and a proactive Donny DM with quick actions. All of it runs
**serially**, which is the source of the 3–4 second click latency.

## What PR #382 changed

**The product now states the reality.** The section header carries it in one sentence, the button
is **"Invite to apply"** (naming the ask is what kills the "make them do the work" reading), and
a `WhyExpander` (`campaign_invite`) carries the detail. Copy lives in one place —
`src/components/campaigns/inviteCopy.ts` — shared by the match cards and the All Creators list.

**Post-invite state tells the truth.** `useCampaignInvitations` had always SELECTed `status` and
**never read it**, so the `Set`-based `invitedCreatorIds` rendered a creator who **declined**
identically to one who **accepted** — a disabled "Invited ✓" with a green check, permanently.
`describeInvitation()` now maps status → `AppStatusBadge`:

| status | badge | tone |
|---|---|---|
| `pending` | Invited · waiting | amber |
| `accepted` / `counter_offered` | Applied — review them | teal (scrolls to `#applications-section`) |
| `declined` | Declined | neutral |

Showing the outcome answers "what happens after I invite?" better than any copy describing it.

**The click responds immediately.** Pending state is derived from the mutation's own
`variables.creatorId`, so it is scoped to the creator in flight — the All Creators tab previously
used the global `isPending` and froze *every* button. Deliberately **not optimistic**: the
function has real failure modes (403 non-owner, not published, crew rejection), and showing
"Invited" for three seconds before snapping back is worse than an honest spinner.

## Known issues / gotchas

- **Expired invitations used to be permanently un-resendable, silently — fixed in #382.** The
  client query hides `pending` rows past `expires_at`, so the button reverted to "Invite"; but
  `ignoreDuplicates: true` meant the row was never refreshed, so it returned
  `already_invited: true`, no notification re-fired, and `expires_at` stayed in the past — which
  also kept the row hidden from the creator's own query. The owner clicked and nothing happened,
  for good. Now an expired `pending` row is revived (UPDATE filtered on `id` + `status='pending'`,
  so a concurrent accept/decline isn't clobbered) and falls through to the normal fan-out.
- **`trg_reject_group_campaign_invitation` is `BEFORE INSERT` only** — despite its own migration
  comment claiming it "fires for every write path (incl. service-role)". That was harmless while
  INSERT was the only write path; the revive UPDATE made it load-bearing. `send-campaign-invitation`
  now re-asserts `campaign.group_id IS NULL` **in code** (400, right after the owner 403), so the
  guarantee doesn't depend on the trigger existing in prod. Read a trigger's `CREATE TRIGGER`
  clause, never its comment. See [[Creator Groups (Crews)]].
- **`bulk-invite` skips the in-app bell** (`useBulkInvite` omits the `create-notification` call),
  so bulk-invited creators get email + Donny but no bell.
- **No `updated_at` to trust.** `campaign_invitations` is one of the ~30 tables wired to the stub
  `handle_updated_at()`. The freshness signal here is `expires_at`, which is set explicitly.
- **Invitation status is not joined into the applications list**, so the business can't yet see
  which applicants were invited vs organic.

## See Also

- [[AI Creator Matching]] — the panel invitations are launched from, and its auto-run
- [[Creator Groups (Crews)]] — crew campaigns are members-only and reject invitations outright
- [[Campaign Lifecycle]] — where an application sits after the invite is accepted
- [[Service-Role Data Exposure]] — the review class that caught the `group_id` fan-out gap
