# Donny AI Audit Remediation — Phase 2

> Fixes the final 2 of 8 issues from `docs/donny-ai-audit.txt`.
> Phase 1 (6 fixes) completed in prior session.

## Scope

| # | Issue | Severity | Section |
|---|-------|----------|---------|
| 1 | No monthly LLM quota enforcement | Critical | 1 |
| 5 | No streaming — frontend blocks until full response | Medium | 2 |

## Files Modified

```
supabase/functions/_shared/usage-tracker.ts         — Section 1
supabase/functions/donny-chat/index.ts               — Section 1
supabase/functions/donny-orchestrator/index.ts        — Sections 1, 2
src/hooks/useDonny.ts                                — Sections 1, 2
src/contexts/DonnyProvider.tsx                       — Section 2
src/components/donny/DonnyChatView.tsx               — Section 2
```

---

## Section 1: Monthly LLM Quota Enforcement (Audit #1 — Critical)

**Problem:** Monthly Donny action limits are not enforced. Usage is tracked
(`donny_usage` table, `incrementUsage()`), but users are never blocked when
they exceed their budget. One automated script per Free user can exhaust
the platform's Claude budget.

**Tier budget values:** The audit's pricing PDF cites Free=50, Starter=50,
Growth=200, but `TIER_BUDGETS` in `_shared/usage-tracker.ts` (set during
cost architecture implementation) uses Free=50, Starter=500, Growth=2000,
Pro=10000, Enterprise=50000. The code values are authoritative — they were
established by the cost architecture spec and migration
(`20260503000000_donny_cost_architecture.sql`). The pricing PDF predates
this spec and was superseded. This enforcement uses the code values.

**Why no new migration:** The existing `donny_usage` table already tracks
per-user, per-month usage with `actions_used`, `actions_budget`, and
`period_start` (set to the 1st of each month). `TIER_BUDGETS` in
`_shared/usage-tracker.ts` maps tiers to budgets. Creating a separate
`donny_usage_monthly` table (as the audit literally suggests) would duplicate
this infrastructure for zero benefit.

### Enforcement function

Add `checkQuotaOrBlock()` to `_shared/usage-tracker.ts`:

```typescript
export async function checkQuotaOrBlock(
  supabaseAdmin: SupabaseClient,
  userId: string
): Promise<
  | { allowed: true }
  | { allowed: false; used: number; budget: number; tier: string }
> {
  const periodStart = getCurrentPeriodStart();
  const tier = await getUserSubscriptionTier(supabaseAdmin, userId);
  const budget = TIER_BUDGETS[tier] ?? TIER_BUDGETS.free;

  const { data } = await supabaseAdmin
    .from("donny_usage")
    .select("actions_used")
    .eq("user_id", userId)
    .eq("period_start", periodStart)
    .maybeSingle();

  const used = data?.actions_used ?? 0;
  if (used >= budget) {
    return { allowed: false, used, budget, tier };
  }
  return { allowed: true };
}
```

### Edge function enforcement

Both `donny-chat/index.ts` and `donny-orchestrator/index.ts` call this
after auth resolution but before any Claude API call or profile lookup.

**`donny-chat/index.ts`** — add `checkQuotaOrBlock` to existing import from
`"../_shared/usage-tracker.ts"` (already imports `getUserUsageStage`,
`incrementUsage`, `getUserSubscriptionTier`). The service-role client is
named `supabaseAdmin`:

```typescript
const quotaCheck = await checkQuotaOrBlock(supabaseAdmin, userId);
if (!quotaCheck.allowed) {
  return new Response(
    JSON.stringify({
      error: "monthly_quota_exceeded",
      message: `You've used ${quotaCheck.used}/${quotaCheck.budget} Donny actions this month.`,
      tier: quotaCheck.tier,
      upgrade_url: "/settings/billing",
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

**`donny-orchestrator/index.ts`** — add `checkQuotaOrBlock` to existing
import from `"../_shared/usage-tracker.ts"` (already imports
`getUserUsageStage`, `incrementUsage`). The service-role client is named
`supabase` (not `supabaseAdmin`):

