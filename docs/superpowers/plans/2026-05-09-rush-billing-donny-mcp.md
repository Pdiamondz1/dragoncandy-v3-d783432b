# DragonDash Rush Billing + Donny AI MCP Activation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close two post-Phase 4 gaps — charge Rush surcharges via Stripe invoice batching, and activate Donny's social media tools through MCP client infrastructure.

**Architecture:** Rush billing adds a new edge function (`invoice-rush-surcharges`) that batches pending `rush_surcharge_log` rows into Stripe invoice items on the user's subscription. The webhook reconciles payment. Donny gains a shared MCP client module that bridges Claude's `tool_use` with Outstand's 25 social tools (or REST fallback), then three stub components and a new caption rewriter are wired to real AI calls through the orchestrator.

**Tech Stack:** Supabase Edge Functions (Deno), Stripe API, Claude API (Anthropic), MCP HTTP/SSE transport, React/TypeScript, Tailwind CSS, TanStack Query.

**Spec:** `docs/superpowers/specs/2026-05-09-rush-billing-donny-mcp-design.md`

---

## File Map

### Workstream 1: Rush Surcharge Billing

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/20260510000001_rush_invoice_tracking.sql` | Add tracking columns to `rush_surcharge_log`, extend `payment_events` CHECK |
| Create | `supabase/functions/invoice-rush-surcharges/index.ts` | Edge function: batch pending surcharges to Stripe invoice items |
| Modify | `supabase/functions/_shared/payment-events.ts:4` | Add `'rush'` to `PaymentEvent.entity_type` union |
| Modify | `src/hooks/outstand/useRushSurchargeLog.ts:6-10,33-48` | Add Pro discount to `calculateSurcharge()`, invoke edge function after insert |
| Modify | `supabase/functions/stripe-webhook/index.ts:524-546` | Add rush surcharge reconciliation to `invoice.payment_succeeded` handler |

### Workstream 2: Donny AI MCP Activation

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/functions/_shared/mcp-client.ts` | Reusable MCP client (HTTP/SSE transport, tool discovery, tool execution) |
| Create | `supabase/functions/_shared/outstand-mcp.ts` | Outstand-specific config: tool filtering, namespacing, user context injection |
| Modify | `supabase/functions/_shared/model-routing.ts:50-58` | Add `social-caption` (T1) and `social-analysis` (T2) routing entries |
| Modify | `supabase/functions/donny-orchestrator/tools.ts:1-70` | Merge MCP tools into `SUB_AGENT_TOOLS`, add social tool dispatcher |
| Modify | `supabase/functions/donny-orchestrator/index.ts:8,130-133,309-311` | Init MCP client, pass to dispatcher, add social intent routing |
| Create | `supabase/migrations/20260510000002_donny_mcp_activation.sql` | Add `auto_pilot_enabled`, `donny_system_conversation_id`, `insight_type` columns |
| Replace | `src/components/outstand/DonnyAutoPilotStub.tsx` → `DonnyAutoPilot.tsx` | Active toggle with tier gating (Growth+) |
| Modify | `src/pages/OutstandManager.tsx:15,188` | Swap stub import for active component |
| Replace | `src/components/outstand/DonnyWeeklyPlannerStub.tsx` → `DonnyWeeklyPlanner.tsx` | "Generate Weekly Plan" button → Donny chat |
| Modify | `src/components/outstand/CalendarTab.tsx:14,240` | Swap stub import for active component |
| Replace | `src/components/outstand/DonnyPerformanceStub.tsx` → `DonnyPerformanceInsights.tsx` | AI-generated insights card with refresh |
| Modify | `src/components/outstand/AnalyticsTab.tsx:12,128` | Swap stub import for active component |
| Create | `src/components/outstand/DonnyCaptionRewriter.tsx` | Inline AI caption rewriter for cross-posting |
| Modify | `src/components/outstand/CrossPostPrompt.tsx:111-125` | Render `DonnyCaptionRewriter` below caption preview |
| Create | `supabase/functions/donny-auto-pilot/index.ts` | Scheduled daily agent: fetch metrics → generate posts → digest message |

---

## Workstream 1: Rush Surcharge Billing

### Task 1: Rush Invoice Tracking Migration

**Files:**
- Create: `supabase/migrations/20260510000001_rush_invoice_tracking.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add invoice tracking columns to rush_surcharge_log
ALTER TABLE rush_surcharge_log
  ADD COLUMN stripe_invoice_item_id TEXT,
  ADD COLUMN invoiced_at TIMESTAMPTZ,
  ADD COLUMN paid_at TIMESTAMPTZ;

-- Extend payment_events CHECK constraint to accept 'rush' entity type
ALTER TABLE payment_events DROP CONSTRAINT payment_events_entity_type_check;
ALTER TABLE payment_events ADD CONSTRAINT payment_events_entity_type_check
  CHECK (entity_type IN ('collaboration', 'sponsorship', 'rush'));
```

- [ ] **Step 2: Verify migration is syntactically valid**

Run: `npx supabase migration list`
Expected: New migration appears in the list without parse errors.

- [ ] **Step 3: Update PaymentEvent TypeScript interface**

Modify `supabase/functions/_shared/payment-events.ts` line 4:

Change:
```typescript
entity_type: 'collaboration' | 'sponsorship';
```
To:
```typescript
entity_type: 'collaboration' | 'sponsorship' | 'rush';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260510000001_rush_invoice_tracking.sql supabase/functions/_shared/payment-events.ts
git commit -m "feat(billing): add rush invoice tracking migration and extend payment_events entity type"
```

---

### Task 2: Pro Discount in calculateSurcharge

**Files:**
- Modify: `src/hooks/outstand/useRushSurchargeLog.ts:6-10`

- [ ] **Step 1: Add tier parameter and discount logic**

In `src/hooks/outstand/useRushSurchargeLog.ts`, replace the `calculateSurcharge` function (lines 6-10):

Old:
```typescript
function calculateSurcharge(platformCount: number): number {
  if (platformCount >= 5) return 5000;
  if (platformCount >= 4) return 3000;
  return 2500;
}
```

New:
```typescript
function calculateSurcharge(platformCount: number, tier?: string): number {
  let base: number;
  if (platformCount >= 5) base = 5000;
  else if (platformCount >= 4) base = 3000;
  else base = 2500;
  if (tier === 'pro') return Math.round(base * 0.8);
  return base;
}
```

- [ ] **Step 2: Pass tier into logRush mutation**

The `logRush` mutation at line 33 needs `tier` in its variables. Update the `mutationFn` parameter type and the call to `calculateSurcharge`:

