# UGC & DragonShare Social Integration — Design Spec

## Goal

Wire auto-scheduling and one-tap social posting into UGC Promotion approvals and DragonShare boosts, reusing the proven campaign Stage 4 pattern (donny_scheduled_posts + donny_nudges + social-caption + outstand-proxy). Unify all social posts in the existing content calendar.

## Decisions

| Question | Answer |
|----------|--------|
| Who gets nudged on UGC approval? | Business only |
| Who gets nudged on DragonShare boost? | Full triple-post: business, creator, brand (if present) |
| Default post behavior? | One-tap publish via "Post Now" nudge; "Review Draft" as escape hatch |
| Unified calendar? | Yes — extend existing OutstandManager/CalendarTab, no new pages |

## Architecture

Hook-per-flow approach: two new Supabase Edge Functions (`fire-promotion-social-hook`, `fire-dragonshare-social-hook`) that mirror the existing `fire-campaign-social-hook` Stage 4 pattern. Each hook resolves parties, checks Outstand accounts, generates AI captions, creates drafts in `donny_scheduled_posts`, and drops nudges into `donny_nudges`. The existing `post_now` handler in `DonnyProvider.tsx` handles one-tap publish for all sources.

No new database tables. No new routes. All data flows through existing tables with `metadata.source` distinguishing origin.

---

## Section 1: Trigger Points & Edge Functions

### fire-promotion-social-hook

**Trigger:** Called from `src/hooks/usePromotions.ts` inside the `reviewSubmission` mutation, after the status update succeeds and `status === 'approved'` (after line 346, alongside the existing `send-promotion-notification` call).

**Input:**
```json
{ "promotion_id": "uuid", "submission_id": "uuid" }
```

**Pipeline:**
1. Fetch promotion from `promotions` table (title, user_id, description)
2. Fetch submission from `promotion_submissions` (video_url, customer_name, social_handles)
3. Resolve business user from `promotions.user_id`
4. Check business's `business_outstand_accounts` for connected platform — skip if none
5. Call `social-caption` with `source: 'promotion'`, promotion title, customer name, platform
6. Call `donny-schedule` for optimal posting time (fallback: +24h)
7. Insert draft into `donny_scheduled_posts`:
   - `user_id`: business user
   - `platform`: from Outstand account
   - `content_type`: 'video' (customer video) or derived from submission
   - `caption`: AI-generated
   - `media_urls`: `[submission.video_url]` (signed URL from `promotion-videos` bucket)
   - `hashtags`: AI-generated
   - `status`: 'draft'
   - `ai_suggested_time`: true
   - `metadata`: `{ source: 'promotion_social_hook', promotion_id, submission_id }`
8. Insert nudge into `donny_nudges`:
   - `user_id`: business user
   - `type`: 'content'
   - `priority`: 'high'
   - `source_table`: 'promotion_submissions'
   - `source_id`: submission ID
   - `summary`: "Customer video approved — share it on your socials!"
   - `actions`: Post Now (primary) + Review Draft (secondary, navigates to `/dashboard/business/social`)

**Error handling:** Each step wrapped in try/catch. If caption generation fails, fall back to template caption. If schedule suggestion fails, default to +24h. If Outstand account missing, skip silently (no nudge).

### fire-dragonshare-social-hook

**Trigger:** Called from `supabase/functions/boost-payment/index.ts` after line 172 (successful boost completion, before returning the response).

**Input:**
```json
{ "boost_id": "uuid", "post_id": "uuid" }
```

**Pipeline:**
1. Fetch boost from `dragonshare_boosts` (boosting_org_id, boosting_user_id)
2. Fetch post from `dragonshare_posts` (creator_id, target_org_id, post_url, caption, platform, content_type, hashtags, mentions)
3. Resolve three parties:
   - **Business:** Owner of `boosting_org_id` (from `organization_members` where role = 'owner')
   - **Creator:** `dragonshare_posts.creator_id`
   - **Brand:** Check if `target_org_id` has any active `campaign_sponsorships` — if so, resolve sponsor's user via `business_profiles`. If none, skip brand.
4. For each party with a connected Outstand account:
   a. Check `business_outstand_accounts` for platform — skip if none
   b. Call `social-caption` with `source: 'dragonshare'`, role-specific context
   c. Call `donny-schedule` for optimal posting time
   d. Insert draft into `donny_scheduled_posts`:
      - `metadata`: `{ source: 'dragonshare_social_hook', boost_id, post_id }`
      - `media_urls`: Signed URL from creator's post_url or screenshot_url
   e. Insert nudge into `donny_nudges`:
      - `source_table`: 'dragonshare_boosts'
      - `source_id`: boost ID
      - `summary`: Role-specific (see Section 2)
      - `actions`: Post Now + Review Draft (navigates to role-appropriate social page)

**Error handling:** Each party wrapped in independent try/catch (same isolation pattern as `fire-campaign-social-hook`). One party failing does not block others.

---

## Section 2: Social Caption Extension & Nudge Design

### social-caption updates

The `CaptionRequest` interface gains two optional fields:

```typescript
interface CaptionRequest {
  campaign_title: string;
  campaign_description: string;
  content_type: string;
  party_role: "restaurant" | "creator" | "brand";
  platform: string;
  user_id: string;
  source?: "campaign" | "promotion" | "dragonshare";     // NEW
  context?: Record<string, string>;                        // NEW
}
```

New source-specific prompt logic (added to the existing `ROLE_PROMPTS` dispatch):

**When `source === 'promotion'`:**
> "You are writing a social media caption for a restaurant sharing a customer's video review. Celebrate the customer by name ({context.customer_name}), mention the promotion ({context.promotion_title}), keep it authentic and grateful. Include a call-to-action inviting others to participate."

