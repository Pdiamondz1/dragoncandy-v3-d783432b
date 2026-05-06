# Donny AI Audit Remediation — Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add monthly LLM quota enforcement (audit #1) and streaming responses (audit #5) to complete the 8-item Donny AI audit remediation.

**Architecture:** Quota enforcement adds a `checkQuotaOrBlock()` function to the shared usage tracker, called by both `donny-chat` and `donny-orchestrator` edge functions before any Claude API call. Streaming modifies `donny-orchestrator` to return SSE instead of JSON for the final Claude response, with the frontend consuming the stream via `ReadableStream` and rendering partial text progressively.

**Tech Stack:** Deno (edge functions), Anthropic Messages API (streaming mode), React/TypeScript, TanStack Query, Supabase JS client v2.

**Spec:** `docs/superpowers/specs/2026-05-06-donny-ai-audit-remediation-phase2-design.md`

**Build verification:** `npm run build` verifies frontend TypeScript. Edge function changes are Deno — verify syntax with careful review (no local Deno type-checker configured).

---

## File Map

| File | Action | Tasks | Responsibility |
|------|--------|-------|----------------|
| `supabase/functions/_shared/usage-tracker.ts` | Modify | 1 | Add `checkQuotaOrBlock()` export |
| `supabase/functions/donny-chat/index.ts` | Modify | 2 | Add quota enforcement after auth |
| `supabase/functions/donny-orchestrator/index.ts` | Modify | 3, 4 | Add quota enforcement + SSE streaming |
| `src/hooks/useDonny.ts` | Modify | 5 | Replace `supabase.functions.invoke` with streaming fetch, add retry |
| `src/contexts/DonnyProvider.tsx` | Modify | 6 | Pass `streamingContent` and `retry` through context |
| `src/components/donny/DonnyChatView.tsx` | Modify | 6 | Streaming bubble render, error retry button, upgrade CTA |

**Task ordering:** All 6 tasks are sequential. Tasks 1-3 are quota enforcement (each depends on the prior). Tasks 4-6 are streaming (each depends on the prior). Tasks 3 and 4 both modify `donny-orchestrator/index.ts`.

---

### Task 1: Add `checkQuotaOrBlock` to usage-tracker.ts

**Files:**
- Modify: `supabase/functions/_shared/usage-tracker.ts` (currently 117 lines)

**Context:** This file already exports `getUserUsageStage()`, `incrementUsage()`, `getUserSubscriptionTier()`, and has `TIER_BUDGETS` and `getCurrentPeriodStart()` as internal helpers. The new function reuses all of them. It queries the `donny_usage` table (columns: `user_id`, `period_start`, `actions_used`, `actions_budget`, `current_stage`) to check if the user has exceeded their monthly budget.

- [ ] **Step 1: Add the `checkQuotaOrBlock` function**

Add this export at the end of `supabase/functions/_shared/usage-tracker.ts` (after the `getUserSubscriptionTier` function, which ends at line 116):

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

- [ ] **Step 2: Verify the file is syntactically valid**

Open the file and review that:
- `getCurrentPeriodStart` is used (defined at line 19)
- `getUserSubscriptionTier` is used (defined at line 96)
- `TIER_BUDGETS` is used (defined at line 11)
- The return type uses a discriminated union on `allowed`
- `SupabaseClient` type is already imported at line 7

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/usage-tracker.ts
git commit -m "feat: add checkQuotaOrBlock to usage-tracker for monthly quota enforcement"
```

---

### Task 2: Add quota enforcement to donny-chat

**Files:**
- Modify: `supabase/functions/donny-chat/index.ts` (currently ~1752 lines)

**Context:** This is the direct-access Donny chat handler used by external clients (Chrome Extension, OAuth). The service-role client is named `supabaseAdmin` (line 1435). The import from `usage-tracker.ts` is at line 6 and currently imports `getUserUsageStage`, `incrementUsage`, `getUserSubscriptionTier`. The quota check goes after auth resolution (line 1433 where `userId` is set) and after the `supabaseAdmin` client is created (line 1435), but BEFORE the rate limit check (line 1449) and before any Claude API call.

- [ ] **Step 1: Add `checkQuotaOrBlock` to the existing import**

At line 6 of `supabase/functions/donny-chat/index.ts`, change:

```typescript
import { getUserUsageStage, incrementUsage, getUserSubscriptionTier } from "../_shared/usage-tracker.ts";
```

to:

```typescript
import { getUserUsageStage, incrementUsage, getUserSubscriptionTier, checkQuotaOrBlock } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Add quota enforcement after auth, before rate limiting**

