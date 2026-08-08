---
title: Knowledge-Sync Automation
type: concept
created: 2026-06-22
updated: 2026-08-08
sources: [2026-06-21-origin-story-and-sync-automation.md, 2026-08-08-dc-points-discoverability-and-sync-break.md]
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

## An unattended sync fails silently — the 2026-08-08 outage (PR #401)

The consumer sync was **dead for hours and nothing said so.** PR #378 added a `FORCE_INTERNAL`
set to `sync-wiki-to-donny.mjs` (keeping unbuilt-DRE-spec pages out of the consumer RAG) plus a
guard that aborts if a listed path matches no file. One listed path —
`analyses/dragoncandy-dragon-rewards-engine-dre-full-system-spec.md` — **did not exist**; it had
already been split into the two `dre-part-*` pages. The guard fired correctly and aborted before
any network call, on **every** post-merge run.

Three durable lessons:

- **Never build a path list from `donny_knowledge` rows — a row outlives its file.** The deleted
  spec still had an orphan row carrying its path, which made the DB look authoritative. Verify
  with `ls`, not a query. This is the root cause; everything else followed from it.
- **A fail-loud guard in an unattended job is only as loud as its consumer.** `sync:wiki` runs
  from the `post-merge` hook into a background log nobody reads, so "throws an error" and "fails
  silently" are the same event. The guard was right to abort — a renamed page is still in the
  scan under its **new** name, so continuing would publish it to the consumer RAG at
  `scope null`. The fix is a better message (name the missing entries; a bare count says a path
  is wrong but not which), not a softer guard. Consider surfacing hook failures somewhere read.
- **Two `source_id` namespaces share `source_type='wiki'`.** `wiki:<dir>/<slug>` is the CONSUMER
  row (`sync-wiki-to-donny.mjs`); `internal-<dir>:<slug>` is the INTERNAL row
  (`sync-internal-docs.mjs`). Two rows per path is **by design, not duplication** — a fact that
  produced two wrong diagnoses before the real one. The edge function matches on
  `source_type + metadata->>'source_id'` via `.maybeSingle()`, so genuinely duplicate ids would
  error rather than silently pick one.

**Finding orphans is cheap:** run a full sync, then list rows the sync did *not* touch —
`where source_type='wiki' and updated_at < now() - interval '2 hours'`. That found exactly 2
(both deleted full-spec files later split in two, frozen since 2026-06-27, both `scope=internal`
so never leaking); both were deleted after confirming their content was covered by the
replacements.

## See Also
- [[Dragon Rewards Engine (DRE)]]
- [[Self-Improving App]]
- [[In-UI Knowledge Merge]]
- [[Origin Story & Knowledge-Sync Automation Session]]
- [[Donny AI]]
