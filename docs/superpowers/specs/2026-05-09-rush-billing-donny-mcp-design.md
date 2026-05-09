# DragonDash Rush Billing + Donny AI MCP Activation — Design Spec

**Date:** 2026-05-09
**Status:** Approved Design
**Scope:** Two workstreams shipping sequentially — Rush surcharge billing (Stripe invoice batching), then Donny AI activation via Outstand MCP server integration.

---

## Context

Phase 4 (Cross-Role & Advanced) of the Outstand.so social media integration is complete. Phase 3 (Brand) was verified as fully wired (5/6 deliverables functional, 6th awaiting analytics data). Two gaps remain before launch:

1. **Rush surcharges are logged but not charged.** The `rush_surcharge_log` table records every $25–50 premium post with `status: 'pending'`, but no Stripe integration turns those into payments.
2. **Donny's social features are stubbed.** Three Phase 4 components (Auto-Pilot, Weekly Planner, Performance Recommendations) plus the Phase 2 caption rewriter are disabled placeholders awaiting AI activation.

This spec closes both gaps.

---

## Workstream 1: DragonDash Rush Surcharge Billing

### What Exists

| Layer | Component | Status |
|-------|-----------|--------|
| Database | `rush_surcharge_log` (user_id, campaign_id, platform_count, surcharge_cents, status) | Built |
| Frontend | `DragonDashRushButton`, `RushConfirmDialog` | Built |
| Hook | `useRushSurchargeLog` (logRush, calculateSurcharge) | Built |
| Stripe | No integration | Missing |

### Billing Model: Invoice Item Batching

Rush surcharges are added as line items to the user's next Stripe subscription invoice. No separate checkout flow, no payment modal. Content posts immediately; the charge appears on the next bill.

This matches the existing UI copy in `RushConfirmDialog` ("will be added to your next invoice") and the fact that Rush is gated to Starter+ tiers — every Rush user already has a `stripe_customer_id` and payment method from their subscription.

### Flow

```
User confirms Rush → logRush() inserts pending row → content posts via outstand-proxy
                                    ↓
                    invoice-rush-surcharges Edge Function
                    (triggered after each rush OR on schedule)
                                    ↓
                    Queries rush_surcharge_log WHERE status = 'pending'
                    Looks up org stripe_customer_id
                    stripe.invoiceItems.create() per surcharge
                    Updates rows to status = 'invoiced'
                    Writes rush_surcharge_invoiced to payment_events
                                    ↓
                    Stripe collects on next subscription invoice
                                    ↓
                    stripe-webhook: invoice.payment_succeeded
                    Updates rows to status = 'paid'
                    Writes rush_surcharge_paid to payment_events
```

### Surcharge Pricing

| Platform Count | Surcharge | Notes |
|---------------|-----------|-------|
| 3 platforms | $25.00 | Minimum for Rush eligibility |
| 4 platforms | $30.00 | |
| 5+ platforms | $50.00 | Maximum |
| Pro tier discount | 20% off | Pro subscribers get reduced rate |

Base surcharge logic exists in `useRushSurchargeLog.calculateSurcharge()` but **does not yet include Pro discount**. The Pro 20% discount must be implemented: pass the org's `subscription_tier` into `calculateSurcharge()` and apply `Math.round(surcharge * 0.8)` for Pro-tier orgs. The edge function must also apply the discount before calling `stripe.invoiceItems.create()`.

### New Files

#### `supabase/functions/invoice-rush-surcharges/index.ts`

Edge function that batches pending surcharges to Stripe:

- **Auth:** Requires authenticated user (same pattern as `create-sponsorship-checkout`)
- **Input:** `{ userId: string }` (from the client after logRush, or from a scheduled cron)
- **Logic:**
  1. Query `rush_surcharge_log WHERE user_id = $1 AND status = 'pending'`
  2. If no pending rows, return early
  3. Look up org via `profiles.org_id` → `organizations.stripe_customer_id`
  4. Guard: if no `stripe_customer_id`, return error (should never happen for Starter+)
  5. For each pending row:
     - `stripe.invoiceItems.create({ customer, amount: surcharge_cents, currency: 'usd', description })` with description: `"DragonDash Rush — {platform_count} platforms{campaign_title ? ' — ' + campaign_title : ''}"`
     - Store `stripe_invoice_item_id` (new nullable column on rush_surcharge_log)
  6. Batch update rows to `status: 'invoiced'`
  7. Write `rush_surcharge_invoiced` event to `payment_events` for each row (entity_type: 'rush', actor_role: 'system')
  8. Return `{ invoiced: count, total_cents: sum }`