After line 1435 (`const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);`) and before line 1437 (`const { conversation_id, message, context: requestContext } = await req.json();`), add:

```typescript
    // Monthly quota enforcement
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

Note: This goes BEFORE `req.json()` so we don't consume the request body before checking quota. The indentation is 4 spaces (matching the surrounding `try` block).

- [ ] **Step 3: Verify placement is correct**

The handler flow should now be:
1. CORS check (line 1403)
2. Auth resolution (lines 1408-1433) → `userId` set
3. `supabaseAdmin` created (line 1435)
4. **NEW: Quota check** → returns 429 if exceeded
5. Parse request body (line 1437)
6. Input length check (line 1439)
7. Sanitize input (line 1446)
8. Rate limit check (line 1449)
9. ... rest of handler

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-chat/index.ts
git commit -m "cost: add monthly quota enforcement to donny-chat"
```

---

### Task 3: Add quota enforcement to donny-orchestrator

**Files:**
- Modify: `supabase/functions/donny-orchestrator/index.ts` (currently 401 lines)

**Context:** This is the main entry point from the frontend. The service-role client is named `supabase` (NOT `supabaseAdmin` — line 225). The import from `usage-tracker.ts` is at line 6 and currently imports `getUserUsageStage`, `incrementUsage`. The quota check goes after auth resolution (line 223 where `userId` is set) and after the `supabase` client is created (line 225), but BEFORE parsing the request body (line 228).

- [ ] **Step 1: Add `checkQuotaOrBlock` to the existing import**

At line 6 of `supabase/functions/donny-orchestrator/index.ts`, change:

```typescript
import { getUserUsageStage, incrementUsage } from "../_shared/usage-tracker.ts";
```

to:

```typescript
import { getUserUsageStage, incrementUsage, checkQuotaOrBlock } from "../_shared/usage-tracker.ts";
```

- [ ] **Step 2: Add quota enforcement after auth, before request parsing**

After line 225 (`const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);`) and before line 228 (`const body = (await req.json()) as OrchestratorInput;`), add:

```typescript
    // Monthly quota enforcement
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

Note: Use `supabase` (not `supabaseAdmin`) — this is the variable name in the orchestrator. Indentation is 4 spaces.

- [ ] **Step 3: Verify placement is correct**

The handler flow should now be:
1. CORS check (line 195)
2. Auth resolution (lines 199-223) → `userId` set
3. `supabase` created (line 225)
4. **NEW: Quota check** → returns 429 if exceeded
5. Parse request body (line 228)
6. ... rest of handler

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-orchestrator/index.ts
git commit -m "cost: add monthly quota enforcement to donny-orchestrator"
```

---

### Task 4: Add SSE response format to donny-orchestrator

**Files:**
- Modify: `supabase/functions/donny-orchestrator/index.ts` (modified in Task 3, now ~415 lines)

**Context:** The orchestrator currently makes synchronous Claude API calls via
`callClaude()` (line 121-148), runs a tool loop (max 3 iterations, line 310),
then returns JSON (line 385). We switch the response format from JSON to SSE
so the frontend can distinguish "tool loop running" from "response arrived"
and render text immediately on arrival.

**Approach — SSE wrapping (not progressive streaming):** The tool loop runs
synchronously via `callClaude()`. When it completes, the final text is already
resolved. We wrap it in SSE events (`text_delta` + `done`) and return as
`text/event-stream`. This avoids a redundant Claude API call — the tool loop's
last `callClaude()` already produced the final answer.

Progressive streaming (where text appears word-by-word) would require making
the final Claude call with `stream: true`. Since we can't predict which call
will be the last one before it happens, and making a redundant streaming call
doubles the token cost, SSE wrapping is the pragmatic choice. The frontend
still gets immediate text display after the tool loop, eliminating the typing
indicator dead zone. Real progressive streaming can be added later by
restructuring the tool loop to detect the final call.

- [ ] **Step 1: Replace the final response section with SSE format**

