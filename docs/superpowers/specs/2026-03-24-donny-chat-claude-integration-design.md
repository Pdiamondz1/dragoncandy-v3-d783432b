# Donny Chat — Claude API Integration

**Date:** 2026-03-24
**Status:** Draft
**Scope:** `supabase/functions/donny-chat/index.ts` only

## Summary

Migrate donny-chat from OpenAI GPT-4o to Anthropic Claude (`claude-sonnet-4-20250514`). Keep 17 existing tools (replacing `search_creators` with the improved `match_creators`), add 3 net-new tools, drop context summarization in favor of a wider history window, and add `donny_actions` logging.

## Goals

- Switch the LLM provider from OpenAI to Anthropic Claude
- Preserve existing tool capabilities — keep 17 of 18 tools, replacing `search_creators` with the improved `match_creators` (superset: adds location + min_rating filters)
- Add 3 net-new tools: `generate_campaign`, `get_analytics`, `send_message`
- Remove the GPT-4o-mini context summarization dependency
- Add action logging to the `donny_actions` table (from the super-agent migration)
- Support `context.page_url` in the request body for page-aware responses

## Non-goals

- Migrating other Edge Functions (`chat-assistant`, `match-creators`, `generate-campaign-analysis`, `donny-campaign-generate`) — these stay on OpenAI
- Changing the frontend (`useDonny.ts`, `donny.ts` types) — the response contract stays the same. The `context` field is added to the Edge Function request but will only be populated by future callers (Chrome Extension, SDK). `useDonny.ts` is unchanged this iteration.
- Changing the database schema — we use existing tables only
- Streaming responses — the current architecture is request/response; streaming is a future enhancement

## Architecture

### API Layer Change

| Aspect | Before (OpenAI) | After (Anthropic) |
|---|---|---|
| Endpoint | `https://api.openai.com/v1/chat/completions` | `https://api.anthropic.com/v1/messages` |
| Model | `gpt-4o` | `claude-sonnet-4-20250514` |
| Auth header | `Authorization: Bearer $KEY` | `x-api-key: $KEY` |
| Env var | `OPENAI_API_KEY` | `ANTHROPIC_API_KEY` |
| API version header | None | `anthropic-version: 2023-06-01` |

### Tool Definition Format Change

OpenAI format:
```json
{
  "type": "function",
  "function": {
    "name": "tool_name",
    "description": "...",
    "parameters": { "type": "object", "properties": { ... } }
  }
}
```

Anthropic format:
```json
{
  "name": "tool_name",
  "description": "...",
  "input_schema": { "type": "object", "properties": { ... } }
}
```

### Message Format Change

OpenAI uses `role: "system"` messages inline. Anthropic uses a top-level `system` parameter.

OpenAI tool calls are a `tool_calls` array on the assistant message. Anthropic tool calls are `content` blocks with `type: "tool_use"`.

OpenAI tool results are `role: "tool"` messages with `tool_call_id`. Anthropic tool results are `role: "user"` messages with `content` blocks of `type: "tool_result"` and `tool_use_id`.

**Request shape (Anthropic):**
```json
{
  "model": "claude-sonnet-4-20250514",
  "max_tokens": 8192,
  "system": "system prompt here",
  "messages": [...],
  "tools": [...]
}
```

**Assistant message with tool use (Anthropic):**
```json
{
  "role": "assistant",
  "content": [
    { "type": "text", "text": "Let me look that up..." },
    { "type": "tool_use", "id": "toolu_xxx", "name": "get_campaigns", "input": {} }
  ]
}
```

**Tool result (Anthropic):**
```json
{
  "role": "user",
  "content": [
    { "type": "tool_result", "tool_use_id": "toolu_xxx", "content": "{...}" }
  ]
}
```

### History Reconstruction

Messages stored in `donny_messages` must be reconstructed into Anthropic's format when loading history. The key differences:

- `role: "assistant"` messages with `tool_calls` → assistant message with `content` blocks containing `type: "tool_use"`
- `role: "tool"` messages → `role: "user"` message with `type: "tool_result"` content block
- Multiple consecutive tool results for the same assistant turn are grouped into a single `role: "user"` message

**Backwards compatibility:** Old conversations started on GPT-4o stored tool calls in OpenAI format (`tool_calls` array with `function.name`, `function.arguments`). The history reconstruction must detect the format and convert appropriately. Detection: if `tool_calls` is null, undefined, or not an array, skip it and treat the message as plain text. If it's an array of objects with a `function` key, it's OpenAI format — convert each entry to a `tool_use` content block. If `content` is an array with `type: "tool_use"` blocks, it's already Anthropic format.

### Storage Format Change

Going forward, new messages are stored in Anthropic's native format:

