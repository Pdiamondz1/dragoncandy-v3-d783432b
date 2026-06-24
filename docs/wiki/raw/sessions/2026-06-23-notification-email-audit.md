# Session: Notification email audit & delivery repair (PR #161)

Date: 2026-06-23
Branch: worktree-DC-AIOS-Donny5
PR: #161

## What prompted it

A content creator reported that the **Campaign Invitation** email's "View Campaign"
button did nothing on iPhone (it rendered as `href="undefined"`). Fixing it expanded
into a full audit of every button in `send-notification-email`, then a caller-payload
trace of every notification email, which uncovered a systemic delivery bug.

## What shipped (6 commits)

1. **Dead invitation link.** A single invite sent TWO emails: `send-campaign-invitation`
   (correct) and a second one via the frontend `create-notification` call. The
   `campaign_invitation` template was the only one using raw `data.campaignUrl` with no
   `baseUrl` fallback → when `create-notification` didn't pass `campaignUrl`, the button
   became `href="undefined"`. Fix: dropped the `campaign_invitation` email mapping from
   `create-notification` (bell-only now — `send-campaign-invitation` is the sole email
   owner, which also covers the bulk-invite path); the invitation button now builds
   `baseUrl + campaignId` as a fallback.

2. **Button-destination audit.** Cross-checked every template button against
   `src/App.tsx` routes. Fixed 3 pointing at non-existent routes (→ NotFound):
   `new_campaign_for_creators` `/dashboard/creator/marketplace` → `/dashboard/creator/campaigns`;
   `file_uploaded_by_creator` no-collab fallback `/business/projects` → `/dashboard/business/campaigns`;
   `file_uploaded_by_restaurant` no-collab fallback `/creator/projects` → `/dashboard/creator/projects`.
   Guarded all id-interpolated buttons (7× business-campaign CTA, `review_request`,
   `content_started`) with named URL consts so a missing id degrades to a list page
   instead of `/undefined`.

3. **Missing templates.** Added `campaign_cancelled` (creators got NO cancellation email —
   doubly broken: no template AND a frontend cross-user 403; now routed via
   `create-notification`), `dispute_alert` (admin email had no template; also honored an
   optional `subject` override), and `org_invite` (invite-member was passing unsupported
   raw `html` with no `type`). Corrected `file_uploaded` to use the restaurant-variant
   template for restaurant uploads (pass explicit `emailType`).

4. **Caller-payload trace → 9 silently-broken emails.** The keystone finding:
   `send-notification-email` has a self-only auth gate (added to "prevent enumerating
   other users' emails") that **403s any non-service caller whose `to`/`recipientUserId`
   isn't themselves.** Edge-function callers use the service key (fine), but every
   FRONTEND flow that emails the counterparty was 403'd and never delivered:
   `content_liked` (useFeedLike/FeedLightbox/DragonFeedCard), `content_started`
   (useDragonDashTimer), `application_status`+`approval_pending` (useJointApproval),
   `project_completion`+`completion_request` (useProjectComplete),
   `sponsorship_completed`+`sponsorship_completion_request` (useSponsorshipComplete).
   Plus two type names with no matching template: `new_sponsorship_opportunity` and
   `new_campaign_available` (in send-campaign-publish-notifications). Fix: rerouted all 6
   frontend flows through `create-notification` (service-key send + the in-app BELL they
   previously lacked) and renamed the two broadcast types to `new_campaign_for_brands` /
   `new_campaign_for_creators`.

5. **Codex P2 — like-email pref-gating.** content_liked now uses category `content`
   (email default OFF) → bell always, email only if the user opted in. Deliberate: the
   old direct path never delivered (403), and `forceDelivery` would wrongly override the
   user's content-email preference. Documented, not changed. Transactional reroutes use
   `campaigns`/`transactions` (email on).

6. **Codex P2 — empty greeting.** `esc.recipientName` fell back to `''`;
   create-notification callers pass `recipientUserId` (resolved server-side to `rn`) but
   not top-level `recipientName`, so templates greeting with `${esc.recipientName}`
   rendered "Hi ,". Fix: `recipientName` falls back to `rn`.

## Key decisions / invariants

- **`create-notification` is the correct delivery choke point for any cross-user
  notification from the frontend.** It runs the email send with the service key
  (`isService=true`, bypassing the self-only gate), resolves the recipient email
  server-side, AND inserts the in-app bell. Frontend code must never call
  `send-notification-email` directly with another user's `to`/`recipientUserId` — it 403s.
- `create-notification` honors an explicit `emailType` (`emailType ?? map[type]`), so a
  caller can target any template without adding a map entry.
- Category drives default email: `campaigns`/`transactions`/`account`/`dragonshare` = email
  on; `messages`/`content` = email off (bell only unless user opts in or `forceDelivery`).
- `/projects/:id` (CollaborationRedirect) expects a **collaboration id**; `content_started`
  passes `projectId = collaborationId` (correct despite the name).

## Gotchas

- Prod logs showed NO send-notification-email traffic in 24h (pre-revenue), so the
  403/missing-template findings are from code analysis, not observed runtime errors.
- Edge functions deploy separately (not via Lovable). Deployed via Supabase CLI;
  `verify_jwt` preserved per function (send-notification-email stays `false` per
  config.toml; invite-member / send-campaign-publish-notifications stay `true`).
- A subagent trace pass made several wrong claims (e.g. "file_uploaded not mapped",
  "review_request never invoked") — verified each against source before acting.

## Affected files

- Edge: `supabase/functions/send-notification-email/index.ts` (templates, subject
  override, recipientName fallback, invitation/guarded URLs), `create-notification`
  (dropped campaign_invitation email mapping, added campaign_cancelled),
  `send-campaign-publish-notifications` (type renames), `invite-member` (org_invite).
- Frontend reroutes: `useFeedLike`, `FeedLightbox`, `DragonFeedCard`, `useDragonDashTimer`,
  `useJointApproval`, `useProjectComplete`, `useSponsorshipComplete`, `useCampaignMutations`
  (campaign_cancelled), `useFileUploadNotification` (emailType), `src/types/notifications.ts`
  (union + map).

## Out of scope (noted)

- Bulk-invite (`useBulkInvite`) sends the email but creates no in-app bell.
- `CollaborationRedirect` always lands on the creator's my-campaigns view regardless of
  who clicks.
- Verification of delivered emails requires a real inbox (founder E2E) — code-verified only.