**When `source === 'dragonshare'`:**
- **Restaurant role:** "You are writing a caption for a restaurant amplifying a creator's content about their business. Thank the creator, highlight the experience, encourage followers to visit."
- **Creator role:** "You are writing a caption for a content creator cross-posting their featured content. Reference the restaurant/business, keep it authentic and personal."
- **Brand role:** "You are writing a caption for a brand amplifying sponsored content from a creator-restaurant collaboration. Professional co-marketing tone with brand hashtags."

When `source` is absent or `'campaign'`, behavior is unchanged (backward compatible).

### Nudge summaries by source

| Source | Role | Summary |
|--------|------|---------|
| promotion | business | "Customer video approved — share it on your socials!" |
| dragonshare | business | "You boosted @{creator}'s post — amplify it on your channels!" |
| dragonshare | creator | "Your post got boosted by {business} — cross-post it!" |
| dragonshare | brand | "Sponsored content is live — amplify it!" |

### Nudge actions (all sources)

```json
[
  {
    "label": "Post Now",
    "variant": "primary",
    "action": "post_now",
    "payload": { "scheduled_post_id": "<draft-id>", "campaign_id": null }
  },
  {
    "label": "Review Draft",
    "variant": "secondary",
    "action": "navigate",
    "payload": { "route": "/dashboard/{role}/social" }
  }
]
```

The `navigate` route is role-aware:
- Business: `/dashboard/business/social`
- Creator: `/dashboard/creator/social`
- Brand: `/dashboard/brand/social`

---

## Section 3: Unified Content Calendar

No new pages or routes. The existing `OutstandManager.tsx` at `/dashboard/{business|creator}/social` with its `CalendarTab` and `ScheduledTab` becomes the unified hub.

### Source filter chips

Add a filter row in `CalendarTab.tsx` above the calendar grid:

- Chips: "All" | "Campaigns" | "UGC" | "DragonShare"
- Filters `donny_scheduled_posts` query by `metadata->>'source'`:
  - "Campaigns" → `metadata->>'source' = 'campaign_social_hook'`
  - "UGC" → `metadata->>'source' = 'promotion_social_hook'`
  - "DragonShare" → `metadata->>'source' = 'dragonshare_social_hook'`
  - "All" → no filter
- Works orthogonally with the existing platform filter (Instagram, TikTok, etc.)

### Source badge on post cards

Each post card in calendar and list views gets a small badge:

| Source | Badge text | Color |
|--------|-----------|-------|
| campaign_social_hook | Campaign | teal (bg-dc-teal/20 text-dc-teal) |
| promotion_social_hook | UGC | pink (bg-dc-pink/20 text-dc-pink-accent) |
| dragonshare_social_hook | DragonShare | yellow (bg-dc-yellow/20 text-yellow-800) |
| (no source / manual) | Manual | gray (bg-gray-100 text-gray-600) |

### ScheduledTab "Post Now" button

Add a "Post Now" action button on draft-status posts in the list view. Calls the same `post_now` logic from `DonnyProvider` so users can one-tap publish directly from the calendar without needing a nudge.

### Navigation fix

Update nudge `navigate` payloads in all three hooks to use the correct routes:
- Business: `/dashboard/business/social`
- Creator: `/dashboard/creator/social`

(The old `fire-campaign-social-hook` used `/dashboard/creator/content-calendar` and `/dashboard/business/content-calendar` which don't exist as routes — these should be updated too.)

---

## Section 4: social_post_log Population

The `post_now` handler in `DonnyProvider.tsx` already inserts into `social_post_log` for campaign posts. We make it universal by reading `metadata.source` from the draft:

| metadata.source | post_type |
|-----------------|-----------|
| campaign_social_hook | campaign |
| promotion_social_hook | ugc_promotion |
| dragonshare_social_hook | dragonshare |
| (anything else) | manual |

The `campaign_id` field comes from the draft's `campaign_id` column (populated for campaigns, null for UGC/DragonShare). No schema changes to `social_post_log`.

This makes `social_post_log` the single audit trail for all platform-published posts, enabling future analytics and Donny insights.

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `supabase/functions/fire-promotion-social-hook/index.ts` | UGC approval → social draft + nudge |
| `supabase/functions/fire-dragonshare-social-hook/index.ts` | DragonShare boost → triple-post drafts + nudges |

### Modified files
| File | Change |
|------|--------|
| `supabase/functions/social-caption/index.ts` | Add `source` and `context` fields, source-specific prompt logic |
| `src/hooks/usePromotions.ts` | Call `fire-promotion-social-hook` on approval |
| `supabase/functions/boost-payment/index.ts` | Call `fire-dragonshare-social-hook` after successful boost |
| `src/components/outstand/CalendarTab.tsx` | Add source filter chips, source badges on post cards |
| `src/components/outstand/ScheduledTab.tsx` | Add source badges, "Post Now" button on drafts |
| `src/contexts/DonnyProvider.tsx` | Map `metadata.source` to `post_type` in social_post_log insert |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Fix navigate routes to `/dashboard/{role}/social` |

### No changes needed
| File | Reason |
|------|--------|
| `donny_scheduled_posts` table | `metadata` JSONB column already exists |
| `donny_nudges` table | Existing schema supports all needed fields |
| `social_post_log` table | Existing `post_type` column accommodates new values |
| `outstand-proxy` edge function | Already supports POST /posts for publishing |
| `DonnyProvider.tsx` post_now handler | Already works for any draft (just needs post_type mapping) |

---

## Out of Scope

- Social API direct integration (Meta, TikTok, YouTube, X) — handled by Outstand proxy
- Customer-facing social prompts (customers who submit UGC videos are not prompted to post)
- New database tables or migrations
- New frontend routes or pages
- Brand role dashboard (brands use existing routes)
