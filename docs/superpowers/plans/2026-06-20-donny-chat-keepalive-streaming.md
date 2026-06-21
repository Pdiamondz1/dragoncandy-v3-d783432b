# donny-chat Keepalive Streaming — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream the internal AIOS Donny response so the first byte beats Supabase's 150s request idle timeout, eliminating the `504` on long internal conversations and unlocking the Pro plan's 400s wall-clock — with per-tool status lines and live final text.

**Architecture:** `donny-chat` keeps one function. After all existing pre-call validation, internal requests return a streamed **NDJSON** body (`status`/`text`/`heartbeat`/`done`/`error`); consumer requests keep the current JSON body. A unified model-call helper (`callModel`) either streams the Anthropic SSE response through a pure, unit-tested accumulator (internal) or reads it as JSON (consumer); both return the same `{content, stop_reason, usage}` shape so the tool loop is shared. The frontend hook reads the stream via a pure NDJSON parser and renders a transient in-flight bubble, then reconciles with the persisted DB message.

**Tech Stack:** Supabase Edge Functions (Deno), Anthropic Messages API streaming (SSE), React + React Query (frontend), Vitest (pure-module tests).

**Spec:** `docs/superpowers/specs/2026-06-20-donny-chat-keepalive-streaming-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `supabase/functions/donny-chat/stream-accumulator.ts` | **New, pure.** `parseSseLines` (SSE bytes→event objects), `StreamAccumulator` (events→text deltas + assembled message with reconstructed `tool_use` inputs + merged usage), `toolStatusLabel` (tool name→friendly label). No Deno/network imports → vitest-testable. |
| `supabase/functions/donny-chat/stream-accumulator.test.ts` | **New.** Vitest unit tests for all three exports. |
| `supabase/functions/donny-chat/index.ts` | **Modify.** Add `callModel({stream, emit})`; for internalMode return a streamed NDJSON `Response`; emit status before each tool, forward text, emit `done`/`error`, heartbeat timer; consumer path keeps JSON behavior. |
| `src/lib/ndjson.ts` | **New, pure.** `parseNdjsonChunk(buffer, chunk) → {events, rest}`. |
| `src/lib/ndjson.test.ts` | **New.** Vitest unit tests. |
| `src/hooks/internal/useInternalDonny.ts` | **Modify.** Read NDJSON stream, drive transient in-flight message, reconcile on `done`, Content-Type fallback to JSON. |
| `src/pages/internal/InternalDonny.tsx` | **Modify.** Render the transient streaming bubble + status line. |

**Build order:** pure modules first (TDD), then the server integration that consumes them, then the frontend. Each task commits independently.

**Note on testing the edge function:** `index.ts` imports Deno URL modules, so it is **not** vitest-importable and Deno is not installed locally. Its tasks are verified by (a) the pure modules it depends on being fully unit-tested, (b) careful implementation against the snippets here, (c) the mandatory Codex review, and (d) post-deploy manual prod verification (Task 9). Do **not** claim the function works from a local test run — say it's pending prod verification.

---

### Task 1: SSE line parser (`parseSseLines`)

**Files:**
- Create: `supabase/functions/donny-chat/stream-accumulator.ts`
- Test: `supabase/functions/donny-chat/stream-accumulator.test.ts`

Anthropic streams Server-Sent Events: each event is an `event:` line + a `data:` line (compact single-line JSON) + a blank line. We only need the `data:` JSON. JSON never contains a raw newline, so a line-based parser is safe; we buffer a partial trailing line across chunks.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseSseLines } from './stream-accumulator';

describe('parseSseLines', () => {
  it('parses a complete data line and ignores event/blank lines', () => {
    const input = 'event: message_start\ndata: {"type":"message_start"}\n\n';
    const { events, rest } = parseSseLines('', input);
    expect(events).toEqual([{ type: 'message_start' }]);
    expect(rest).toBe('');
  });

  it('buffers a partial trailing line across chunks', () => {
    const a = parseSseLines('', 'data: {"type":"co');
    expect(a.events).toEqual([]);
    const b = parseSseLines(a.rest, 'ntent_block_stop","index":0}\n');
    expect(b.events).toEqual([{ type: 'content_block_stop', index: 0 }]);
  });

  it('ignores [DONE] and non-data lines, skips blank data', () => {
    const { events } = parseSseLines('', 'data: [DONE]\n: ping comment\ndata:\n');
    expect(events).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts`
