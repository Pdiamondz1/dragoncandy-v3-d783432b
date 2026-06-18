# Save a Donny answer to the knowledge base — design

> Internal Donny can already *chat* and *export an answer to a Google Doc*, and it can
> *propose corrections* to existing strategy/wiki docs. What it cannot do is turn a
> fresh answer into a **new** knowledge-base page Donny will later recall. This adds
> that: a founder-clicked, admin-gated **"Save to knowledge"** action that opens a
> GitHub PR creating a new `docs/wiki/` page from the answer. On merge, the existing
> `donny-knowledge-sync` folds it into Donny's RAG.

**Status:** design (approved 2026-06-18)
**Worktree:** `.claude/worktrees/DC-AIOS-SaveAnswer` (branch `worktree-DC-AIOS-save-answer`)
**Builds on:** `2026-06-18-wiki-commit-pr-design.md` (shares the GitHub-PR plumbing)

---

## 1. Problem & goal

On `internal.dragoncandy.io/internal/donny` today:

- **Chat** — yes (`InternalDonny.tsx`, `donny-chat` internal tool set).
- **Document an answer** — only to **Google Docs** (`ExportToDocButton`, `InternalDonny.tsx:66`). Drive, not the knowledge base.
- **Add to the wiki / RAG** — only via the **corrections** flow, which targets an *existing* doc (`propose_correction` → `/internal/corrections` → apply RPC → `wiki-commit-pr`).

**Gap:** no path takes a *fresh* answer and makes it a *new* wiki page Donny recalls later.

**Goal:** one click on a Donny answer → a reviewed GitHub PR adding a new `docs/wiki/` page → after merge, the page is in Donny's RAG.

## 2. Why PR-gated (the load-bearing constraint)

The entire AIOS rests on one invariant: **Donny never writes to the knowledge base directly; a human approves first** (`aios-report-ingest`, gated corrections). A Donny answer is Donny's *own synthesis*. Letting an answer flow straight into RAG unreviewed creates a feedback loop where Donny can later cite its own un-vetted claim back as fact.

So "Save to knowledge" **opens a PR; it never pushes to `main` and never auto-merges.** RAG only changes when a human merges the PR and a sync runs. The PR review *is* the gate — which is also what makes it safe for this function to accept client-supplied content (see §6).

## 3. User flow

1. Each internal Donny **assistant answer** gets a **Save to knowledge** button (ghost style) next to *Export to Doc*.
2. Click → a **confirm dialog** opens, pre-filled with deterministic defaults derived client-side from the answer:
   - **title** — the answer's first markdown heading, else its first sentence (trimmed/clamped).
   - **folder** — defaults to `analyses/` (most Donny answers are syntheses of live data); a dropdown switches to `concepts/`.
   - **filename** — kebab-slug of the title (editable).
   - **tags** — empty, optional comma-separated input.
   - A live **preview** of the frontmatter + first lines.
3. Founder edits as needed, clicks **Open wiki PR**.
4. Backend (`wiki-save-answer`) opens a GitHub PR adding `docs/wiki/<folder>/<filename>.md`.
5. Success toast with an **Open PR** action. On merge → the existing `donny-knowledge-sync` picks up the new `concepts/`·`analyses/` page → embeddings → **Donny recalls it from then on.**

No AI metadata call in v1 (deliberate simplification from the first sketch — see §8): the confirm dialog already provides the quality gate, deterministic defaults are testable and free, and AI suggestion can be a fast-follow if the defaults feel weak.

## 4. Page shape (built server-side)

The edge function builds the file; the client supplies only field values. Frontmatter is **constructed by the server** so the client can't forge `type`/`sources`:

```markdown
---
title: <title>
type: <analysis|concept>          # derived from folder
created: <YYYY-MM-DD>             # today (Deno Date)
updated: <YYYY-MM-DD>
sources: [donny-answer]
tags: [<tags…>]
---
# <title>

> Captured from an internal Donny answer on <YYYY-MM-DD>, in response to:
> "<originating question>"

<answer markdown>
```

The originating question (the user turn immediately preceding the answer) is passed through for traceability (wiki principle: *trace everything*). It is escaped/clamped, not trusted as markdown structure.

## 5. Components & files

**Frontend**

- `src/lib/internal/wikiSave.ts` (new) — pure helpers:
  - `slugify(title): string`
  - `deriveWikiDefaults(markdown): { title; folder: 'analyses'; filename }`
  - `validateSaveInput({ folder; filename; title }): { ok: boolean; error?: string }` — folder ∈ {concepts, analyses}; filename `^[a-z0-9][a-z0-9-]*$`; non-empty title; mirrors the edge guard so the UI never submits an invalid save.
  - `saveErrorMessage(error): string` — maps `github_not_configured` → setup hint, `file_exists` → "a page with that name already exists — pick another filename", else passthrough.
- `src/lib/internal/wikiSave.test.ts` (new) — Vitest for all of the above.
- `src/hooks/internal/useSaveAnswerToWiki.ts` (new) — React Query mutation, **raw `fetch`** to `${VITE_SUPABASE_URL}/functions/v1/wiki-save-answer` with Bearer session token + apikey, reads 200-with-error-body as data (mirrors `useCommitWikiPr`).
- `src/components/internal/SaveToKnowledgeButton.tsx` (new) — ghost button + the confirm dialog (title/folder/filename/tags + frontmatter preview + Open-wiki-PR). Reuses shadcn dialog primitives already in the repo.
- `src/pages/internal/InternalDonny.tsx` (modify) — mount `SaveToKnowledgeButton` beside `ExportToDocButton` (lines ~64–72), passing the answer markdown and the preceding user question.

