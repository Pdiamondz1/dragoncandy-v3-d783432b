# AIOS Connections — Google Workspace Integration (+ ops-deck restyle)

> Status: spec (PR 0 of 7). Codex gate #1 record at the bottom.
> Predecessor: `2026-06-11-dragoncandy-aios-design.md` (AIOS core, shipped — PRs #64–#84).

## 1. Why

The AIOS covers three of the Four C's (Context, Capabilities, Cadence). This build adds the
**Connections** pillar: Google Workspace. Founders and stakeholders connect Google accounts to
AIOS; docs, spreadsheets, and slides flow both ways (device ↔ AIOS ↔ Drive); Donny exports briefs,
analyses, metrics, and email drafts into Workspace; and a Google Chat bot scaffold stands ready
for the day the DragonCandy Workspace org is created. The internal surface also moves to the dark
"ops-deck" theme introduced by the internal login page.

**Hard realities the design is built around:**

- **Google Chat apps require a Workspace org.** The DragonCandy Workspace does not exist yet, so
  the Chat bot ships dark behind `GOOGLE_CHAT_PROJECT_NUMBER` (503 until set) with a
  registration runbook for Workspace day.
- **Drive/Docs/Sheets/Slides APIs work with any Google account** — per-user OAuth is live and
  testable immediately with personal accounts; Workspace accounts work identically later.
- **Google blocks embedding its editors.** Previews embed (`drive.google.com/file/d/{id}/preview`);
  editing always opens docs.google.com. "Local edit" = download → edit on device → re-upload.
- **`drive.file` is a non-sensitive scope**: no Google app-verification process, no 7-day
  refresh-token expiry (once the OAuth app is "In production"), and the app only sees files it
  created — which fits a DragonCandy-folder-centric hub exactly. The full `drive` scope is
  restricted and would require Google's paid security assessment; we never request it.
- **All Gmail content scopes (incl. `gmail.compose`) are RESTRICTED** — Google hard-blocks
  restricted-scope grants for unverified production apps (not just a warning). So API-created
  Gmail drafts are a **Workspace-day feature**: a Workspace org can mark the OAuth app
  **Internal**, which is exempt from verification entirely. Until then, "Donny drafts an email"
  uses a zero-scope **Gmail compose deep-link** (prefilled to/subject/body opens the user's own
  Gmail compose window — drafts only by construction).

## 2. Decisions (founder interview, 2026-06-11)

| # | Decision |
|---|----------|
| 1 | **Per-user OAuth now** (any Google account). When the Workspace exists, set `GOOGLE_ALLOWED_DOMAIN` — new connections must match the domain; existing non-domain connections flip to `needs_reconnect`. |
| 2 | **All four capabilities in scope**, staged: Drive file hub → Donny export → metrics/Gmail → Chat scaffold. |
| 3 | **Edit UX**: preview embedded in AIOS, real editing in Google's editors (new tab), local round-trip via download/upload. |
| 4 | **Placement**: `/internal/workspace`, stakeholder tier. |
| 5 | **Direct Google REST APIs** through one proxy edge function (Outstand pattern) — no hosted MCP server. Donny tools reuse the same helpers. |
| 6 | **Auto-flows**: brief → Google Doc on publish; metrics snapshot → living Sheet (Monday agent); Export-to-Doc from Internal Donny + strategy pages; Donny email **drafts** (never sends) — compose deep-links now, Gmail API drafts on Workspace day (restricted-scope reality, §1). |
| 7 | **Theme**: the whole AIOS dashboard restyles to the dark ops-deck theme. Consumer app untouched. |

## 3. Architecture

### A. Connection layer (per-user OAuth)

**Table `google_workspace_accounts`** — service-role-only. **Zero authenticated RLS policies**;
tokens are never readable from the client under any policy:

```
user_id uuid UNIQUE NOT NULL          -- one Google connection per internal user
google_email text NOT NULL
scopes text[] NOT NULL
refresh_token text NOT NULL
access_token text
access_token_expires_at timestamptz
dc_folder_id text                     -- the "DragonCandy AIOS" Drive folder
status text CHECK (active|needs_reconnect|revoked) DEFAULT 'active'
connected_at / updated_at timestamptz
```

**Status RPC `google_connection_status()`** — SECURITY DEFINER, `is_internal_user()` gate, returns
only the CALLER's `{connected, google_email, scopes, needs_reconnect}`. No token columns in the
return type, ever.

**OAuth flow** (authorization-code, all secrets server-side):

1. Workspace page → proxy `{action:'auth_url'}` → returns Google consent URL.
   `state` = HMAC-SHA256-signed payload (user id + nonce + origin host + issued-at, 10-min TTL),
   keyed by a dedicated `GOOGLE_OAUTH_STATE_SECRET`. This gives tamper resistance, user binding,
   and expiry — not one-time-use semantics; true replay is already dead because Google
   authorization codes are single-redemption, so a replayed `state+code` fails at the exchange.
2. Google consent (`access_type=offline`, `prompt=consent` to guarantee a refresh token).
3. Redirect to `/{origin}/internal/workspace/callback` (route added under the existing internal
   allowlist; registered for both `internal.dragoncandy.io` and `dragoncandy.io`).
4. Callback page POSTs `{code, state}` to proxy `{action:'oauth_callback'}` → server verifies
   state (signature + TTL + user matches caller JWT), exchanges the code (client secret never
   leaves the server), enforces `GOOGLE_ALLOWED_DOMAIN` when set, upserts tokens, finds-or-creates
   the "DragonCandy AIOS" folder, stores `dc_folder_id` → page navigates to `/internal/workspace`.

**Disconnect**: proxy revokes the token at Google (`oauth2.revoke`) and deletes the row.

### B. `google-workspace-proxy` edge function (single audited gateway)

- **Auth**: caller's Supabase JWT → `auth.getUser()` → server-side `user_roles` check
  (admin or stakeholder — same pattern as donny-chat's internal gate). Per-action token load with
  inline refresh; refresh failure marks the row `needs_reconnect` and returns a typed error the UI
  turns into a reconnect prompt.
- **Service mode** (exact `SUPABASE_SERVICE_ROLE_KEY` bearer + `acting_user_id`): used only by
  scheduled agents (metrics export); the acting user's roles are verified server-side before
  their tokens are used.
- **Actions** (POST `{action, ...params}`):
  `auth_url`, `oauth_callback`, `status`, `disconnect`,
  `list_files` (DragonCandy folder, fields: id/name/mimeType/modifiedTime/webViewLink/iconLink/
  webContentLink/exportLinks — binary uploads download via `webContentLink`; Google-native files
  have no blob, so the UI offers `exportLinks` formats, e.g. Doc → .docx/.pdf),
  `create_file` — Google-native files are created via **Drive `files.create`** with
  `parents:[dc_folder_id]` and the native MIME type (`application/vnd.google-apps.document` etc.);
  the Docs/Sheets/Slides create endpoints don't take a folder, so placement always goes through
  Drive — content edits then use the Docs/Sheets/Slides APIs. `rename`, `trash`,
  `upload_init` — starts a **Drive resumable-upload session** server-side and returns the
  pre-authorized session URL; the browser streams bytes directly to Google (avoids the 6 MB edge
  body limit and never exposes an OAuth token). The session URL is a bearer capability (reusable
  for that upload, ~1-week expiry per Google), so the proxy pins the metadata at init (name,
  parent = DragonCandy folder, MIME type), enforces size/type limits, and the URL is treated as a
  secret (returned to the initiating caller only, never logged),
  `export_markdown_to_doc` (creates/updates a Google Doc from markdown via Docs API batchUpdate),
  `append_metrics_to_sheet` (find-or-create "DragonCandy Metrics" Sheet in the folder; append one
  snapshot row — in service mode the proxy resolves the designated `google_export_user_id` from
  `aios_settings` **server-side**, so the scheduled agent's prompt stays dumb),
  `compose_email_link` (PR 5: builds a prefilled Gmail compose deep-link — zero OAuth scopes,
  body capped to a safe URL length with a "longer body exported as a Doc" fallback). A
  `create_gmail_draft` API action is **Workspace-day only** (Internal consent type, §1/§5); there
  is no send action, ever, by design.
- **Downloads/editing**: the client opens Google's own `webViewLink` (editor) or
  `webContentLink`/export link (download) in a new tab — the user is signed into Google in their
  own browser. No file bytes transit our backend.
- **Shared helpers** in `supabase/functions/_shared/google-workspace.ts` (token refresh,
  Drive/Docs/Sheets/Gmail REST wrappers, markdown→Docs-requests converter) — used by the proxy and
  by donny-chat's tools, so the logic exists once.

### C. `/internal/workspace` page (stakeholder tier, ops-deck theme)

- **Disconnected**: a "Connect Google" card in the InternalAuth visual language (glass card,
  teal CTA), short copy on what connecting enables, and the provisioning note. Shows the domain
  requirement when `GOOGLE_ALLOWED_DOMAIN` is active.
- **Connected**: connected-account chip (email + disconnect); file grid of the DragonCandy folder
  with type glyphs (Doc/Sheet/Slides/upload), modified times; "New Doc / Sheet / Slides" buttons;
  drag-and-drop upload zone (resumable); per-file actions: preview (embedded iframe pane),
  open in Google (new tab), download, rename, trash. The embedded preview is **best-effort**:
  it authenticates via the user's Google cookies in a cross-site frame, which Safari ITP /
  third-party-cookie blocking can break for private files — the pane falls back to an
  "Open in Google" prompt and is not a PR checkpoint blocker.
- Hooks `src/hooks/internal/useGoogleWorkspace.ts` — query keys `['aios','workspace',...]`,
  mutations invalidate the file list.
- **CSP**: add `https://drive.google.com` to `frame-src`.

### D. Donny Workspace tools (internal tool set)

`workspace_export_doc` (markdown → Doc, returns the doc link), `workspace_list_files`,
`workspace_append_metrics_sheet`, `workspace_compose_email_link` (PR 5: returns the prefilled
Gmail compose link for the user to open — Donny never sends). Tools execute with the
**caller's** Google tokens via the shared helpers; a user without a connection gets a helpful
"connect Google at /internal/workspace" tool result instead of an error. Tool results include
links so Donny can answer "exported — here's the doc."

**Trusted service path on donny-chat** (prerequisite for the Chat bot): exact service bearer +
`acting_user_id` in the body forces internal mode after server-side role verification of that
user. This is the only way to use donny-chat without a Supabase session, it cannot be reached
with a user JWT, and it is Codex-gated (gate #3).

### E. Auto-flows

- **Brief → Doc on publish**: `usePublishBriefing` also calls `export_markdown_to_doc`.
  Idempotency mapping lives ON the briefing row: nullable `gdoc_id` + `gdoc_owner_user_id`
  columns on `aios_briefings`. Re-publish by the SAME user updates that doc; a different
  publisher gets a fresh doc under their own connection (drive.file cannot touch another user's
  files) and the mapping moves to it. Best-effort: export failure toasts but never blocks the
  publish; no Google connection → publish succeeds with a "connect Google to export" toast.
- **Metrics → Sheet**: new `aios_settings` key/value table (admin-only RLS) holds
  `google_export_user_id` — the designated connection for org-level exports (normally Dame's).
  The Monday brief routine gains one step: POST `append_metrics_to_sheet` with the service
  bearer; the **proxy resolves the designated user server-side** (the routine never chooses the
  acting user). If the designated user has no active connection, the proxy returns a typed
  `export_unconfigured` error that the agent reports in its run summary. Sheet row: date, users
  by role, signups 7d, campaigns active, DragonShare posts/boosts + revenue split,
  db/storage bytes.
- **Export to Doc buttons**: on briefings, strategy-library docs, and Internal Donny answers.

### F. Google Chat bot scaffold (ships dark)

`google-chat-donny` edge function:

1. Verifies the request is from Google Chat: bearer is a Google-signed JWT
   (issuer `chat@system.gserviceaccount.com`, audience = `GOOGLE_CHAT_PROJECT_NUMBER`), validated
   against Google's public JWKs.
2. Maps the Chat sender's email against **`auth.users.email`** (service-role query — identity-bound,
   changeable only through Supabase Auth's verified email-change flow), **never `profiles.email`**
   (user-mutable, so it could bind a Google sender to the wrong account) → `user_roles`.
   Non-internal senders get a polite "this assistant is for the DragonCandy team" reply — no data.
3. Forwards the message through donny-chat's trusted service path (`acting_user_id` = mapped
   user), so Chat answers use the full internal tool set with that user's permissions.
4. Replies as Chat text (markdown-lite).

Returns 503 until `GOOGLE_CHAT_PROJECT_NUMBER` is configured. **Workspace-day runbook** (§5)
covers registering the Chat app.

### G. Ops-deck restyle (whole internal surface)

InternalLayout and every internal page adopt the login page's theme: `bg-dc-dark` shell with the
teal/pink glow + blueprint-grid atmosphere, glass cards (`bg-white/[0.04]`, `border-dc-teal/20`),
white/teal text hierarchy, monospace micro-labels, existing pill buttons kept. Internal-shared
components get explicit dark variants: `stats.tsx` (StatCard/SectionHeading/ErrorCard),
`MarkdownProse` (a `tone: 'light' | 'dark'` prop), recharts axis/grid/tooltip colors on the
Weight page. **Consumer-shared components (Donny chat bubbles, inputs) are not modified** — only
internal page wrappers. Both viewports verified per page; no gray utilities (brand rule).

## 4. Build order — PR-sized slices

| # | PR | Backend | Frontend | Checkpoint |
|---|----|---------|----------|------------|
| 0 | **Spec + runbook** (this doc) | — | — | Codex gate #1; founder sign-off; founder executes GCP runbook (§5) |
| 1 | **Connection layer** | table, status RPC, proxy `auth_url`/`oauth_callback`/`status`/`disconnect` | Workspace page connect/disconnect, callback route, nav item | Founder connects + disconnects a real account on internal.dragoncandy.io; **Codex gate #2** (token handling) |
| 2 | **Drive hub** | `list/create/rename/trash/upload_init`, folder bootstrap, CSP | file grid, dropzone, preview pane, open/download | Device upload → in Drive; create Doc → edit in Google → preview in AIOS → download back |
| 3 | **Ops-deck restyle** | — | all internal pages + shared internal components dark | Every page screenshotted, both viewports, consumer untouched |
| 4 | **Donny export** | `export_markdown_to_doc`, Donny tools, donny-chat redeploy | Export buttons; brief→Doc on publish | Publish a brief → Doc appears; "Donny, export this analysis" works |
| 5 | **Metrics + email links** | `append_metrics_to_sheet`, `compose_email_link`, `aios_settings`, routine prompt update | export-account setting UI | Monday run appends a Sheet row; Donny returns a prefilled Gmail compose link |
| 6 | **Chat scaffold** | `google-chat-donny`, donny-chat trusted service path | — | Deployed dark (503); **Codex gate #3**; Workspace-day runbook final |

## 5. Founder runbook — Google Cloud setup (before PR 1 checkpoint)

1. console.cloud.google.com → New project: **DragonCandy AIOS** (free; use your Google account —
   ownership transfers to the Workspace org later).
2. APIs & Services → Enable: **Google Drive API**, **Google Docs API**, **Google Sheets API**,
   **Google Slides API**. (Gmail API is NOT enabled now — API drafts are Workspace-day, §1.)
3. OAuth consent screen: External · app name "DragonCandy AIOS" · support email · publish status
   **In production** (critical: "Testing" status expires refresh tokens after 7 days). The
   "unverified app" warning during consent is expected and fine for ≤100 internal users.
4. Credentials → Create OAuth client ID (Web application):
   - Authorized redirect URIs: `https://internal.dragoncandy.io/internal/workspace/callback`
     and `https://dragoncandy.io/internal/workspace/callback`
5. Put the credentials in Supabase edge secrets: `GOOGLE_OAUTH_CLIENT_ID`,
   `GOOGLE_OAUTH_CLIENT_SECRET`, plus a fresh random `GOOGLE_OAUTH_STATE_SECRET`.

**Workspace day** (later): set `GOOGLE_ALLOWED_DOMAIN`; transfer/recreate the GCP project under
the org and flip the OAuth consent screen to **Internal** (org-only — exempt from Google
verification, which unlocks restricted scopes like `gmail.compose` for real API drafts); enable
the Gmail API then; create the Google Chat app (App ID + project number) pointing at
`https://zocahiffooqdybdhguqv.supabase.co/functions/v1/google-chat-donny`; set
`GOOGLE_CHAT_PROJECT_NUMBER`.

## 6. Verification

- Per-PR: `npm run typecheck` + `npm run build` + vitest; prod verification per session
  discipline (screenshots, console clean, both viewports).
- **Token safety (gate #2 focus)**: no token column in any client-reachable payload (status RPC
  return type + every proxy response audited); zero authenticated policies on
  `google_workspace_accounts`; `state` tamper + TTL + wrong-user tests (replay is covered by
  Google's single-redemption auth codes); cross-user test — user A cannot reach user B's
  connection through any action (including `acting_user_id`, which is service-only).
- **Chat path (gate #3 focus)**: forged/absent JWT rejected; non-internal sender gets no data;
  trusted service path unreachable with user JWTs.
- **End-to-end**: device file → Drive → edited in Google → previewed in AIOS → downloaded back;
  published brief → shareable Doc; Monday metrics row appends unattended; Donny's compose link
  opens a prefilled Gmail draft window and nothing is ever sent.

## 7. Deferred (explicitly out)

Google Picker import of pre-existing Drive files; service-account / domain-wide delegation;
Calendar; embedded editing (Google prohibits it); auto-sending email (drafts only, ever);
consumer-app Google features.

## 8. Review Record (gate #1)

**Codex (security/API reality): approve-with-changes — all 7 findings folded.**

1. *(High)* Chat sender mapping originally used user-mutable `profiles.email` → now identity-bound
   `auth.users.email` (§3.F).
2. *(High)* `gmail.compose` is a Google **restricted** scope (hard-blocked for unverified
   production apps) → API drafts moved to Workspace day (Internal consent type); zero-scope Gmail
   compose deep-links now (§1, §3.B, §3.D, PR 5, §5). *(Independently caught by the spec reviewer.)*
3. *(Med)* Resumable session URL is a reusable ~1-week bearer capability, not single-use → spec now
   pins metadata at init, limits size/type, treats the URL as a secret (§3.B).
4. *(Med)* Download fields were inconsistent → `list_files` now returns `webContentLink` +
   `exportLinks`; native Google files download via export formats (§3.B).
5. *(Med)* Native-file folder placement goes through Drive `files.create` + `parents`, not the
   Docs/Sheets/Slides create endpoints (§3.B).
6. *(Low)* State "replay test" overstated → reworded: HMAC gives tamper/TTL/user-binding; replay
   dies at Google's single-redemption auth codes (§3.A, §6).
7. *(Low)* Metrics service flow ambiguity → proxy resolves `google_export_user_id` server-side;
   typed `export_unconfigured` failure (§3.B, §3.E).

**Spec-document reviewer: Issues Found → fixed.** The Gmail restricted-scope gap (same as Codex #2)
plus three advisories folded: brief→Doc idempotency mapping (`gdoc_id`/`gdoc_owner_user_id` on
`aios_briefings`, cross-publisher behavior defined), metrics resolution server-side, embedded
preview marked best-effort (third-party-cookie reality).
