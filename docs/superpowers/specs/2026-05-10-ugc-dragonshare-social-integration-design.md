# UGC & DragonShare Social Integration — Design Spec

## Goal

Wire auto-scheduling and one-tap social posting into UGC Promotion approvals and DragonShare boosts, reusing the proven campaign Stage 4 pattern (donny_scheduled_posts + donny_nudges + social-caption + outstand-proxy). Surface draft posts in a new "Drafts" tab on the existing social management page.

## Decisions

| Question | Answer |
|----------|--------|
| Who gets nudged on UGC approval? | Business only |
| Who gets nudged on DragonShare boost? | Full triple-post: business, creator, brand (if discoverable) |
| Default post behavior? | One-tap publish via "Post Now" nudge; "Review Draft" as escape hatch |
| Unified calendar? | Yes — add "Drafts" tab to existing OutstandManager, no new pages |

## Architecture

Hook-per-flow approach: two new Supabase Edge Functions (`fire-promotion-social-hook`, `fire-dragonshare-social-hook`) that mirror the existing `fire-campaign-social-hook` Stage 4 pattern. Each hook resolves parties, checks Outstand accounts, generates AI captions, creates drafts in `donny_scheduled_posts`, and drops nudges into `donny_nudges`. The existing `post_now` handler in `DonnyProvider.tsx` handles one-tap publish for all sources.

Both edge functions use `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)` to bypass RLS, matching the pattern in `fire-campaign-social-hook`.

One migration required: extend `social_post_log.post_type` CHECK constraint to accept new source values.

---

## Section 1: Trigger Points & Edge Functions

### fire-promotion-social-hook

**Trigger:** Called from `src/hooks/usePromotions.ts` inside the `reviewSubmission` mutation, within the `if (status === 'approved')` block (around lines 354–373), alongside the existing `send-promotion-notification` call. Fire-and-forget — wrapped in its own try/catch so a failure does not block the approval flow.

**Input:**
```json
{ "promotion_id": "uuid", "submission_id": "uuid" }
```

**Pipeline:**
1. Fetch promotion from `promotions` table (title, user_id, description)
2. Fetch submission from `promotion_submissions` (video_url, customer_name, social_handles)
3. Resolve business user from `promotions.user_id`
4. Check business's `business_outstand_accounts` for connected platform — skip entirely if none
5. Call `social-caption` with `source: 'promotion'`, promotion title, customer name, platform
6. Call `donny-schedule` for optimal posting time (fallback: +24h)
7. Collect media URL from `submission.video_url` (already a full public URL from Supabase storage)
8. Insert draft into `donny_scheduled_posts`:
   - `user_id`: business user
   - `campaign_id`: null (UGC promotions are not campaign-tied)
   - `platform`: from Outstand account
   - `content_type`: 'video' (customer video) or derived from submission mime type
   - `caption`: AI-generated
   - `media_urls`: `[submission.video_url]`
   - `hashtags`: AI-generated
   - `status`: 'draft'
   - `ai_suggested_time`: true
   - `ai_reasoning`: 'Auto-drafted by promotion social hook (UGC approval)'
   - `metadata`: `{ source: 'promotion_social_hook', promotion_id, submission_id }`
9. Insert nudge into `donny_nudges`:
   - `user_id`: business user
   - `type`: 'content'
   - `priority`: 'high'
   - `source_table`: 'promotion_submissions'
   - `source_id`: submission ID
   - `summary`: "Customer video approved — share it on your socials!"
   - `actions`: Post Now (primary) + Review Draft (secondary, navigates to `/dashboard/business/social`)

**Error handling:** Each step wrapped in try/catch. If caption generation fails, fall back to template caption ("Check out this amazing customer video! {promotion_title}"). If schedule suggestion fails, default to +24h. If Outstand account missing, skip entirely (no draft, no nudge).

### fire-dragonshare-social-hook

