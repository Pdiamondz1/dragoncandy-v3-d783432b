# Donny API Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create two new Supabase Edge Functions — `donny-campaign-generate` and `donny-analytics-alerts` — extending the Donny AI API surface for external consumers.

**Architecture:** Both functions follow the dual-client auth pattern from `donny-chat/index.ts`: a user-scoped client for auth validation, a service-role client for querying. Both return `{ success, data?, error? }` JSON responses with CORS headers. No existing files are modified.

**Tech Stack:** Deno, Supabase Edge Functions, @supabase/supabase-js v2, OpenAI API (campaign generate only)

**Spec:** `docs/superpowers/specs/2026-03-24-donny-api-layer-design.md`

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/functions/donny-campaign-generate/index.ts` | Accept URL/content/brief, fetch & parse URLs, call OpenAI, return campaign draft |
| Create | `supabase/functions/donny-analytics-alerts/index.ts` | Query existing tables for user activity, return typed alerts with severity |

No existing files are modified. No new database tables or migrations.

---

### Task 1: Create `donny-campaign-generate` Edge Function

**Files:**
- Create: `supabase/functions/donny-campaign-generate/index.ts`

- [ ] **Step 1: Create the function file with boilerplate**

Create `supabase/functions/donny-campaign-generate/index.ts` with the standard Edge Function scaffold — imports, CORS headers, env vars, `serve()` handler with OPTIONS preflight, dual-client auth pattern, and try/catch error handling. Return a placeholder `{ success: true, data: {} }` response after auth validation.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: dual-client pattern from donny-chat
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // TODO: Parse input, fetch URL, call OpenAI — implemented in next steps
    return new Response(
      JSON.stringify({ success: true, data: {} }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Add input parsing and validation**

Replace the `// TODO` placeholder with input parsing. Accept `source_url`, `page_content`, `text_brief`, and `preferences` from the request body. Validate that at least one content source is provided. Return 400 if none are given.

```typescript
    // Parse input
    const { source_url, page_content, text_brief, preferences } = await req.json();

    if (!source_url && !page_content && !text_brief) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "At least one of source_url, page_content, or text_brief is required",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
```

- [ ] **Step 3: Add URL fetching and HTML extraction**

Add a `fetchAndExtract` helper function that fetches a URL and extracts title, meta description, and body text (stripped of HTML tags). This is used when `source_url` is provided but `page_content` is not.

```typescript
async function fetchAndExtract(
  url: string
): Promise<{ title: string; description: string; bodyText: string }> {
  const response = await fetch(url, {
    headers: { "User-Agent": "DragonCandy-Bot/1.0" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status}`);
  }

  const html = await response.text();

  // Extract <title>
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  // Extract meta description
  const metaMatch = html.match(
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i
  );
  const description = metaMatch ? metaMatch[1].trim() : "";

  // Extract body text: strip tags, collapse whitespace, truncate
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const rawBody = bodyMatch ? bodyMatch[1] : html;
  const bodyText = rawBody
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 3000);

  return { title, description, bodyText };
}
```

- [ ] **Step 4: Add content assembly and OpenAI call**

After input validation, assemble the content context from all sources (priority: `page_content` > fetched URL > `text_brief`). Call OpenAI to generate campaign fields. Wire the full response.

```typescript
    // Assemble content context
    let contentContext = "";

    if (page_content) {
      contentContext += `Pre-scraped page content:\n${page_content.substring(0, 5000)}\n\n`;
    } else if (source_url) {
      try {
        const extracted = await fetchAndExtract(source_url);
        contentContext += `Page title: ${extracted.title}\n`;
        contentContext += `Page description: ${extracted.description}\n`;
        contentContext += `Page content: ${extracted.bodyText}\n\n`;
      } catch (fetchErr) {
        contentContext += `(Failed to fetch URL: ${fetchErr.message})\n\n`;
      }
    }

    if (text_brief) {
      contentContext += `User brief: ${text_brief}\n\n`;
    }

    if (source_url) {
      contentContext += `Source URL: ${source_url}\n`;
    }

    if (preferences?.platform) {
      contentContext += `Preferred platform: ${preferences.platform}\n`;
    }
    if (preferences?.budget_range) {
      contentContext += `Budget range: $${preferences.budget_range.min} - $${preferences.budget_range.max}\n`;
    }

    // Call OpenAI
    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a marketing expert for DragonCandy, an AI-powered marketplace connecting businesses with content creators. Generate a complete campaign draft from the provided context.