Old (lines 33-42):
```typescript
  const logRush = useMutation({
    mutationFn: async ({ platformCount, campaignId: cId }: { platformCount: number; campaignId?: string }) => {
      const { error } = await supabase.from('rush_surcharge_log').insert({
        user_id: user!.id,
        campaign_id: cId ?? null,
        platform_count: platformCount,
        surcharge_cents: calculateSurcharge(platformCount),
        status: 'pending',
      });
      if (error) throw error;
    },
```

New:
```typescript
  const logRush = useMutation({
    mutationFn: async ({ platformCount, campaignId: cId, tier }: { platformCount: number; campaignId?: string; tier?: string }) => {
      const { error } = await supabase.from('rush_surcharge_log').insert({
        user_id: user!.id,
        campaign_id: cId ?? null,
        platform_count: platformCount,
        surcharge_cents: calculateSurcharge(platformCount, tier),
        status: 'pending',
      });
      if (error) throw error;
    },
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. Callers of `logRush` may need `tier` added — check `DragonDashRushButton.tsx` or wherever `logRush` is called and pass the org's `subscription_tier` if available.

- [ ] **Step 4: Commit**

```bash
git add src/hooks/outstand/useRushSurchargeLog.ts
git commit -m "feat(billing): add Pro tier 20% discount to rush surcharge calculation"
```

---

### Task 3: invoice-rush-surcharges Edge Function

**Files:**
- Create: `supabase/functions/invoice-rush-surcharges/index.ts`

- [ ] **Step 1: Create the edge function**

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { writePaymentEvent } from "../_shared/payment-events.ts";
import { corsHeaders } from "../_shared/cors.ts";

const logStep = (step: string, details?: Record<string, unknown>) => {
  console.log(`[INVOICE-RUSH] ${step}${details ? ' - ' + JSON.stringify(details) : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!stripeKey) {
    return new Response(JSON.stringify({ error: "STRIPE_SECRET_KEY not set" }), { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (!user || authError) throw new Error("Unauthorized");

    const { userId } = await req.json() as { userId: string };
    if (userId !== user.id) throw new Error("User ID mismatch");

    logStep("Invoicing rush surcharges", { userId });

    // Rate limit: skip if any row was invoiced in the last minute
    const { data: recentlyInvoiced } = await supabase
      .from("rush_surcharge_log")
      .select("id")
      .eq("user_id", userId)
      .eq("status", "invoiced")
      .gte("invoiced_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);

    if (recentlyInvoiced && recentlyInvoiced.length > 0) {
      logStep("Recently invoiced, skipping", { userId });
      return new Response(JSON.stringify({ invoiced: 0, skipped: true }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Fetch pending surcharges
    const { data: pending, error: fetchError } = await supabase
      .from("rush_surcharge_log")
      .select("id, campaign_id, platform_count, surcharge_cents")
      .eq("user_id", userId)
      .eq("status", "pending");

    if (fetchError) throw new Error(`Failed to fetch pending rows: ${fetchError.message}`);
    if (!pending || pending.length === 0) {
      logStep("No pending surcharges");
      return new Response(JSON.stringify({ invoiced: 0 }), {
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Look up org via org_members (profiles has no org_id column)
    const { data: membership } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId)
      .eq("invitation_status", "active")
      .limit(1)
      .single();

    if (!membership?.org_id) throw new Error("User has no organization");

    const { data: org } = await supabase
      .from("organizations")
      .select("stripe_customer_id, subscription_tier, stripe_subscription_id")
      .eq("id", membership.org_id)
      .single();

    if (!org?.stripe_customer_id) throw new Error("Organization has no Stripe customer");
    if (!org.stripe_subscription_id) throw new Error("Organization has no active subscription");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    let totalCents = 0;
    let invoicedCount = 0;

    for (const row of pending) {
      // Log pickup event per spec
      await writePaymentEvent(supabase, {
        event_type: "rush_surcharge_logged",
        entity_type: "rush",
        entity_id: row.id,
        campaign_id: row.campaign_id,
        actor_role: "system",
        amount_cents: row.surcharge_cents,
      }, "[INVOICE-RUSH]");

      try {
        const description = `DragonDash Rush — ${row.platform_count} platform${row.platform_count > 1 ? 's' : ''}`;

        const invoiceItem = await stripe.invoiceItems.create({
          customer: org.stripe_customer_id,
          amount: row.surcharge_cents,
          currency: "usd",
          description,
          subscription: org.stripe_subscription_id,
          metadata: { rush_surcharge_log_id: row.id },
        });

        await supabase
          .from("rush_surcharge_log")
          .update({
            status: "invoiced",
            stripe_invoice_item_id: invoiceItem.id,
            invoiced_at: new Date().toISOString(),
          })
          .eq("id", row.id);

        await writePaymentEvent(supabase, {
          event_type: "rush_surcharge_invoiced",
          entity_type: "rush",
          entity_id: row.id,
          campaign_id: row.campaign_id,
          actor_role: "system",
          amount_cents: row.surcharge_cents,
          stripe_id: invoiceItem.id,
        }, "[INVOICE-RUSH]");

        totalCents += row.surcharge_cents;
        invoicedCount++;
      } catch (rowErr) {
        const errMsg = rowErr instanceof Error ? rowErr.message : "unknown";
        logStep("Stripe invoice item failed, row stays pending", { rowId: row.id, error: errMsg });

        await writePaymentEvent(supabase, {
          event_type: "rush_surcharge_invoice_failed",
          entity_type: "rush",
          entity_id: row.id,
          campaign_id: row.campaign_id,
          actor_role: "system",
          amount_cents: row.surcharge_cents,
          metadata: { error: errMsg },
        }, "[INVOICE-RUSH]");
      }
    }

    logStep("Invoiced successfully", { count: invoicedCount, totalCents });

    return new Response(
      JSON.stringify({ invoiced: invoicedCount, total_cents: totalCents }),
      { headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal error";
    logStep("ERROR", { error: msg });

    if (msg.includes("Unauthorized") || msg.includes("authorization") || msg.includes("mismatch")) {
      return new Response(JSON.stringify({ error: msg }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds. The new edge function follows the same pattern as `create-sponsorship-checkout`.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/invoice-rush-surcharges/index.ts
git commit -m "feat(billing): add invoice-rush-surcharges edge function for Stripe batching"
```

---

### Task 4: Wire useRushSurchargeLog to Edge Function

**Files:**
- Modify: `src/hooks/outstand/useRushSurchargeLog.ts:43-48`

- [ ] **Step 1: Add fire-and-forget edge function call after insert**

In `src/hooks/outstand/useRushSurchargeLog.ts`, update the `onSuccess` callback of the `logRush` mutation (line 44):

Old:
```typescript
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rush-surcharge-log'] });
      toast.success('Rush surcharge logged');
    },
```

New:
```typescript
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['rush-surcharge-log'] });
      toast.success('Rush surcharge logged');
      supabase.functions.invoke('invoice-rush-surcharges', {
        body: { userId: user!.id },
      }).catch((err) => {
        console.error('[useRushSurchargeLog] invoice call failed:', err);
      });
    },
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/outstand/useRushSurchargeLog.ts
git commit -m "feat(billing): wire rush surcharge hook to invoice edge function"
```

---

### Task 5: Webhook Rush Reconciliation

**Files:**
- Modify: `supabase/functions/stripe-webhook/index.ts:524-546`

- [ ] **Step 1: Add rush reconciliation to invoice.payment_succeeded handler**

In `supabase/functions/stripe-webhook/index.ts`, find the `invoice.payment_succeeded` case (line 524). The current handler (lines 524-546) logs the event but does not reconcile rush surcharges. Add rush reconciliation after the existing org lookup block.

Find this block (lines 524-546):
```typescript
      // ── Invoice payment succeeded ─────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        logStep("Invoice payment succeeded", { invoiceId: invoice.id, subscriptionId, amountPaid: invoice.amount_paid });

        if (subscriptionId) {
          const { data: org, error: orgError } = await supabase
            .from("organizations")
            .select("id, subscription_tier")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();

          if (orgError) {
            logStep("ERROR: Failed to look up org by subscription", { subscriptionId, error: orgError.message });
          } else if (org) {
            logStep("Invoice payment logged for org", { orgId: org.id, tier: org.subscription_tier });
          } else {
            logStep("No org found for subscription — invoice ignored", { subscriptionId });
          }
        }
        break;
      }
```

Replace with:
```typescript
      // ── Invoice payment succeeded ─────────────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;

        logStep("Invoice payment succeeded", { invoiceId: invoice.id, subscriptionId, amountPaid: invoice.amount_paid });

        if (subscriptionId) {
          const { data: org, error: orgError } = await supabase
            .from("organizations")
            .select("id, subscription_tier")
            .eq("stripe_subscription_id", subscriptionId)
            .maybeSingle();

          if (orgError) {
            logStep("ERROR: Failed to look up org by subscription", { subscriptionId, error: orgError.message });
          } else if (org) {
            logStep("Invoice payment logged for org", { orgId: org.id, tier: org.subscription_tier });
          } else {
            logStep("No org found for subscription — invoice ignored", { subscriptionId });
          }
        }

        // Reconcile rush surcharges via metadata on invoice line items
        const lineItems = (invoice as any).lines?.data as Array<{ metadata?: Record<string, string> }> | undefined;
        if (lineItems) {
          const rushIds = lineItems
            .map((li) => li.metadata?.rush_surcharge_log_id)
            .filter((id): id is string => !!id);

          if (rushIds.length > 0) {
            logStep("Reconciling rush surcharges", { count: rushIds.length, rushIds });

            const { data: rushRows, error: rushError } = await supabase
              .from("rush_surcharge_log")
              .select("id, surcharge_cents, campaign_id")
              .in("id", rushIds)
              .eq("status", "invoiced");

            if (rushError) {
              logStep("ERROR: Failed to fetch rush rows for reconciliation", { error: rushError.message });
            } else if (rushRows && rushRows.length > 0) {
              const { error: updateError } = await supabase
                .from("rush_surcharge_log")
                .update({ status: "paid", paid_at: new Date().toISOString() })
                .in("id", rushRows.map((r) => r.id));

              if (updateError) {
                logStep("ERROR: Failed to mark rush rows as paid", { error: updateError.message });
              }

              for (const row of rushRows) {
                await writePaymentEvent(supabase, {
                  event_type: "rush_surcharge_paid",
                  entity_type: "rush",
                  entity_id: row.id,
                  campaign_id: row.campaign_id,
                  actor_role: "stripe",
                  amount_cents: row.surcharge_cents,
                  stripe_id: invoice.id,
                }, "[STRIPE-WEBHOOK]");
              }

              logStep("Rush surcharges reconciled", { paid: rushRows.length });
            }
          }
        }
        break;
      }
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/stripe-webhook/index.ts
git commit -m "feat(billing): add rush surcharge reconciliation to invoice.payment_succeeded webhook"
```

---

## Workstream 2: Donny AI MCP Activation

### Task 6: MCP Client Module

**Files:**
- Create: `supabase/functions/_shared/mcp-client.ts`

- [ ] **Step 1: Create the MCP client**

This module provides a reusable MCP client for Deno edge functions. It uses HTTP/SSE transport (not stdio — serverless doesn't support persistent processes). If the MCP server is unavailable, callers handle the error.

```typescript
export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

export interface McpClient {
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  disconnect(): void;
}

const TOOL_CALL_TIMEOUT = 10_000;

export async function createMcpClient(
  serverUrl: string,
  authToken: string,
): Promise<McpClient> {
  const headers = {
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };

  // Verify connectivity
  const ping = await fetch(`${serverUrl}/health`, { headers, signal: AbortSignal.timeout(5000) })
    .catch(() => null);

  if (!ping || !ping.ok) {
    throw new Error(`MCP server unreachable at ${serverUrl}`);
  }

  return {
    async listTools(): Promise<McpToolDefinition[]> {
      const res = await fetch(`${serverUrl}/tools/list`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT),
      });
      if (!res.ok) throw new Error(`listTools failed: ${res.status}`);
      const body = await res.json();
      return (body.tools ?? []) as McpToolDefinition[];
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const res = await fetch(`${serverUrl}/tools/call`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, arguments: args }),
        signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        return { content: [{ type: "text", text: `Tool call failed (${res.status}): ${errText}` }], isError: true };
      }
      return await res.json() as McpToolResult;
    },

    disconnect() {
      // HTTP transport — no persistent connection to close
    },
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/mcp-client.ts
git commit -m "feat(donny): add reusable MCP client module for Deno edge functions"
```

---

### Task 7: Outstand MCP Configuration Module

**Files:**
- Create: `supabase/functions/_shared/outstand-mcp.ts`
- Uses: `supabase/functions/outstand-proxy/index.ts:119-130` (reuses `listOwnedAccountIds` pattern)

- [ ] **Step 1: Create the Outstand MCP module**

This module handles Outstand-specific MCP configuration: tool discovery, filtering by role/tier/platforms, namespacing, and REST API fallback if no MCP server is available.

```typescript
import { createMcpClient, type McpClient, type McpToolDefinition, type McpToolResult } from "./mcp-client.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

interface OutstandMcpConfig {
  userId: string;
  userRole: string;
  orgTier?: string;
  supabase: SupabaseClient;
}

const REST_FALLBACK_TOOLS: McpToolDefinition[] = [
  { name: "create_post", description: "Create and publish a social media post", inputSchema: { type: "object", properties: { account_id: { type: "string" }, caption: { type: "string" }, platforms: { type: "array", items: { type: "string" } }, media_urls: { type: "array", items: { type: "string" } } }, required: ["account_id", "caption"] } },
  { name: "schedule_post", description: "Schedule a post for a future time", inputSchema: { type: "object", properties: { account_id: { type: "string" }, caption: { type: "string" }, scheduled_at: { type: "string" }, platforms: { type: "array", items: { type: "string" } } }, required: ["account_id", "caption", "scheduled_at"] } },
  { name: "get_post_analytics", description: "Get analytics for recent posts", inputSchema: { type: "object", properties: { account_id: { type: "string" }, days: { type: "number" } }, required: ["account_id"] } },
  { name: "get_account_metrics", description: "Get account-level metrics (followers, engagement rate)", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "get_optimal_times", description: "Get optimal posting times based on audience activity", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "get_audience_insights", description: "Get audience demographic and behavior insights", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
  { name: "list_scheduled", description: "List scheduled posts", inputSchema: { type: "object", properties: { account_id: { type: "string" } }, required: ["account_id"] } },
];

const ANALYTICS_ONLY_TOOLS = new Set(["get_post_analytics", "get_account_metrics", "get_audience_insights"]);

async function getUserAccountIds(supabase: SupabaseClient, userId: string): Promise<string[]> {
  const { data } = await supabase
    .from("business_outstand_accounts")
    .select("outstand_social_account_id")
    .eq("user_id", userId)
    .neq("status", "revoked");
  return (data ?? []).map((r: { outstand_social_account_id: string }) => r.outstand_social_account_id);
}

function filterToolsByTier(tools: McpToolDefinition[], tier?: string): McpToolDefinition[] {
  if (!tier || tier === "free") {
    return tools.filter((t) => ANALYTICS_ONLY_TOOLS.has(t.name));
  }
  return tools;
}

export interface OutstandMcpBridge {
  tools: McpToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  disconnect(): void;
}

export async function createOutstandMcpBridge(config: OutstandMcpConfig): Promise<OutstandMcpBridge | null> {
  const accountIds = await getUserAccountIds(config.supabase, config.userId);
  if (accountIds.length === 0) return null;

  const mcpUrl = Deno.env.get("OUTSTAND_MCP_URL");
  const apiKey = Deno.env.get("OUTSTAND_API_KEY");
  if (!apiKey) return null;

  let client: McpClient | null = null;
  let rawTools: McpToolDefinition[];

  if (mcpUrl) {
    try {
      client = await createMcpClient(mcpUrl, apiKey);
      rawTools = await client.listTools();
    } catch {
      console.log("[outstand-mcp] MCP server unavailable, using REST fallback");
      rawTools = REST_FALLBACK_TOOLS;
    }
  } else {
    rawTools = REST_FALLBACK_TOOLS;
  }

  const filtered = filterToolsByTier(rawTools, config.orgTier);

  // Namespace tools with social_ prefix for Claude
  const namespacedTools = filtered.map((t) => ({
    ...t,
    name: `social_${t.name}`,
  }));

  const proxyUrl = Deno.env.get("SUPABASE_URL") + "/functions/v1/outstand-proxy";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const defaultAccountId = accountIds[0];

  return {
    tools: namespacedTools,

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const rawName = name.replace(/^social_/, "");
      const enrichedArgs = { ...args, account_id: args.account_id ?? defaultAccountId };

      // Use real MCP client if available
      if (client) {
        return client.callTool(rawName, enrichedArgs);
      }

      // REST fallback via outstand-proxy
      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          "x-outstand-user-id": config.userId,
        },
        body: JSON.stringify({
          action: rawName,
          ...enrichedArgs,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        return { content: [{ type: "text", text: `Social tool error: ${errText}` }], isError: true };
      }

      const data = await res.json();
      return { content: [{ type: "text", text: JSON.stringify(data) }] };
    },

    disconnect() {
      client?.disconnect();
    },
  };
}
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/outstand-mcp.ts
git commit -m "feat(donny): add Outstand MCP bridge with REST fallback and tier-based tool filtering"
```

---

### Task 8: Social Model Routing

**Files:**
- Modify: `supabase/functions/_shared/model-routing.ts:50-58`

- [ ] **Step 1: Add social routing entries**

In `supabase/functions/_shared/model-routing.ts`, add two new entries to the `FUNCTION_ROUTING` map (after line 57):

Old (lines 50-58):
```typescript
const FUNCTION_ROUTING: Record<string, FunctionRouting> = {
  "donny-nudge-frame": { config: HAIKU, canDowngrade: false },
  "donny-schedule": { config: NO_AI, canDowngrade: false },
  "donny-creator-match": { config: HAIKU, canDowngrade: false },
  "donny-campaign-preview": { config: SONNET, canDowngrade: true },
  "donny-campaign-generate": { config: SONNET, canDowngrade: false },
  "donny-orchestrator": { config: SONNET, canDowngrade: false },
  "donny-chat": { config: SONNET_EXTENDED, canDowngrade: false },
};
```

New:
```typescript
const FUNCTION_ROUTING: Record<string, FunctionRouting> = {
  "donny-nudge-frame": { config: HAIKU, canDowngrade: false },
  "donny-schedule": { config: NO_AI, canDowngrade: false },
  "donny-creator-match": { config: HAIKU, canDowngrade: false },
  "donny-campaign-preview": { config: SONNET, canDowngrade: true },
  "donny-campaign-generate": { config: SONNET, canDowngrade: false },
  "donny-orchestrator": { config: SONNET, canDowngrade: false },
  "donny-chat": { config: SONNET_EXTENDED, canDowngrade: false },
  "social-caption": { config: HAIKU, canDowngrade: false },
  "social-analysis": { config: SONNET, canDowngrade: true },
};
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/_shared/model-routing.ts
git commit -m "feat(donny): add social-caption (T1) and social-analysis (T2) model routing entries"
```

---

### Task 9: Integrate MCP into Donny Orchestrator

**Files:**
- Modify: `supabase/functions/donny-orchestrator/tools.ts`
- Modify: `supabase/functions/donny-orchestrator/index.ts`

- [ ] **Step 1: Add social tool dispatcher to tools.ts**

In `supabase/functions/donny-orchestrator/tools.ts`, add the MCP tool merger and social intent detection after the existing `SUB_AGENT_TOOLS` array:

Append after line 70:

```typescript
import { type McpToolDefinition } from "../_shared/mcp-client.ts";

export function mergeToolsWithMcp(mcpTools: McpToolDefinition[]): Array<Record<string, unknown>> {
  const claudeMcpTools = mcpTools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
  return [...SUB_AGENT_TOOLS, ...claudeMcpTools];
}

const SOCIAL_T1_PATTERNS = [
  /caption|hashtag|rewrite|schedule.*post|post.*to/i,
  /reply.*comment|respond.*review/i,
];

const SOCIAL_T2_PATTERNS = [
  /weekly.*plan|content.*plan|auto.*pilot/i,
  /performance|insights|recommend|analyze.*social/i,
  /amplify.*all|rush.*post|multi.*platform/i,
];

export function detectSocialIntent(query: string): "social-caption" | "social-analysis" | null {
  if (SOCIAL_T2_PATTERNS.some((p) => p.test(query))) return "social-analysis";
  if (SOCIAL_T1_PATTERNS.some((p) => p.test(query))) return "social-caption";
  return null;
}

export function isSocialTool(name: string): boolean {
  return name.startsWith("social_");
}
```

- [ ] **Step 2: Update orchestrator index.ts to use MCP**

In `supabase/functions/donny-orchestrator/index.ts`, make these changes:

**a) Add imports (after line 8):**

Add after the existing `import { SUB_AGENT_TOOLS } from "./tools.ts";` line:

```typescript
import { mergeToolsWithMcp, detectSocialIntent, isSocialTool } from "./tools.ts";
import { createOutstandMcpBridge, type OutstandMcpBridge } from "../_shared/outstand-mcp.ts";
```

**b) Fix org tier lookup bug (line 277):**

The existing code queries `.select("tier")` but the actual column is `subscription_tier`. Find and fix:

Old:
```typescript
      const { data: org } = await supabase
        .from("organizations")
        .select("tier")
        .eq("id", resolvedOrgId)
        .maybeSingle();
      orgTier = org?.tier ?? undefined;
```

New:
```typescript
      const { data: org } = await supabase
        .from("organizations")
        .select("subscription_tier")
        .eq("id", resolvedOrgId)
        .maybeSingle();
      orgTier = org?.subscription_tier ?? undefined;
```

Without this fix, `orgTier` is always undefined, and MCP tool filtering defaults to free-tier (analytics only).

**c) Update the system prompt (line 53):**

In `buildSystemPrompt()`, add social capability awareness. Find the line:
```
- If unsure, say so honestly
```
Add before it:
```
- When the user asks about social media posting, analytics, or content scheduling, use the social_ tools
```

**d) Update `callClaude` to accept dynamic tools (lines 116-143):**

Change the function signature and body to accept a `tools` parameter instead of using the hardcoded `SUB_AGENT_TOOLS`:

Old (line 130-133):
```typescript
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      tools: SUB_AGENT_TOOLS,
      messages,
    }),
```

New:
```typescript
    body: JSON.stringify({
      model: modelConfig.model,
      max_tokens: modelConfig.maxTokens,
      system: systemPrompt,
      tools: allTools,
      messages,
    }),
```

And update the function signature:
```typescript
async function callClaude(
  systemPrompt: string,
  messages: ClaudeMessage[],
  modelConfig: ModelConfig,
  allTools: Array<Record<string, unknown>>
): Promise<ClaudeResponse> {
```

**e) Initialize MCP bridge and route tools in the main handler (after line 289, before the model routing block):**

After the `userContext` is built (line 289) and before the model routing section (line 310), add:

```typescript
    // --- MCP bridge ---
    let mcpBridge: OutstandMcpBridge | null = null;
    try {
      mcpBridge = await createOutstandMcpBridge({
        userId,
        userRole: userContext.user_role,
        orgTier: userContext.org_tier,
        supabase,
      });
    } catch (mcpErr) {
      console.log("[donny-orchestrator] MCP bridge init failed:", mcpErr);
    }
```

**f) Update model routing to handle social intents (line 311):**

Old:
```typescript
    const modelConfig = getModelConfig("donny-orchestrator", usageStage);
```

New:
```typescript
    const socialIntent = detectSocialIntent(query);
    const routingKey = socialIntent ?? "donny-orchestrator";
    const modelConfig = getModelConfig(routingKey, usageStage);
```

**g) Build merged tool list and pass to callClaude (before line 314):**

Add:
```typescript
    const allTools = mcpBridge ? mergeToolsWithMcp(mcpBridge.tools) : SUB_AGENT_TOOLS;
```

Update all `callClaude` calls (lines 314 and 365) to pass `allTools`:
```typescript
    let claudeResult = await callClaude(systemPrompt, messages, modelConfig, allTools);
```
And:
```typescript
      claudeResult = await callClaude(systemPrompt, messages, modelConfig, allTools);
```

**h) Update tool dispatch loop to route social tools (in the while loop, around line 332):**

In the for loop over `toolUseBlocks`, before calling `dispatchAgent`, add a check for social tools:

Old (lines 332-358):
```typescript
      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name ?? "general_agent";
        const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;

        // Inject page context and user role into tool input
        const enrichedInput: Record<string, unknown> = {
          ...toolInput,
          page_path,
          page_context: page_context ?? {},
          user_role: userContext.user_role,
          org_id: userContext.org_id,
          rag_context: ragChunks.join("\n"),
        };

        lastToolUsed = toolName;
        const agentResult = await dispatchAgent(
          toolName,
          enrichedInput,
          supabase,
          userContext
        );

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: agentResult,
        });
      }
```

New:
```typescript
      for (const toolUse of toolUseBlocks) {
        const toolName = toolUse.name ?? "general_agent";
        const toolInput = (toolUse.input ?? {}) as Record<string, unknown>;
        lastToolUsed = toolName;

        let agentResult: string;

        if (isSocialTool(toolName) && mcpBridge) {
          const mcpResult = await mcpBridge.callTool(toolName, toolInput);
          agentResult = JSON.stringify(mcpResult);

          // Audit log per spec — all MCP tool calls logged to donny_tool_executions
          await supabase.from("donny_tool_executions").insert({
            user_id: userId,
            tool_name: toolName,
            tool_input: toolInput,
            tool_output: mcpResult,
            is_error: mcpResult.isError ?? false,
          }).then(() => {}, (err: unknown) => console.error("[donny-orchestrator] tool exec log failed:", err));
        } else {
          const enrichedInput: Record<string, unknown> = {
            ...toolInput,
            page_path,
            page_context: page_context ?? {},
            user_role: userContext.user_role,
            org_id: userContext.org_id,
            rag_context: ragChunks.join("\n"),
          };
          agentResult = await dispatchAgent(toolName, enrichedInput, supabase, userContext);
        }

        toolResultBlocks.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: agentResult,
        });
      }