- **Error handling:** If Stripe call fails, rows stay `pending` for retry. Log error to `payment_events` with event_type `rush_surcharge_invoice_failed`.
- **Rate limiting:** Guard against repeated calls by checking `rush_surcharge_log` for any row with `status = 'invoiced'` and `invoiced_at > now() - interval '1 minute'` for the same user. If found, return early — the previous call already handled it. The function also validates the user has an active subscription before creating invoice items.

#### Migration: `20260510000001_rush_invoice_tracking.sql`

```sql
-- Add invoice tracking columns
ALTER TABLE rush_surcharge_log
  ADD COLUMN stripe_invoice_item_id TEXT,
  ADD COLUMN invoiced_at TIMESTAMPTZ,
  ADD COLUMN paid_at TIMESTAMPTZ;

-- Extend payment_events CHECK constraint to accept 'rush' entity type
ALTER TABLE payment_events DROP CONSTRAINT payment_events_entity_type_check;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_entity_type_check
  CHECK (entity_type IN ('collaboration', 'sponsorship', 'rush'));
```

The `PaymentEvent` TypeScript interface in `_shared/payment-events.ts` must also be updated to include `'rush'` in the `entity_type` union type.

**RLS note:** `rush_surcharge_log` intentionally has no UPDATE policy. Status transitions (pending → invoiced → paid) are performed by the edge function and webhook handler using the service role key, consistent with the append-only ledger pattern. This prevents users from tampering with billing status.

#### Modification: `supabase/functions/stripe-webhook/index.ts`

Add handling for rush surcharge reconciliation in the `invoice.payment_succeeded` handler:

1. When an invoice is paid, check if any of its line items match rush surcharge invoice item IDs
2. Query `rush_surcharge_log WHERE stripe_invoice_item_id IN (line_item_ids) AND status = 'invoiced'`
3. Update matching rows to `status: 'paid'`, set `paid_at = now()`
4. Write `rush_surcharge_paid` event to `payment_events`

When creating invoice items, attach `metadata: { rush_surcharge_log_id: row.id }` so the webhook can match directly without expanding invoice line items.

#### Modification: `src/hooks/outstand/useRushSurchargeLog.ts`

After `logRush()` inserts the pending row:

1. Call `supabase.functions.invoke('invoice-rush-surcharges', { body: { userId } })`
2. Fire-and-forget — don't block the UI on invoice creation
3. If the call fails, the row stays `pending` and gets picked up on next attempt

### Ledger Integration

All state transitions write to `payment_events` (append-only ledger):

| Event Type | Trigger | Data |
|-----------|---------|------|
| `rush_surcharge_logged` | Edge function picks up pending row | amount_cents, platform_count, campaign_id |
| `rush_surcharge_invoiced` | Edge function batches to Stripe | stripe_invoice_item_id |
| `rush_surcharge_paid` | Webhook confirms payment | stripe_invoice_id |
| `rush_surcharge_invoice_failed` | Stripe API error | error message |

Entity type: `'rush'`. Actor role: `'system'` for all events (all ledger writes happen server-side in the edge function or webhook handler, never from the frontend).

### Testing Plan

- Stripe test mode: Create a test subscription, trigger rush, verify invoice item appears on next invoice
- Verify surcharge calculation: 3 platforms = $25, 4 = $30, 5+ = $50
- Verify Pro discount: 20% reduction applied
- Verify idempotency: Same pending row doesn't get invoiced twice
- Verify webhook: invoice.payment_succeeded updates rows to paid
- Verify error: Stripe API failure leaves rows in pending state for retry

---

## Workstream 2: Donny AI — MCP Server Integration

### What Exists

