---
title: Knowledge-Sync Automation
type: concept
created: 2026-06-22
updated: 2026-06-22
sources: [2026-06-21-origin-story-and-sync-automation.md]
tags: [knowledge-sync, donny-rag, strategy-library, git-hooks, dev-workflow, supabase]
---
# Knowledge-Sync Automation

The mechanical plumbing that keeps Donny's knowledge (`donny_knowledge` RAG + the
`internal_docs` strategy-library viewer) current with the repo's `docs/` — **without pasting
the prod service-role secret on the command line**. This is the operational counterpart to
[[Self-Improving App]] (which is the AI *content* loop); this page is the *sync* loop.

Built 2026-06-21 (PRs #156/#157/#158). No schema, RLS, edge-function, or secret changes — pure
dev tooling over the existing `donny-knowledge-sync` edge function and the two sync scripts
(`sync-internal-docs.mjs`, `sync-wiki-to-donny.mjs`).

## Three layers

1. **npm aliases + secret resolver.** `npm run sync:internal` (strategy library + internal RAG)
   and `npm run sync:wiki` (consumer RAG) route through `supabase/scripts/with-env.mjs`, which
   resolves the secret (an **env var wins**, else the **gitignored** `supabase/scripts/.env.sync.local`)
   and defaults `DONNY_SYNC_URL` to the prod endpoint, then runs the target script. One-time
   setup is either `setx SUPABASE_SECRET_KEY …` or pasting the key into `.env.sync.local`.
2. **Auto post-merge git hook.** `scripts/hooks/post-merge` runs both syncs in the background
   when the **main** checkout fast-forwards and `docs/` changed (logs to
   `.git/knowledge-sync.log`). Self-guards to the main checkout (skips worktrees via
   `git-dir != git-common-dir`); never blocks the merge; idempotent.
3. **Committed installer (survives fresh clones).** `scripts/install-hooks.mjs` copies
   `scripts/hooks/*` into the **common** `.git/hooks/` (shared across worktrees), wired to
   `package.json` `"prepare"` so it runs on `npm install` (also `npm run hooks:install`).

Net workflow: edit a `docs/` page → merge → `refresh-main` → Donny updates itself.

## Known Issues / Gotchas

- **Key must reach the merge-triggering shell.** A `setx` var only reaches terminals opened
  *after* it; a merge fired by a process predating the `setx` falls back to the file. So
  `.env.sync.local` is the bulletproof store for the hook.
- **Windows ESM import:** dynamic-import a `C:\…` path via `pathToFileURL(path).href` —
  a bare path throws `ERR_UNSUPPORTED_ESM_URL_SCHEME` (`C:` read as a scheme).
- **Verify by content, not counts.** `content ilike '%phrase%'` on `internal_docs.content_md`
  AND `donny_knowledge.content` (column is `content`, NOT `full_content`). Counts /
  `max(updated_at)` are false checks — updates don't bump `updated_at`. See [[RAG Sync Needs Git Bash]]
  if that page exists; otherwise this supersedes the manual-only guidance.
- Harmless libuv-on-Windows `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` can print
  *after* `Done.` in the background log; it doesn't affect the sync or git.
- **Auth note:** prod uses the legacy service-role JWT injected as `SUPABASE_SERVICE_ROLE_KEY`;
  `with-env.mjs`'s key just needs to match what `donny-knowledge-sync` accepts.

## See Also
- [[Self-Improving App]]
- [[In-UI Knowledge Merge]]
- [[Origin Story & Knowledge-Sync Automation Session]]
- [[Donny AI]]