```

**i) Add MCP cleanup in finally block:**

Wrap the entire main handler try/catch in a try/finally that disconnects MCP. At the very end, before the final `return new Response(...)` in the catch block, and also after the successful SSE response:

Add before the success return (line 405):
```typescript
    mcpBridge?.disconnect();
```

Add before the error return (line 419):
```typescript
    mcpBridge?.disconnect();
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds. The orchestrator now routes social tool calls through MCP and uses intent-based model routing.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/donny-orchestrator/tools.ts supabase/functions/donny-orchestrator/index.ts
git commit -m "feat(donny): integrate MCP bridge into orchestrator with social intent routing"
```

---

### Task 10: Donny MCP Activation Migration

**Files:**
- Create: `supabase/migrations/20260510000002_donny_mcp_activation.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Auto-Pilot enable flag
ALTER TABLE profiles
  ADD COLUMN auto_pilot_enabled BOOLEAN DEFAULT false;

-- System conversation ID for Donny digests
ALTER TABLE profiles
  ADD COLUMN donny_system_conversation_id UUID REFERENCES donny_conversations(id);

-- Cache for Donny-generated insights (avoid re-calling AI on each tab switch)
-- user_id is denormalized here so insights can be queried directly without joining donny_conversations
ALTER TABLE donny_messages
  ADD COLUMN user_id UUID REFERENCES auth.users(id),
  ADD COLUMN insight_type TEXT CHECK (
    insight_type IN ('daily_digest', 'weekly_plan', 'performance_insight')
  ),
  ADD COLUMN expires_at TIMESTAMPTZ;