- `donny_messages.tool_calls` → stores the full `content` array from the assistant response (which includes both text and tool_use blocks)
- `donny_messages.tool_result` → stores the tool result object (unchanged)
- `donny_messages.content` → stores extracted text content from the assistant response
- `donny_messages.model` → `"claude-sonnet-4-20250514"` (new column from migration)
- `donny_messages.tokens_used` → extracted from `response.usage.input_tokens + response.usage.output_tokens` after each Anthropic API call

## System Prompt

```
You are Donny, DragonCandy's AI assistant specializing in digital content, marketing, and creator-brand connections.

## Personality
- Energetic, knowledgeable, and action-oriented — you don't just advise, you DO things
- Friendly and casual, like texting a helpful friend who happens to be a marketing expert
- Use emojis naturally but not excessively (1-2 per message)
- Keep responses concise — this is a mobile chat, not an essay
- Always suggest a next step or action
- Never fabricate data — if you don't know, say so

## Capabilities
- Generate campaigns with optimized briefs and targeting
- Match creators to brands based on niche, platform, audience, and budget fit
- Analyze content performance and campaign metrics
- Suggest marketing strategies and content ideas
- Manage applications, collaborations, and payments
- Guide new users through onboarding

## User Context
- Name: {profile.full_name}
- Role: {profile.role}
- {role-specific context: business name or creator info}
- Active campaigns: {count}
- Pending applications: {count}
{if context.page_url: "- Currently viewing: {page_url}"}

## Rules
- For payments: ALWAYS use prepare_payment and tell the user to confirm on the payment screen. NEVER claim a payment was processed directly.
- When showing creators: include name, platform, niche, rating, and project count.
- When showing campaigns: include title, platform, budget, and application count.
- If a tool fails: explain the error conversationally and suggest how to fix it.
- Use tools proactively — if the user asks about campaigns, call get_campaigns. Don't just describe what you could do.
- When you call a tool that returns data, present it conversationally.

## Rich Cards
When presenting creators or campaigns from tool results, add a JSON object in your response metadata. Format:
- Creator: { "type": "creator_profile", "data": { ... } }
- Campaign: { "type": "campaign_summary", "data": { ... } }
- Payment: { "type": "payment_confirmation", "data": { ... } }
```

## New Tools (4)

### `generate_campaign`

Generates a campaign brief using AI. Delegates to the existing `donny-campaign-generate` Edge Function via an internal fetch call.

```
name: generate_campaign
description: Generate an AI-optimized campaign brief based on the user's goals and target audience.
input_schema:
  type: object
  properties:
    brief: { type: string, description: "What the campaign is about" }
    target_audience: { type: string, description: "Target demographic or audience" }
    budget_range: { type: string, description: "Budget range (e.g. '$500-$1000')" }
  required: [brief]
```

**Implementation:** Calls `donny-campaign-generate` Edge Function internally via `fetch(SUPABASE_URL + '/functions/v1/donny-campaign-generate', ...)` with the service role key. Returns the generated campaign data.

**Note:** `donny-campaign-generate` remains on OpenAI. A single Donny chat turn using this tool will hit both Anthropic (orchestration) and OpenAI (campaign generation). Both `ANTHROPIC_API_KEY` and `OPENAI_API_KEY` must be configured.

### `match_creators` (replaces `search_creators`)

Replaces the existing `search_creators` tool with a superset that adds location and min_rating filters. This avoids LLM confusion from two overlapping search tools.

```
name: match_creators
description: Find content creators matching specific criteria like niche, location, and minimum rating.
input_schema:
  type: object
  properties:
    campaign_id: { type: string, description: "Optional campaign UUID to match against" }
    niche: { type: string, description: "Content niche (food, fashion, tech, fitness, lifestyle)" }
    location: { type: string, description: "Geographic location filter" }
    min_rating: { type: number, description: "Minimum creator rating (0-5)" }
  required: [niche]
```

**Implementation:** Queries `creator_profiles` joined with `profiles`, applying filters for niche (ilike on `specialty`), location (ilike on `profiles.location`), and min_rating (gte on `rating`). Returns top 10 results sorted by rating descending.

### `get_analytics`

Retrieves campaign analytics data.

```
name: get_analytics
description: Get analytics and performance data for campaigns.
input_schema:
  type: object
  properties:
    campaign_id: { type: string, description: "Specific campaign UUID (omit for overall stats)" }
    time_range: { type: string, description: "Time range: '7d', '30d', '90d' (default '30d')" }
```

**Implementation:** Queries `analytics_events` filtered by user_id and optional campaign_id. Aggregates event counts by type within the time range. Also pulls campaign application counts and collaboration status for a summary view.

### `send_message`

Sends a message to another user via the platform's messaging system.

