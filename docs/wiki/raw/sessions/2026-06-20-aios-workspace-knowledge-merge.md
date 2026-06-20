# Session: AIOS Workspace reading, Strategy-library import & in-UI knowledge merge (2026-06-20)

Branch: `feat/aios-workspace-knowledge-merge` (26 commits). Built via brainstorm → spec →
plan → subagent-driven execution (7 units, per-unit spec+quality review) → opus whole-branch
review → Codex second review (clean after 4 fix waves).

Spec: `docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md`
Plan: `docs/superpowers/plans/2026-06-20-aios-workspace-knowledge-merge.md`

## Problem (three founder asks)

1. Internal Donny could LIST Workspace files (`workspace_list_files`) but could not READ
   their contents — no way to pull a Doc's text back.
2. No path from a Workspace doc into the Strategy library (`internal_docs`), which was
   populated only by the repo sync (`sync-internal-docs.mjs` → `donny-knowledge-sync`).
3. The knowledge-save round-trip left the app twice: Save → GitHub PR → merge on GitHub →
   deploy on Lovable → next sync into RAG.

## Founder decisions (resolved in brainstorming)

- Knowledge-save (#3): **in-UI approve, keep the PR gate** (merge via GitHub API from inside
  `/internal`; no GitHub visit, no Lovable step). The Lovable deploy was never needed for
  knowledge — Donny's brain is a DB table fed by a sync, not the frontend bundle.
- Doc reach (#1/#2) under `drive.file` scope: **AIOS folder only** (no Google Picker, no
  scope upgrade — `drive.readonly` would need a Google CASA security review).
- Library import (#2): **PR → repo → in-UI merge**, reusing the #3 pipeline; lands in BOTH
  the Strategy library and Donny's RAG.

Unifying insight: #2 and #3 collapse onto ONE new keystone — an in-UI approve-&-merge
pipeline + a "Pending knowledge" panel — and #1 is a standalone read path.

## What shipped (build order A → B → C)

### Slice A — Donny reads AIOS docs
- `supabase/functions/_shared/drive-export.ts` (pure): `pickExportMode` (Google Docs →
  `text/markdown`, Sheets → `text/csv`, text uploads → media, else unsupported), `capText`,
  `EXPORT_CAP = 50_000`.
- `readDcFile(token, folderId, fileId)` in `_shared/google-workspace.ts` (impure): parent-
  folder guard (rejects files not in the "DragonCandy AIOS" folder), streams the export and
  stops at `EXPORT_CAP` (bounded memory), returns `{name, mimeType, text, truncated}`.
- `read_file` action in `google-workspace-proxy`.
- `workspace_read_file` internal Donny tool in `donny-chat` (added to
  `INTERNAL_TOOL_DEFINITIONS` only — never exposed to consumer Donny). donny-chat redeploy
  is founder-run (it `serve()`s at import).

### Slice B — In-UI approve & merge (keystone)
- `_shared/wiki-sync-payload.ts` (pure): `buildSyncPage(path, raw)` reproduces EXACTLY the
  per-page payload `sync-internal-docs.mjs` POSTs — `source_id: internal-<folder>:<slug>`,
  `content: ${title}\n\n${body}`.slice(0,24000), `metadata.{title,type,path,tags}`,
  `scope:"internal"`, `full_content: <raw markdown>`. Matching this is what keeps the nightly
  cron from creating duplicate `donny_knowledge` rows.
- `_shared/wiki-merge-guard.ts` (pure): `MERGE_PATH_RE` (traversal-safe, matches the producer
  contract incl. underscores/dots/mixed case but no `/`), `assertAllWikiPaths`,
  `dedupeByHeadBranch`.
- `wiki-merge-pr` edge function (admin-gated, reuses `GITHUB_WIKI_TOKEN`): actions
  `list` / `preview` / `merge`. `merge` loads the PR, asserts base=main + wiki-only paths +
  create/modify-only statuses BEFORE the squash-merge, handles `mergeable===null` (one
  re-poll), is idempotent on already-merged, then batches the merged files (20/req) to
  `donny-knowledge-sync` (service-role bearer). Reports an honest `merged:true, synced:false`
  state on sync failure (the merge is durable; the nightly knowledge-freshness agent
  self-heals RAG lag).
- Frontend: `usePendingKnowledge` hooks, `PendingKnowledgePanel` (self-hiding, rendered-
  markdown preview, "Merge & sync"), mounted on `/internal/corrections`; the Save-to-
  knowledge toast now deep-links to the panel instead of GitHub.

### Slice C — Import an AIOS Doc into the Strategy library
- `_shared/wiki-import-page.ts` (pure): `buildImportedPage` (frontmatter with
  `sources: [workspace]`, provenance citing the Doc id + import date).
- `wiki-import-doc` edge function (admin-gated): reads the Doc SERVER-SIDE via `readDcFile`
  (content never client-trusted), surfaces typed error codes (`bad_file_id`, `not_connected`,
  `needs_reconnect`, `forbidden_file`, `unsupported_type`, `doc_too_large`, `file_exists`,
  `github_not_configured`), then opens a wiki PR with the `wiki-save-answer` ceremony
  (branch prefix `donny-wiki-import/`).
- Frontend: `src/lib/internal/wikiImport.ts` (helpers), `useImportDocToLibrary`,
  `ImportToLibraryDialog`, and an "Add to Strategy library" action on importable Drive files
  in `WorkspaceFileGrid` (wired in `WorkspaceHub`, not the thin `InternalWorkspace` shell).

## Key invariants preserved

- **Donny never writes knowledge directly — a human merges first.** Every path requires an
  admin click; Donny gained only a READ tool. No new merge/import tool on the Donny side.
- Merge surface is wiki-paths-only (path allow-list applied before the merge PUT).
- No schema migration, no new edge secret, no new OAuth scope.

## Gotchas / decisions captured

- **`verify_jwt = false` is required in `supabase/config.toml`** for any browser-invoked edge
  function that does its OWN admin check (so the gateway doesn't reject the CORS preflight
  before the function runs). `wiki-merge-pr` and `wiki-import-doc` needed it; the opus whole-
  branch review caught the omission. Same posture as `wiki-save-answer`/`wiki-commit-pr`.
- **`donny-knowledge-sync` returns HTTP 200 even on per-page upsert failures** (reports an
  aggregate `errors` count). Callers must parse the body, not just check `.ok`.
- **`donny-knowledge-sync` caps `pages` at 100**; batch heavy `full_content` payloads (20/req,
  matching `sync-internal-docs.mjs` BATCH).
- **`internal_docs` is written by `donny-knowledge-sync`** (not the sync script directly) and
  ONLY when the page carries `scope:"internal"` + a truthy `full_content` (the raw markdown).
- **`drive.file` scope** = the app sees only files it created; reads/imports are AIOS-folder-
  only by design.
- The merge gate must accept the full producer path contract (`wiki-commit-pr` allows
  underscores/dots/mixed case) but stay traversal-proof (no `/` in the filename segment).

## Founder-run follow-ups (post-merge)

- Deploy edge functions via Supabase MCP/CLI (bundle transitive `_shared/`):
  `google-workspace-proxy`, `wiki-merge-pr`, `wiki-import-doc`; redeploy `donny-chat` for
  `workspace_read_file`.
- Sync Donny's RAG against `main` (`sync-wiki-to-donny.mjs`).
- Verify in prod (both viewports) on `/internal/corrections`, `/internal/workspace`,
  `/internal/strategy`.