```

- [ ] **Step 2: Verify migration list**

Run: `npx supabase migration list`
Expected: Both new migrations appear.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260510000002_donny_mcp_activation.sql
git commit -m "feat(donny): add auto_pilot_enabled, system conversation, and insight caching columns"
```

---

### Task 11: DonnyAutoPilot Component

**Files:**
- Replace: `src/components/outstand/DonnyAutoPilotStub.tsx` → `src/components/outstand/DonnyAutoPilot.tsx`
- Modify: `src/pages/OutstandManager.tsx:15,188`

- [ ] **Step 1: Create the active DonnyAutoPilot component**

Create `src/components/outstand/DonnyAutoPilot.tsx`:

```tsx
import React from 'react';
import { Zap } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const DonnyAutoPilot: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const qc = useQueryClient();
  const orgTier = activeOrg?.subscription_tier ?? 'free';
  const isLocked = orgTier === 'free' || orgTier === 'starter';

  const { data: enabled } = useQuery({
    queryKey: ['auto-pilot-enabled', user?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles')
        .select('auto_pilot_enabled')
        .eq('id', user!.id)
        .single();
      return data?.auto_pilot_enabled ?? false;
    },
    enabled: !!user?.id && !isLocked,
  });

  const toggle = useMutation({
    mutationFn: async (newValue: boolean) => {
      const { error } = await supabase
        .from('profiles')
        .update({ auto_pilot_enabled: newValue })
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: (_, newValue) => {
      qc.invalidateQueries({ queryKey: ['auto-pilot-enabled'] });
      toast.success(newValue ? 'Auto-Pilot enabled' : 'Auto-Pilot disabled');
    },
    onError: (err: Error) => toast.error(`Failed: ${err.message}`),
  });

  if (isLocked) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-3 py-2 opacity-60 cursor-default">
              <Zap className="h-4 w-4 text-gray-400" />
              <span className="text-xs font-medium text-gray-400 flex-1">Donny Auto-Pilot</span>
              <Switch disabled checked={false} />
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>Auto-Pilot requires Growth plan or higher. <a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-teal-50 rounded-xl px-3 py-2">
      <Zap className={`h-4 w-4 ${enabled ? 'text-dc-teal' : 'text-gray-400'}`} />
      <span className="text-xs font-medium text-gray-700 flex-1">Donny Auto-Pilot</span>
      <Switch
        checked={enabled ?? false}
        onCheckedChange={(checked) => toggle.mutate(checked)}
        disabled={toggle.isPending}
      />
    </div>
  );
};
```

