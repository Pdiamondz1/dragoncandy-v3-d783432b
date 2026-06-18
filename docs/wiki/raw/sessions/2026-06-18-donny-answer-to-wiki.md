# Session — Save a Donny answer to the knowledge base (2026-06-18)

Raw session source for `/wiki-ops ingest`. Immutable once written.

## What shipped

A founder-clicked, admin-gated **"Save to knowledge"** action on each internal Donny
answer (`/internal/donny`). Clicking it opens a confirm dialog (title / folder /
filename / tags, pre-filled from the answer) and **opens a GitHub PR** creating a new
`docs/wiki/<concepts|analyses>/<file>.md` page built from the answer. On merge, the
existing `donny-knowledge-sync` folds the page into Donny's RAG (`donny_knowledge`) on
the next sync — so the answer becomes durable knowledge Donny recalls later.

This closes the gap where internal Donny could *chat*, *export an answer to a Google
Doc*, and *propose corrections to existing docs* — but had no way to turn a **fresh**
answer into a **new** knowledge-base page.

## Why PR-gated (the load-bearing decision)

The whole AIOS rests on one invariant: **Donny never writes to the knowledge base
directly; a human approves first** (the `aios-report-ingest` choke point + gated
corrections). A Donny answer is Donny's *own synthesis*. Letting an answer flow straight
into RAG unreviewed would create a feedback loop where Donny later cites its own
un-vetted claim as fact. So "Save to knowledge" **opens a PR; it never pushes to `main`
and never auto-merges.** The PR review is the gate — which is also what makes it safe for
the function to accept client-supplied content (see trust model).

User decisions (confirmed in brainstorming): **save to both wiki file + RAG, sequenced
so the wiki PR is the gate and RAG follows on merge**; **no AI metadata in v1**
(deterministic client-side defaults + confirm dialog; Haiku suggestion deferred);
**include the originating founder question** in the page as a quoted provenance block.

## Architecture

- **`wiki-save-answer` edge function** (new, Deno) — a **sibling** of the shipped
  `wiki-commit-pr`, not a reuse. `wiki-commit-pr` trusts only `{correction_id}` and
  re-derives path+content from a server-side row; a fresh answer has no row, so
  `wiki-save-answer` accepts client field values under a **stricter** guard:
  admin gate (`auth.getUser` → `user_roles` role `admin`), 2-folder whitelist
  (`concepts|analyses` — its OWN `SAVE_PATH_RE`, deliberately tighter than
  wiki-commit-pr's 3-folder regex), kebab filename regex, server-built frontmatter
  (client supplies values only, never raw frontmatter), and PR-only. It shares
  wiki-commit-pr's GitHub plumbing (base ref → branch → PUT → PR), idempotency
  (filename-derived branch `donny-wiki-answer/<filename>` recovers the same PR on retry),
  422-recovery, UTF-8-safe base64, and `github_not_configured` graceful 200. New typed
  200: `file_exists` when the page already exists on `main` (refuses to overwrite; the
  dialog prompts for a new filename).
- **Frontend** — `src/lib/internal/wikiSave.ts` (pure helpers: `slugify`,
  `deriveWikiDefaults`, `validateSaveInput`, `saveErrorMessage`; unit-tested),
  `src/hooks/internal/useSaveAnswerToWiki.ts` (raw-`fetch` mutation mirroring
  `useCommitWikiPr` — reads 200-with-error as data), `SaveToKnowledgeButton.tsx`
  (ghost button + confirm dialog), mounted beside `ExportToDocButton` in
  `InternalDonny.tsx` (passes the answer markdown + the preceding user turn as the
  provenance question).
- **No schema, no new secret, no new DB row.** Reuses the `GITHUB_WIKI_TOKEN` edge
  secret. The PR is the audit trail.

## Page shape (built server-side)

Frontmatter (`title` quoted/escaped, `type` from folder, `created`/`updated`=today,
`sources: [donny-answer]`, sanitized `tags`), then `# title`, then a provenance
blockquote (`> Captured from an internal Donny answer on <date>, in response to:
"<question>"`), then the answer markdown.

## Gotchas / decisions

- **Trust model divergence is deliberate** — a separate function keeps wiki-commit-pr's
  tight `{correction_id}`-only invariant intact rather than weakening it to accept
  client content.
- **YAML-safety hardening** (from code review): title interior newlines collapsed to
  spaces (a multi-line title could otherwise break/escape the frontmatter block); tags
  stripped to `[a-z0-9-]` and leading-dash tags dropped; title capped at 200 chars
  server-side (client caps the input at 120); question clamped to 500 chars.
- **Idempotency without a DB row** — the filename-derived branch + GitHub 422-recovery
  give retry-safety; no persistence needed. Known acceptable edge case: closing a PR
  (without merging) then re-saving the same filename returns a technical 502 string
  (the `state=open` recovery finds nothing) — rare, admin-only, deferred.
- **Preview scope (YAGNI)** — the dialog shows a live path preview
  (`docs/wiki/<folder>/<filename>.md`), not a rendered-frontmatter preview; frontmatter
  is server-built and the confirm dialog is already the quality gate.
- **RAG path unchanged** — after merge, `sync-wiki-to-donny.mjs` → `donny-knowledge-sync`
  reads `concepts/`·`analyses/` and upserts by `source_id` (idempotent). Same path
  wiki-commit-pr corrections already use. (Note the `donny_knowledge.updated_at`
  non-bumping quirk — verify content advanced by matching on text, not the timestamp.)

## Affected files

- `supabase/functions/wiki-save-answer/index.ts` (new), `supabase/config.toml`
  (`verify_jwt = false`, browser-invoked, self-admin-checks).
- `src/lib/internal/wikiSave.ts` + `wikiSave.test.ts` (new, 14 tests).
- `src/hooks/internal/useSaveAnswerToWiki.ts` (new).
- `src/components/internal/SaveToKnowledgeButton.tsx` (new).
- `src/pages/internal/InternalDonny.tsx` (mount).
- Specs/plan: `docs/superpowers/specs/2026-06-18-donny-answer-to-wiki-design.md`,
  `docs/superpowers/plans/2026-06-18-donny-answer-to-wiki.md`.

## Prerequisites / deploy

- Edge function deploys separately from the Lovable frontend push (MCP/CLI), to staging
  (`mhffqrawgizhprbobcta`) then prod (`zocahiffooqdybdhguqv`), `verify_jwt = false`.
- Reuses existing `GITHUB_WIKI_TOKEN` (fine-grained: Contents + Pull Requests R/W).
