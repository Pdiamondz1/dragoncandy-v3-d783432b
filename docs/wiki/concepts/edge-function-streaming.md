---
title: Edge Function Streaming
type: concept
created: 2026-06-20
updated: 2026-07-14
sources: [raw/sessions/2026-06-20-donny-chat-keepalive-streaming.md, raw/sessions/2026-07-14-campaign-generate-async-jobs.md]
tags: [edge-functions, supabase, streaming, donny, anthropic, performance, async-jobs]
---

# Edge Function Streaming

The pattern for keeping a long-running Supabase Edge Function from 504-ing, and for
streaming partial output to the client. First applied to `donny-chat` (internal AIOS
surface) in PR #148 to fix internal Donny's 504 on long Strategy-doc corrections.

## The two limits that matter (and which one bites)

Supabase Edge Functions have **two** independent time limits ([docs/guides/functions/limits](https://supabase.com/docs/guides/functions/limits)):

| Limit | Value | Trigger |
|-------|-------|---------|
| Wall-clock (worker lifetime) | **150s free / 400s paid** | worker terminated |
| **Request idle timeout** | **150s, both plans** | **"if a function doesn't send a response before the timeout, 504 Gateway Timeout"** |
| CPU time | 200ms active compute | not relevant to I/O-bound (Anthropic) work |

The DragonCandy org is **Pro → 400s wall-clock**, so a 504 at exactly ~150,000ms is the
**idle timeout**, not the wall-clock. A fully non-streaming function that does all its work
then returns one JSON body sends **zero bytes until done** — so any run over 150s 504s
*before a response exists*, wasting the ~250s of wall-clock the plan already pays for.

**The fix is to send a first byte early and keep the connection non-idle.** Once bytes are
flowing, you're bounded only by the 400s wall-clock.

## Pattern (as shipped in donny-chat)

1. **Validate first, stream second.** Run all auth/quota/ownership/gate/length checks
   (which return JSON 4xx) *before* opening the stream, so error status codes are
   unchanged. Only branch into streaming once you're about to make the first model call.
2. **Return a `ReadableStream`** with `Content-Type: application/x-ndjson` and **write an
   initial event at `start()` before the first slow call** — the early first byte is what
   defeats the idle timeout; it must not wait on the first model delta.
3. **NDJSON event protocol** (one JSON object per line): `status` (progress), `text`
   (output deltas), `heartbeat` (periodic keepalive, e.g. 15s `setInterval`), `done`
   (terminal success, carries the canonical final payload), `error` (terminal failure —
   an **event**, not an HTTP 500, since the 200 status is already committed).
4. **Stream the upstream (Anthropic) calls** and forward their deltas, so keepalive falls
   out naturally (during a long tool-input generation, `input_json_delta` events drip
   continuously). Reconstruct the full message for any server-side loop continuation — see
   the pure accumulator below.
5. **Handle client disconnect.** Add a `ReadableStream.cancel()` handler that stops the
   heartbeat and marks the stream closed; guard `controller.enqueue`/`close()` against
   post-cancel throws (a distinct `cancelled` flag — closing an already-cancelled
   controller throws). On the client, release the reader in a `finally`.

## The pure accumulator (testability)

The fiddly part — reconstructing Anthropic `tool_use` inputs from streamed
`input_json_delta` fragments and merging token `usage` from two SSE events — lives in a
**pure module with no Deno/network imports** (`donny-chat/stream-accumulator.ts`:
`parseSseLines`, `StreamAccumulator`, `toolStatusLabel`), so it is fully vitest-testable
offline. This mirrors the `history.ts` pattern: edge functions can't run under vitest (Deno
URL imports) and Deno isn't installed locally, so **isolate the logic into pure modules and
unit-test those**; the thin integration glue in `index.ts` is verified post-deploy. Key
accumulator rules: `usage.input_tokens` + cache fields come from `message_start`,
`usage.output_tokens` from `message_delta` (drop neither, or cost accounting under-reports);
`tool_use.input` is the concatenated `partial_json` fragments `JSON.parse`d at
`content_block_stop` (malformed → throw → surfaced as an `error` event).

## Keep one loop for both modes

A unified `callModel({stream, emit})` returns the same `{content, stop_reason, usage}` shape
whether it streamed or read JSON, so a single `runTurn(emit?)` runs the tool loop once for
**both** the streaming (internal) and non-streaming (consumer) surfaces — no duplicated
loop, and the consumer path's behavior (and every persistence/audit/cost side effect) is
preserved exactly. The consumer surface stays JSON; only `internalMode` streams.

## Graceful version skew

The client reads the stream but **falls back to `response.json()` if the response isn't
NDJSON** (`Content-Type` check), so a new frontend works against an un-redeployed edge
function. Symmetrically, an *old* frontend hitting a *new* streaming edge function degrades
gracefully rather than breaking: `response.json().catch(() => ({}))` on an NDJSON body
yields `{}` on a 200, and the existing `onSettled` refetch of `donny_messages` still renders
the persisted final message (no live UX, but no error). So deploy order is not load-bearing
— relevant given the [[Lovable Edge-Function Deploy Gap]] (frontend and edge functions
deploy separately).

## Residual limits

Streaming defeats the **idle** timeout but not the **400s wall-clock** — a single run over
400s would still die. In `donny-chat` the long generation is the `propose_correction`
full-doc tool input; **this residual was resolved** by [[Patch-Based Corrections]] (PRs
#151/#152) — Donny now emits small find/replace edits and the server reconstructs the doc, so
the heavy-correction turn dropped from ~130s to seconds (which also stopped the mobile
streamed-`fetch` "Load failed" on long turns). Also: `ReadableStream.cancel()` stops
the heartbeat, but Deno doesn't abort in-flight `await`s, so `runTurn` may still finish
server-side after a client disconnect (work persists correctly); an `AbortController`
thread-through is the deferred fix.

## When streaming isn't enough: async job + own-row polling (2026-07-14)

Streaming keeps the **server** side alive (idle timeout) but a streamed fetch still
dies when a **mobile tab backgrounds** (the PR #151 "Load failed" lesson). When the
output can't be shortened either, use the third pattern —
**async job + own-row polling**, first applied to `donny-campaign-generate` (PR #232):
the fn returns `{job_id}` in <1s, runs the unchanged pipeline in
`EdgeRuntime.waitUntil` writing progress/result/error to a `campaign_generation_jobs`
row (service-role writes, `auth.uid()=user_id` SELECT RLS), and the client polls its
own row (2.5s × 3 min, poll errors are blips). Survives connection drops, tab
backgrounding, even reloads. Choosing between the three: **shorten the output** if you
can (patch-based corrections), **stream** if the client stays foregrounded (internal
Donny on desktop), **job+poll** if the client can vanish mid-call (consumer mobile).
Gotchas: async must be gated to session-JWT callers (an OAuth caller can't poll);
the background task must be fully self-catching (a dead isolate leaves `processing` —
the client poll timeout is the recovery); `EdgeRuntime.waitUntil` does not survive
isolate shutdown and the 400s wall-clock still applies.

## See Also

- [[Patch-Based Corrections]] — the follow-up that cut the correction turn itself (output volume), resolving the residual above
- [[Donny Chat UX]] — the consumer/internal shared chat components and how the transient streaming bubble renders
- [[Donny AI]]
- [[Lovable Edge-Function Deploy Gap]]
- [[Error Handling Patterns]]
- [[Codex Second Review]]