| Layer | Component | Status |
|-------|-----------|--------|
| Donny Chat | DonnyChatView, useDonny, donny-orchestrator | Working |
| Sub-Agents | 5 local agents (campaign, dragonshare, billing, guidance, general) | Working |
| Outstand Proxy | outstand-proxy edge function (REST API relay) | Working |
| MCP Client | None | Missing |
| Auto-Pilot | DonnyAutoPilotStub (disabled toggle) | Stub |
| Weekly Planner | DonnyWeeklyPlannerStub (disabled card) | Stub |
| Performance | DonnyPerformanceStub (disabled card) | Stub |
| Caption Rewriter | No component | Missing |

### Architecture

Donny's orchestrator gains a second tool source: Outstand's MCP server for social actions. The MCP client lives in the edge function, bridging Claude's `tool_use` with Outstand's 25 social tools.

```
User → DonnyChatView → donny-orchestrator (Edge Function)
                              ↓
                         Claude API
                         (tool_use)
                              ↓
                    ┌─────────┴──────────┐
              Local Sub-Agents       MCP Client (NEW)
              (existing 5)
                    ↓                    ↓
               Supabase          Outstand MCP Server
               queries           (25 social tools)
                                       ↓
                                 10 Social Platforms
```

### MCP Client Infrastructure

#### `supabase/functions/_shared/mcp-client.ts`

Reusable MCP client module for Deno edge functions:

- **Transport:** HTTP/SSE (Streamable HTTP transport per MCP spec — stdio not available in serverless)
- **Connection:** Lazy-initialized per request, no persistent connections
- **Tool discovery:** `listTools()` fetches available tools from MCP server, returns array of tool definitions
- **Tool execution:** `callTool(name, args)` sends tool call to MCP server, returns result
- **Error handling:** Timeouts (10s per tool call), connection failures return structured error objects
- **Auth:** Bearer token via `OUTSTAND_API_KEY` Supabase secret

Interface:

```typescript
interface McpClient {
  connect(serverUrl: string, authToken: string): Promise<void>;
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  disconnect(): void;
}

interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}
```

#### `supabase/functions/_shared/outstand-mcp.ts`

Outstand-specific MCP configuration:

- **Server URL:** Stored as `OUTSTAND_MCP_URL` Supabase secret
- **Tool filtering:** Not all 25 tools are exposed to every user. Filter by:
  - User's subscription tier (Free users get read-only analytics tools only)
  - User's connected platforms (don't expose Instagram tools if no IG connected)
  - User's role (restaurants don't get creator-specific tools)
- **Tool namespacing:** MCP tools are prefixed with `social_` to distinguish from local sub-agents (e.g., Outstand's `create_post` becomes `social_create_post` in Claude's tool list)
- **User context injection:** Every MCP tool call includes the user's `outstand_social_account_id` from `business_outstand_accounts` so Outstand routes to the correct social accounts. The lookup pattern already exists in `outstand-proxy/index.ts` via `listOwnedAccountIds()` — the MCP client reuses that function.

Tool categories from Outstand's 25-tool MCP server (expected):

| Category | Tools | Used By |
|----------|-------|---------|
| Posting | create_post, schedule_post, delete_post, get_post | Auto-Pilot, Weekly Planner, Caption Rewriter |
| Analytics | get_post_analytics, get_account_metrics, get_audience_insights | Performance, Weekly Planner |
| Engagement | get_comments, reply_to_comment, get_mentions | Engagement Hub |
| Media | upload_media, confirm_media | Auto-Pilot |
| Accounts | list_accounts, get_account, connect_account, disconnect_account | Account management |
| Scheduling | get_optimal_times, list_scheduled, update_scheduled | Weekly Planner, Auto-Pilot |

#### Modification: `supabase/functions/donny-orchestrator/tools.ts`

Merge MCP tools into Claude's tool list:

1. Import `outstand-mcp` module
2. Before calling Claude, fetch MCP tools via `listTools()`
3. Convert MCP tool schemas to Claude `tool_use` format:
   ```typescript
   mcpTools.map(tool => ({
     name: `social_${tool.name}`,
     description: tool.description,
     input_schema: tool.inputSchema
   }))
   ```
