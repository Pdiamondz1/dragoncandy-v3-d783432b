# AIOS — Workspace doc reading, Strategy-library import, and in-UI knowledge merge

- **Date:** 2026-06-20
- **Status:** Design (approved for planning)
- **Area:** DragonCandy AIOS (`/internal`), Google Workspace integration, Donny knowledge/RAG
- **Related specs:**
  - `docs/superpowers/specs/2026-06-11-google-workspace-connections-design.md`
  - `docs/superpowers/specs/2026-06-18-wiki-commit-pr-design.md`
  - `docs/superpowers/specs/2026-06-18-donny-answer-to-wiki-design.md`
  - `docs/superpowers/specs/2026-06-11-dragoncandy-aios-design.md`

## 1. Problem

Three founder-reported gaps in the AIOS:

1. **Donny can't read Workspace docs.** Internal Donny has `workspace_list_files`
   (sees file names/ids) and `workspace_export_doc` (writes a Doc), but no way to
   read the *contents* of a Doc back. He can list the Drive but not read it.
2. **No path from a Workspace doc into the Strategy library.** The Strategy library
   (`internal_docs`) is populated via `supabase/scripts/sync-internal-docs.mjs`, which
   reads repo files and **POSTs them to `donny-knowledge-sync`** — the edge function
   that actually writes `internal_docs` (and `donny_knowledge`). An arbitrary Google
   Doc cannot land there.
3. **The knowledge-save round-trip leaves the app twice.** Today: *Save to knowledge
   → `wiki-save-answer` opens a GitHub PR → founder merges on GitHub → founder deploys
   on Lovable → next sync ingests into Donny's RAG.* The pain is the two app exits
   (GitHub, then Lovable).

## 2. Constraints & key facts (verified in code)

- **OAuth scope is `drive.file` only** (`_shared/google-workspace.ts:18`). The app —
  and therefore Donny — can only access files it *created itself*: exports, uploads,
  and Docs made through the Drive hub, all in the **"DragonCandy AIOS"** folder. A
  hand-authored Doc elsewhere in the founder's Drive is invisible under this scope.
  Reaching the whole Drive would require a *restricted* scope (`drive.readonly`) and a
  Google CASA security assessment — explicitly **out of scope**.
- **The knowledge sync is upsert-only, no prune** (`donny-knowledge-sync/index.ts`).
  It populates `donny_knowledge` (internal RAG) keyed on `metadata.source_id`, **and**
  additionally upserts `internal_docs` (Strategy library viewer) keyed `onConflict:
  "path"` — but the `internal_docs` write fires **only when the page payload carries
  both `scope: "internal"` and `full_content: true`** (and the validator *rejects*
  `full_content` unless `scope: "internal"` is also set). So any merge→sync POST that
  wants a doc to appear in the library, not just the RAG, MUST send
  `scope: "internal"` + `full_content: true` + a `metadata.path` of the canonical wiki
  form `docs/wiki/<folder>/<slug>.md`. So a correctly-synced Strategy-library doc is
  *also* a doc in Donny's brain.
- **PR plumbing already exists.** `wiki-save-answer` and `wiki-commit-pr` open PRs using
  the fine-grained **`GITHUB_WIKI_TOKEN`** edge secret (single repo; Contents + Pull
  Requests R/W). Merge requires exactly those same permissions — **no new secret.**
- **The Lovable deploy is not needed for knowledge.** Donny's brain is a DB table fed
  by a sync, not the frontend bundle. The frontend deploy step in the current flow is a
  founder habit, not a technical dependency for RAG/library updates. Eliminating it is
  safe.
- **Invariant to preserve:** *Donny never writes knowledge directly — a human reviews
  and merges first.* All three founder decisions keep this gate.

## 3. Founder decisions (resolved during brainstorming)