**Backend**

- `supabase/functions/wiki-save-answer/index.ts` (new) — see §6.
- `supabase/config.toml` (modify) — add `[functions.wiki-save-answer] verify_jwt = false` (browser-invoked; does its own admin check, so the gateway JWT check must be off or it rejects the unauthenticated CORS preflight — same reason as `wiki-commit-pr`).

**No migration, no `types.ts` change** — this introduces no schema. The PR itself is the audit trail; no DB row is written.

## 6. `wiki-save-answer` edge function

Modeled on `wiki-commit-pr`, sharing the GitHub flow (base ref → branch → PUT → PR, `github_not_configured` graceful degradation, 422 PR-already-exists recovery, UTF-8-safe base64). **Different trust model**, deliberately kept separate from `wiki-commit-pr`:

- `wiki-commit-pr` trusts only `{correction_id}` and re-derives path+content from a server-side row — nothing client-forged.
- `wiki-save-answer` has **no row to re-derive from**, so it must accept client-supplied content+path. Rather than weaken `wiki-commit-pr`, this is a sibling with its own strict validation.

**Trust mitigations (why client-supplied content is safe here):**
1. **Admin-gated** — `auth.getUser()` → `user_roles` role `admin` (copied from `wiki-commit-pr`).
2. **Folder whitelist** — `concepts | analyses` only (`entities/` is for integrations, not answers).
3. **Strict filename** — `^[a-z0-9][a-z0-9-]*$` (no slashes, dots, or `..`); assembled path re-checked against `WIKI_PATH_RE` as defense-in-depth.
4. **Server-built frontmatter** — client supplies field *values* only, not raw frontmatter; `type`/`created`/`sources` cannot be forged.
5. **PR-only** — a human reviews before anything reaches `main`/RAG. This is what makes 1–4 a backstop rather than the sole defense.

**Input:** `{ folder, filename, title, tags?: string[], markdown, question? }`.

**Logic:**
- Admin gate. Validate folder/filename/title/markdown; build `path = docs/wiki/<folder>/<filename>.md`; assert `WIKI_PATH_RE`.
- `GITHUB_TOKEN` missing → `{ error: "github_not_configured" }` (200), after auth/validation so config hint surfaces last.
- Base head SHA → branch `donny-wiki-answer/<filename>` (filename-derived ⇒ re-saving the same page recovers the same branch/PR — idempotent).
- **Collision check:** `GET /contents/<path>?ref=<BASE>`. If the file **already exists on base**, return `{ error: "file_exists" }` (200) — never silently overwrite an existing page; the dialog prompts for a new filename. (A file existing only on a reused branch is fine and PUTs cleanly.)
- Build the page (§4). PUT new file on the branch. POST `/pulls`; on 422 recover the existing open PR for `head` (same logic as `wiki-commit-pr`).
- Return `{ url, number }`. No DB persistence.

**Reuse note:** the GitHub helpers (`ghHeaders`, `toBase64`, base64 decode, ref/branch/PUT/PR sequence, 422 recovery) are duplicated from `wiki-commit-pr` rather than extracted to `_shared/` for v1, to avoid touching the just-shipped, staging-proven `wiki-commit-pr`. A follow-up may extract a shared `_shared/github-wiki.ts` once both are stable. (Flagged so the duplication is a conscious choice, not an oversight.)

## 7. Testing

- **Unit (TDD, Vitest):** `wikiSave.test.ts` covers `slugify`, `deriveWikiDefaults` (heading title, sentence fallback, kebab filename), `validateSaveInput` (folder whitelist, filename regex, traversal/empty rejection), `saveErrorMessage` (both mapped signals + passthrough).
- **Edge function:** validated by **staging E2E** (real PR created → re-save recovers same PR → `file_exists` on a base-existing path → cleanup), following the `wiki-commit-pr` precedent (Deno + live GitHub aren't unit-testable here). Uses the existing `GITHUB_WIKI_TOKEN`.
- **Build/lint/typecheck** green before PR; Codex second pass before merge.

## 8. Scope cuts (YAGNI)

- **New pages only** — no append-to-existing (byte-safe PR append is fiddly; revisit once we see what gets saved).
- **`concepts/` + `analyses/` only** — no `entities/`.
- **No AI metadata suggestion in v1** — deterministic client-side defaults + confirm dialog. (Changed from the first sketch, which mentioned a Haiku call; flagged here for the spec-review/user gate.)
- **No immediate RAG sync** — merge → scheduled `donny-knowledge-sync` is enough; a one-click "sync now" can come later.
- **No new secret** — reuses `GITHUB_WIKI_TOKEN`.
- **No new DB table/row** — the PR is the audit trail.

## 9. Knowledge / RAG path (unchanged)

After the PR merges to `main`, `supabase/scripts/sync-wiki-to-donny.mjs` → `donny-knowledge-sync` reads `concepts/`·`analyses/` and upserts by `source_id` (idempotent). The saved answer enters Donny's RAG on the next sync (per-session `knowledge-sync` skill or the scheduled run). This is the same path `wiki-commit-pr` corrections already rely on — no change required.

## 10. Open questions for the user (spec-review gate)

1. **AI metadata** — OK to ship v1 without the Haiku suggestion (deterministic defaults + confirm dialog), and add AI only if defaults prove weak? (§8)
2. **Originating question in the page** — include the preceding founder question as a quoted context block for traceability (§4)? Recommended yes.
