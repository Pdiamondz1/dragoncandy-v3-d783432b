# Patch-Based Strategy-Doc Corrections — Design

**Date:** 2026-06-21
**Status:** Built
**Scope:** `donny-chat` edge function only — no DB migration, no new edge function, no new
secret, no RLS change, no frontend change.

## Problem

Internal Donny (DC AIOS) lets a founder say "fix this strategy doc," and Donny stages a
`propose_correction` for approval at `/internal/corrections`. For a `strategy_doc` correction
Donny had to emit the **entire** corrected markdown (5–50 KB) as `proposed_value`. Generating
that much output is what drove the correction turn to ~130 s — long enough that on mobile
Safari the streamed `fetch` connection dropped ("Load failed") and the founder had to retry,
even though the v131 streaming fix already removed the server-side 504 (the work completes
server-side; the client just can't hold the long connection on a heavy turn).

Root cause (confirmed by tracing the full path donny-chat → aios-report-ingest →
`aios_corrections` → `aios_corrections_apply` RPC → `wiki-commit-pr`): turn length is
dominated by Donny's **output-token generation**, and every downstream hop already assumes a
full-document `proposed_value`.

This is the follow-up to the keepalive-streaming work
(`2026-06-20-donny-chat-keepalive-streaming-design.md`): streaming stopped the server 504;
this shortens the turn so the heavy-correction case stops straining the mobile client at all.

## Approach

Let Donny emit only the **change** as find/replace edit blocks — the exact contract our `Edit`
tool uses (`{old_string, new_string, replace_all?}`). The `propose_correction` handler
re-reads the current `internal_docs.content_md`, applies the edits **server-side**, and POSTs
the reconstructed **full** `proposed_value` exactly as before. Donny's output shrinks from
kilobytes to a few changed lines (turn drops from ~130 s to seconds); ingest, the
`aios_corrections` row, the drift-checked apply RPC, the wiki PR, and the **"a human merges
first"** invariant all stay byte-for-byte unchanged.

A full-content `proposed_value` path is **kept as a fallback** for a genuine top-to-bottom
rewrite, so a legitimate large rewrite is never blocked — it just remains the rare slow case.

### Why apply in the handler (not in ingest/RPC)

Applying edits in the donny-chat tool handler isolates the entire change to one function and
preserves the downstream data contract. The handler re-reads the **current** doc as the edit
base, which matches the `current_value` that `aios-report-ingest` captures server-side; the
apply RPC's existing trimmed-text drift check still guards the approve-time race. This is in
fact more robust than before, where Donny edited a possibly-stale in-context copy.

## Components

### `doc-edits.ts` (new, pure module)
`applyEdits(content: string, edits: DocEdit[]): { content } | { error }`. Pure, no
Deno/Supabase deps, unit-tested under vitest — mirrors the `history.ts` / `stream-accumulator.ts`
pure-module pattern. Semantics mirror the Edit tool exactly:
- Sequential application against a running buffer.
- Empty `old_string` → error; `old_string === new_string` → error (no-op).
- `replace_all: true` → replace all; 0 occurrences → error.
- Default → require exactly one occurrence: 0 → "not found"; >1 → "not unique (N matches)".
- On any failure: `{ error: "edit #<i>: <reason>" }` (1-based), nothing returned, so the
  caller keeps the original (atomic from the caller's view).
- Exact substring match, **no normalization** (Donny copies `old_string` verbatim from
  `get_internal_doc` content_md). The error string is returned to Donny as the tool result,
  so a bad block is **self-correcting in the same turn**.

### `propose_correction` tool (modified, `index.ts`)
- Schema: add `edits` array (`items: {old_string, new_string, replace_all?}`); `required`
  drops `proposed_value` (now conditionally required, validated in the handler).
- Handler: for `target_type === 'strategy_doc'` with non-empty `edits`, read current
  `content_md` via `internalCtx.userClient`, `applyEdits`, set `proposed_value` to the result;
  on edit/read error return it to Donny. Validate that a strategy_doc has either edits or a
  non-empty full value, and a dashboard_setting has a value. Everything else (the POST to
  `aios-report-ingest`) is unchanged.
- Prompt rule 4: still call `get_internal_doc` first, then **prefer `edits`**; full
  `proposed_value` only for a genuine rewrite; retry a failed edit block in-turn.

## Testing

- `doc-edits.test.ts`: single unique replace, sequential edits, not-found (with index),
  not-unique (count surfaced), replace_all, replace_all zero-match, identical no-op, empty
  old_string, empty edits, order-dependent edits, atomic-failure.
- `npm run build` + full vitest green (29 donny-chat tests).
- Prod (post-deploy): a localized strategy-doc fix is a few-second turn, no "Load failed",
  correction queued whose `proposed_value` differs from `current_value` only at the edit;
  approve → `applied`; "Open wiki PR" → clean single-file PR. Full-`proposed_value` fallback
  still works. Deliberately-wrong `old_string` → handler error → Donny retries in-turn.

## Invariants preserved

- Donny never writes — it only proposes; a human approves at `/internal/corrections`.
- The drift check, apply RPC, wiki PR, and `aios_corrections` schema are unchanged.
- No new attack surface: edits are applied to a doc the admin can already read and propose.

## See also

- `docs/superpowers/specs/2026-06-20-donny-chat-keepalive-streaming-design.md`
- `docs/superpowers/specs/2026-06-17-donny-aios-corrections-design.md`
- `docs/superpowers/specs/2026-06-18-wiki-commit-pr-design.md`
