---
title: Google Workspace Connections Session
type: source
created: 2026-06-13
updated: 2026-06-13
sources: [raw/sessions/2026-06-13-weekly-sync.md, docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md]
tags: [aios, google, workspace, oauth, drive, connections]
---

# Google Workspace Connections Session

The AIOS "Connections" pillar (the fourth C after Context, Capabilities,
and Cadence). Founders and stakeholders connect Google accounts to the
internal dashboard; docs, spreadsheets, and slides flow both ways via the
`google-workspace-proxy` edge function.

Spec: `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`
PRs: #88 (GW 1), #92 (GW 2), #93 (GW 3), #95 (GW 4), #101 (GW 5a),
     #102 (GW 5b), #103 (GW 6), #104 (PROJECT_CONTEXT record)
Dates: 2026-06-11 (spec + GW 1) → 2026-06-13 (GW 5b + 6 + PROJECT_CONTEXT)

## Key Takeaways

1. **Tokens never touch the client** — `google_workspace_accounts` has zero
   authenticated RLS policies. All Google API traffic routes through the
   single `google-workspace-proxy` edge function.

2. **`drive.file` is the right scope** — non-sensitive, no Google app-verification
   process, no 7-day refresh-token expiry once "In production". Requesting the
   full `drive` scope would require Google's paid security assessment.

3. **Gmail drafts via deep-link only (now)** — `gmail.compose` is a RESTRICTED scope.
   The current `compose_email_link` tool generates a prefilled Gmail URL. Full Gmail
   API drafts unblock when the DragonCandy Workspace org exists (Internal OAuth app
   → verification exempt).

4. **Google Chat bot ships dark** — Returns 503 until `GOOGLE_CHAT_PROJECT_NUMBER`
   is set. Requires a Workspace org; runbook included in the spec.

5. **Founder GCP gotchas**: publish OAuth consent to Production (not Testing),
   register the exact callback path, enable Sheets API separately.

## What Shipped

- Connection layer: per-user OAuth, `google_workspace_accounts` table,
  `google_connection_status()` RPC, `google-workspace-proxy` edge function
- Drive file hub: browse/create/rename/trash/upload + embedded preview
- Ops-deck dark restyle of the entire `/internal` surface
- Donny Workspace export: markdown → Google Doc from answers, briefings, strategy pages
- Gmail compose deep-link: `compose_email_link` Donny tool
- Metrics → living Sheet: service-bearer path, Monday brief auto-flow
- Google Chat bot scaffold (dark): `google-chat-donny` edge function

## Remaining (Workspace-org-gated)

- Register Chat app + set `GOOGLE_CHAT_PROJECT_NUMBER`
- Set `GOOGLE_ALLOWED_DOMAIN` (domain-match enforcement for new connections)
- Full Gmail API drafts (Internal OAuth app → `gmail.compose` scope)

## Key Decisions

- Per-user OAuth now (any Google account); Workspace-day: set `GOOGLE_ALLOWED_DOMAIN`
- Editing always opens Google's editors in new tab (Google blocks embedding editors)
- No hosted MCP server — direct REST via the proxy (mirrors the Outstand pattern)
- Auto-flows: brief → Doc on publish; metrics → Sheet on Monday brief; Export-to-Doc in UI

## See Also

- [[Google Workspace]]
- [[Donny AI]]
- [[Supabase]]
- [[Outstand]]