4. Concatenate with existing `SUB_AGENT_TOOLS` array
5. In the tool execution loop, route `social_*` tool calls to `mcpClient.callTool()` instead of local agent functions
6. Return MCP result to Claude as tool_result

#### Modification: `supabase/functions/donny-orchestrator/index.ts`

- Initialize MCP client at request start (after auth)
- Pass MCP client to tool execution handler
- Add `social_agent` to the system prompt so Claude knows about social capabilities
- Disconnect MCP client in finally block

### Cost Routing

Per the Donny AI Cost Architecture (strategy doc Section 8), social features route to different model tiers:

| Feature | Tier | Model | Rationale |
|---------|------|-------|-----------|
| Caption & hashtag generation | T1 | Haiku | Pattern matching, high volume |
| Caption rewriting (cross-post) | T1 | Haiku | Voice/tone adaptation |
| Content calendar slot suggestions | T1 | Haiku | Time-slot optimization |
| Growth insights & recommendations | T2 | Sonnet | Multi-signal analysis |
| Auto-Pilot weekly planner | T2 | Sonnet | Multi-day strategy generation |
| Performance recommendations | T2 | Sonnet | Cross-platform pattern analysis |
| Multi-platform simultaneous posting | T2 | Sonnet | Complex orchestration |

The `donny-orchestrator` currently calls `getModelConfig("donny-orchestrator", usageStage)` which returns a single model for the entire request. Social features require per-intent routing to different tiers.

**Integration with existing `getModelConfig()`:**

1. Before the Claude call, run intent detection on the user's message using regex patterns
2. If a social intent is detected, override the function name passed to `getModelConfig()`:
   - T1 intents → `getModelConfig("social-caption", usageStage)` → routes to Haiku
   - T2 intents → `getModelConfig("social-analysis", usageStage)` → routes to Sonnet
   - No social intent → existing `getModelConfig("donny-orchestrator", usageStage)` unchanged
3. Add `"social-caption"` and `"social-analysis"` entries to the model routing config

**Interaction with usage stage degradation:** If the user is in "conservation" stage (approaching quota), the `usageStage` parameter already forces cheaper models. Social T1 features stay on Haiku regardless of stage (Haiku is already the cheapest). Social T2 features degrade from Sonnet to Haiku during conservation, matching the existing behavior for other T2 features.

Intent detection patterns:

```typescript
const SOCIAL_T1_PATTERNS = [
  /caption|hashtag|rewrite|schedule.*post|post.*to/i,
  /reply.*comment|respond.*review/i,
];

const SOCIAL_T2_PATTERNS = [
  /weekly.*plan|content.*plan|auto.*pilot/i,
  /performance|insights|recommend|analyze.*social/i,
  /amplify.*all|rush.*post|multi.*platform/i,
];
```

### Stub Activations

#### Auto-Pilot: `DonnyAutoPilotStub.tsx` → `DonnyAutoPilot.tsx`

**Current:** Disabled toggle with "Coming post-launch" tooltip in OutstandManager header.

**Activated:**
- Toggle enables/disables Auto-Pilot for the user's account
- When enabled, a scheduled edge function (`donny-auto-pilot`) runs daily:
  1. Connects to MCP, calls `social_get_account_metrics` and `social_get_post_analytics` for recent performance
  2. Calls Claude (T2/Sonnet) with performance data + user's content library + calendar
  3. Claude generates 1-3 posts for the day using MCP `social_create_post` and `social_schedule_post`
  4. Inserts a summary message into user's `donny_messages` as a daily digest (see System Message Routing below)
- User sees digest in Donny chat: "I scheduled 2 posts for today — a lunch special at 11:30am and a behind-the-scenes at 6pm. [View Calendar]"
- User can override from content calendar (drag, edit, delete)
- Toggle writes to `profiles.auto_pilot_enabled` (new boolean column, default false)

**Tier gating:** Growth+ ($499/mo). Toggle shows locked state with upgrade prompt for lower tiers.

**New files:**
- `supabase/functions/donny-auto-pilot/index.ts` — scheduled daily agent
- Migration: add `auto_pilot_enabled` boolean to profiles