Find the block that starts at `// --- Extract final answer ---` (around line
361 after Task 3's insertion) and ends at `return new Response(JSON.stringify(output), ...)` (around line 386). Replace this entire section (including the `try/catch` for logging) with:

```typescript
    // --- Extract final answer and return as SSE ---
    const rawText = extractText(claudeResult.content);
    const { answer, suggested_actions } = parseSuggestedActions(rawText);

    // Log to donny_help_logs
    try {
      await supabase.from("donny_help_logs").insert({
        user_id: userId,
        page_path,
        page_context: page_context ?? {},
        query,
        answer,
        suggested_actions,
        agent_used: lastToolUsed,
      });
    } catch (logErr) {
      console.error("[donny-orchestrator] logging failed:", logErr);
    }

    // Return as SSE events for frontend streaming consumption
    const textChunk = JSON.stringify({ text: answer });
    const doneChunk = JSON.stringify({
      suggested_actions,
      agent_used: lastToolUsed,
      answer,
    });
    const sseBody = `event: text_delta\ndata: ${textChunk}\n\nevent: done\ndata: ${doneChunk}\n\n`;

    return new Response(sseBody, {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
    });
```

**What this replaces:** The existing code that builds an `OrchestratorOutput`
object and returns `new Response(JSON.stringify(output), ...)`. The
`parseSuggestedActions()` function is already defined in the file (line 165)
and is reused here. The `try/catch` and `serve()` closing braces remain
unchanged.

- [ ] **Step 2: Verify the complete handler flow**

After modifications, the handler flow should be:
1. CORS → Auth → Quota check (from Task 3) → Parse request → Build context/prompt → Model routing
2. Initial Claude call + tool loop (synchronous `callClaude()`, max 3 iterations)
3. Cost logging + usage increment (existing, unchanged)
4. Extract final text via `extractText()` + `parseSuggestedActions()`
5. Log to `donny_help_logs`
6. Return SSE response (`text/event-stream`) with `text_delta` and `done` events

Error responses (auth, quota, validation) still return `application/json`.
Only the success path returns `text/event-stream`. The frontend (Task 5)
checks Content-Type to decide which parsing path to use.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-orchestrator/index.ts
git commit -m "feat: switch donny-orchestrator response format from JSON to SSE"
```

---

### Task 5: Frontend streaming consumption and quota handling

**Files:**
- Modify: `src/hooks/useDonny.ts` (currently 243 lines)

**Context:** This hook manages Donny chat state. It currently calls `donny-orchestrator` via `supabase.functions.invoke()` (line 144), which returns JSON. We need to:
1. Replace `supabase.functions.invoke()` with raw `fetch()` that handles SSE
2. Parse SSE events to update `streamingContent` progressively
3. Handle 429 quota errors with specific messaging
4. Add `retry` function and `lastUserMessage` ref
5. Handle connection drops gracefully

The hook already has `isStreaming`, `streamingContent`, `isSendingRef`, and `error` state. The `useAuth` hook provides `user` and `profile`.

**Important:** The Supabase session access token is needed for the `Authorization` header. Get it via `supabase.auth.getSession()`.

- [ ] **Step 1: Add `lastUserMessage` ref and `retry` function**

After the existing `isSendingRef` declaration (line 43), add:

```typescript
  const lastUserMessage = useRef<string>("");
```

After the `clearChat` callback (ends around line 224), add:

```typescript
  const retry = useCallback(() => {
    if (lastUserMessage.current && !isSendingRef.current) {
      setError(null);
      sendMessage(lastUserMessage.current);
    }
  }, [sendMessage]);
```

- [ ] **Step 2: Replace the `sendMessageMutation` with streaming fetch**

Replace the entire `sendMessageMutation` (lines 120-204) with a new version that uses `fetch()` and SSE parsing. The key changes:
- Get session token via `supabase.auth.getSession()`
- Use raw `fetch()` to the orchestrator URL
- Check Content-Type to decide between SSE parsing and JSON fallback
- Parse SSE events with proper double-newline splitting
- Update `streamingContent` on `text_delta` events
- Save assistant message on `done` event
- Handle 429 quota errors specifically

```typescript
  const sendMessageMutation = useMutation({
    mutationFn: async (content: string) => {
      if (!conversation || !user) throw new Error('No active conversation');
      if (isSendingRef.current) throw new Error('Message already in flight');

      isSendingRef.current = true;
      lastUserMessage.current = content;

      setIsStreaming(true);
      setAvatarState('thinking');
      setStreamingContent('');
      setError(null);

      // Insert user message locally first
      const { error: insertError } = await supabase
        .from('donny_messages')
        .insert({
          conversation_id: conversation.id,
          role: 'user',
          content,
        });

      if (insertError) throw insertError;

      // Get session for auth header
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('No active session');

      // Call orchestrator with streaming support
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/donny-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            query: content,
            page_path: window.location.pathname,
            page_context: options?.campaignContext || {},
            user_role: profile?.role || 'content_creator',
            org_id: activeOrg?.id,
            conversation_history: messages.slice(-10).map(m => ({
              role: m.role === 'user' ? 'user' as const : 'assistant' as const,
              content: m.content || '',
            })),
          }),
        }
      );

      // Handle non-OK responses (quota exceeded, auth errors, etc.)
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (errorData?.error === 'monthly_quota_exceeded') {
          throw new Error(
            `You've used all ${errorData.budget} Donny actions this month. Upgrade your plan to continue.`
          );
        }
        throw new Error(errorData?.error || errorData?.message || 'Something went wrong');
      }

      const contentType = response.headers.get('Content-Type') || '';

      // SSE streaming response
      if (contentType.includes('text/event-stream')) {
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let accumulatedText = '';
        let suggestedActions: Array<{ label: string; route: string }> = [];

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            const events = buffer.split('\n\n');
            buffer = events.pop() ?? '';

            for (const event of events) {
              const lines = event.split('\n');
              let eventType = '';
              let eventData = '';

              for (const line of lines) {
                if (line.startsWith('event: ')) eventType = line.slice(7);
                else if (line.startsWith('data: ')) eventData = line.slice(6);
              }

              if (eventType === 'text_delta' && eventData) {
                const { text } = JSON.parse(eventData);
                accumulatedText += text;
                setStreamingContent(accumulatedText);
              } else if (eventType === 'done' && eventData) {
                const parsed = JSON.parse(eventData);
                suggestedActions = parsed.suggested_actions ?? [];
                if (parsed.answer) {
                  accumulatedText = parsed.answer;
                }
              }
            }
          }
        } catch (streamErr) {
          // Connection dropped — preserve partial text
          if (accumulatedText) {
            setStreamingContent(accumulatedText);
          }
          throw streamErr;
        }

        // Save assistant message to DB
        if (accumulatedText) {
          const quickActions = suggestedActions.map(
            (a: { label: string; route: string }) => ({
              label: a.label,
              action: 'navigate' as const,
              url: a.route,
            })
          );

          await supabase.from('donny_messages').insert({
            conversation_id: conversation.id,
            role: 'assistant',
            content: accumulatedText,
            quick_actions: quickActions.length > 0 ? quickActions : null,
          });
        } else {
          throw new Error('Donny could not generate a response');
        }

        return { answer: accumulatedText, suggested_actions: suggestedActions };
      }

      // JSON fallback (non-streaming response)
      const data = await response.json();

      if (data?.answer) {
        const quickActions = (data.suggested_actions ?? []).map(
          (a: { label: string; route: string }) => ({
            label: a.label,
            action: 'navigate' as const,
            url: a.route,
          })
        );

        await supabase.from('donny_messages').insert({
          conversation_id: conversation.id,
          role: 'assistant',
          content: data.answer,
          quick_actions: quickActions.length > 0 ? quickActions : null,
        });
      } else {
        throw new Error(data?.error || 'Donny could not generate a response');
      }

      return data;
    },
    onSuccess: () => {
      isSendingRef.current = false;
      setAvatarState('celebrating');
      setTimeout(() => setAvatarState('idle'), 2000);
      setIsStreaming(false);
      setStreamingContent('');
      queryClient.invalidateQueries({ queryKey: ['donny-messages', conversation?.id] });
      queryClient.invalidateQueries({ queryKey: ['donny-dashboard', user?.id] });
    },
    onError: (err) => {
      isSendingRef.current = false;
      setAvatarState('error');
      setTimeout(() => setAvatarState('idle'), 3000);
      setIsStreaming(false);
      // Don't clear streamingContent on error — preserve partial text
      setError(err instanceof Error ? err.message : 'Something went wrong');
    },
  });