- [ ] **Step 2: Delete the stub file**

Delete `src/components/outstand/DonnyAutoPilotStub.tsx`.

- [ ] **Step 3: Update OutstandManager import**

In `src/pages/OutstandManager.tsx`, line 15:

Old:
```typescript
import { DonnyAutoPilotStub } from '@/components/outstand/DonnyAutoPilotStub';
```

New:
```typescript
import { DonnyAutoPilot } from '@/components/outstand/DonnyAutoPilot';
```

And line 188, replace `<DonnyAutoPilotStub />` with:
```tsx
<DonnyAutoPilot />
```

The component reads `subscription_tier` from `useAuth().activeOrg` internally — no prop needed.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/outstand/DonnyAutoPilot.tsx src/pages/OutstandManager.tsx
git rm src/components/outstand/DonnyAutoPilotStub.tsx
git commit -m "feat(donny): activate Auto-Pilot toggle with Growth+ tier gating"
```

---

### Task 12: DonnyWeeklyPlanner Component

**Files:**
- Replace: `src/components/outstand/DonnyWeeklyPlannerStub.tsx` → `src/components/outstand/DonnyWeeklyPlanner.tsx`
- Modify: `src/components/outstand/CalendarTab.tsx:14,240`

- [ ] **Step 1: Create the active DonnyWeeklyPlanner component**

Create `src/components/outstand/DonnyWeeklyPlanner.tsx`:

```tsx
import React, { useState } from 'react';
import { CalendarRange, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export const DonnyWeeklyPlanner: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const [isGenerating, setIsGenerating] = useState(false);
  const orgTier = activeOrg?.subscription_tier ?? 'free';
  const isLocked = orgTier === 'free';

  const handleGenerate = async () => {
    if (!user || isLocked) return;
    setIsGenerating(true);
    try {
      const { error } = await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: 'Generate a weekly content plan for my social accounts based on recent performance data',
          page_path: '/social/calendar',
          user_role: 'business',
        },
      });
      if (error) throw error;
      toast.success('Weekly plan sent to Donny chat');
    } catch (err) {
      toast.error('Failed to generate plan');
      console.error('[DonnyWeeklyPlanner]', err);
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLocked) {
    return (
      <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <CalendarRange className="h-5 w-5 text-gray-300" />
          <Sparkles className="h-4 w-4 text-gray-300" />
        </div>
        <h3 className="font-semibold text-sm text-gray-400">Weekly Content Plan</h3>
        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></p>
      </div>
    );
  }

  return (
    <div className="bg-teal-50 rounded-2xl p-4 border border-teal-200 text-center">
      <div className="flex items-center justify-center gap-2 mb-2">
        <CalendarRange className="h-5 w-5 text-dc-teal" />
        <Sparkles className="h-4 w-4 text-dc-teal" />
      </div>
      <h3 className="font-semibold text-sm text-gray-700">Weekly Content Plan</h3>
      <p className="text-xs text-gray-500 mt-1 mb-3">
        Donny analyzes your performance and suggests an optimal posting schedule
      </p>
      <button
        onClick={handleGenerate}
        disabled={isGenerating}
        className="inline-flex items-center gap-1.5 bg-dc-teal text-white text-xs font-bold py-2 px-4 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
      >
        {isGenerating ? (
          <>
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-3.5 w-3.5" />
            Generate Weekly Plan
          </>
        )}
      </button>
    </div>
  );
};
```

- [ ] **Step 2: Delete the stub file**

Delete `src/components/outstand/DonnyWeeklyPlannerStub.tsx`.

- [ ] **Step 3: Update CalendarTab import**

In `src/components/outstand/CalendarTab.tsx`, line 14:

Old:
```typescript
import { DonnyWeeklyPlannerStub } from './DonnyWeeklyPlannerStub';
```

New:
```typescript
import { DonnyWeeklyPlanner } from './DonnyWeeklyPlanner';
```

And line 240, replace `<DonnyWeeklyPlannerStub />` with `<DonnyWeeklyPlanner />`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/outstand/DonnyWeeklyPlanner.tsx src/components/outstand/CalendarTab.tsx
git rm src/components/outstand/DonnyWeeklyPlannerStub.tsx
git commit -m "feat(donny): activate Weekly Planner with AI plan generation via orchestrator"
```