Expected: FAIL — `parseSseLines` is not exported / file missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// supabase/functions/donny-chat/stream-accumulator.ts
// Pure SSE/streaming helpers for donny-chat. No Deno or network imports so this
// module is unit-testable with vitest (mirrors history.ts).

export function parseSseLines(
  buffer: string,
  chunk: string,
): { events: any[]; rest: string } {
  const text = buffer + chunk;
  const lines = text.split("\n");
  const rest = lines.pop() ?? ""; // last element is a (possibly partial) line
  const events: any[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue; // ignore event:/comment/blank lines
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    events.push(JSON.parse(payload));
  }
  return { events, rest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/stream-accumulator.ts supabase/functions/donny-chat/stream-accumulator.test.ts
git commit -m "feat(donny-chat): add parseSseLines SSE line parser"
```

---

### Task 2: Stream accumulator (`StreamAccumulator`)

**Files:**
- Modify: `supabase/functions/donny-chat/stream-accumulator.ts`
- Test: `supabase/functions/donny-chat/stream-accumulator.test.ts`

Consumes parsed Anthropic stream events and produces (a) text deltas (return value of `push`) and (b) the fully assembled message via `finalize()` — content blocks with `tool_use.input` reconstructed from `input_json_delta`, plus `stop_reason` and `usage` merged from `message_start` (input/cache) **and** `message_delta` (output).

- [ ] **Step 1: Write the failing tests**

```ts
import { StreamAccumulator } from './stream-accumulator';

describe('StreamAccumulator', () => {
  it('assembles a text-only message and surfaces text deltas', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 } } });
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    expect(acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } })).toEqual({ textDelta: 'Hel' });
    expect(acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } })).toEqual({ textDelta: 'lo' });
    acc.push({ type: 'content_block_stop', index: 0 });
    acc.push({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } });
    const msg = acc.finalize();
    expect(msg.content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(msg.stop_reason).toBe('end_turn');
    expect(msg.usage).toEqual({ input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 });
  });

  it('reconstructs a tool_use input from input_json_delta fragments', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'message_start', message: { usage: {} } });
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_internal_doc' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.md"}' } });
    acc.push({ type: 'content_block_stop', index: 0 });
    acc.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } });
    const msg = acc.finalize();
    expect(msg.content).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'get_internal_doc', input: { path: 'a.md' } }]);
    expect(msg.stop_reason).toBe('tool_use');
  });

  it('handles interleaved text + tool_use and empty tool input', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'message_start', message: { usage: {} } });
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'working' } });
    acc.push({ type: 'content_block_stop', index: 0 });
    acc.push({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't2', name: 'get_platform_stats' } });
    acc.push({ type: 'content_block_stop', index: 1 }); // no input_json_delta → {}
    const msg = acc.finalize();
    expect(msg.content).toEqual([
      { type: 'text', text: 'working' },
      { type: 'tool_use', id: 't2', name: 'get_platform_stats', input: {} },
    ]);
  });

  it('throws on malformed tool input json (caller maps to error event)', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'x' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"bad":' } });
    expect(() => acc.push({ type: 'content_block_stop', index: 0 })).toThrow();
  });

  it('returns {} (no textDelta) for non-text events', () => {
    const acc = new StreamAccumulator();
    expect(acc.push({ type: 'ping' })).toEqual({});
    expect(acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } })).toEqual({});
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts`
Expected: FAIL — `StreamAccumulator` not exported.

- [ ] **Step 3: Write the implementation (append to `stream-accumulator.ts`)**

```ts
export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type AssembledMessage = {
  content: any[];
  stop_reason: string | null;
  usage: Usage;
};