| Fork | Decision |
|------|----------|
| Knowledge-save model (#3) | **In-UI approve, keep the PR gate.** Merge via GitHub API from inside `/internal`; no GitHub visit, no Lovable step. |
| Doc reach (#1, #2) given `drive.file` | **AIOS folder only.** No Google Picker, no scope upgrade. |
| Strategy-library import target (#2) | **PR → repo → in-UI merge**, reusing the #3 pipeline; lands in both library and RAG. |
| Merge surface | **"Pending knowledge" panel** listing open wiki PRs, each with a Merge & sync button. |
| Slice C default folder | **`analyses`**, editable in the import dialog (matches `wiki-save-answer`). |

## 4. Architecture

The three asks collapse onto **one new keystone** (an in-UI approve-&-merge pipeline)
plus two satellite additions. Build order **A → B → C**; each slice is independently
shippable.

### Slice A — Donny reads AIOS docs (#1)

- **New shared helper `readDcFile` in `_shared/google-workspace.ts`.** This is the
  single source of truth for both callers below (matching the existing pattern:
  `donny-chat` imports `driveCtx`/`listDcFiles`/`exportMarkdownToDoc` from this shared
  module and calls them directly — it does **not** HTTP-proxy to
  `google-workspace-proxy`). The helper takes `(token, folderId, fileId)`, and:
  - **Guard:** verifies the file's `parents` includes the "DragonCandy AIOS" folder id.
    Reject anything else — we never read files outside the app's own folder, even though
    `drive.file` already limits the token.
  - Exports by mime type via Drive: Google Docs → `text/markdown`; Google Sheets →
    `text/csv`; uploaded text/markdown → raw bytes. Rejects binary/unsupported types
    with a clear `code`.
  - **Caps output** at ~50 KB (returns `{ text, truncated }`) to protect Donny's
    context window.
- **New proxy action `read_file`** in `google-workspace-proxy`: `{ action: "read_file",
  file_id }` → resolves `driveCtx` (caller-session, no service mode) → calls
  `readDcFile`. Used by the Slice C import dialog.
- **New Donny internal tool `workspace_read_file`** in `donny-chat`:
  - `input_schema`: `{ file_id: string }`, required.
  - Description steers Donny to call `workspace_list_files` first to obtain the id.
  - Handler resolves `driveCtx` for the caller and calls `readDcFile` **directly**
    (same direct-import mechanism as the existing `workspace_list_files` /
    `workspace_export_doc` handlers — not an HTTP call to the proxy).
  - **Internal tool set only** (never exposed to consumer Donny).
- **Deploy note:** `donny-chat` calls `serve()` at import, so this is a `donny-chat`
  redeploy — founder-run, per existing convention. `google-workspace-proxy` redeploys
  independently.

### Slice B — In-UI approve & merge (#3, keystone)

- **New edge function `wiki-merge-pr`** (admin-gated; reuses `GITHUB_WIKI_TOKEN`):
  - Trusts only `{ pr_number }`. Re-derives everything else server-side.
  - Steps: (1) `GET .../pulls/{n}` + changed-files — confirm it targets `main` and that
    **every** changed path matches `^docs/wiki/(concepts|entities|analyses)/[a-z0-9-]+\.md$`
    (the exact folders `donny-knowledge-sync` can round-trip), and that the PR is
    `mergeable`. (2) If not yet mergeable (CI pending), return
    `{ state: "not_mergeable_yet" }` (no error). (3) `PUT .../pulls/{n}/merge` (squash).
    (4) For each changed file, fetch merged content from GitHub raw and POST to
    `donny-knowledge-sync` with the **full payload required for the dual write**:
    `{ source_id, content, metadata: { title, type, path, tags }, scope: "internal",
    full_content: true }` where `path` is the canonical `docs/wiki/<folder>/<slug>.md`
    — without `scope: "internal"` + `full_content: true` the doc would update the RAG
    but **never appear in the Strategy library** (and `full_content` without `scope`
    is rejected 400). Parse `title`/`type`/`tags` from the file's frontmatter; derive
    `source_id` the same way the sync script does (stable per path). (5) Return
    `{ merged: true, synced: [...] }`.
  - **Path allow-list (defense in depth):** the changed-files assertion above refuses to
    merge a PR that touches anything outside the three wiki folders — these are
    knowledge PRs only, never code.
  - Idempotent: re-invoking on an already-merged PR returns success and re-syncs.
- **New "Pending knowledge" panel** (UI), placed on `/internal/corrections` (or a small
  shared card reused on `/internal/strategy`):
  - Lists open PRs touching `docs/wiki/**` via the GitHub list API (new read action,
    same token). **De-dupe by head branch** — `wiki-save-answer`/`wiki-commit-pr` reuse
    a deterministic branch name per page/correction, so a re-opened PR for the same slug
    can exist; show one row per head branch so the panel never displays stale duplicates.
  - Each row: PR title, rendered-markdown **preview** (reuse `MarkdownProse`), a
    **Merge & sync** button (calls `wiki-merge-pr`), and a plain "View diff on GitHub"
    link for the founder who *wants* it.
  - On `not_mergeable_yet`: button shows "checks running — retry," no destructive state.
  - After `wiki-save-answer` / `wiki-import-doc` succeed, the success toast deep-links
    to this panel (replacing today's "Open PR on GitHub" as the primary action).
- **CI interaction (to confirm in planning):** if `main` requires status checks, a
  docs-only PR may be briefly un-mergeable. Determine whether the CI gate runs on
  `docs/wiki/**`-only PRs; if so, the `not_mergeable_yet` path + retry covers it.
- **Gate preserved:** a human reviews the rendered markdown and clicks merge. Donny
  never self-merges; `wiki-merge-pr` is admin-gated and only callable from the UI.

### Slice C — Import an AIOS Doc into the Strategy library (#2)

Built on A (reader) and B (merge surface):

- **"Add to Strategy library" action** on each Doc row in the Drive hub
  (`/internal/workspace`, `WorkspaceFileGrid`).
- **Import dialog** (sibling of `SaveToKnowledgeButton`): title (prefilled from the Doc
  name), folder select (`analyses` default / `concepts`), filename (kebab, derived),
  optional tags.
- Flow: read the Doc as markdown via the Slice A `read_file` action → **new
  `wiki-import-doc` edge function** (sibling of `wiki-save-answer`: admin gate, 2-folder
  whitelist, kebab filename, server-built YAML-safe frontmatter) → opens a PR to
  `docs/wiki/<concepts|analyses>/<slug>.md` → appears in the **Pending knowledge panel**
  → founder Merge & syncs → lands in library + RAG.
- **Provenance lives in the frontmatter / body** (`source: workspace`, originating Doc
  id, import date) — **not** in the `path` column. The `path` must stay the canonical
  wiki path `docs/wiki/<folder>/<slug>.md`, because that is the `internal_docs`
  `onConflict` upsert key; this also keeps a later `sync-internal-docs.mjs` re-sync
  idempotent (updates the same row instead of duplicating it).
- Google Docs export to `text/markdown` (Drive native) gives clean markdown; the
  function strips/normalizes any existing frontmatter and writes its own.

## 5. Data flow (knowledge capture, after this change)

```
Save-to-knowledge / Corrections "Open wiki PR" / Import-AIOS-Doc
        │  (wiki-save-answer | wiki-commit-pr | wiki-import-doc)
        ▼
   GitHub PR (docs/wiki/**)  ──►  "Pending knowledge" panel in /internal
        │                                   │ founder reviews rendered markdown
        │                                   ▼  clicks "Merge & sync"
        │                            wiki-merge-pr (admin-gated)
        │                              ├─ merge PR via GitHub API (squash)
        │                              └─ POST merged file → donny-knowledge-sync
        ▼                                          │
   canonical repo record               donny_knowledge (RAG) + internal_docs (library)
```

No GitHub site visit. No Lovable deploy.

## 6. Security & gates

- `wiki-merge-pr`, `wiki-import-doc`, and the PR-list read action are **admin-gated**
  (same internal-admin check as the rest of `/internal`) and reuse `GITHUB_WIKI_TOKEN`.
- `wiki-merge-pr` **path allow-list** (`docs/wiki/**` only) prevents the merge surface
  from ever touching code — knowledge PRs only.
- `read_file` **parent-folder guard** keeps Donny's reach inside the AIOS folder even
  within the `drive.file` scope.
- The human-merge invariant is preserved end to end.
- No schema migration, no new edge secret, no new OAuth scope.

## 7. Deletes / simplifies / automates

- **Deletes:** the GitHub visit and the Lovable deploy from every knowledge capture
  (~2 app exits, ~a dozen keystrokes per save).
- **Simplifies:** three "open a wiki PR" entry points now share **one** merge surface
  instead of each dead-ending at GitHub.
- **Automates:** post-merge RAG/library sync fires inline on merge (seconds), not at the
  next 3am cron.
- **Keystrokes:** `Save → (leave app) merge → (leave app) deploy` → `Save → Merge & sync`
  (two clicks, zero exits).

## 8. Out of scope (YAGNI)

- Google Picker / broad Drive scopes (founder chose AIOS-folder-only).
- Reading Slides bodies (Docs + Sheets cover the need; add later if asked).
- Conversational Donny tools to *trigger* an import or a merge (would redeploy
  `donny-chat` for marginal value; the UI buttons suffice).
- AI-generated wiki frontmatter/metadata for imports (v1 uses deterministic defaults,
  like `wiki-save-answer`).
- Editing/diffing a Doc's content in-app before import (import the Doc as-is; edit in
  the wiki PR if needed).

## 9. Build order & shippability

1. **Slice A** — `read_file` proxy action + `workspace_read_file` Donny tool. Ships
   alone; immediately lets Donny read AIOS docs.
2. **Slice B** — `wiki-merge-pr` + Pending knowledge panel + PR-list read. Ships alone;
   fixes the #3 round-trip for *all existing* PR sources.
3. **Slice C** — Import-AIOS-Doc button + dialog + `wiki-import-doc`. Depends on A and B.

Each slice: build → `npm run build` → Codex second pass → verify in prod.

## 10. Open items to resolve in planning

- Whether the CI gate runs on `docs/wiki/**`-only PRs (drives the `not_mergeable_yet`
  handling and whether merge can be immediate).
- Exact placement of the Pending knowledge panel (`/internal/corrections` card vs. a
  shared component also on `/internal/strategy`).
- Confirm Drive `files.export` `text/markdown` availability for the connected account;
  fall back to `text/plain` if needed.