Respond with valid JSON only (no markdown fences). Use this exact structure:
{
  "title": "Campaign title (max 60 chars)",
  "description": "Detailed campaign description (2-3 paragraphs)",
  "platform": "Primary platform (Instagram, TikTok, YouTube, etc.)",
  "budget_min": 500,
  "budget_max": 2000,
  "content_type": "Primary content format (Reel, Story, UGC Video, Carousel, etc.)",
  "goals": ["goal1", "goal2", "goal3"],
  "target_audience": "Target audience description",
  "recommended_platforms": ["Instagram", "TikTok"],
  "content_ideas": [
    { "concept": "Short name", "format": "Reel / TikTok / Carousel", "description": "What to shoot" }
  ],
  "hashtags": ["#hashtag1", "#hashtag2"],
  "style_direction": {
    "visual_style": "Visual guidance for creators",
    "mood": "Campaign mood/tone",
    "references": "Style references"
  }
}

Generate 3-5 content_ideas, 5-10 hashtags. If budget preferences are provided, use them. Otherwise estimate based on the content scope.`,
            },
            {
              role: "user",
              content: `Generate a campaign draft from this context:\n\n${contentContext}`,
            },
          ],
          temperature: 0.7,
          max_tokens: 3000,
        }),
      }
    );

    if (!openaiResponse.ok) {
      throw new Error(`OpenAI API error: ${openaiResponse.status}`);
    }

    const aiResult = await openaiResponse.json();
    let content = (aiResult.choices?.[0]?.message?.content || "").trim();

    // Strip markdown fences if present
    if (content.startsWith("```json")) {
      content = content.replace(/^```json\n?/, "").replace(/\n?```$/, "");
    } else if (content.startsWith("```")) {
      content = content.replace(/^```\n?/, "").replace(/\n?```$/, "");
    }

    const campaignData = JSON.parse(content);

    return new Response(
      JSON.stringify({ success: true, data: campaignData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
```

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/donny-campaign-generate/index.ts
git commit -m "feat: add donny-campaign-generate Edge Function

Generates campaign drafts from URL, pre-scraped content, or text brief.
Supports Chrome Extension page-awareness via page_content field."
```

---

### Task 2: Create `donny-analytics-alerts` Edge Function

**Files:**
- Create: `supabase/functions/donny-analytics-alerts/index.ts`

- [ ] **Step 1: Create the function file with boilerplate and types**

Create `supabase/functions/donny-analytics-alerts/index.ts` with the standard scaffold — imports, CORS, env vars, serve handler, dual-client auth, input parsing. Define the Alert interface and alert type constants.

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Alert {
  type: string;
  severity: "info" | "warning" | "urgent";
  title: string;
  message: string;
  campaign_id?: string;
  count?: number;
  created_at: string;
}

const VALID_ALERT_TYPES = [
  "new_applications",
  "status_changes",
  "unread_messages",
  "payment_events",
  "expiring_campaigns",
] as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse input
    const body = await req.json().catch(() => ({}));
    const since = body.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const typeFilter: string[] | null = body.types?.length
      ? body.types.filter((t: string) => VALID_ALERT_TYPES.includes(t as any))
      : null;

    // Get user role
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = profile?.role || "content_creator";
    const isBusiness = role === "business_client" || role === "brand";

    // TODO: Collect alerts — implemented in next steps
    const alerts: Alert[] = [];

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          alerts,
          summary: {
            total_alerts: alerts.length,
            urgent_count: alerts.filter((a) => a.severity === "urgent").length,
          },
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Add business-user alert checks**

Replace the `// TODO` placeholder. Add three alert check functions for business users: `checkNewApplications`, `checkExpiringCampaigns`, and `checkPaymentEvents`. Each queries the relevant table using the service-role client and pushes alerts to the array.

```typescript
    // Collect alerts based on role
    const alerts: Alert[] = [];

    function shouldCheck(type: string): boolean {
      return !typeFilter || typeFilter.includes(type);
    }

    if (isBusiness) {
      // New applications on user's campaigns
      if (shouldCheck("new_applications")) {
        const { data: apps } = await supabaseAdmin
          .from("campaign_applications")
          .select("id, campaign_id, created_at, campaigns!inner(title, user_id)")
          .eq("campaigns.user_id", user.id)
          .gte("created_at", since)
          .eq("status", "pending");

        if (apps && apps.length > 0) {
          // Group by campaign
          const byCampaign = new Map<string, { title: string; count: number }>();
          for (const app of apps) {
            const cid = app.campaign_id;
            const existing = byCampaign.get(cid);
            if (existing) {
              existing.count++;
            } else {
              byCampaign.set(cid, {
                title: (app as any).campaigns?.title || "Untitled",
                count: 1,
              });
            }
          }

          for (const [campaignId, info] of byCampaign) {
            alerts.push({
              type: "new_applications",
              severity: "info",
              title: `${info.count} new application${info.count > 1 ? "s" : ""}`,
              message: `Your campaign "${info.title}" received ${info.count} new application${info.count > 1 ? "s" : ""}`,
              campaign_id: campaignId,
              count: info.count,
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      // Expiring campaigns (deadline within 48 hours)
      if (shouldCheck("expiring_campaigns")) {
        const now = new Date();
        const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000);

        const { data: expiring } = await supabaseAdmin
          .from("campaigns")
          .select("id, title, deadline")
          .eq("user_id", user.id)
          .in("status", ["published", "active"])
          .not("deadline", "is", null)
          .lte("deadline", in48h.toISOString().split("T")[0])
          .gte("deadline", now.toISOString().split("T")[0]);

        if (expiring) {
          for (const campaign of expiring) {
            const deadlineDate = new Date(campaign.deadline);
            const hoursLeft = Math.round(
              (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60)
            );
            alerts.push({
              type: "expiring_campaigns",
              severity: hoursLeft <= 24 ? "urgent" : "warning",
              title: `Campaign deadline ${hoursLeft <= 24 ? "today" : "approaching"}`,
              message: `"${campaign.title}" deadline is in ${hoursLeft} hours`,
              campaign_id: campaign.id,
              created_at: new Date().toISOString(),
            });
          }
        }
      }

      // Payment events — escrow status changes on user's campaigns
      if (shouldCheck("payment_events")) {
        const { data: paymentChanges } = await supabaseAdmin
          .from("campaigns")
          .select("id, title, escrow_status, updated_at")
          .eq("user_id", user.id)
          .neq("escrow_status", "none")
          .gte("updated_at", since);

        if (paymentChanges) {
          for (const campaign of paymentChanges) {
            const isUrgent = campaign.escrow_status === "refunded";
            alerts.push({
              type: "payment_events",
              severity: isUrgent ? "urgent" : "info",
              title: `Escrow ${campaign.escrow_status}`,
              message: `"${campaign.title}" escrow is now ${campaign.escrow_status}`,
              campaign_id: campaign.id,
              created_at: campaign.updated_at,
            });
          }
        }
      }
    }
```

- [ ] **Step 3: Add creator-user alert checks**

Add alert checks for creator users: `status_changes` on collaborations and `payment_events` on collaborations where they're the creator.

```typescript
    if (!isBusiness) {
      // Collaboration status changes
      if (shouldCheck("status_changes")) {
        const { data: collabs } = await supabaseAdmin
          .from("campaign_collaborations")
          .select("id, status, content_status, updated_at, campaigns!inner(title)")
          .eq("creator_id", user.id)
          .gte("updated_at", since);

        if (collabs) {
          for (const collab of collabs) {
            const needsAction =
              collab.content_status === "revision_requested";
            alerts.push({
              type: "status_changes",
              severity: needsAction ? "warning" : "info",
              title: needsAction
                ? "Revision requested"
                : `Collaboration ${collab.content_status || collab.status}`,
              message: `"${(collab as any).campaigns?.title}" — ${
                needsAction
                  ? "the business requested revisions on your content"
                  : `status is now ${collab.content_status || collab.status}`
              }`,
              created_at: collab.updated_at,
            });
          }
        }
      }

      // Payment events for creators — escrow released on their collaborations
      if (shouldCheck("payment_events")) {
        const { data: payouts } = await supabaseAdmin
          .from("campaign_collaborations")
          .select("id, status, updated_at, campaigns!inner(title, escrow_status)")
          .eq("creator_id", user.id)
          .gte("updated_at", since);

        if (payouts) {
          const relevant = payouts.filter(
            (p: any) =>
              p.campaigns?.escrow_status === "released" ||
              p.campaigns?.escrow_status === "held"
          );
          for (const payout of relevant) {
            const escrowStatus = (payout as any).campaigns?.escrow_status;
            alerts.push({
              type: "payment_events",
              severity: escrowStatus === "released" ? "info" : "info",
              title:
                escrowStatus === "released"
                  ? "Payment released"
                  : "Payment in escrow",
              message: `"${(payout as any).campaigns?.title}" — ${
                escrowStatus === "released"
                  ? "your payment has been released"
                  : "payment is being held in escrow"
              }`,
              created_at: payout.updated_at,
            });
          }
        }
      }
    }
```

- [ ] **Step 4: Add unread messages check (both roles)**

Add the unread messages alert check — this applies to both business and creator users. Query messages where `read_at IS NULL` and the sender is not the current user, joined through `conversation_participants` to scope to the user's conversations.

```typescript
    // Unread messages — both roles
    if (shouldCheck("unread_messages")) {
      const { data: unread, count } = await supabaseAdmin
        .from("messages")
        .select(
          "id, conversation_id, created_at, conversation_participants!inner(user_id)",
          { count: "exact", head: false }
        )
        .eq("conversation_participants.user_id", user.id)
        .neq("sender_id", user.id)
        .is("read_at", null)
        .gte("created_at", since)
        .limit(1);

      const unreadCount = count ?? 0;
      if (unreadCount > 0) {
        alerts.push({
          type: "unread_messages",
          severity: "info",
          title: `${unreadCount} unread message${unreadCount > 1 ? "s" : ""}`,
          message: `You have ${unreadCount} unread message${unreadCount > 1 ? "s" : ""} since ${new Date(since).toLocaleDateString()}`,
          count: unreadCount,
          created_at: new Date().toISOString(),
        });
      }
    }
```

- [ ] **Step 5: Sort alerts and finalize**

After all alert checks, sort alerts by severity (urgent first, then warning, then info), then by `created_at` descending within each severity.

```typescript
    // Sort: urgent first, then warning, then info; within each, newest first
    const severityOrder = { urgent: 0, warning: 1, info: 2 };
    alerts.sort((a, b) => {
      const sevDiff = severityOrder[a.severity] - severityOrder[b.severity];
      if (sevDiff !== 0) return sevDiff;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
```

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/donny-analytics-alerts/index.ts
git commit -m "feat: add donny-analytics-alerts Edge Function

Pull-based alerts for campaign applications, status changes,
unread messages, payment events, and expiring campaigns.
Role-aware: business vs creator users see different alerts."
```

---

### Task 3: Verify Both Functions

- [ ] **Step 1: Validate TypeScript syntax**

Run Deno check on both functions to verify they are syntactically valid:

```bash
deno check --no-lock supabase/functions/donny-campaign-generate/index.ts
deno check --no-lock supabase/functions/donny-analytics-alerts/index.ts
```

Expected: No type errors. If Deno is not installed locally, manually review the files for syntax issues.

- [ ] **Step 2: List created files**

```bash
ls -la supabase/functions/donny-campaign-generate/
ls -la supabase/functions/donny-analytics-alerts/
```

Expected: Both directories contain `index.ts`.

- [ ] **Step 3: Final commit (if any fixes were needed)**

```bash
git add supabase/functions/donny-campaign-generate/ supabase/functions/donny-analytics-alerts/
git commit -m "fix: address type issues in new Donny API functions"
```

Only commit if changes were made in Step 1.
