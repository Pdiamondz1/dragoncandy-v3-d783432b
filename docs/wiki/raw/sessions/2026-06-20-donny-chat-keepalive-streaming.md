# Session: donny-chat keepalive streaming (PR #148) — 2026-06-20

## What shipped

Two related changes to `donny-chat` this session:

1. **Tool-pairing replay fix (PR #146, merged + deployed earlier in the session).**
   Internal Donny 400'd with `messages.N.content.0: unexpected tool_use_id found in
   tool_result blocks` on long conversations. Root cause: `getConversationHistory`
   replays the last 50 stored messages into Anthropic format and could emit a
   `tool_result` whose matching `tool_use` was gone — via a merge step that dropped a
   tool-bearing assistant turn, and the absence of any final integrity check (a 50-msg
   window cutting a tool pair, a failed tool-result insert, or created_at ties). Fix:
   extracted replay into a pure `donny-chat/history.ts` with `reconstructHistory` +
   `enforceToolPairing` (drops orphaned tool_result blocks and unanswered tool_use
   blocks); 8 vitest cases. Deployed via `npm run deploy:fn -- donny-chat`.

2. **Keepalive streaming (PR #148, this branch).** Internal Donny 504'd on long
   conversations (Strategy-doc edits). Diagnosed as Supabase's **150s request idle
   timeout**, NOT the wall-clock limit — the org is **Pro** (400s wall-clock), but
   `donny-chat` was fully non-streaming so it sent zero bytes until the whole tool loop
   finished. The internal surface now streams an **NDJSON** response so the first byte
   beats the idle timeout and the full 400s is available.

## Key decisions (PR #148)

- **It's the idle timeout, not the wall-clock.** Supabase Edge limits: wall-clock 150s
  free / **400s paid**; **request idle timeout 150s regardless** ("if a function doesn't
  send a response before the timeout, 504"). The 504s were at exactly ~150,000ms = idle.
- **Internal-only scope.** Consumer Donny (capped 1024–8192 tokens) never hits 150s;
  consumer path keeps its JSON response unchanged. Only `internalMode` streams.
- **NDJSON protocol** (`application/x-ndjson`): events `status` (per tool, friendly
  label), `text` (final-answer deltas, live), `heartbeat` (15s keepalive), `done`
  (`content` = persisted displayContent, `rich_card`), `error` (failure after stream open
  — an event, not an HTTP 500).
- **Early first byte:** write an initial `status` ("Thinking…") at stream open BEFORE the
  first Anthropic call — the idle-timeout fix can't wait on the first model delta.
- **The expensive generation is a tool input, not the final text.** In a correction the
  ~130s generation is `propose_correction`'s full-doc `proposed_value`; the final answer
  is short. So the per-tool **status line** carries the UX during the long wait; live
  final text is the smaller win.
- **Mechanism:** stream the Anthropic calls (`stream:true`, read `response.body`) through
  a pure, unit-tested `donny-chat/stream-accumulator.ts` — `parseSseLines` (SSE→events),
  `StreamAccumulator` (forward text deltas; reconstruct `tool_use.input` from
  `input_json_delta` fragments; merge `usage` from `message_start` input/cache +
  `message_delta` output), `toolStatusLabel`. Mirrors the `history.ts` pure-module +
  vitest pattern. No new dependency (the existing `anthropicFetch` retry wrapper streams
  fine).
- **Unified loop:** `callModel({stream, emit})` returns `{content, stop_reason, usage}` in
  both modes; a shared `runTurn(emit?)` runs the tool loop once for both surfaces. Every
  existing side effect preserved (assistant/tool-result inserts, audit inserts,
  per-call logCost, cache-visibility console.log, incrementUsage once, rich-card strip,
  final insert, last_message_at).
- **Frontend (`useInternalDonny.ts`):** reads the NDJSON stream via a pure
  `src/lib/ndjson.ts` `parseNdjsonChunk`, drives a transient in-flight bubble, reconciles
  with the persisted DB message in `onSettled` (clear after invalidation), and **falls
  back to `response.json()` if the response isn't NDJSON** (frontend/edge version skew).
  `InternalDonny.tsx` renders the transient bubble + status line (brand tokens, no gray).
- **Client-disconnect handling** (review catches): `ReadableStream.cancel()` stops the
  heartbeat; `send`/`controller.close()` guarded against post-cancel throws (a distinct
  `cancelled` flag — Codex P2); the client releases the reader in `finally`.

## Gotchas

- **Old frontend + new streaming edge fn degrades gracefully**, not breaks: old hook does
  `response.json().catch(() => ({}))` → NDJSON body fails to parse → `{}`, request is
  200, `onSettled` refetches `donny_messages` → the persisted final message still renders
  (no live streaming UX). So deploy order isn't load-bearing.
- **Deno isn't installed locally** and `index.ts` imports Deno URL modules → the edge
  function can't be run/typechecked locally. Pure modules carry the test coverage; the
  integration is verified post-deploy. Don't claim it runs from a local test.
- **Residual deferred:** on client cancel, `runTurn` may still finish server-side (Deno
  doesn't abort in-flight async) — work persists correctly; an `AbortController`
  thread-through is the future enhancement.
- **150s is the idle timeout, 400s the Pro wall-clock** — streaming defeats the former;
  a single >400s run would still die (rare; the patch-based-correction idea would cut the
  generation volume if it recurs).

## Affected files

- `supabase/functions/donny-chat/stream-accumulator.ts` (+`.test.ts`) — new pure module
- `supabase/functions/donny-chat/index.ts` — `callModel` + `runTurn` + internal NDJSON streaming
- `src/lib/ndjson.ts` (+`.test.ts`) — new pure parser
- `src/hooks/internal/useInternalDonny.ts` — stream reader + transient message + JSON fallback
- `src/pages/internal/InternalDonny.tsx` — transient streaming bubble + status line
- (PR #146) `supabase/functions/donny-chat/history.ts` (+`.test.ts`) — replay integrity

## Process

Brainstorm → spec (`docs/superpowers/specs/2026-06-20-donny-chat-keepalive-streaming-design.md`,
spec-document-reviewer approved) → plan
(`docs/superpowers/plans/2026-06-20-donny-chat-keepalive-streaming.md`,
plan-document-reviewer approved) → subagent-driven execution (4 implementer dispatches +
per-task reviews) → whole-branch opus review (2 Important client-cancel leaks fixed) →
**Codex second review clean** (1 P2 close-after-cancel fixed). No schema/RLS/secret/OAuth
change.