```typescript
const quotaCheck = await checkQuotaOrBlock(supabase, userId);
if (!quotaCheck.allowed) {
  return new Response(
    JSON.stringify({
      error: "monthly_quota_exceeded",
      message: `You've used ${quotaCheck.used}/${quotaCheck.budget} Donny actions this month.`,
      tier: quotaCheck.tier,
      upgrade_url: "/settings/billing",
    }),
    { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

### Frontend quota error handling

In `useDonny.ts`, detect the 429 quota error and surface a specific message
with upgrade CTA instead of the generic "Something went wrong":

```typescript
// In the error handler, after catching the response:
if (errorData?.error === "monthly_quota_exceeded") {
  setError(
    `You've used all ${errorData.budget} Donny actions this month. Upgrade your plan to continue.`
  );
} else {
  setError(err instanceof Error ? err.message : "Something went wrong");
}
```

In `DonnyChatView.tsx`, the error block renders the upgrade link when the
error mentions "Upgrade":

```tsx
{error && !isStreaming && (
  <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-xs text-red-600">{error}</p>
    {error.includes("Upgrade") && (
      <Link to="/settings/billing"
        className="text-xs text-dc-teal font-semibold mt-1 inline-block">
        Upgrade Plan
      </Link>
    )}
  </div>
)}
```

---

## Section 2: Streaming (Audit #5 — Medium)

**Problem:** `donny-orchestrator` is a synchronous fetch — it awaits the full
Claude response (including tool loop iterations) before returning JSON. The
frontend shows a typing indicator (bouncing dots) for 6-15 seconds with no
progress signal. Users assume it's broken and click again, queueing duplicate
requests.

**Architecture:** The frontend calls `donny-orchestrator` (not `donny-chat`).
The orchestrator has a tool loop (max 3 iterations dispatching sub-agents).
The tool loop must complete synchronously — tool calls need their results
before Claude can continue. Only the final Claude response (after the tool
loop exits) streams to the client.

### Layer 1: Orchestrator SSE streaming

Modify `donny-orchestrator/index.ts` to stream the final Claude response as
Server-Sent Events.

**SSE event format:**

```
event: text_delta
data: {"text": "Here's"}

event: text_delta
data: {"text": " what I found..."}

event: done
data: {"suggested_actions": [...], "agent_used": "campaign_agent"}
```

**Implementation:**

The existing `callClaude()` function stays for tool-loop iterations. Add a
`callClaudeStreaming()` that uses `stream: true` in the Anthropic API request
and returns the raw `Response` body. After the tool loop completes:

1. If the tool loop produced a final text result (stop_reason was not
   `tool_use`), send it as SSE events from the already-resolved text —
   this covers the case where no tool calls happened or the last iteration
   returned text.

2. If the tool loop's last iteration still ended with `tool_use` but hit
   the 3-iteration cap, extract whatever text exists and send it.

3. For the streaming call: pipe the Anthropic streaming response through a
   `TransformStream` that:
   - Extracts `content_block_delta` events with `text_delta` type
   - Forwards each text chunk as `event: text_delta\ndata: {"text": "..."}\n\n`
   - Accumulates the full text for `suggested_actions` parsing
   - On stream end, emits `event: done\ndata: {...}\n\n` with the parsed
     `suggested_actions` and `agent_used`

**When to stream vs. not:** The final Claude call (after tool loop exits)
uses streaming. All tool-loop iterations use synchronous `callClaude()`.
The response Content-Type switches from `application/json` to
`text/event-stream`.

**Cost logging and usage increment** still happen after the stream completes,
using the accumulated token counts from the streaming response.

### Layer 2: Frontend streaming consumption

In `useDonny.ts`, replace `supabase.functions.invoke('donny-orchestrator', ...)`
with a raw `fetch()` to the orchestrator URL. This is necessary because
`supabase.functions.invoke()` doesn't support streaming responses.

```typescript
const response = await fetch(
  `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/donny-orchestrator`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ query, page_path, ... }),
  }
);
```

**Stream reading logic:**

SSE events are delimited by double newlines (`\n\n`). Parse complete events
from the buffer, tracking the current event type:

```typescript
const reader = response.body!.getReader();
const decoder = new TextDecoder();
let buffer = "";
let accumulatedText = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  buffer += decoder.decode(value, { stream: true });

  // Split on double-newline to get complete SSE events
  const events = buffer.split("\n\n");
  buffer = events.pop() ?? ""; // last element is incomplete

  for (const event of events) {
    const lines = event.split("\n");
    let eventType = "";
    let eventData = "";

    for (const line of lines) {
      if (line.startsWith("event: ")) eventType = line.slice(7);
      else if (line.startsWith("data: ")) eventData = line.slice(6);
    }

    if (eventType === "text_delta" && eventData) {
      const { text } = JSON.parse(eventData);
      accumulatedText += text;
      setStreamingContent(accumulatedText);
    } else if (eventType === "done" && eventData) {
      const { suggested_actions, agent_used } = JSON.parse(eventData);
      // Save final assistant message to DB with accumulatedText + suggested_actions
    }
  }
}
```

**Non-streaming fallback:** If the response Content-Type is `application/json`
(quota error, validation error, auth error), fall back to reading the body
as JSON. This handles 429 quota responses and other error cases cleanly.

**Connection drop handling:** If `reader.read()` throws (network failure),
preserve whatever `accumulatedText` was built so far — set it as the final
`streamingContent` so the user can still see the partial response. Show the
error with a retry button. The user message (already inserted into DB before
the fetch) stays; on retry, a new user message is not re-inserted — instead
the retry resends the same query to the orchestrator, and on success, saves
a new assistant message.

**User message insertion** stays the same — inserted into `donny_messages`
before the fetch. **Assistant message insertion** moves to after the stream
completes, using the accumulated text and suggested_actions from the `done`
event.

### Layer 3: Chat view streaming render

In `DonnyChatView.tsx`, replace the simple `{isStreaming && <DonnyTypingIndicator />}`
with conditional rendering:

- `isStreaming && !streamingContent` → show `DonnyTypingIndicator` (tool loop
  still running, no text yet)
- `isStreaming && streamingContent` → show a streaming message bubble with the
  partial text and a blinking cursor

```tsx
{isStreaming && !streamingContent && <DonnyTypingIndicator />}
{isStreaming && streamingContent && (
  <div className="flex gap-2 items-end">
    <DonnyAvatar size="sm" state="thinking" />
    <div className="max-w-[80%]">
      <div className="bg-dc-pink rounded-2xl rounded-bl-sm px-3.5 py-2.5">
        <p className="donny-markdown text-sm text-dc-text leading-relaxed whitespace-pre-wrap">
          {streamingContent}
          <span className="inline-block w-1.5 h-4 bg-dc-text/40 animate-pulse ml-0.5 align-text-bottom" />
        </p>
      </div>
    </div>
  </div>
)}
```

The streaming bubble matches the existing `DonnyMessage` assistant styling
(pink bubble, avatar, same padding). The blinking cursor provides a visual
cue that text is still arriving.

### Layer 4: Error handling and retry

Add a `retry` function to `useDonny.ts` that resends the last user message:

```typescript
const lastUserMessage = useRef<string>("");