```

- [ ] **Step 3: Update the return object to include `retry`**

Change the return object (around line 237) to include `retry`:

```typescript
  return {
    ...state,
    sendMessage,
    clearChat,
    quickChips,
    retry,
  };
```

- [ ] **Step 4: Run build to verify**

```bash
npm run build
```

Expected: Build succeeds. If there are TypeScript errors about the return type not matching expectations, check that `retry` is a `() => void` function.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useDonny.ts
git commit -m "feat: add streaming fetch and quota error handling to useDonny"
```

---

### Task 6: DonnyProvider context + DonnyChatView streaming UI

**Files:**
- Modify: `src/contexts/DonnyProvider.tsx` (currently 189 lines)
- Modify: `src/components/donny/DonnyChatView.tsx` (currently 83 lines)

**Context:** `DonnyChatView` gets state from `useDonnyContext()` which reads from `DonnyProvider`. The provider wraps `useDonny()` but currently doesn't pass through `streamingContent` or `retry`. We need to add those to the context interface and value. Then update `DonnyChatView` to render streaming text and error retry/upgrade buttons.

- [ ] **Step 1: Add `streamingContent` and `retry` to DonnyProvider**

In `src/contexts/DonnyProvider.tsx`:

**1a.** Add to the `DonnyContextValue` interface (after `error: string | null;` at line 30):

