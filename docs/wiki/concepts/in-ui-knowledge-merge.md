---
title: In-UI Knowledge Merge
type: concept
created: 2026-06-20
updated: 2026-06-20
sources: [raw/sessions/2026-06-20-aios-workspace-knowledge-merge.md, docs/superpowers/specs/2026-06-20-aios-workspace-knowledge-merge-design.md]
tags: [aios, donny, knowledge, wiki, github, rag, internal]
---

# In-UI Knowledge Merge

The pipeline that lets a founder review and merge a wiki knowledge PR **entirely inside
`/internal`** — no GitHub visit, no Lovable deploy — while preserving the gate that *a human
merges before anything enters Donny's brain*. Shipped 2026-06-20 on
`feat/aios-workspace-knowledge-merge`.

## Why it exists

Before this, every knowledge capture left the app twice: Save → GitHub PR → merge on GitHub
→ deploy on Lovable → next sync into the RAG. Two pain points were deleted:

- **The GitHub trip** — replaced by a "Pending knowledge" panel in the app.
- **The Lovable deploy** — never actually needed for knowledge. Donny's brain
  (`donny_knowledge`) is a DB table fed by a sync, not the frontend bundle. The deploy was a
  founder habit, not a dependency.

It unifies three previously-separate "open a wiki PR" entry points — [[Donny Answer to Wiki
Session]] (Save to knowledge), [[Wiki-Commit-PR Session]] (correction "Open wiki PR"), and the
new Workspace-doc import ([[Google Workspace]]) — onto ONE merge surface.

## The keystone: `wiki-merge-pr` edge function

Admin-gated (same gate as `wiki-save-answer`), reuses `GITHUB_WIKI_TOKEN` (Contents + Pull
Requests R/W — no new secret). Three actions:

- **`list`** — open PRs touching ONLY `docs/wiki/**`, deduped by head branch. Pages through
  ALL PR files (not just the first 100) and skips PRs with non-create/modify file statuses.
- **`preview`** — rendered markdown of a PR's first wiki file (panel preview).
- **`merge`** — loads the PR; asserts base=`main`, wiki-only paths, and create/modify-only
  statuses **before** the squash-merge; handles GitHub's async `mergeable===null` (one
  re-poll); is idempotent on already-merged; then **batches** the merged files (20/req) to
  `donny-knowledge-sync`.

### The sync-contract invariant

`wiki-merge-pr` must build the EXACT page payload that the nightly `sync-internal-docs.mjs`
sends, or the cron would create **duplicate `donny_knowledge` rows**. The shared
`buildSyncPage(path, raw)` reproduces it: `source_id: internal-<folder>:<slug>`,
`content: ${title}\n\n${body}`.slice(0,24000), `metadata.{title,type,path,tags}`,
`scope:"internal"`, `full_content: <raw markdown>`. See [[Self-Improving App]].

### Honest failure semantics

The merge is durable once GitHub returns success, so a *sync* failure must NOT report as a
*merge* failure. `merge` returns `{ merged: true, synced: false, sync_error }` when the RAG
sync fails (transport error or per-page `errors > 0`). The daily knowledge-freshness agent
self-heals the RAG lag, and re-invoking `merge` re-syncs idempotently.

## The panel

`PendingKnowledgePanel` (self-hiding when empty) on `/internal/corrections`: each open
knowledge PR shows title + paths, a rendered-markdown preview, a "Merge & sync" button, and a
plain "View diff on GitHub" link for anyone who *wants* it. The Save-to-knowledge toast now
deep-links here instead of GitHub. Merging invalidates both the panel query and the Strategy
library query (`['aios','internal-docs']`) so the library refreshes immediately.

## Security / gates

- Admin-gated; the path allow-list (`MERGE_PATH_RE`, traversal-safe — matches the producer
  contract incl. underscores/dots/mixed case but disallows `/` in the filename segment) is
  re-asserted **after loading the PR, before the merge PUT**, so a crafted `pr_number` can
  never merge a code PR.
- `verify_jwt = false` in `supabase/config.toml` is **required** (browser preflight would
  otherwise be rejected by the gateway before the function's own admin check).
- The human-merge invariant holds: Donny gained only a READ tool; nothing auto-merges.

## Key Decisions

- Keep the PR/merge gate; bring the merge + RAG sync into the UI rather than dropping the
  review step (founder choice).
- Batch the sync at 20 pages/request (heavy `full_content` payloads; matches the sync script)
  because `donny-knowledge-sync` caps `pages` at 100.
- Reject delete/rename PRs at the gate (the feature's producers only ever create/modify).

## Known Issues

- `list` does one `pulls/{n}/files` fetch per open PR (N+1) — fine for the handful of open
  knowledge PRs; a known scaling cliff.
- Base64-decode of GitHub contents is duplicated across `wiki-merge-pr`/`wiki-import-doc`/
  `wiki-save-answer` — a future `_shared/github-content.ts` could retire the copies.

## See Also

- [[Self-Improving App]] (the knowledge flow this feeds)
- [[Google Workspace]] (the Workspace-doc import that rides this pipeline)
- [[Donny Answer to Wiki Session]] · [[Wiki-Commit-PR Session]] (the predecessor PR producers)
- [[AIOS Workspace Knowledge-Merge Session]] (source)
