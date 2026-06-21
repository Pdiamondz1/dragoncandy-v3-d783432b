---
title: Patch-Based Corrections Session
type: source
created: 2026-06-21
updated: 2026-06-21
sources: [raw/sessions/2026-06-21-patch-based-corrections.md]
tags: [donny, aios, corrections, edge-functions, performance]
---

# Patch-Based Corrections Session

Summary of the 2026-06-21 session that made internal Donny propose strategy-doc corrections as
small find/replace edits instead of regenerating the full document (PRs #151 feature + #152
backtick hotfix; donny-chat deployed to prod).

## Key claims

- Correction turn length is dominated by Donny's **output-token generation**, so the way to cut
  the ~130 s heavy-correction turn (and stop the mobile streamed-`fetch` "Load failed") is to
  shrink Donny's output — emit edits, not the whole 5–50 KB doc. Follow-up to the
  [[Edge Function Streaming]] work, which fixed the server 504 but not the turn length.
- Edits use the `Edit`-tool contract (`{old_string, new_string, replace_all?}`); the new pure
  module `donny-chat/doc-edits.ts` applies them server-side and the handler sends the full
  reconstructed `proposed_value` downstream — every other hop unchanged. See
  [[Patch-Based Corrections]].
- A full-`proposed_value` fallback is kept for genuine rewrites. The invariant **a human
  approves** ([[Donny Gated Corrections]]) is preserved.
- Gotcha: backticks inside the backtick-delimited system-prompt template literal broke the Deno
  bundle; `npm run build` doesn't typecheck edge functions, so the **deploy bundle is the real
  parse check**. Merged #151 before deploying → main briefly held the break → #152 realigned
  main with the deployed source. Order edge-fn work build → deploy → merge.

## Verification

`npm run build` clean; 29 donny-chat vitest tests green (11 new in `doc-edits.test.ts`); Codex
second review clean; prod deploy bundle succeeded. Prod smoke (localized fix is a few-second
turn, no "Load failed") is the remaining post-deploy check.

## See Also

- [[Patch-Based Corrections]]
- [[Edge Function Streaming]]
- [[Donny Gated Corrections]]