// Consumes parsed Anthropic stream events. push() returns { textDelta } when the
// event produced user-facing text, else {}. finalize() returns the assembled
// message in the same shape as a non-streaming Messages response.
export class StreamAccumulator {
  private blocks: any[] = [];
  private partialJson: Record<number, string> = {};
  private stopReason: string | null = null;
  private usage: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  push(ev: any): { textDelta?: string } {
    switch (ev?.type) {
      case "message_start": {
        const u = ev.message?.usage ?? {};
        this.usage.input_tokens = u.input_tokens ?? 0;
        this.usage.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
        this.usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
        return {};
      }
      case "content_block_start": {
        const cb = ev.content_block ?? {};
        if (cb.type === "tool_use") {
          this.blocks[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
          this.partialJson[ev.index] = "";
        } else if (cb.type === "text") {
          this.blocks[ev.index] = { type: "text", text: cb.text ?? "" };
        } else {
          this.blocks[ev.index] = { type: cb.type, ...cb }; // thinking/other — kept, not forwarded
        }
        return {};
      }
      case "content_block_delta": {
        const d = ev.delta ?? {};
        if (d.type === "text_delta") {
          const b = this.blocks[ev.index];
          if (b?.type === "text") b.text += d.text ?? "";
          return { textDelta: d.text ?? "" };
        }
        if (d.type === "input_json_delta") {
          this.partialJson[ev.index] = (this.partialJson[ev.index] ?? "") + (d.partial_json ?? "");
        }
        return {};
      }
      case "content_block_stop": {
        const b = this.blocks[ev.index];
        if (b?.type === "tool_use") {
          const raw = (this.partialJson[ev.index] ?? "").trim();
          b.input = raw ? JSON.parse(raw) : {}; // throws on malformed → fatal stream error
        }
        return {};
      }
      case "message_delta": {
        if (ev.delta?.stop_reason) this.stopReason = ev.delta.stop_reason;
        if (ev.usage?.output_tokens != null) this.usage.output_tokens = ev.usage.output_tokens;
        return {};
      }
      default:
        return {}; // ping, message_stop, etc.
    }
  }

  finalize(): AssembledMessage {
    return { content: this.blocks.filter(Boolean), stop_reason: this.stopReason, usage: this.usage };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts`
Expected: PASS (all Task 1 + Task 2 tests).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/stream-accumulator.ts supabase/functions/donny-chat/stream-accumulator.test.ts
git commit -m "feat(donny-chat): add StreamAccumulator (text deltas + tool_use reconstruction + usage)"
```

---

### Task 3: Friendly tool status labels (`toolStatusLabel`)

**Files:**
- Modify: `supabase/functions/donny-chat/stream-accumulator.ts`
- Test: `supabase/functions/donny-chat/stream-accumulator.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { toolStatusLabel } from './stream-accumulator';

describe('toolStatusLabel', () => {
  it('maps known internal tools to friendly labels', () => {
    expect(toolStatusLabel('get_internal_doc')).toBe('Reading the strategy library…');
    expect(toolStatusLabel('propose_correction')).toBe('Queuing the correction…');
    expect(toolStatusLabel('get_platform_stats')).toBe('Pulling platform stats…');
  });
  it('humanizes unknown tools', () => {
    expect(toolStatusLabel('some_new_tool')).toBe('Working on some new tool…');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts`
Expected: FAIL — `toolStatusLabel` not exported.

- [ ] **Step 3: Write the implementation (append to `stream-accumulator.ts`)**

```ts
const TOOL_STATUS_LABELS: Record<string, string> = {
  search_internal_knowledge: "Searching the strategy library…",
  get_internal_doc: "Reading the strategy library…",
  get_platform_stats: "Pulling platform stats…",
  get_revenue_stats: "Pulling revenue…",
  get_cost_stats: "Pulling AI spend…",
  get_platform_weight_trend: "Reading the scaling trend…",
  get_latest_briefing: "Reading the latest brief…",
  workspace_export_doc: "Exporting to a Google Doc…",
  workspace_list_files: "Listing your Drive folder…",
  workspace_read_file: "Reading the Drive file…",
  compose_email_link: "Drafting the email…",
  propose_correction: "Queuing the correction…",
};

export function toolStatusLabel(toolName: string): string {
  return TOOL_STATUS_LABELS[toolName] ?? `Working on ${toolName.replace(/_/g, " ")}…`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/stream-accumulator.ts supabase/functions/donny-chat/stream-accumulator.test.ts
git commit -m "feat(donny-chat): add toolStatusLabel for stream status lines"
```

---

### Task 4: Frontend NDJSON parser (`parseNdjsonChunk`)

**Files:**
- Create: `src/lib/ndjson.ts`
- Test: `src/lib/ndjson.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseNdjsonChunk } from './ndjson';

describe('parseNdjsonChunk', () => {
  it('parses multiple complete events in one chunk', () => {
    const { events, rest } = parseNdjsonChunk('', '{"type":"status","label":"a"}\n{"type":"text","delta":"hi"}\n');
    expect(events).toEqual([{ type: 'status', label: 'a' }, { type: 'text', delta: 'hi' }]);
    expect(rest).toBe('');
  });
  it('buffers a partial trailing line across chunks', () => {
    const a = parseNdjsonChunk('', '{"type":"te');
    expect(a.events).toEqual([]);
    const b = parseNdjsonChunk(a.rest, 'xt","delta":"x"}\n');
    expect(b.events).toEqual([{ type: 'text', delta: 'x' }]);
  });
  it('ignores blank lines', () => {
    const { events } = parseNdjsonChunk('', '\n{"type":"done","content":"c","rich_card":null}\n\n');
    expect(events).toEqual([{ type: 'done', content: 'c', rich_card: null }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/ndjson.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/ndjson.ts
// Pure newline-delimited-JSON chunk parser for streaming responses.
export function parseNdjsonChunk(
  buffer: string,
  chunk: string,
): { events: any[]; rest: string } {
  const text = buffer + chunk;
  const lines = text.split("\n");
  const rest = lines.pop() ?? "";
  const events: any[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed));
  }
  return { events, rest };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/ndjson.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ndjson.ts src/lib/ndjson.test.ts
git commit -m "feat(donny): add parseNdjsonChunk for streaming responses"
```

---

### Task 5: Server — `callModel` abstraction (no behavior change yet)

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts`

Extract the Anthropic call into one helper so the tool loop can run identically whether streaming (internal) or not (consumer). This task introduces the helper and routes the **existing** non-streaming calls through it — no behavior change, smaller diff for the next task. (Verification is build + review; no local Deno run — see the note at the top.)

- [ ] **Step 1: Add the import**

At the top of `index.ts`, alongside the other local imports:

```ts
import { parseSseLines, StreamAccumulator, toolStatusLabel } from "./stream-accumulator.ts";
```

- [ ] **Step 2: Add the `callModel` helper**

Place this inside `serve(...)` after `clampedMaxTokens` is computed and `extractText`/`getToolUseBlocks` are defined, so it closes over `systemBlocks`, `allowedTools`, `modelConfig`, `clampedMaxTokens`, `ANTHROPIC_API_KEY`. `emit` is optional; when present and `stream` is true, text deltas are forwarded as they arrive.

```ts
// One model call. stream=false → non-streaming JSON (consumer, unchanged behavior).
// stream=true → SSE; forward text deltas via emit and return the assembled message.
// Returns { content, stop_reason, usage } in both modes.
async function callModel(
  messages: any[],
  opts: { stream: boolean; withTools: boolean; emit?: (ev: any) => void },
): Promise<{ content: any[]; stop_reason: string | null; usage: any }> {
  const body: Record<string, any> = {
    model: modelConfig.model,
    max_tokens: clampedMaxTokens,
    system: systemBlocks,
    messages: withHistoryCacheBreakpoint(messages),
  };
  if (opts.withTools) body.tools = allowedTools;
  if (opts.stream) body.stream = true;

  const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Anthropic API error: ${response.status} ${errorBody}`);
  }

  if (!opts.stream) {
    const json = await response.json();
    return { content: json.content, stop_reason: json.stop_reason, usage: json.usage };
  }

  // Streaming: read SSE, forward text deltas, assemble the message.
  const acc = new StreamAccumulator();
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    const { events, rest } = parseSseLines(buffer, decoder.decode(value, { stream: true }));
    buffer = rest;
    for (const ev of events) {
      if (ev.type === "error") {
        throw new Error(`Anthropic stream error: ${JSON.stringify(ev.error ?? ev)}`);
      }
      const { textDelta } = acc.push(ev); // may throw on malformed tool json → caught by caller
      if (textDelta && opts.emit) opts.emit({ type: "text", delta: textDelta });
    }
  }
  return acc.finalize();
}
```

- [ ] **Step 3: Route the existing non-streaming calls through `callModel`**

Replace the **initial** `anthropicFetch(...)` + `if (!response.ok)` + `result = await response.json()` block with:

```ts
let result = await callModel(claudeMessages, { stream: false, withTools: true });
let totalTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
```

Replace the **in-loop** `anthropicFetch(...)` call (after pushing tool results) the same way:

```ts
result = await callModel(claudeMessages, { stream: false, withTools: true });
```

Replace the **final safety-net** no-tools `anthropicFetch(...)` call with:

```ts
const finalResult = await callModel(claudeMessages, { stream: false, withTools: false });
finalContent = extractText(finalResult.content);
totalTokens += (finalResult.usage?.input_tokens ?? 0) + (finalResult.usage?.output_tokens ?? 0);
```

Keep every surrounding line (the `logCost` calls, `console.log` cache line, persistence, `getToolUseBlocks`, etc.) exactly as-is — `result` keeps the same shape.

- [ ] **Step 4: Verify the frontend build is unaffected and lint passes**

Run: `npm run build`
Expected: succeeds (this task doesn't touch `src/`).
Run: `npm run lint`
Expected: no new errors (note: `supabase/**` is lint-ignored, but run it to catch accidental `src` edits).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "refactor(donny-chat): route Anthropic calls through callModel helper"
```

---

### Task 6: Server — stream the internal response

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts`

For `internalMode`, run the tool loop inside a `ReadableStream`, emitting NDJSON events; consumer keeps the JSON `Response`. (Verification: build + review + post-deploy.)

- [ ] **Step 1: Factor the loop+finalize into a function that takes `emit`**

Wrap the existing tool loop + final-text extraction + rich-card extraction + the three persistence/`incrementUsage` calls into one inner async function so both paths share it:

```ts
// Runs the full turn: tool loop → final text → persist. When emit is provided
// (internal/streaming), forwards status before each tool and the final text is
// already streamed via callModel's emit. Returns { displayContent, richCard }.
async function runTurn(emit?: (ev: any) => void): Promise<{ displayContent: string; richCard: any }> {
  let result = await callModel(claudeMessages, { stream: !!emit, withTools: true, emit });
  let totalTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
  await logCost(supabaseAdmin, { userId, edgeFunction: "donny-chat", model: modelConfig.model, tier: modelConfig.tier, inputTokens: result.usage?.input_tokens ?? 0, outputTokens: result.usage?.output_tokens ?? 0 });

  let toolRounds = 0;
  const MAX_TOOL_ROUNDS = 10;
  const TOKEN_SAFETY_NET = 300_000;
  while (result.stop_reason === "tool_use") {
    if (toolRounds >= MAX_TOOL_ROUNDS || totalTokens > TOKEN_SAFETY_NET) break;
    toolRounds++;
    const assistantContent = result.content;
    const callTokens = (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
    const { data: savedAssistantMsg } = await supabaseAdmin.from("donny_messages").insert({
      conversation_id, role: "assistant", content: extractText(assistantContent),
      tool_calls: assistantContent, model: modelConfig.model, tokens_used: callTokens,
    }).select().single();

    const toolResultBlocks: any[] = [];
    for (const toolUse of getToolUseBlocks(assistantContent)) {
      emit?.({ type: "status", label: toolStatusLabel(toolUse.name), tool: toolUse.name });
      let toolResult: any; let status = "completed";
      try {
        const execution = await executeTool(toolUse.name, toolUse.input, userId, profile.role, supabaseAdmin, requestContext, internalMode ? { userClient: supabaseUser ?? supabaseAdmin, serviceMode: serviceActed } : undefined);
        toolResult = execution.result;
      } catch (err: any) { toolResult = { error: err.message }; status = "failed"; }
      // ... audit inserts + tool-result insert exactly as today ...
      toolResultBlocks.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(toolResult) });
    }
    claudeMessages.push({ role: "assistant", content: assistantContent });
    claudeMessages.push({ role: "user", content: toolResultBlocks });
    result = await callModel(claudeMessages, { stream: !!emit, withTools: true, emit });
    totalTokens += (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0);
    await logCost(/* same as today */);
  }
  await incrementUsage(supabaseAdmin, userId, modelConfig.actionCost);

  let finalContent = extractText(result.content);
  if (!finalContent.trim()) {
    // existing safety-net block, but the final call uses callModel(stream:!!emit, withTools:false, emit)
  }
  // existing rich_card extraction → richCard, displayContent
  await supabaseAdmin.from("donny_messages").insert({ conversation_id, role: "assistant", content: displayContent, rich_card: richCard, model: modelConfig.model, tokens_used: (result.usage?.input_tokens ?? 0) + (result.usage?.output_tokens ?? 0) });
  await supabaseAdmin.from("donny_conversations").update({ last_message_at: new Date().toISOString() }).eq("id", conversation_id);
  return { displayContent, richCard };
}
```

> Keep the audit-insert and tool-result-insert bodies byte-for-byte from the current loop; only the wrapping changed. This is a mechanical extraction — diff carefully against the original to confirm no logic dropped. Specifically, **do not drop these existing pieces** when lifting them into `runTurn`:
> - the prompt-cache visibility `console.log(...)` after the initial call (index.ts ~lines 2038–2042) — keep it;
> - the in-loop `logCost(...)` (index.ts ~lines 2187–2194) — the `/* same as today */` above stands for that exact block;
> - the full safety-net "no text → one no-tools turn" block (index.ts ~lines 2202–2245), with its final call switched to `callModel(claudeMessages, { stream: !!emit, withTools: false, emit })`;
> - the rich-card regex extraction (index.ts ~lines 2247–2260) producing `richCard` + `displayContent`.

- [ ] **Step 2: Consumer path — call `runTurn()` and return JSON (unchanged behavior)**

```ts
if (!internalMode) {
  const { displayContent, richCard } = await runTurn();
  return new Response(JSON.stringify({ success: true, content: displayContent, rich_card: richCard }),
    { headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
}
```

- [ ] **Step 3: Internal path — stream NDJSON**

```ts
// internalMode: stream NDJSON. Validation already passed above this point.
const encoder = new TextEncoder();
const stream = new ReadableStream({
  async start(controller) {
    let closed = false;
    const send = (ev: any) => { if (!closed) controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n")); };
    // Flush a first byte immediately so the 150s idle timeout never fires.
    send({ type: "status", label: "Thinking…", tool: "" });
    const heartbeat = setInterval(() => send({ type: "heartbeat" }), 15_000);
    try {
      const { displayContent, richCard } = await runTurn(send);
      send({ type: "done", content: displayContent, rich_card: richCard ?? null });
    } catch (err: any) {
      send({ type: "error", message: err?.message ?? "Donny hit an error" });
    } finally {
      clearInterval(heartbeat);
      closed = true;
      controller.close();
    }
  },
});
return new Response(stream, {
  headers: { ...corsHeaders(req), "Content-Type": "application/x-ndjson", "Cache-Control": "no-cache" },
});
```

- [ ] **Step 4: Verify frontend build + lint still clean**

Run: `npm run build` → succeeds. Run: `npm run lint` → no new errors.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "feat(donny-chat): stream internal responses as NDJSON (status/text/heartbeat/done/error)"
```

---

### Task 7: Frontend — consume the stream in `useInternalDonny`

**Files:**
- Modify: `src/hooks/internal/useInternalDonny.ts`

Read the NDJSON stream, drive a transient in-flight assistant message, reconcile with the DB query on `done`, and fall back to JSON if the response isn't NDJSON.

- [ ] **Step 1: Add transient streaming state**

Add hook state for the in-flight message: `const [streaming, setStreaming] = useState<{ text: string; status: string } | null>(null);` and **add `streaming` to the hook's returned object** (alongside the existing `isThinking`/`error`/etc.) so the page can render it. Note Task 8 must then add `streaming` to `InternalDonny.tsx`'s destructure of the hook.

- [ ] **Step 2: Replace the response handling in the mutation**

Replace `const data = await response.json()...` with content-type branching:

```ts
if (!response.ok) {
  const data = await response.json().catch(() => ({}));
  throw new Error(data?.error || data?.message || 'Donny could not generate a response');
}

const contentType = response.headers.get('content-type') ?? '';
if (!contentType.includes('ndjson') || !response.body) {
  // Fallback: older/non-streaming function deploy → behave as before.
  return await response.json().catch(() => ({}));
}

const reader = response.body.getReader();
const decoder = new TextDecoder();
let buffer = '';
let acc = '';
setStreaming({ text: '', status: 'Thinking…' });
for (;;) {
  const { value, done } = await reader.read();
  if (done) break;
  const { events, rest } = parseNdjsonChunk(buffer, decoder.decode(value, { stream: true }));
  buffer = rest;
  for (const ev of events) {
    if (ev.type === 'status') setStreaming((s) => ({ text: s?.text ?? acc, status: ev.label }));
    else if (ev.type === 'text') { acc += ev.delta; setStreaming((s) => ({ text: acc, status: s?.status ?? '' })); }
    else if (ev.type === 'done') return { success: true, content: ev.content, rich_card: ev.rich_card };
    else if (ev.type === 'error') throw new Error(ev.message || 'Donny hit an error');
    // heartbeat: ignore
  }
}
// Stream closed without `done` → cut off (e.g. 400s wall-clock).
throw new Error('Donny’s response was cut off — please try again.');
```

Add the import: `import { parseNdjsonChunk } from '@/lib/ndjson';`

- [ ] **Step 3: Clear the transient bubble after the DB refetch**

In `onSettled`, after `invalidateQueries`, clear streaming once the refetch resolves so the persisted message replaces the transient one without a gap:

```ts
onSettled: async () => {
  await queryClient.invalidateQueries({ queryKey: ['aios', 'donny-messages', conversation?.id] });
  setStreaming(null);
},
```

- [ ] **Step 4: Run the frontend tests + build**

Run: `npx vitest run src/lib/ndjson.test.ts` → PASS.
Run: `npm run build` → succeeds.
Run: `npm run typecheck` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/internal/useInternalDonny.ts
git commit -m "feat(donny): stream internal Donny responses in useInternalDonny"
```

---

### Task 8: Frontend — render the transient bubble in `InternalDonny`

**Files:**
- Modify: `src/pages/internal/InternalDonny.tsx`

- [ ] **Step 1: Render the streaming bubble + status**

Add `streaming` to the existing `useInternalDonny()` destructure, then consume it. While non-null, render an assistant bubble showing `streaming.text` (typing) with a small muted status line `streaming.status` beneath it (use existing dc tokens / message-bubble components; no gray — use a brand-adjacent muted tone per the design system). Place it after the persisted messages and before the input. Ensure it disappears when `streaming` becomes null (the persisted message has loaded).

- [ ] **Step 2: Verify both viewports**

Run: `npm run build` → succeeds.
Manually check the component renders the transient bubble at desktop (`lg:`) and mobile (base) widths per the design-system separation.

- [ ] **Step 3: Commit**

```bash
git add src/pages/internal/InternalDonny.tsx
git commit -m "feat(donny): render transient streaming bubble + status on InternalDonny"
```

---

### Task 9: Full verification, review, PR, deploy

**Files:** none (process)

- [ ] **Step 1: Full test + build + typecheck + lint**

```bash
npx vitest run supabase/functions/donny-chat/stream-accumulator.test.ts src/lib/ndjson.test.ts
npm run build
npm run typecheck
npm run lint
```
Expected: pure-module tests PASS; build/typecheck/lint clean. (Full `npm run test` exits non-zero from pre-existing nested e2e files — trust the per-file pass counts, per project memory.)

- [ ] **Step 2: Codex second review (required)**

Use the `codex-review` skill / `codex review --base main --title "donny-chat internal streaming"`. Fix any real findings and re-run until clean. Relay the verdict.

- [ ] **Step 3: Open the PR**

`gh pr create --base main` with a body covering: the 150s-idle-timeout root cause, the NDJSON protocol, internal-only scope, the tested pure modules, consumer-behavior-preserved, and the **deploy note** (`npm run deploy:fn -- donny-chat`).

- [ ] **Step 4: Merge + deploy + verify**

After merge: refresh local main (`refresh-main`), then `npm run deploy:fn -- donny-chat`. Post-deploy manual verification (do not skip — this is the only real test of the integration):
  - Reproduce a long internal correction (a Strategy-library doc edit). Confirm: status lines appear, final text streams in, **no 504**, and the persisted message matches the streamed content.
  - Run a normal consumer Donny turn → confirm it still returns JSON and works (consumer regression).
  - Check `donny-chat` edge logs (`get_logs`) for the new version: no `500`/`504` on the streamed turn.

- [ ] **Step 5: Knowledge sync**

Run the `knowledge-sync` skill to capture the session (wiki source + PROJECT_CONTEXT note + Donny RAG), since this is a non-trivial architecture change.

---

## Invariants to preserve (check during review)

- Internal surface gating (stored-surface trust anchor + admin re-verification) unchanged.
- `donny_messages` remains source of truth; persisted final message equals `done.content`.
- Consumer surface **behavior** unchanged (still JSON; same content).
- `propose_correction` still routes through `aios-report-ingest`; nothing auto-applied.
- `logCost` / `incrementUsage` / `tokens_used` accounting unchanged (usage merged from both SSE events).
- No schema, RLS, secret, or OAuth-scope changes.