**Trigger:** Called from `supabase/functions/boost-payment/index.ts` after successful boost completion (after the post's `boost_status` is updated to 'boosted', before returning the response). Fire-and-forget — wrapped in try/catch so a failure does not block the payment response.

**Input:**
```json
{ "boost_id": "uuid", "post_id": "uuid" }
```

**Pipeline:**
1. Fetch boost from `dragonshare_boosts` (boosting_org_id, boosting_user_id)
2. Fetch post from `dragonshare_posts` (creator_id, target_org_id, post_url, caption, platform, content_type, hashtags, mentions)
3. Resolve parties:
   - **Business:** Owner of `boosting_org_id` via `org_members` table (where `role = 'owner'`)
   - **Creator:** `dragonshare_posts.creator_id`
   - **Brand (best-effort):** Look up the business user from `org_members` → find campaigns owned by that user (`campaigns.user_id`) → find active sponsorships on those campaigns (`campaign_sponsorships` where `status IN ('active', 'accepted')`) → resolve brand user via `business_profiles` where `id = brand_id` → `user_id`. If no sponsorships exist, brand party is skipped. This is a best-effort lookup — DragonShare is organic content, not inherently campaign-tied, so brand discovery is opportunistic.
4. For each party with a connected Outstand account:
   a. Check `business_outstand_accounts` for platform — skip party if none
   b. Call `social-caption` with `source: 'dragonshare'`, role-specific context (creator handle, business name)
   c. Call `donny-schedule` for optimal posting time
   d. Insert draft into `donny_scheduled_posts`:
      - `user_id`: party's user ID
      - `campaign_id`: null (DragonShare is not campaign-tied)
      - `media_urls`: Creator's `screenshot_url` if available (already a full URL), otherwise `[post_url]` as link reference
      - `metadata`: `{ source: 'dragonshare_social_hook', boost_id, post_id }`
      - `status`: 'draft'
      - `ai_suggested_time`: true
      - `ai_reasoning`: 'Auto-drafted by DragonShare social hook (boost)'
   e. Insert nudge into `donny_nudges`:
      - `source_table`: 'dragonshare_boosts'
      - `source_id`: boost ID
      - `summary`: Role-specific (see Section 2)
      - `actions`: Post Now + Review Draft (navigates to role-appropriate social page)

**Error handling:** Each party wrapped in independent try/catch (same isolation pattern as `fire-campaign-social-hook`). One party failing does not block others.

---

## Section 2: Social Caption Extension & Nudge Design

### social-caption updates

The `CaptionRequest` interface gains two optional fields and relaxes `campaign_title` validation:

```typescript
interface CaptionRequest {
  campaign_title: string;       // Repurposed: accepts promotion title or post caption for non-campaign sources
  campaign_description: string;
  content_type: string;
  party_role: "restaurant" | "creator" | "brand";
  platform: string;
  user_id: string;
  source?: "campaign" | "promotion" | "dragonshare";     // NEW
  context?: Record<string, string>;                        // NEW
}
```

**Validation change:** The existing check `if (!campaign_title || !party_role || !platform || !user_id)` is relaxed — `campaign_title` becomes optional when `source` is `'promotion'` or `'dragonshare'`. The hooks pass the promotion title or DragonShare post caption in `campaign_title` for backward compatibility, but if absent, the function uses `context.title` or a generic fallback.

**Callers pass:**
- Promotion hook: `campaign_title = promotion.title`, `context = { customer_name, promotion_title }`
- DragonShare hook: `campaign_title = post.caption || 'DragonShare content'`, `context = { creator_name, business_name }`

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

## Section 3: Drafts Tab & Content Calendar

### Data source clarification

The existing `CalendarTab` and `ScheduledTab` operate on Outstand SDK `Post` objects fetched via `usePosts()` from the Outstand API. They do NOT query `donny_scheduled_posts`. These components show posts that are already scheduled or published through Outstand.

Draft posts created by the social hooks live in `donny_scheduled_posts` with `status = 'draft'`. They are not yet Outstand posts — they only become Outstand posts when a user taps "Post Now" (which calls outstand-proxy to publish, then updates the draft's status to 'published').

### New "Drafts" tab in OutstandManager

Add a "Drafts" tab to `OutstandManager.tsx` alongside the existing Calendar / Scheduled / Compose / Analytics tabs. This tab:

1. **Queries `donny_scheduled_posts`** where `status = 'draft'` and `user_id = current user`, ordered by `created_at DESC`
2. **Renders each draft as a card** showing:
   - Source badge (Campaign / UGC / DragonShare) based on `metadata.source`
   - Platform pill (Instagram, TikTok, etc.)
   - Caption preview (first 120 chars)
   - Media thumbnail (from `media_urls[0]`)
   - AI-suggested posting time (`scheduled_at`)
   - Two action buttons: "Post Now" (primary, teal) and "Edit" (secondary, outline)
3. **"Post Now" button** calls `publishDraft(draftId)` via `useDonnyContext()`, a standalone function that publishes the draft without requiring a nudge ID
4. **"Edit" button** switches to the Compose tab (pre-fill with draft content is a follow-up enhancement)
5. **Empty state**: "No drafts waiting. When you approve customer videos or get boosted, Donny will prepare posts for you here."

### Source badge component

Shared between DraftsTab and any future post cards:

| metadata.source | Badge text | Color |
|-----------------|-----------|-------|
| campaign_social_hook | Campaign | teal (bg-dc-teal/20 text-dc-teal) |
| promotion_social_hook | UGC | pink (bg-dc-pink/20 text-dc-pink-accent) |
| dragonshare_social_hook | DragonShare | yellow (bg-dc-yellow/20 text-yellow-800) |
| (no source / manual) | Manual | gray (bg-gray-100 text-gray-600) |

### Draft count badge on tab

The "Drafts" tab label shows a count badge when drafts exist (e.g., "Drafts (3)"), using the same query count. This draws attention to pending drafts.

### Navigation from nudges

Update nudge `navigate` payloads in all three hooks to use the correct routes:
- Business: `/dashboard/business/social`
- Creator: `/dashboard/creator/social`

Also fix the existing `fire-campaign-social-hook` which currently uses non-existent `/dashboard/creator/content-calendar` and `/dashboard/business/content-calendar` routes.

### CalendarTab and ScheduledTab — no changes

These continue to show only Outstand posts. Once a draft is published via "Post Now", it appears in these views naturally (because it becomes an Outstand post). No source filter chips or merged data sources needed — the Drafts tab handles the pre-publish view cleanly.

---

## Section 4: social_post_log Migration & Population

### Migration: extend post_type CHECK constraint

The existing `social_post_log` table (migration `20260509100001`) has a CHECK constraint limiting `post_type` to `('amplification', 'cross_post', 'standalone', 'campaign')`. The new sources require expanding this.

**New migration** (`20260510200000_extend_social_post_log_post_type.sql`):
```sql
ALTER TABLE social_post_log
  DROP CONSTRAINT IF EXISTS social_post_log_post_type_check;

ALTER TABLE social_post_log
  ADD CONSTRAINT social_post_log_post_type_check
  CHECK (post_type IN ('amplification', 'cross_post', 'standalone', 'campaign', 'ugc_promotion', 'dragonshare'));
```

### DonnyProvider post_type mapping

The `post_now` handler in `DonnyProvider.tsx` reads `metadata.source` from the `donny_scheduled_posts` draft row and maps it to `post_type` for `social_post_log`:

| metadata.source | post_type |
|-----------------|-----------|
| campaign_social_hook | campaign |
| promotion_social_hook | ugc_promotion |
| dragonshare_social_hook | dragonshare |
| (anything else) | standalone |

The `campaign_id` field on the log row comes from the draft's `campaign_id` column (populated for campaign posts, null for UGC/DragonShare since those are not campaign-tied).

This makes `social_post_log` the single audit trail for all platform-published posts, enabling future analytics and Donny insights.

---

## Files Changed

### New files
| File | Purpose |
|------|---------|
| `supabase/functions/fire-promotion-social-hook/index.ts` | UGC approval → social draft + nudge |
| `supabase/functions/fire-dragonshare-social-hook/index.ts` | DragonShare boost → triple-post drafts + nudges |
| `supabase/migrations/20260510200000_extend_social_post_log_post_type.sql` | Extend post_type CHECK constraint |
| `src/components/outstand/DraftsTab.tsx` | New tab showing donny_scheduled_posts drafts with Post Now / Edit |

### Modified files
| File | Change |
|------|--------|
| `supabase/functions/social-caption/index.ts` | Add `source` and `context` fields, source-specific prompt logic, relax validation |
| `src/hooks/usePromotions.ts` | Call `fire-promotion-social-hook` on approval (inside `if (status === 'approved')` block) |
| `supabase/functions/boost-payment/index.ts` | Call `fire-dragonshare-social-hook` after successful boost |
| `src/pages/OutstandManager.tsx` | Add "Drafts" tab with count badge |
| `src/contexts/DonnyProvider.tsx` | Read `metadata.source` from draft, map to `post_type` in social_post_log insert |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Fix navigate routes to `/dashboard/{role}/social` |

### No changes needed
| File | Reason |
|------|--------|
| `donny_scheduled_posts` table | `metadata` JSONB column and nullable `campaign_id` already exist |
| `donny_nudges` table | Existing schema supports all needed fields |
| `outstand-proxy` edge function | Already supports POST /posts for publishing |
| `DonnyProvider.tsx` post_now handler | Already works for any draft (just needs post_type mapping) |
| `CalendarTab.tsx` / `ScheduledTab.tsx` | Continue showing Outstand posts only; drafts handled by new DraftsTab |

---

## Out of Scope

- Social API direct integration (Meta, TikTok, YouTube, X) — handled by Outstand proxy
- Customer-facing social prompts (customers who submit UGC videos are not prompted to post)
- New frontend routes or pages (DraftsTab is a tab within existing OutstandManager)
- Brand role dashboard (brands use existing routes)
- Merging donny_scheduled_posts into CalendarTab/ScheduledTab data sources (clean separation via DraftsTab)