---

### Task 13: DonnyPerformanceInsights Component

**Files:**
- Replace: `src/components/outstand/DonnyPerformanceStub.tsx` → `src/components/outstand/DonnyPerformanceInsights.tsx`
- Modify: `src/components/outstand/AnalyticsTab.tsx:12,128`

- [ ] **Step 1: Create the active DonnyPerformanceInsights component**

Create `src/components/outstand/DonnyPerformanceInsights.tsx`:

```tsx
import React, { useState } from 'react';
import { LineChart, Sparkles, RefreshCw, Loader2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface Insight {
  title: string;
  text: string;
  action?: string;
}

export const DonnyPerformanceInsights: React.FC = () => {
  const { user, activeOrg } = useAuth();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const orgTier = activeOrg?.subscription_tier ?? 'free';
  const isLocked = orgTier === 'free';

  const { data: insights, refetch } = useQuery({
    queryKey: ['donny-performance-insights', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('donny_messages')
        .select('content')
        .eq('user_id', user!.id)
        .eq('insight_type', 'performance_insight')
        .gte('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) return null;
      try {
        return JSON.parse(data.content) as Insight[];
      } catch {
        return null;
      }
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = async () => {
    if (!user) return;
    setIsRefreshing(true);
    try {
      await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: 'Analyze my social media performance and give me 3-5 actionable recommendations',
          page_path: '/social/analytics',
          user_role: 'business',
        },
      });
      await refetch();
    } catch (err) {
      console.error('[DonnyPerformanceInsights]', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  if (isLocked) {
    return (
      <div className="bg-gray-50 rounded-2xl p-4 border border-dashed border-gray-300 text-center mt-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <LineChart className="h-5 w-5 text-gray-300" />
          <Sparkles className="h-4 w-4 text-gray-300" />
        </div>
        <h3 className="font-semibold text-sm text-gray-400">Performance Recommendations</h3>
        <p className="text-xs text-gray-300 mt-1">Requires Starter plan or higher. <a href="/settings/billing" className="underline text-dc-teal">Upgrade</a></p>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="bg-teal-50 rounded-2xl p-4 border border-teal-200 text-center mt-4">
        <div className="flex items-center justify-center gap-2 mb-2">
          <LineChart className="h-5 w-5 text-dc-teal" />
          <Sparkles className="h-4 w-4 text-dc-teal" />
        </div>
        <h3 className="font-semibold text-sm text-gray-700">Performance Recommendations</h3>
        <p className="text-xs text-gray-500 mt-1 mb-3">Get AI-powered insights on your social performance</p>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="inline-flex items-center gap-1.5 bg-dc-teal text-white text-xs font-bold py-2 px-4 rounded-full hover:bg-teal-500 transition-colors disabled:opacity-50"
        >
          {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          {isRefreshing ? 'Analyzing...' : 'Get Insights'}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl p-4 border border-teal-200 mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <LineChart className="h-4 w-4 text-dc-teal" />
          <h3 className="font-semibold text-sm text-gray-700">Donny's Recommendations</h3>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
        >
          {isRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" /> : <RefreshCw className="h-3.5 w-3.5 text-gray-400" />}
        </button>
      </div>
      <div className="space-y-3">
        {insights.map((insight, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-3">
            <h4 className="text-xs font-bold text-gray-700">{insight.title}</h4>
            <p className="text-xs text-gray-500 mt-1">{insight.text}</p>
            {insight.action && (
              <span className="inline-block mt-2 text-[10px] font-semibold text-dc-teal bg-teal-50 px-2 py-0.5 rounded-full">
                {insight.action}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Delete the stub file**

Delete `src/components/outstand/DonnyPerformanceStub.tsx`.

- [ ] **Step 3: Update AnalyticsTab import**

In `src/components/outstand/AnalyticsTab.tsx`, line 12:

Old:
```typescript
import { DonnyPerformanceStub } from './DonnyPerformanceStub';
```

New:
```typescript
import { DonnyPerformanceInsights } from './DonnyPerformanceInsights';
```

And line 128, replace `<DonnyPerformanceStub />` with `<DonnyPerformanceInsights />`.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/outstand/DonnyPerformanceInsights.tsx src/components/outstand/AnalyticsTab.tsx
git rm src/components/outstand/DonnyPerformanceStub.tsx
git commit -m "feat(donny): activate Performance Insights with AI-generated recommendations"
```

