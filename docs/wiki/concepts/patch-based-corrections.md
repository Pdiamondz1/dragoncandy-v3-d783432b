---
title: Patch-Based Corrections
type: concept
created: 2026-06-21
updated: 2026-06-21
sources: [raw/sessions/2026-06-21-patch-based-corrections.md]
tags: [donny, aios, corrections, edge-functions, performance, anthropic]
---

# Patch-Based Corrections

How internal Donny corrects a strategy document **cheaply**: it emits a few find/replace
**edit blocks** instead of regenerating the whole file, and the server reconstructs the full
document. Shipped for `donny-chat` in PRs #151/#152 (2026-06-21).

## The problem it solves

A correction turn is dominated by the model's **output-token generation**, not the round-trip.
The old `propose_correction` contract made Donny emit the **entire** corrected markdown
(5–50 KB) as `proposed_value`, so a strategy-doc fix ran ~130 s. [[Edge Function Streaming]]
(PR #148) removed the server-side 150 s idle **504**, but a 130 s streamed `fetch` still drops
on mobile Safari ("Load failed") and forces retries even though the server completes. The only
way to make the turn short is to make Donny **write less**.

## The contract

Donny supplies `edits: [{ old_string, new_string, replace_all? }]` — the exact contract of
the [[Design System]]-era `Edit` tool. The `propose_correction` handler:

1. Re-reads the **current** `internal_docs.content_md` for `target_ref`.
2. Applies the edits server-side via the pure module `donny-chat/doc-edits.ts` (`applyEdits`).
3. POSTs the **reconstructed full** `proposed_value` to `aios-report-ingest` — exactly as
   before.

So the entire downstream pipeline is **byte-for-byte unchanged**: `aios-report-ingest`, the
`aios_corrections` row (`current_value`/`proposed_value` still full content), the
drift-checked `aios_corrections_apply` RPC, and `wiki-commit-pr` ([[Wiki-Commit-PR Session]]).
A full-`proposed_value` path is **kept as a fallback** for a genuine top-to-bottom rewrite.

## Why apply in the tool handler (not in ingest / the RPC)

Applying in the donny-chat handler isolates the whole change to one function and preserves the
data contract every other hop depends on. Re-reading the current doc as the **edit base** also
matches the `current_value` that ingest captures server-side, and the apply RPC's trimmed-text
drift check still guards the approve-time race — *more* robust than the old path, where Donny
edited a possibly-stale in-context copy. The invariant from [[Donny Gated Corrections]] holds:
**Donny never writes — it only proposes; a human approves at `/internal/corrections`.**

## doc-edits.ts semantics (mirror the Edit tool)

Pure, no Deno/Supabase deps, vitest-tested (the same isolate-logic-into-pure-modules pattern as
`history.ts` / `stream-accumulator.ts` under [[Edge Function Streaming]]). Sequential
application; empty `old_string` → error; identical old/new → error (no-op); `replace_all`
replaces all (0 → error); default requires **exactly one** match (0 → "not found", >1 → "not
unique (N matches)"); on any failure returns `{ error: "edit #i: …" }` and nothing else (atomic
from the caller's view); exact substring match, **no normalization**. The error string is
returned to Donny as the tool result, so a wrong block is **self-correcting in the same turn**.

## Gotcha: backticks break edge-function prompt template literals

The system prompt is a backtick-delimited template literal. Writing inline-code emphasis with
backticks inside it (`` `edits` ``) terminates the string → Deno bundle "Expression expected".
`npm run build` only builds the frontend (`src/`), so it **never typechecks the edge function**
— the deploy bundle (`supabase functions deploy`) is the real parse check. Use **single
quotes** for emphasis inside any edge-fn prompt, and order edge-fn work
build → **deploy (bundle check)** → merge (see [[Lovable Edge-Function Deploy Gap]]).

## See Also

- [[Edge Function Streaming]] — the predecessor fix; this resolves its "patch/diff contract" residual
- [[Donny Gated Corrections]]
- [[Wiki-Commit-PR Session]]
- [[Lovable Edge-Function Deploy Gap]]
- [[Donny AI]]
