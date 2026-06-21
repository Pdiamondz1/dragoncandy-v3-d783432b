# Session: Patch-Based Strategy-Doc Corrections (Option B) — 2026-06-21

## What shipped

Internal Donny (DC AIOS) now proposes a `strategy_doc` correction as small **find/replace
`edits`** (`{old_string, new_string, replace_all?}`) instead of re-emitting the entire
5–50 KB corrected document as `proposed_value`. The `propose_correction` tool handler in
`donny-chat` re-reads the current `internal_docs.content_md`, applies the edits **server-side**
(new pure module `doc-edits.ts`), and POSTs the reconstructed **full** `proposed_value`
exactly as before.

PRs: **#151** (feature) + **#152** (hotfix). donny-chat deployed to prod
(`zocahiffooqdybdhguqv`). Spec: `docs/superpowers/specs/2026-06-21-patch-based-corrections-design.md`.

## Why

This is the follow-up to the 2026-06-20 keepalive-streaming work. Streaming removed the
server-side 150s **504**, but a heavy correction still ran ~130 s because turn length is
dominated by Donny's **output-token generation** of the whole document — and a 130 s streamed
`fetch` drops on mobile Safari ("Load failed"), forcing retries even though the server
completes. Edits shrink Donny's output to a few changed lines, cutting the turn to seconds, so
the mobile client no longer has a long-held connection to drop.

## Key decisions

- **Apply edits in the donny-chat tool handler, not in ingest/RPC.** Isolates the whole change
  to one function; `aios-report-ingest`, the `aios_corrections` row, the drift-checked
  `aios_corrections_apply` RPC, and `wiki-commit-pr` all keep receiving full content unchanged.
- **Re-read the current doc as the edit base.** Matches the `current_value` ingest captures
  server-side, and the apply RPC's trimmed-text drift check still guards the approve-time race
  — more robust than the old path (Donny editing a possibly-stale in-context copy).
- **Find/replace blocks over unified diff or section-by-heading.** Exact Edit-tool contract;
  LLMs do it reliably (no line numbers); tiny output; exact/unique match is self-validating.
- **Keep the full-`proposed_value` fallback** for a genuine top-to-bottom rewrite (rare slow
  case), so a legitimate big rewrite is never blocked.
- **Invariant held:** Donny never writes — it only proposes; a human approves at
  `/internal/corrections`.

## doc-edits.ts semantics (mirror the Edit tool)

Sequential application; empty `old_string` → error; `old_string === new_string` → error
(no-op); `replace_all` replaces all (0 matches → error); default requires exactly one match
(0 → "not found", >1 → "not unique (N matches)"); on failure returns `{error: "edit #i: …"}`
and nothing else (atomic from caller's view); exact substring match, **no normalization**.
The error string is returned to Donny as the tool result, so a bad block is **self-correcting
in the same turn**.

## Gotchas

- **Backticks inside the system-prompt template literal break the Deno bundle.** The rule-4
  prompt edit quoted words with backticks (`` `edits` ``) inside the backtick-delimited
  `stable` prompt string → "Expression expected" parse error at deploy. `npm run build` only
  builds the frontend (`src/`), so it never typechecked the edge function — the deploy bundle
  (`supabase functions deploy`) is the real parse check for edge-fn prompt edits. Fixed by
  switching to single quotes (#152). Use single quotes for inline-code emphasis inside any
  edge-function template-literal prompt.
- **Merged #151 before deploying**, so main briefly held the broken backticks; prod was
  deployed from the corrected working tree and #152 re-aligned main. Order edge-fn work as
  build → **deploy (bundle check)** → merge.

## Files

- Create: `supabase/functions/donny-chat/doc-edits.ts` (+ `doc-edits.test.ts`, 11 tests).
- Modify: `supabase/functions/donny-chat/index.ts` — `propose_correction` schema (`edits`
  array; `proposed_value` no longer hard-required), handler (apply edits → full value),
  prompt rule 4 (prefer edits).
- Scope: donny-chat only — no migration, no new edge function, no secret, no RLS, no frontend.

## Verification

`npm run build` clean; 29 donny-chat vitest tests green; Codex second review clean; prod deploy
bundle succeeded. Remaining: prod smoke — ask Donny a localized strategy-doc fix and confirm a
few-second turn (not ~130 s), no "Load failed", correction queued/approvable with a minimal
diff.
