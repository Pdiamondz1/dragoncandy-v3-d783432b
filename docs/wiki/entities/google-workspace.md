---
title: Google Workspace
type: entity
created: 2026-06-13
updated: 2026-06-26
sources: [raw/sessions/2026-06-13-weekly-sync.md, raw/sessions/2026-06-20-aios-workspace-knowledge-merge.md, raw/sessions/2026-06-26-internal-only-user-fks.md, docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md, docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md]
tags: [aios, google, workspace, oauth, drive, connections]
---

# Google Workspace

The AIOS "Connections" pillar: founders and stakeholders connect personal or
Workspace Google accounts to the internal dashboard. Docs, spreadsheets, slides,
and emails flow both ways. All traffic routes through one audited edge function —
tokens never leave the backend.

Surface: `/internal/workspace` (stakeholder tier and above).

## Architecture

### Connection Layer

- **`google_workspace_accounts` table** — service-role-only. Zero authenticated RLS
  policies; no token columns are ever returned to the client.
  Key columns: `user_id` (UNIQUE), `google_email`, `scopes text[]`,
  `refresh_token`, `access_token`, `access_token_expires_at`, `dc_folder_id`,
  `status` (active / needs_reconnect / revoked).
- **`google_connection_status()` RPC** — SECURITY DEFINER, `is_internal_user()` gate.
  Returns only `{connected, google_email, scopes, needs_reconnect}`.
- **OAuth flow** — authorization-code, all secrets server-side. `state` is
  HMAC-SHA256-signed (user id + nonce + origin host + issued-at, 10-min TTL, keyed by
  `GOOGLE_OAUTH_STATE_SECRET`). Google authorization codes are single-redemption, so a
  replayed state+code fails at the exchange. `access_type=offline`, `prompt=consent`
  guarantees a refresh token.
- **Callback**: `/internal/workspace/callback` (registered for both
  `internal.dragoncandy.io` and `dragoncandy.io`).

### `google-workspace-proxy` Edge Function

Single audited gateway for all Google API traffic.

- **Auth**: caller's Supabase JWT → `auth.getUser()` → server-side `user_roles` check
  (admin or stakeholder). Per-action token load with inline refresh; refresh failure
  marks the row `needs_reconnect`.
- **Service mode**: exact `SUPABASE_SERVICE_ROLE_KEY` bearer + `acting_user_id`; acting
  user's roles verified server-side. Used only by scheduled agents (Monday brief → Sheet).
- **Actions**: `auth_url`, `oauth_callback`, `status`, `disconnect`,
  `list_files`, `create_file`, `rename_file`, `trash_file`, `upload_file`,
  `create_doc_from_markdown`, `export_metrics_to_sheet`, `compose_email_link`,
  `read_file` (2026-06-20 — guarded text read of an AIOS-folder file).

### Scopes

| Scope | Sensitivity | Note |
|-------|-------------|------|
| `drive.file` | Non-sensitive | App sees only files it created. No Google app-verification, no 7-day refresh expiry once "In production". |
| `openid` + `email` | Standard | Identity only. |
| `gmail.compose` | **RESTRICTED** | Not requested now — compose deep-link is the interim path. |
| `drive` (full) | Restricted | Would require Google's paid security assessment — never requested. |

## Capabilities

### Drive File Hub

Browse, create (Docs/Sheets/Slides), rename, trash, upload, and preview files in the
"DragonCandy AIOS" folder (`dc_folder_id`). Previews embed
(`drive.google.com/file/d/{id}/preview`); real editing opens `docs.google.com` in a new tab
— Google blocks embedding its editors. Google-native files have no binary blob; the UI
offers `exportLinks` (Doc → .docx/.pdf). Binary uploads use `webContentLink` for download.

### Donny Workspace Export

"Export to Doc" on: Internal Donny answers, operating briefings, strategy pages.
"Brief → Doc on publish" auto-flow (Monday brief routine).
Uses `create_doc_from_markdown` proxy action.

### Donny Reads AIOS Docs (2026-06-20)

Internal Donny can now READ the text of files in the AIOS folder, not just list them.
Pure `_shared/drive-export.ts` maps mime → read strategy (Google Docs → `text/markdown`,
Sheets → `text/csv`, text uploads → media, Slides/binary → unsupported); `readDcFile` in
`_shared/google-workspace.ts` guards on direct parentage of the AIOS folder and **streams**
the export, stopping at a 50 KB cap (bounded memory). Exposed as the `read_file` proxy
action and the internal-only `workspace_read_file` Donny tool (in `INTERNAL_TOOL_DEFINITIONS`
— never on the consumer surface). See [[In-UI Knowledge Merge]].