// Set in sendMessage before the fetch
lastUserMessage.current = content;

const retry = useCallback(() => {
  if (lastUserMessage.current && !isSendingRef.current) {
    setError(null);
    sendMessage(lastUserMessage.current);
  }
}, [sendMessage]);
```

Expose `retry` from the hook. In `DonnyChatView.tsx`, render a retry button
in the error block:

```tsx
{error && !isStreaming && (
  <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
    <p className="text-xs text-red-600">{error}</p>
    <div className="flex gap-2 mt-1.5">
      {error.includes("Upgrade") && (
        <Link to="/settings/billing"
          className="text-xs text-dc-teal font-semibold">
          Upgrade Plan
        </Link>
      )}
      {!error.includes("Upgrade") && (
        <button onClick={retry}
          className="text-xs text-dc-teal font-semibold">
          Try Again
        </button>
      )}
    </div>
  </div>
)}
```

`DonnyChatInput` already has `disabled={isStreaming}` — the send button is
already disabled during streaming. No changes needed there.

### Layer 5: DonnyProvider context pass-through

`DonnyChatView` gets state from `useDonnyContext()`, not directly from
`useDonny()`. The `DonnyProvider` at `src/contexts/DonnyProvider.tsx` must
be updated to pass through the new values:

1. Add `streamingContent` and `retry` to the `DonnyContextValue` interface:

```typescript
interface DonnyContextValue {
  // ... existing fields ...
  streamingContent: string;
  retry: () => void;
}
```

2. Pass them through in the `value` memo:

```typescript
const value = useMemo<DonnyContextValue>(
  () => ({
    // ... existing fields ...
    streamingContent: donny.streamingContent,
    retry: donny.retry,
  }),
  [
    // ... existing deps ...
    donny.streamingContent, donny.retry,
  ]
);
```

3. `DonnyChatView` destructures `streamingContent` and `retry` from context:

```typescript
const { messages, isStreaming, streamingContent, error, retry, ... } = useDonnyContext();
```

### Concurrent requests

The `isSendingRef` guard in `useDonny.ts` prevents duplicate sends from a
single tab. Multi-tab concurrent requests are an accepted edge case — the
existing per-hour rate limit (30 messages/hour) catches abuse. No server-side
single-flight enforcement is needed for Phase 2.

---

## Out of Scope

- Streaming for `donny-chat` (external clients) — deferred until Chrome
  Extension / mobile widget UIs support streaming
- New `donny_usage_monthly` migration — existing `donny_usage` table suffices
- Cost telemetry dashboard / usage alerts — separate workstream
- Router prompt for model selection (Haiku for simple queries) — already
  implemented via `getModelConfig()` + `UsageStage` routing