```typescript
  streamingContent: string;
  retry: () => void;
```

**1b.** Add to the `value` memo object (after `error: donny.error,` at line 169):

```typescript
      streamingContent: donny.streamingContent,
      retry: donny.retry,
```

**1c.** Add to the `value` memo dependency array (after `donny.error,` in the deps array at line 181):

```typescript
      donny.streamingContent, donny.retry,
```

- [ ] **Step 2: Update DonnyChatView to render streaming text**

In `src/components/donny/DonnyChatView.tsx`:

**2a.** Add imports at the top. Add `Link` from react-router-dom and `DonnyAvatar`:

```typescript
import { Link } from 'react-router-dom';
import { DonnyAvatar } from './DonnyAvatar';
```

**2b.** Update the destructured context (line 10-18) to include `streamingContent` and `retry`:

```typescript
  const {
    messages,
    avatarState,
    isStreaming,
    streamingContent,
    error,
    sendMessage,
    quickChips,
    collapse,
    close,
    retry,
  } = useDonnyContext();
```

**2c.** Replace the typing indicator line (line 62):

```tsx
        {isStreaming && <DonnyTypingIndicator />}
```

with:

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

**2d.** Replace the error block (lines 63-67):

```tsx
        {error && !isStreaming && (
          <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">Something went wrong. Please try again.</p>
          </div>
        )}
```

with:

```tsx
        {error && !isStreaming && (
          <div className="mx-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-600">{error}</p>
            <div className="flex gap-2 mt-1.5">
              {error.includes('Upgrade') && (
                <Link to="/settings/billing"
                  className="text-xs text-dc-teal font-semibold">
                  Upgrade Plan
                </Link>
              )}
              {!error.includes('Upgrade') && (
                <button type="button" onClick={retry}
                  className="text-xs text-dc-teal font-semibold">
                  Try Again
                </button>
              )}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Run build to verify**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors. Key things that could fail:
- `donny.streamingContent` or `donny.retry` not found on the `useDonny` return type — means Task 5 wasn't applied correctly
- `Link` not imported — means step 2a was missed
- `DonnyAvatar` not imported — means step 2a was missed
- `retry` not in `DonnyContextValue` — means step 1a was missed

- [ ] **Step 4: Commit**

```bash
git add src/contexts/DonnyProvider.tsx src/components/donny/DonnyChatView.tsx
git commit -m "feat: add streaming render, retry button, and upgrade CTA to Donny chat UI"
```

---

## Post-Implementation Verification

After all 6 tasks are complete:

1. Run `npm run build` — must succeed with no errors
2. Verify the complete flow:
   - Quota check happens before any Claude call in both edge functions
   - 429 response includes `monthly_quota_exceeded` error code
   - Frontend detects 429 and shows upgrade CTA (not generic error)
   - Orchestrator returns `text/event-stream` Content-Type with SSE events
   - Frontend parses SSE and updates `streamingContent` progressively
   - Streaming bubble appears with blinking cursor
   - Typing indicator shows when `streamingContent` is empty
   - Error block shows retry button or upgrade link
   - `DonnyChatInput` send button is disabled during streaming (already implemented)
3. No regressions to Phase 1 fixes (role filtering, injection defense, token clamping, per-tool auth, a11y, logout cleanup)
