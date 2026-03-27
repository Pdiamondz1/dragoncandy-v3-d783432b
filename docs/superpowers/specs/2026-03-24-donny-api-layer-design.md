# Donny AI Super Agent API Layer — Design Spec

**Date:** 2026-03-24
**Status:** Approved
**Scope:** Two new Supabase Edge Functions for the Donny external API layer

## Context

DragonCandy has an existing Donny AI chat system (`donny-chat/index.ts`) with 18 tool definitions, rate limiting, and context window management. A creator matching function (`match-creators/index.ts`) and campaign analysis function (`generate-campaign-analysis/index.ts`) also exist.

The goal is to extend the Donny API surface for external consumers (Chrome Extension, mobile widgets, embeddable SDK). This phase builds the two functions that don't exist yet. The existing `donny-chat` will be evolved separately when wiring the Claude API.

## Approach: Option B+

- **Build what's missing:** `donny-campaign-generate` and `donny-analytics-alerts`
- **Leave existing functions untouched:** `donny-chat`, `match-creators`, `generate-campaign-analysis`
- **No new tables needed:** One function returns data without saving; the other reads existing tables

## Function 1: `donny-campaign-generate/index.ts`

### Purpose

Auto-generate a full campaign draft from a URL, pre-scraped content, or a text brief.

### Input (POST)

```typescript
{
  source_url?: string,        // URL to fetch & parse
  page_content?: string,      // Pre-scraped content from Chrome Extension
  text_brief?: string,        // Free-text campaign description
  preferences?: {
    platform?: string,
    budget_range?: { min: number, max: number }
  }
}
```

At least one of `source_url`, `page_content`, or `text_brief` must be provided.

Content priority: `page_content` > fetched URL content > `text_brief`.

### Logic Flow

1. Validate auth (Bearer token → Supabase `getUser()`)
2. If `source_url` provided and no `page_content`, fetch URL and extract text/title/meta description (simple `fetch()` + HTML tag stripping — not a headless browser)
3. Combine all available content into a single context string
4. Call OpenAI (matching existing patterns) to generate campaign fields
5. Return generated campaign data for client-side preview/editing

### Output

```typescript
{
  success: true,
  data: {
    title: string,
    description: string,
    platform: string,
    budget_min: number,
    budget_max: number,
    content_type: string,
    goals: string[],
    target_audience: string,
    recommended_platforms: string[],
    content_ideas: Array<{ concept: string, format: string, description: string }>,
    hashtags: string[],
    style_direction: {
      visual_style: string,
      mood: string,
      references: string
    }
  }
}
```

### Key Decisions

- **Does NOT auto-save** — returns data for the client to preview/edit before creating via the existing campaign creation flow
- **URL fetching is basic** — `fetch()` + HTML text extraction. JS-heavy pages (Instagram, TikTok) won't render fully. The Chrome Extension pre-scrape path (`page_content`) handles those cases.
- **Uses OpenAI for now** — matches existing function patterns. Will migrate to Claude API alongside `donny-chat` in a future phase.

## Function 2: `donny-analytics-alerts/index.ts`

### Purpose

Check a user's internal DragonCandy activity and return actionable alerts. Pull-based — the client polls this endpoint.

### Input (POST)

```typescript
{
  since?: string,   // ISO timestamp — defaults to 24 hours ago
  types?: string[]  // Filter to specific alert types (optional)
}
```

### Alert Types

| Alert Type | Source Table | Trigger |
|---|---|---|
| `new_applications` | `campaign_applications` | New applications on user's campaigns since `since` (filter by `created_at`) |
| `status_changes` | `campaign_collaborations` | Collaboration `status` column changed since `since` (uses `updated_at`) |
| `unread_messages` | `messages` + `conversation_participants` | Unread message count |
| `payment_events` | `campaigns` | `escrow_status` column changes — values: `none`, `pending`, `held`, `released`, `refunded` |
| `expiring_campaigns` | `campaigns` | `deadline` column (DATE) within 48 hours of now |

### Output

```typescript
{
  success: true,
  data: {
    alerts: Array<{
      type: string,
      severity: "info" | "warning" | "urgent",
      title: string,
      message: string,
      campaign_id?: string,
      count?: number,
      created_at: string
    }>,
    summary: {
      total_alerts: number,
      urgent_count: number
    }
  }
}
```

### Severity Logic

- **`urgent`** — payment issues, deadlines within 24 hours
- **`warning`** — deadlines within 48 hours, status changes needing action
- **`info`** — new applications, new messages, routine updates

### Key Decisions

- **Pull-based only** — no push/websocket. Chrome Extension or widget polls on an interval. Realtime push can be layered on later via Supabase Realtime subscriptions.
- **Internal data only** — reads from existing DragonCandy tables. External social media API integration deferred to a later phase.
- **Role-aware** — determined by `profiles.role` column. `business_client` users see campaign/application/escrow alerts; `content_creator` users see collaboration/payment alerts. Both roles see unread messages.

## Shared Patterns

Both functions follow conventions from existing Edge Functions:

- **Auth:** Bearer token → user-scoped `createClient` with auth header for `getUser()` validation + service-role `createClient` for querying across tables (same dual-client pattern as `donny-chat`)
- **CORS:** `Access-Control-Allow-Origin: *`, same allowed headers as existing functions
- **Response shape:** `{ success: boolean, data?: any, error?: string }`
- **Imports:** `serve` from `deno.land/std@0.168.0`, `createClient` from `esm.sh/@supabase/supabase-js@2`
- **Error handling:** Try/catch wrapping entire handler, 401/400/500 status codes as appropriate

## Files to Create

1. `supabase/functions/donny-campaign-generate/index.ts`
2. `supabase/functions/donny-analytics-alerts/index.ts`

## Files NOT Modified

All existing files remain untouched. No new database tables or migrations.

## Future Work (Not in Scope)

- Migrate `donny-chat` from OpenAI to Claude API
- Add `context: { page_url, page_content }` to `donny-chat` for Chrome Extension awareness
- Standardize all existing function response shapes
- Add external social media API integrations to analytics alerts
- Add push-based realtime alerts via Supabase Realtime