#### Weekly Planner: `DonnyWeeklyPlannerStub.tsx` → `DonnyWeeklyPlanner.tsx`

**Current:** Empty card with "Donny AI will generate your weekly posting schedule based on performance data."

**Activated:**
- "Generate Weekly Plan" button on Calendar tab
- On click:
  1. Sends message to Donny: "Generate a weekly content plan for my social accounts"
  2. Donny orchestrator calls MCP `social_get_account_metrics`, `social_get_optimal_times`, `social_get_post_analytics` (last 30 days)
  3. Claude (T2/Sonnet) generates 7-day plan with post suggestions, optimal times, platform targets
  4. Returns as rich card in Donny chat with day-by-day breakdown
- Each day shows: suggested content type, caption draft, recommended time, target platforms
- "Approve All" button → batch schedules via MCP `social_schedule_post`
- Individual approve/edit/skip per day
- Available to Starter+ tiers

**No new edge function needed** — uses existing donny-orchestrator with MCP tools.

#### Performance Recommendations: `DonnyPerformanceStub.tsx` → `DonnyPerformanceInsights.tsx`

**Current:** Empty card with "Donny AI recommendations coming soon."

**Activated:**
- Card on Analytics tab shows Donny-generated narrative insights
- Generated weekly (or on-demand via "Refresh Insights" button):
  1. Calls MCP `social_get_account_metrics` and `social_get_post_analytics`
  2. Claude (T2/Sonnet) analyzes: best performing content types, optimal posting times, audience growth trends, engagement patterns
  3. Returns 3-5 actionable recommendations as structured data
- Each recommendation: title, insight text, suggested action chip
- Cached in `donny_messages` as system-generated content (avoid re-calling AI on every tab switch)
- Available to Starter+ tiers

**No new edge function needed** — uses donny-orchestrator with MCP tools.

#### Caption Rewriter: New `DonnyCaptionRewriter.tsx`

**Purpose:** When a creator cross-posts campaign content, Donny rewrites the restaurant's caption for the creator's personal voice.

**Rendered in:** `CrossPostPrompt.tsx` — below the caption editing area, as an inline suggestion.

**Flow:**
1. Creator opens CrossPostPrompt after content approval
2. Component calls donny-orchestrator with: original caption, creator's platform, creator's recent captions (from social_posts)
3. Claude (T1/Haiku) rewrites caption with creator's tone, adds creator's hashtags, adjusts CTA
4. Shows inline: "Donny's suggestion:" with the rewritten caption and "Use this" / "Edit" buttons
5. If creator accepts, caption field updates

**Props:**
```typescript
{
  originalCaption: string;
  platform: string;
  creatorId: string;
  onAccept: (rewrittenCaption: string) => void;
}
```

**Cost:** T1/Haiku — cheap, high-volume. Each rewrite is a single short-form AI call.

### System Message Routing

System-generated Donny messages (Auto-Pilot digests, weekly plans, performance insights) need a `conversation_id` even when the user isn't actively chatting. Each user gets a dedicated **system conversation** for Donny digests:

- On first system message for a user, create a `donny_conversations` row with `context_snapshot: { type: 'system_digest' }`
- Cache this conversation ID on the profile (`donny_system_conversation_id`, nullable UUID)
- All subsequent system messages (digests, plans, insights) use this conversation
- When the user opens Donny chat, system messages appear in a "Donny Updates" section above the regular conversation

### Database Changes

#### Migration: `20260510000002_donny_mcp_activation.sql`

```sql
-- Auto-Pilot enable flag
ALTER TABLE profiles
  ADD COLUMN auto_pilot_enabled BOOLEAN DEFAULT false;

-- System conversation ID for Donny digests
ALTER TABLE profiles
  ADD COLUMN donny_system_conversation_id UUID REFERENCES donny_conversations(id);

-- Cache for Donny-generated insights (avoid re-calling AI)
ALTER TABLE donny_messages
  ADD COLUMN insight_type TEXT CHECK (
    insight_type IN ('daily_digest', 'weekly_plan', 'performance_insight')
  ),
  ADD COLUMN expires_at TIMESTAMPTZ;
```

