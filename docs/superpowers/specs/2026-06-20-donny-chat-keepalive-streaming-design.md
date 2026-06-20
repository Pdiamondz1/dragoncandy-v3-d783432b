# donny-chat Keepalive Streaming — Design

**Date:** 2026-06-20
**Status:** Approved (brainstorm) — pending spec review + implementation plan
**Scope:** Internal AIOS Donny surface only

## 1. Problem

Internal Donny (`/internal/donny`) intermittently returns a `504` on long
conversations — most reliably when Donny updates a Strategy-library doc. Edge
logs show the failures at `150,083ms` / `150,139ms`: exactly Supabase's
**request idle timeout of 150s** ("if an Edge Function doesn't send a response
before the timeout, a 504 Gateway Timeout is returned"), *not* the wall-clock
limit.

The org is on the **Pro plan**, whose Edge Function wall-clock limit is **400s**
— but `donny-chat` is **fully non-streaming**: it runs the entire multi-round
tool loop and the final-answer call, then emits one JSON body at the very end.
It sends zero bytes until done, so when total work crosses 150s the gateway
504s *before any response exists*, throwing away ~250s of budget the plan
already pays for.

**Why work crosses 150s (secondary factor):** the heavy internal path is a
strategy-doc correction. Donny pins Sonnet at `max_tokens: 16384` and emits the
**entire corrected document** as the `propose_correction` tool input
(`proposed_value`) — a single generation of up to ~16K output tokens, sometimes
across multiple rounds. Evidence: the pre-fix logs include a `200` that ran
`129,936ms` (a near-miss) alongside the 504s. Note the expensive generation is a
**tool-use input**, not the final text answer; the final answer is short.

## 2. Goal & non-goals

**Goal:** eliminate the 504 by streaming the internal response so the first byte
goes out immediately (defeating the 150s idle timeout and unlocking the 400s
wall-clock), and improve perceived latency with per-tool **status** lines and
**live final text**.

**Non-goals (YAGNI):**
- Consumer-surface streaming (`DonnyChatInput.tsx` / its hook). Consumer turns
  are capped at 1024–8192 tokens and don't hit the 150s ceiling. Consumer keeps
  the current JSON response.
- Background-job + realtime architecture ("Option C").
- Patch-based corrections ("Option B" — reduce `proposed_value` to a diff). A
  separate future PR *if* the 400s ceiling is ever hit.
- Rich-card streaming for internal (internal tools don't emit rich cards;
  `done` still carries `rich_card: null` for contract symmetry).

## 3. Platform facts (authoritative)

| Limit | Value | Relevance |
|---|---|---|
| Wall-clock (worker lifetime) | **400s** (Pro) | The real ceiling once streaming starts |
| **Request idle timeout** | **150s** | What currently fires the 504 |
| CPU time | 200ms active compute | N/A — work is I/O-bound on Anthropic |

`anthropicFetch` (`_shared/anthropic-fetch.ts`) is a thin retry wrapper around
`fetch`; it works unchanged with `stream: true` (retries apply to the initial
connect; the body is read by the caller).

## 4. Architecture

`donny-chat` stays one function. **All existing pre-call validation runs first**
(auth: service-bearer / session / OAuth; quota; hourly limit; conversation
ownership; internal admin gate; `MAX_INPUT_LENGTH`). These produce the current
JSON 4xx responses *before* any stream opens, so error status codes are
unchanged. Only after validation passes and we are about to make the first
Anthropic call does the function branch:

- **internalMode** → return a streamed **NDJSON** response.
- **consumer** → unchanged JSON response (current code path, untouched).

### 4.1 Wire protocol — NDJSON (`application/x-ndjson`), one JSON object per line

| Event | Emitted | Payload |
|---|---|---|
| `status` | before each tool executes | `{ "type": "status", "label": string, "tool": string }` — friendly label per tool (e.g. `get_internal_doc` → "Reading the strategy doc…", `propose_correction` → "Queuing the correction…", default → humanized tool name) |
| `text` | model emits text (incl. final answer) | `{ "type": "text", "delta": string }` |
| `heartbeat` | quiet-gap keepalive | `{ "type": "heartbeat" }` |
| `done` | success terminal (exactly once) | `{ "type": "done", "content": string, "rich_card": object \| null }` — full final text, equal to what is persisted |
| `error` | failure after stream start (terminal) | `{ "type": "error", "message": string }` |

`content` on `done` is the canonical final text and matches the persisted
`donny_messages` row.

### 4.2 Server flow (internal path)

1. Create a `ReadableStream`; return `new Response(stream, { headers: ndjson + cors })` immediately.
2. Run the **existing tool loop, unchanged in structure** (`MAX_TOOL_ROUNDS = 10`, token safety net), with three additions:
   - Each Anthropic call uses `stream: true`; its `response.body` is fed through the accumulator (§4.3).
   - `text` deltas from the accumulator are forwarded to the client as `text` events.
   - Before executing each `tool_use`, emit a `status` event (label from the tool name).
3. **Persistence is untouched** — still writes the assistant tool-call rows
   (`role: "assistant"`, `tool_calls`), tool-result rows (`role: "tool"`), and
   the final assistant message (`role: "assistant"`, `rich_card`), plus
   `donny_tool_executions` / `donny_actions` audit rows and `logCost` /
   `incrementUsage`, exactly as today. The DB remains the source of truth;
   streaming is additive.
4. On loop completion → emit `done` (with the final `content` + `rich_card`), close.
5. On any thrown error after the stream opened → emit `error`, close.
6. A 15s **fallback heartbeat timer** writes a `heartbeat` if no event has been
   written in the interval; it is cleared on completion/error. Anthropic's own
   SSE `ping` events are also forwarded as `heartbeat`. (During a long
   `propose_correction` generation, `input_json_delta` events stream
   continuously, so keepalive is naturally satisfied; the timer covers quiet
   gaps such as before the first delta.)

The final-answer safety net (the existing "no text → one no-tools turn" block)
is preserved and likewise streamed.

### 4.3 Stream accumulator — `supabase/functions/donny-chat/stream-accumulator.ts` (pure, unit-tested)

Mirrors the `history.ts` pattern: a pure module with no Deno/network imports so
it is fully testable with vitest.

- **Input:** a sequence of parsed Anthropic streaming events
  (`message_start`, `content_block_start`, `content_block_delta` with
  `text_delta` or `input_json_delta`, `content_block_stop`, `message_delta`,
  `message_stop`, `ping`).
- **Output:**
  - text deltas surfaced via callback/iterator (forwarded as `text` events);
  - the **fully assembled message** — an array of content blocks: `text` blocks
    and `tool_use` blocks whose `input` is reconstructed by concatenating the
    block's `input_json_delta.partial_json` fragments and `JSON.parse`-ing at
    `content_block_stop`; plus `stop_reason` and `usage` from `message_delta` /
    `message_start`.
- The assembled message is structurally identical to today's non-streaming
  `result` object, so the rest of the loop (tool execution, persistence,
  `claudeMessages` building) is unchanged.
- A separate tiny helper parses raw SSE bytes → event objects; the accumulator
  itself consumes already-parsed events so tests feed event arrays directly.

**Reconstruction rules:** a `tool_use` block with empty/whitespace
`partial_json` yields `input: {}`; a `JSON.parse` failure surfaces as an
accumulator error (→ `error` event), never a silently malformed tool input.

## 5. Frontend — `src/hooks/internal/useInternalDonny.ts` (only frontend file changed)

Replace `await response.json()` with an NDJSON reader over `response.body`:
decode, split on `\n`, `JSON.parse` each complete line, buffering a partial
trailing line. Drive a **transient in-flight assistant message** in hook state:

- `status` → set a subtle status line under the in-flight bubble.
- `text` → append `delta` to the transient bubble (live typing).
- `heartbeat` → ignore.
- `done` → stop the transient bubble; the existing `onSettled` invalidation of
  `['aios', 'donny-messages', conversationId]` refetches the persisted message;
  clear the transient **after** that refetch resolves (no flicker/gap).
- `error` → surface via the existing `setError`.

**Line parsing is a pure function** `parseNdjsonChunk(buffer, chunk) →
{ events, rest }`, vitest-tested (multiple events per chunk, buffered partials,
blank lines).

`InternalDonny.tsx` gets a small render addition for the transient bubble +
status line.

**Defensive fallback:** if the response `Content-Type` is not NDJSON (e.g. the
frontend is newer than a not-yet-redeployed edge function), fall back to
`response.json()` and render as today — version skew cannot break the page.

## 6. Error & edge handling

- **Pre-stream** (auth/quota/ownership/internal-gate/length): unchanged JSON +
  correct 4xx; all run before the stream opens.
- **Mid-stream** (a tool throws, Anthropic errors, accumulator hits malformed
  JSON): emit `error`, close. Already-persisted rows keep the thread
  consistent; the user can retry. (Note: a thrown tool *executes* inside the
  loop already returns `{ error }` as a tool result and does not abort the
  stream — only loop-fatal errors emit the terminal `error` event.)
- **Wall-clock 400s exceeded** (now rare — 2.6× the old ceiling): the stream
  ends with **no `done`**. The reader observes a clean close without a terminal
  event → frontend shows "response was cut off — try again." This is the only
  residual hard limit and is addressed separately (Options B/C) if it recurs.
- **Tool-result persistence failures** keep the existing swallow-and-log
  behavior; the merged `enforceToolPairing` guard already protects the next
  turn's replay.

## 7. Testing

- **Unit (vitest, offline):**
  - `stream-accumulator.ts`: text-only; single `tool_use`; multiple `tool_use`;
    interleaved text + `tool_use`; empty `partial_json` → `{}`; malformed
    `partial_json` → accumulator error.
  - `parseNdjsonChunk`: multiple events per chunk; buffered partial line across
    chunks; blank lines ignored.
- **Manual / prod (after deploy):** reproduce a long internal correction →
  confirm `status` lines + live final text, **no 504**, and the persisted
  message equals the streamed `content`; confirm a consumer Donny turn is
  unchanged (still JSON).
- **Codex second review** before the PR.
- **Deploy:** `npm run deploy:fn -- donny-chat` (edge functions are not deployed
  by the Lovable push).

## 8. Affected files

| File | Change |
|---|---|
| `supabase/functions/donny-chat/index.ts` | Branch internalMode → streamed NDJSON; stream Anthropic calls; emit `status`/`text`/`heartbeat`/`done`/`error`; preserve all persistence/audit/cost logic; consumer path unchanged |
| `supabase/functions/donny-chat/stream-accumulator.ts` | **New.** Pure SSE-event accumulator (text deltas + assembled message with reconstructed `tool_use` inputs) |
| `supabase/functions/donny-chat/stream-accumulator.test.ts` | **New.** Vitest unit tests |
| `src/hooks/internal/useInternalDonny.ts` | Read NDJSON stream; transient in-flight message; `parseNdjsonChunk`; Content-Type fallback to JSON |
| `src/hooks/internal/useInternalDonny.test.ts` (or a `ndjson` util test) | **New.** Vitest tests for `parseNdjsonChunk` |
| `src/pages/internal/InternalDonny.tsx` | Render transient streaming bubble + status line |

## 9. Invariants preserved

- Internal surface gating (stored-surface trust anchor + admin re-verification) unchanged.
- `donny_messages` remains the source of truth; the persisted final message
  equals `done.content`.
- Consumer surface response contract unchanged.
- `propose_correction` still routes through `aios-report-ingest` (the
  service-role choke point); no correction is auto-applied.
- No schema, RLS, secret, or new OAuth scope changes.
