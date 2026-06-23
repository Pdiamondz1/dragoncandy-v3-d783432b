---
title: Notification Email Audit Session
type: source
created: 2026-06-23
updated: 2026-06-23
sources: [2026-06-23-notification-email-audit.md]
tags: [notifications, email, edge-functions, auth, bugfix]
---
# Notification Email Audit Session

One-paragraph summary: A reported dead "View Campaign" button on the Campaign Invitation
email (PR #161) cascaded into a full audit of every button in `send-notification-email`
and a caller-payload trace of every notification email, which uncovered that
DragonCandy's self-only email auth gate was **silently 403-dropping 9 transactional
emails** sent directly from the frontend to the counterparty. All were fixed by routing
through `create-notification`. See [[Notification Delivery]] for the durable pattern.

## Key claims

- The dead invitation link was `href="undefined"`: a duplicate `create-notification`
  email omitted `campaignUrl`, and the `campaign_invitation` template was the only one
  with no `baseUrl` fallback. Fix: dropped the duplicate email (bell-only;
  `send-campaign-invitation` is sole email owner) + added the fallback.
- **Systemic finding:** `send-notification-email`'s self-only gate 403s any frontend
  caller emailing another user. 6 frontend flows (likes, content-started, joint
  approvals, project + sponsorship completion) were rerouted through `create-notification`
  (service-key send + the in-app bell they lacked).
- 2 broadcast types had no template (`new_sponsorship_opportunity`,
  `new_campaign_available`) → renamed to `new_campaign_for_brands` /
  `new_campaign_for_creators`. 3 missing templates added (`campaign_cancelled`,
  `dispute_alert`, `org_invite`).
- 3 buttons pointed at non-existent routes (NotFound); all id-interpolated buttons
  guarded against `/undefined`.
- Two Codex P2s: like-email is intentionally pref-gated (category `content`, off by
  default — not forced); `esc.recipientName` now falls back to the server-resolved `rn`.

## Notable decisions

- `content_liked` stays bell-only-by-default (respects the user's content-email
  preference; the old direct send never delivered anyway). `forceDelivery` would wrongly
  override prefs.
- Verify subagent trace claims against source — the trace pass made several wrong claims.

## See Also

- [[Notification Delivery]] — the pattern distilled from this session
- [[Campaign Lifecycle]]