---

### Task 14: DonnyCaptionRewriter Component

**Files:**
- Create: `src/components/outstand/DonnyCaptionRewriter.tsx`
- Modify: `src/components/outstand/CrossPostPrompt.tsx:111-125`

- [ ] **Step 1: Create the caption rewriter component**

Create `src/components/outstand/DonnyCaptionRewriter.tsx`:

```tsx
import React, { useState } from 'react';
import { Sparkles, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DonnyCaptionRewriterProps {
  originalCaption: string;
  platform: string;
  creatorId: string;
  onAccept: (rewrittenCaption: string) => void;
}

export const DonnyCaptionRewriter: React.FC<DonnyCaptionRewriterProps> = ({
  originalCaption,
  platform,
  creatorId,
  onAccept,
}) => {
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const handleRewrite = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('donny-orchestrator', {
        body: {
          query: `Rewrite this caption in my personal voice for ${platform}. Keep it authentic and engaging. Original caption: "${originalCaption}"`,
          page_path: '/social/cross-post',
          user_role: 'creator',
          page_context: { creator_id: creatorId, platform },
        },
      });

      if (error) throw error;

      const lines = (data as string).split('\n');
      const eventLine = lines.find((l: string) => l.startsWith('data: '));
      if (eventLine) {
        const parsed = JSON.parse(eventLine.replace('data: ', ''));
        setSuggestion(parsed.text ?? parsed.answer ?? null);
      }
    } catch (err) {
      console.error('[DonnyCaptionRewriter]', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (dismissed) return null;

  if (!suggestion) {
    return (
      <button
        onClick={handleRewrite}
        disabled={isLoading}
        className="flex items-center gap-1.5 text-xs text-dc-teal font-semibold mt-2 hover:underline disabled:opacity-50"
      >
        {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
        {isLoading ? 'Rewriting...' : 'Rewrite in my voice'}
      </button>
    );
  }

  return (
    <div className="bg-teal-50 rounded-lg p-2 mt-2 border border-teal-200">
      <p className="text-[10px] font-semibold uppercase text-teal-600 tracking-wide mb-1">
        Donny's suggestion
      </p>
      <p className="text-xs text-gray-700">{suggestion}</p>
      <div className="flex gap-2 mt-2">
        <button
          onClick={() => { onAccept(suggestion); setDismissed(true); }}
          className="inline-flex items-center gap-1 text-[10px] font-bold text-white bg-dc-teal px-2.5 py-1 rounded-full hover:bg-teal-500"
        >
          <Check className="h-3 w-3" />
          Use this
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-[10px] font-semibold text-gray-400 hover:text-gray-600"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};
```

