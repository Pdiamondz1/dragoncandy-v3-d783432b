# Session Extract: Weekly Sync — 2026-06-13

## Session Metadata
- Created: 2026-06-13
- Project: dragoncandy-v3-d783432b
- Branch: main (automated wiki-sync routine)
- Type: Documentation sync — synthesized from commits dated 2026-06-11 → 2026-06-13
  (post-AIOS watermark, PRs #82–#107), closing the gap since the 2026-06-11 wiki log.

## Purpose

Capture the Google Workspace / Connections workstream (6 PRs), Dashboard UX calm (3 PRs),
AIOS post-ship polish, Donny fixes, and analytics firehose fix that shipped after the last
wiki entry (2026-06-11). Also correct the codebase scale (now 73 pages / 206 hooks /
80 edge functions as of 2026-06-13).

---

## 1. DragonCandy AIOS — Google Workspace / Connections (6 PRs, 2026-06-12/13)

The fourth "C" of the AIOS (Connections) shipped: founders and stakeholders can connect
Google accounts to the internal dashboard and drive content into Google Workspace.
Spec: `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`
PRs: #88 (GW PR 1), #92 (GW PR 2), #93 (GW PR 3), #95 (GW PR 4),
     #101 (GW PR 5a), #102 (GW PR 5b), #103 (GW PR 6), #104 (PROJECT_CONTEXT record)

### A. Connection layer (GW PR 1 — #88, 2026-06-11)

- **`google_workspace_accounts` table** — service-role-only. Zero authenticated RLS
  policies; tokens are never readable from the client under any policy.
  Columns: `user_id` (UNIQUE), `google_email`, `scopes text[]`, `refresh_token` (stored),
  `access_token`, `access_token_expires_at`, `dc_folder_id`, `status` (active/needs_reconnect/revoked).
- **`google_connection_status()` RPC** — SECURITY DEFINER, `is_internal_user()` gate,
  returns only `{connected, google_email, scopes, needs_reconnect}` — no token columns.
- **OAuth flow**: HMAC-SHA256-signed `state` payload (user id + nonce + origin host + issued-at,
  10-min TTL, keyed by `GOOGLE_OAUTH_STATE_SECRET`). Google authorization codes are single-
  redemption so replayed state+code fails at the exchange. `access_type=offline`, `prompt=consent`
  guarantees a refresh token. Callback at `/internal/workspace/callback`.
- **`google-workspace-proxy` edge function** — single audited gateway for all Google API traffic.
  Auth: caller's Supabase JWT → server-side `user_roles` check (admin or stakeholder).
  Service mode (service-role bearer + `acting_user_id`) used only by scheduled agents.
  Per-action token load with inline refresh; failure marks `needs_reconnect`.
- **Scopes**: `drive.file` (non-sensitive, no Google app verification, no 7-day expiry once
  "In production") + `openid` + `email`. `drive` (full) would require a paid security assessment
  — never requested.
- **Founder GCP gotchas**: (1) publish OAuth consent screen to Production — Testing mode blocks
  non-test-users and expires refresh tokens in 7 days; (2) register exact
  `/internal/workspace/callback` redirect path; (3) enable Sheets API separately (Drive and
  Sheets are separate Google APIs despite the `drive.file` scope covering Sheets files).

### B. Drive file hub (GW PR 2 — #92, 2026-06-11)

- Browse, create (Docs/Sheets/Slides), rename, trash, upload, and embedded-preview files
  in the "DragonCandy AIOS" Drive folder (folder id stored in `dc_folder_id`).
- Previews via `drive.google.com/file/d/{id}/preview` (embeddable). Real editing opens
  `docs.google.com` in a new tab — Google blocks embedding its editors.
- Google-native files (Docs/Sheets/Slides) have no binary blob; the UI offers `exportLinks`
  (e.g. Doc → .docx/.pdf). Binary uploads use `webContentLink` for download.

### C. Ops-deck dark restyle (GW PR 3 — #93, 2026-06-12)

- The entire `/internal` surface (AIOS dashboard, Internal Donny, findings, briefings,
  workspace) restyled to the dark "ops-deck" theme introduced by the founders-only login page.
- Consumer app `dragoncandy.io` untouched.

### D. Donny Workspace export (GW PR 4 — #95, 2026-06-12)

- "Export to Doc" available from: Internal Donny answers, operating briefings, strategy pages.
- Markdown → Google Doc conversion via the proxy's `create_doc_from_markdown` action.
- "Brief → Doc on publish" auto-flow: the Monday brief routine triggers a new Doc when
  a brief is published.

### E. Gmail compose deep-link / metrics Sheet (GW PRs 5a + 5b — #101/#102, 2026-06-13)

- **Gmail compose deep-link** (GW PR 5a — zero-scope): `gmail.compose` is a RESTRICTED scope
  (Google hard-blocks unverified production apps). A compose deep-link (prefilled to/subject/body
  opens the user's own Gmail compose window) delivers "Donny drafts an email" without any Gmail
  API scope. Full Gmail API drafts are a Workspace-day feature (Internal OAuth app → exempt from
  verification). `Donny.compose_email_link` tool added.
- **Metrics → living Google Sheet** (GW PR 5b): the Monday brief agent auto-flows platform
  metrics into a locked-down living Sheet via a service-bearer path. Acting account resolved
  server-side (no user interaction required).

### F. Google Chat bot scaffold (GW PR 6 — #103, 2026-06-13) — ships dark

- Verifies Google's signed JWT and routes internal admins to Donny through a trusted service path.
- Returns **503 until set**: `GOOGLE_CHAT_PROJECT_NUMBER` secret.
- Registration runbook for Workspace day: Chat app must be registered in GCP console under
  the DragonCandy Workspace org. Until the Workspace org is created, the scaffold stays dark.
- Also requires: `GOOGLE_ALLOWED_DOMAIN` set to enforce domain-matching on new connections.

---

## 2. AIOS Post-Ship Polish (2026-06-11, PRs #82–#84)

Minor hardening after the 8-PR AIOS core shipped:
- **PR #82** — Founders-only login page at `internal.dragoncandy.io/auth`.
- **PR #83** — Access-denied card gains account switch (sign out + `/auth`) and shows the
  signed-in email; wrong-account users were hard-stuck on `internal.dragoncandy.io`.
- **PR #84** — Sign-out control added to the AIOS header (email + LogOut pill); the internal
  host has no consumer nav, so there was previously no way to end a session.

---

## 3. Dashboard UX Calm (3 PRs, 2026-06-12)

All three role dashboards replaced cluttered layouts with a calm information hierarchy.
PRs: #96 (Business, PR 1 of 3), #99 (Creator, PR 2 of 3), #98 (Brand, PR 3 of 3).

### What changed

- **Layout**: quiet greeting, ONE teal hero CTA ("Create a Campaign with Donny"), consolidated
  Needs-your-attention frame, inline stats, single tabbed/accordion Recent-activity zone
  (lg: tabs; mobile: accordion).
- **New shared kit** in `src/components/dashboard/`: `DashboardGreeting`, `HeroPrimaryAction`,
  `StatsRow`, `NeedsAttentionSection` (CSS `:has()` hides itself when all children render null),
  `RecentActivitySection`.
- **Presentation-only variants** on shared components, defaults unchanged for other consumers:
  `PendingActionBanners`/`ActionBanner` `variant=row`, `RatingPrompt` + both managers `variant=row`,
  `DragonShareActivityCard` frameless, `ActivityFeedCard` `variant=row`.
  `UpcomingPostsWidget` rows moved from gray to dc-teal tints (no-gray rule).
- **Legacy components retired** with Brand dashboard (PR 3 of 3): `DashboardHero`,
  `DashboardStatsGrid`, `QuickActionButtons`.
- **No hook, data-flow, navigation, or dismissal logic changes.**

---

## 4. Donny Fixes (PRs #94, #105)

- **PR #94** (2026-06-12): Input-first mobile tray — keyboard-safe chat UX on mobile.
  Donny chat opens in a bottom tray with input field focused first; keyboard safe (no
  viewport overlap).
- **PR #105** (2026-06-13): Fixed empty answers on platform/revenue/scaling questions.
  Root cause: specific question types fell through the routing logic and returned empty
  strings instead of triggering the right Donny tool.

---

## 5. Analytics Events Firehose Fix (PR #106, 2026-06-13)

The `analytics_events` table had grown to 335K+ rows, mostly from `performance_metric`
events fired on every render of `PerformanceMonitor`.

- **Stopped the firehose**: `performance_metric` events no longer persisted to Postgres.
- **Purged 335K dead rows** via migration.
- **Self-adjusting retention**: 90-day age budget + 1M-row count budget (whichever triggers
  first). A pg_cron job (`analytics_events_retention`) runs nightly.
- **Budget watermark alert** on `/internal/weight`: surfaces when `analytics_events`
  approaches the 1M-row budget ceiling.
- Spec: `docs/superpowers/specs/2026-06-13-analytics-events-scaling-design.md`

---

## 6. Codex Second Reviewer (PR #107, 2026-06-13)

Added a mandatory "Codex second review (required)" step to `CLAUDE.md` Code Review Standards.
Codex runs after Claude's own reviews pass and before finishing any branch / opening a PR.
Two independent models review every change.

---

## Codebase Scale (verified 2026-06-13)

- **73 pages**, **206 hooks**, **80 edge functions** (excluding `_shared/`)
- Prior docs said: 60 pages, 183 hooks, 73 edge functions (as of 2026-06-07)
- Growth since 2026-06-07: +13 pages, +23 hooks, +7 edge functions
- New edge functions since last sync include: `google-workspace-proxy`, `google-chat-donny`