### MCP Server Configuration

**Prerequisite:** Confirm with Outstand.so that their MCP server endpoint is available. If Outstand does not yet provide an MCP server, the MCP client layer becomes a **local tool definition wrapper** that translates Claude tool_use calls into REST API calls through the existing `outstand-proxy` edge function. The architecture is identical — the only difference is whether tool calls route to a real MCP transport or to local REST wrappers. This fallback approach ships the same features without a third-party dependency.

**If MCP server is available:**
- `OUTSTAND_MCP_URL` — Outstand's MCP server endpoint (new Supabase secret)
- `OUTSTAND_API_KEY` — Already exists (used by outstand-proxy)
- MCP server supports HTTP/SSE transport with Bearer token auth
- White-label mode: Outstand's MCP tools return DragonCandy-branded responses

**If MCP server is not available (fallback):**
- Define tool schemas locally in `outstand-mcp.ts` matching the 25 expected tools
- Each tool's `callTool()` implementation calls the corresponding Outstand REST endpoint through `outstand-proxy`
- No external MCP transport needed — tools are local functions presented to Claude as tool_use definitions
- Migrate to real MCP transport when Outstand ships their server

### Error Handling

| Scenario | Behavior |
|----------|----------|
| MCP server unreachable | Donny responds: "I can't reach the social tools right now. You can still post manually from the Compose tab." |
| MCP tool call fails | Donny retries once, then surfaces error with manual fallback |
| MCP tool returns partial data | Claude synthesizes what's available, notes gaps |
| User has no connected accounts | MCP tools filtered out; Donny suggests connecting accounts first |
| User exceeds action quota | Donny informs user of quota limit, suggests upgrade |

### Security

- MCP client authenticates with Outstand using server-side API key (never exposed to frontend)
- Per-user social account context injected into MCP calls — users can only act on their own accounts
- Tool filtering prevents users from accessing tools above their tier
- All MCP tool calls logged to `donny_tool_executions` table for audit
- Auto-Pilot scheduled function uses service role key with per-user context isolation

---

## Sequencing

| Order | Workstream | Estimated Effort | Dependency |
|-------|-----------|-----------------|------------|
| 1 | Rush surcharge billing | 1 session | None |
| 2 | MCP client infrastructure | 1 session | None (parallel-safe with #1) |
| 3 | Donny stub activations | 1-2 sessions | MCP client (#2) |
| 4 | Caption rewriter | 0.5 session | MCP client (#2) |

Total: ~3-4 sessions sequential.

---

## Success Metrics

| Metric | Target | Measured By |
|--------|--------|-------------|
| Rush billing conversion | 90% of pending surcharges invoiced within 1 hour | rush_surcharge_log status distribution |
| Rush payment collection | 95% of invoiced surcharges paid on next cycle | paid_at vs invoiced_at delta |
| Donny social command adoption | 70% of social actions via Donny vs manual UI | analytics_events source field |
| Auto-Pilot adoption | 20% of Growth+ users enable within 30 days | profiles.auto_pilot_enabled count |
| Weekly Planner usage | 30% of Starter+ users generate at least 1 plan/month | donny_messages with insight_type = 'weekly_plan' |
| Caption rewriter acceptance | 60% of AI-suggested captions accepted (used/edited) | analytics_events on caption accept/reject |

---

## What This Deletes, Simplifies, Automates

**Deletes:** The gap where Rush posts don't charge (lost revenue). The gap where Donny can't do social actions (manual-only posting). Self-reported creator metrics (replaced by verified data via MCP analytics).

**Simplifies:** Rush billing uses existing Stripe subscription invoicing — no new checkout flows. MCP client is a thin bridge between Claude's tool_use and Outstand's server — no custom agent code per feature.

**Automates:** Daily social posting (Auto-Pilot). Weekly content planning (Weekly Planner). Caption adaptation for cross-posting (Caption Rewriter). Performance analysis (Performance Insights).

**Keystroke reduction:** Auto-Pilot removes daily posting entirely (0 keystrokes). Weekly Planner reduces a week of content planning to one button press. Caption Rewriter removes manual rewriting for every cross-post.