- [ ] **Step 2: Add caption rewriter to CrossPostPrompt**

In `src/components/outstand/CrossPostPrompt.tsx`, add the import at the top with other imports:

```typescript
import { DonnyCaptionRewriter } from './DonnyCaptionRewriter';
```

Add the auth hook import at the top of `CrossPostPrompt.tsx`:
```typescript
import { useAuth } from '@/hooks/useAuth';
```

Inside the component (after the existing hooks around line 30), add:
```typescript
const { user } = useAuth();
```

Then find the caption preview section (around lines 111-125). After the closing `</div>` of the caption preview block (after line 124), add:

```tsx
          {user?.id && (
            <DonnyCaptionRewriter
              originalCaption={caption}
              platform={selectedAccountIds[0] ?? 'social'}
              creatorId={user.id}
              onAccept={(rewritten) => setCaption(rewritten)}
            />
          )}
```

The `creatorId` comes from `useAuth()` — the cross-posting flow is used by creators viewing their own approved content.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/outstand/DonnyCaptionRewriter.tsx src/components/outstand/CrossPostPrompt.tsx
git commit -m "feat(donny): add inline caption rewriter for cross-posting via Haiku"
```

---

### Task 15: donny-auto-pilot Scheduled Edge Function

**Files:**
- Create: `supabase/functions/donny-auto-pilot/index.ts`

- [ ] **Step 1: Create the scheduled Auto-Pilot function**

This function runs on a daily cron schedule for users with Auto-Pilot enabled. It fetches metrics, generates posts, and sends a digest to Donny chat.

```typescript
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createOutstandMcpBridge } from "../_shared/outstand-mcp.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (_req) => {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find all users with Auto-Pilot enabled
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, org_id, role, donny_system_conversation_id")
    .eq("auto_pilot_enabled", true);

  if (error || !users || users.length === 0) {
    console.log("[donny-auto-pilot] No users with Auto-Pilot enabled");
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;

  for (const user of users) {
    try {
      // Look up org tier
      let orgTier = "free";
      if (user.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("subscription_tier")
          .eq("id", user.org_id)
          .single();
        orgTier = org?.subscription_tier ?? "free";
      }

      // Growth+ only
      if (orgTier !== "growth" && orgTier !== "pro" && orgTier !== "enterprise") continue;

      const mcpBridge = await createOutstandMcpBridge({
        userId: user.id,
        userRole: user.role ?? "business",
        orgTier,
        supabase,
      });

      if (!mcpBridge) continue;

      // Fetch recent metrics
      const metricsResult = await mcpBridge.callTool("social_get_account_metrics", {});
      const analyticsResult = await mcpBridge.callTool("social_get_post_analytics", { days: 7 });

      const modelConfig = getModelConfig("social-analysis", "full_power");

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelConfig.model,
          max_tokens: modelConfig.maxTokens,
          system: `You are Donny, DragonCandy's AI assistant. Generate 1-3 social media posts for today based on the user's recent performance data. For each post, include: platform, suggested time, caption text. Keep captions authentic and engaging. Return as JSON array: [{"platform":"instagram","time":"11:30 AM","caption":"..."}]`,
          messages: [{
            role: "user",
            content: `My account metrics: ${JSON.stringify(metricsResult)}\n\nRecent post analytics: ${JSON.stringify(analyticsResult)}\n\nGenerate today's posts.`,
          }],
        }),
      });

      if (!response.ok) {
        console.error(`[donny-auto-pilot] Claude API error for ${user.id}: ${response.status}`);
        mcpBridge.disconnect();
        continue;
      }

      const claudeResult = await response.json();
      await logCost(supabase, {
        userId: user.id,
        edgeFunction: "donny-auto-pilot",
        model: modelConfig.model,
        tier: modelConfig.tier,
        inputTokens: claudeResult.usage?.input_tokens ?? 0,
        outputTokens: claudeResult.usage?.output_tokens ?? 0,
      });

      const assistantText = (claudeResult.content as Array<{ type: string; text?: string }>)
        ?.filter((b) => b.type === "text")
        .map((b) => b.text ?? "")
        .join("") ?? "";

      // Ensure system conversation exists
      let conversationId = user.donny_system_conversation_id;
      if (!conversationId) {
        const { data: conv } = await supabase
          .from("donny_conversations")
          .insert({ user_id: user.id, context_snapshot: { type: "system_digest" } })
          .select("id")
          .single();
        if (conv) {
          conversationId = conv.id;
          await supabase
            .from("profiles")
            .update({ donny_system_conversation_id: conv.id })
            .eq("id", user.id);
        }
      }

      if (conversationId) {
        await supabase.from("donny_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
          insight_type: "daily_digest",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      mcpBridge.disconnect();
      processed++;
    } catch (err) {
      console.error(`[donny-auto-pilot] Error for user ${user.id}:`, err);
    }
  }

  console.log(`[donny-auto-pilot] Processed ${processed} users`);
  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});
```

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/donny-auto-pilot/index.ts
git commit -m "feat(donny): add Auto-Pilot scheduled edge function for daily AI-generated posts"
```

---

### Task 16: Final Build Verification and Summary Commit

- [ ] **Step 1: Run full build**

Run: `npm run build`
Expected: Build succeeds with zero errors.

- [ ] **Step 2: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 3: Verify all new files are tracked**

Run: `git status`
Expected: All new files created in this plan are tracked and committed. No untracked implementation files remain.