### Import an AIOS Doc into the Strategy Library (2026-06-20)

"Add to Strategy library" on importable Drive files (`WorkspaceFileGrid` → `WorkspaceHub`)
→ `wiki-import-doc` edge function reads the Doc server-side via `readDcFile` (content never
client-trusted), then opens a wiki PR (`donny-wiki-import/` branch) that lands in both the
library and Donny's RAG once merged through the [[In-UI Knowledge Merge]] panel.

### Gmail Compose Deep-Link

`compose_email_link` Donny tool generates a prefilled Gmail URL (to/subject/body).
Opens the user's own Gmail compose window — no Gmail API scope required.

> **Note**: Full Gmail API drafts (`gmail.compose` scope) are Workspace-day only.
> When the DragonCandy Workspace org exists, the OAuth app can be marked Internal
> (exempt from Google's app-verification). Until then, the deep-link is the only path.

### Metrics → Living Sheet

Service-bearer path: Monday brief agent exports platform metrics into a locked-down
living Sheet. Acting account resolved server-side; no user interaction.

### Google Chat Bot Scaffold — ships dark

`google-chat-donny` edge function routes internal admins to Donny through a trusted
service path. **Returns 503** until `GOOGLE_CHAT_PROJECT_NUMBER` secret is set.

## Status & Remaining Work

| Item | Status |
|------|--------|
| Per-user OAuth + proxy | Shipped |
| Drive file hub | Shipped |
| Donny reads AIOS docs (`read_file` / `workspace_read_file`) | Shipped 2026-06-20 (deploy founder-run) |
| Import AIOS doc → Strategy library (`wiki-import-doc`) | Shipped 2026-06-20 (deploy founder-run) |
| Ops-deck dark restyle | Shipped |
| Donny Workspace export | Shipped |
| Gmail compose deep-link | Shipped |
| Metrics → living Sheet | Shipped |
| Google Chat bot scaffold | Shipped dark (503 until Workspace org) |
| Register Chat app + `GOOGLE_CHAT_PROJECT_NUMBER` | Blocked — needs Workspace org |
| `GOOGLE_ALLOWED_DOMAIN` enforcement | Blocked — needs Workspace org |
| Full Gmail API drafts | Blocked — needs Workspace org (Internal OAuth app) |

## Key Decisions

- Per-user OAuth now with any Google account; domain enforcement added at Workspace launch.
- All Google API traffic through one proxy (same pattern as [[Outstand]]). No hosted MCP.
- `drive.file` scope only — avoids Google's paid security assessment while covering all use cases.
- Compose deep-link bridges the `gmail.compose` restriction gap without violating Google policy.

## Known Issues

- **Metrics Sheet requires Sheets API enabled** separately in GCP (Drive API does not
  imply Sheets API — a common gotcha).
- **OAuth consent must be "In production"** — Testing mode expires refresh tokens in 7 days
  and blocks non-test-users.
- **Google blocks embedding editors** — "Edit" always opens a new tab to `docs.google.com`.
- **Internal-only users were blocked at connect (fixed, PR #180).** `google_workspace_accounts.user_id`
  foreign-keyed `profiles(id)`, but [[Internal-Only AIOS Users]] have no `profiles` row, so the
  `oauth_callback` upsert failed an FK violation that the proxy reported as the opaque "internal
  error" (a Supabase `PostgrestError` is not an `Error` instance). Repointed the FK to
  `auth.users(id)` and added a `describeError` normalizer so future DB failures surface their real
  message+code. Deployed `google-workspace-proxy` v20.

## See Also

- [[Donny AI]] (Workspace export + read tools)
- [[In-UI Knowledge Merge]] (the import path's merge surface)
- [[Self-Improving App]] (knowledge flow into Donny's RAG)
- [[Supabase]] (proxy edge function, `google_workspace_accounts` table)
- [[Outstand]] (same single-proxy pattern)
- [[Internal-Only AIOS Users]] (why the connect failed for Adrian; the FK fix)
- [[Google Workspace Connections Session]] (source)
- [[AIOS Workspace Knowledge-Merge Session]] (source)