```
name: send_message
description: Send a message to another user on the platform.
input_schema:
  type: object
  properties:
    recipient_id: { type: string, description: "Recipient's user UUID" }
    message: { type: string, description: "Message content to send" }
  required: [recipient_id, message]
```

**Implementation:** Validates that `recipient_id` exists in `profiles` (reject if not found). Finds or creates a conversation between the current user and recipient (checks `conversation_participants` for an existing shared conversation). Inserts the message into `messages` table. Returns the message ID and conversation ID.

**Authorization:** Only allows messaging users who share a campaign context (both are participants in the same campaign via applications, collaborations, or invitations). Rejects messages to arbitrary users with no shared context.

## Context Window Changes

**Before:**
- Load last 20 messages
- After 25 messages, fire GPT-4o-mini to summarize older messages
- Store summary in `donny_conversations.context_snapshot`

**After:**
- Load last 50 messages
- No summarization — Claude's 200K context window handles the history
- Continue reading `context_snapshot` if it exists (backwards compat for old conversations)
- Stop writing new summaries
- Delete `maybeUpdateContextSummary` function definition AND its call site at the end of the request handler (line 985)
- Note: 50 messages includes tool messages (assistant tool_use + user tool_result). A heavy tool-use conversation may cover ~12-15 user turns. This is an acceptable trade-off for simplicity.

## Action Logging

After each tool execution, insert into `donny_actions`:

```sql
INSERT INTO donny_actions (conversation_id, user_id, action_type, action_payload, status)
VALUES ($1, $2, $3, $4, $5);
```

- `action_type` = tool name (e.g., `"create_campaign"`, `"search_creators"`)
- `action_payload` = `{ input: args, output: result }`
- `status` = `"completed"` or `"failed"`

This is in addition to the existing `donny_tool_executions` logging (belt and suspenders).

**Important:** All `donny_actions` inserts use the service-role client (bypasses RLS). The RLS INSERT policy uses `auth.uid() = user_id` which would fail from the Edge Function context.

## Request Body Change

The Edge Function request body gains an optional `context` field:

```ts
interface DonnyChatRequest {
  conversation_id: string;
  message: string;
  context?: {
    page_url?: string;
    surface?: string;  // 'web' | 'chrome_extension' | 'sdk'
  };
}
```

When `context.page_url` is provided, it's appended to the system prompt so Donny knows what the user is looking at. The `surface` field is saved to `donny_conversations.surface` (from the super-agent migration).

## Response Shape (unchanged)

```ts
interface DonnyChatResponse {
  success: boolean;
  content: string;
  rich_card: DonnyRichCard | null;
}
```

No frontend changes required.

## Environment Variables

**Add to Supabase dashboard:**
- `ANTHROPIC_API_KEY` — Anthropic API key

**Keep (used by other functions):**
- `OPENAI_API_KEY` — still needed by `chat-assistant`, `match-creators`, `generate-campaign-analysis`, `donny-campaign-generate`
- `SUPABASE_URL` — already set
- `SUPABASE_SERVICE_ROLE_KEY` — already set

## Error Handling

- If the Anthropic API returns an error, return a 500 with a user-friendly message
- If a tool execution fails, catch the error, log it to `donny_tool_executions` and `donny_actions` with status `"failed"`, and pass the error back to Claude so it can explain conversationally
- Rate limiting (30 messages/hour) remains unchanged
- Auth validation remains unchanged

## Testing Scenarios

1. **Normal chat** — User sends "Hi, what can you do?" → Claude responds conversationally with no tool calls
2. **Tool call** — User sends "Show me my campaigns" → Claude calls `get_campaigns`, receives data, responds with campaign summaries
3. **Multi-tool call** — User sends "Create a campaign for a food festival and find me food creators" → Claude calls `generate_campaign` then `match_creators`, presents both results
4. **Context-aware** — Request includes `context.page_url: "/dashboard/campaigns/abc-123"` → System prompt includes the page URL, Claude can reference what the user is looking at
5. **Old conversation history** — A conversation that started on GPT-4o has OpenAI-format tool calls in history → History reconstruction detects the format and converts correctly
6. **Tool failure** — A tool throws an error → Error is logged, passed to Claude, Claude explains the issue conversationally
7. **Rate limiting** — User exceeds 30 messages/hour → Returns 429 with friendly message (unchanged)

## Files Modified

| File | Change |
|---|---|
| `supabase/functions/donny-chat/index.ts` | Full rewrite of API layer, tool definitions, message format, history reconstruction |

No other files are modified.

## Rollback Strategy

Git revert of the commit. The OpenAI implementation is fully replaced, so reverting restores it. `OPENAI_API_KEY` must remain in the Supabase dashboard (it's still used by other functions) so the reverted code will work immediately.
