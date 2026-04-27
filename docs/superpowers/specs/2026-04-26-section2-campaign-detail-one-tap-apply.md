# Section 2: Campaign Detail Rebuild + One-Tap Apply with Donny

**Date:** 2026-04-26
**Playbook prompts:** P1.2, P1.3
**Status:** Design approved, ready for implementation

---

## Overview

Two changes that transform the creator-side campaign experience:

1. **P1.2** — Rebuild the Campaign Detail view to show the full brief, visual references, deliverables breakdown, and business context. Creators currently can't make informed apply decisions because critical data is hidden.
2. **P1.3** — Replace the 4-field application form with a one-tap "Apply with Donny" flow. Donny auto-fills rate, dates, portfolio sample, and drafts a pitch via Claude API. Legacy form stays behind "Edit details" for power users.

**North Star:** Less typing, more value. The creator goes from reading a full brief to submitting an application in one tap.

---

## P1.2 — Campaign Detail Rebuild

### Approach

Enhance existing `CreatorCampaignDetails.tsx` as orchestrator. Add 10 new/enhanced section components. Enhance `useCampaignDetail` hook to fetch match scores and business profile data.

### Data Layer Changes

**Enhanced `useCampaignDetail` hook** — add fetches for:
- `campaign_matches` WHERE campaign_id + creator_id → `match_score`
- `business_profiles` joined via `campaigns.user_id` → `profiles.id` → `business_profiles.user_id`
- Application count: `campaign_applications` COUNT WHERE campaign_id

**Field mappings (playbook → actual DB):**
| Playbook term | Actual field/table |
|---|---|
| Cover image (type='cover') | `campaign_media.media_type = 'reference_image'` or `'ai_preview'` (use existing `getCoverImageUrl()` fallback chain) |
| Reference media (type='reference') | `campaign_media.media_type IN ('reference_image', 'reference_video')` |
| Raw footage (type='footage') | `campaign_media.media_type = 'raw_footage'` |
| rate_per_post | `creator_profiles.base_rate_per_hour` |
| Match score | `campaign_matches.match_score` (0-100) |

### Section Components (top → bottom)

#### 1. CampaignHero (enhanced)
- **File:** `src/components/campaign-details/CampaignHero.tsx` (modify existing)
- Cover image from `campaign_media` (reference_image or ai_preview), business logo fallback
- Campaign title (from `campaigns.title`)
- Business name + verified badge
- Distance from creator (haversine via `calculateDistance()` from `campaignUtils.ts`)
- Posted timestamp (`getRelativeTime()`) + applicant count
- **No stock photos** — gradient fallback if no media exists

#### 2. CampaignMetricsBar (new)
- **File:** `src/components/campaign-details/CampaignMetricsBar.tsx`
- Budget range in teal: "$200 - $500" (from `budget_min`/`budget_max`, or `fixed_price`)
- Deliverable count: "3 deliverables" (from `campaign_deliverables` COUNT)
- Delivery tier badge with icon:
  - DragonDash (dragon emoji, teal bg) — "1-3 hours"
  - Express (rocket emoji, pink bg) — "24-48 hours"
  - Standard (calendar emoji, gray bg) — "5-7 days"
- Match score pill: "85% Match" (teal pill, from `campaign_matches.match_score`)
- Sticky below header on scroll

#### 3. CampaignBriefSection (new)
- **File:** `src/components/campaign-details/CampaignBriefSection.tsx`
- Full `campaigns.description` (Donny AI's generated brief)
- Goals as bullet list (split `campaigns.goals` by comma/newline)
- Tone & style notes (`campaigns.style`, `campaigns.tone`)
- Target audience (`campaigns.target_creator_personas` as pills)

#### 4. CampaignReferencesGallery (new)
- **File:** `src/components/campaign-details/CampaignReferencesGallery.tsx`
- Horizontal scroll of thumbnails from `campaign_media` WHERE `media_type IN ('reference_image', 'reference_video')`
- Tap to open lightbox (full-size image/video)
- Use existing `useCampaignDetail` hook's `referenceMedia` data
- Hide section entirely if no reference media exists

#### 5. CampaignFootageSection (new, conditional)
- **File:** `src/components/campaign-details/CampaignFootageSection.tsx`
- Only renders if `useCampaignDetail.hasRawFootage === true`
- Badge: camera emoji + "Raw footage provided"
- Subtext: "The business has uploaded footage you can use"
- Thumbnail grid (viewable inline)
- Download locked until application accepted (UI-enforced with tooltip)

#### 6. CampaignDeliverablesBreakdown (new)
- **File:** `src/components/campaign-details/CampaignDeliverablesBreakdown.tsx`
- Numbered list from `campaign_deliverables` table (via `useCampaignDetail.deliverables`)
- Each row: type icon (camera/video/carousel) + platform + content_type + description
- Example: "1. Photo (Instagram) — Hero shot of new burger, golden hour"
- Falls back to `campaigns.deliverables` string array if no `campaign_deliverables` rows

#### 7. CampaignTimeline (new)
- **File:** `src/components/campaign-details/CampaignTimeline.tsx`
- Delivery tier with countdown from `campaigns.deadline`
- DragonDash: "Due 1-3 hours after acceptance"
- Express: "Due 48 hours after acceptance"
- Standard: "Due in 5-7 days"
- Show deadline date if set

#### 8. CampaignBudgetDetail (new)
- **File:** `src/components/campaign-details/CampaignBudgetDetail.tsx`
- Total budget (`budget_min` - `budget_max`, or `fixed_price`)
- Per-deliverable breakdown if `campaign_deliverables` has pricing data
- "Payment via Stripe upon approval" footnote

#### 9. BusinessProfileStrip (new)
- **File:** `src/components/campaign-details/BusinessProfileStrip.tsx`
- Business name, location, average rating (stars)
- "View Business Profile" link → `/business/:slug` or `/business/:id`
- Completed campaigns count badge
- Business logo/avatar with teal ring

#### 10. StickyApplyCTA (new)
- **File:** `src/components/campaign-details/StickyApplyCTA.tsx`
- Fixed at bottom of viewport, above any bottom nav
- Single button: "Apply with Donny" (teal, full-width, 56px height, rounded-full)
- Shows different states: "Applied (Pending)" if already applied, "View Project" if accepted
- Tapping opens the P1.3 one-tap flow

### Protect
- Do NOT modify business-side campaign creation flow
- Do NOT modify campaign_media / campaign_deliverables schemas
- Preserve all `lg:` desktop Tailwind classes
- Mobile-first: no horizontal scroll at 375px, all touch targets >= 44px

---

## P1.3 — One-Tap "Apply with Donny"

### New Supabase Migration: `donny_events` table

**File:** `supabase/migrations/[timestamp]_create_donny_events.sql`

```sql
CREATE TABLE IF NOT EXISTS donny_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  campaign_id uuid REFERENCES campaigns(id),
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE donny_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own events"
  ON donny_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own events"
  ON donny_events FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_donny_events_user ON donny_events(user_id);
CREATE INDEX idx_donny_events_campaign ON donny_events(campaign_id);
```

### New Edge Function: `donny-apply-pitch`

**File:** `supabase/functions/donny-apply-pitch/index.ts`

**Input:** `{ creator_id: string, campaign_id: string }`

**Logic:**
1. Fetch creator's profile (name, base_rate_per_hour, portfolio_urls, skills, average_rating)
2. Fetch creator's last 3 successful campaign deliveries (same content_type if possible)
3. Fetch campaign brief (title, description, goals, budget_min, budget_max, content_types from deliverables)
4. Call Claude Sonnet 4 with system prompt:
   > "You are Donny. Write a 1-sentence pitch (max 25 words) from this creator to this business explaining why they're a great fit. Plain text only. No emoji. No greeting. No signoff."
5. Calculate suggested_rate: creator's `base_rate_per_hour` clipped to campaign `budget_min`/`budget_max`. If no creator rate, use `budget_min`.
6. Select best portfolio piece: match `portfolio_urls` against campaign's first `content_type`. Fallback to first URL.

**Output:** `{ pitch: string, suggested_rate: number, suggested_portfolio_piece_url: string | null }`

**Timeout fallback (>5s):** Return deterministic pitch: "[Creator name] — [skill] specialist with [rating] rating, ready to deliver." Use template rate and first portfolio URL.

**Error fallback:** Same template approach. Never block on Donny failure.

### Frontend Components

#### OneTopApplySheet
- **File:** `src/components/campaigns/OneTopApplySheet.tsx`
- Bottom sheet (slide up from bottom, 60% viewport height)
- Loading state while `donny-apply-pitch` runs (skeleton with "Donny is preparing your application...")
- Shows 4 lines when ready:
  - Rate: `$250` (from suggested_rate)
  - When: `Tonight, ready by 10pm` (earliest availability matching delivery tier)
  - Sample: thumbnail of selected portfolio piece
  - Pitch: the generated pitch text in quotes
- Two buttons:
  - "Looks good — Send" (teal, full-width, default)
  - "Edit details" (outlined, opens legacy `CampaignApplyForm` pre-filled with Donny's suggestions)
- Track "Edit details" taps in `donny_events` as `{ event_type: 'apply_edit_details' }`

#### ApplyConfirmation
- **File:** `src/components/campaigns/ApplyConfirmation.tsx`
- Full-screen overlay with checkmark animation (CSS keyframes, no external lib)
- Text: "Application sent! [Business name] will respond within 24h. We'll ping you here and on push notifications."
- Two CTAs:
  - "Browse more campaigns" (teal) → navigate to `/dashboard/creator/campaigns`
  - "View my applications" (outlined) → navigate to `/dashboard/creator/campaigns` with Applied tab

#### useDonnyApplyPitch hook
- **File:** `src/hooks/useDonnyApplyPitch.ts`
- Calls `supabase.functions.invoke('donny-apply-pitch', { body: { creator_id, campaign_id } })`
- Returns `{ data, isLoading, error, mutateAsync }`
- 5-second client-side timeout with template fallback
- Logs pitch generation to `donny_events` on success

### Application Submission Flow

1. Creator taps "Apply with Donny" → `OneTopApplySheet` opens
2. Hook calls `donny-apply-pitch` edge function
3. Sheet populates with Donny's suggestions
4. Creator taps "Looks good — Send"
5. Insert into `campaign_applications`:
   ```typescript
   {
     campaign_id,
     creator_id: user.id,
     intro_message: pitch,
     proposed_rate: suggested_rate,
     proposed_timeline: calculated_date_from_delivery_tier,
     portfolio_url: suggested_portfolio_piece_url
   }
   ```
6. Log to `donny_events`: `{ event_type: 'apply_with_donny', campaign_id, payload: { used_edit: false, pitch_source: 'claude' | 'template' } }`
7. Update `campaign_invitations` status to 'accepted' if creator was invited
8. Send email notification to campaign owner
9. Show `ApplyConfirmation` overlay
10. Invalidate React Query caches

### Error Handling
- Network/Supabase failure: inline retry banner in the sheet, NOT destroyed state
- Donny timeout (>5s): template fallback, proceed normally
- Edge function down: client-side template generation, proceed normally

### Protect
- Do NOT remove legacy `CampaignApplyForm` — keep behind "Edit details"
- Do NOT modify `campaign_applications` schema
- Preserve all `lg:` desktop classes
- Track edit-rate as a metric via `donny_events`

---

## Verification Plan

### P1.2 Checks
- [ ] `npm run build` passes
- [ ] Campaign detail renders all 10 sections with real data
- [ ] Sections hide gracefully when data is missing (no empty boxes)
- [ ] Mobile 375px: no horizontal overflow, touch targets >= 44px
- [ ] Sticky Apply CTA doesn't overlap content
- [ ] Business profile strip links to business profile page

### P1.3 Checks
- [ ] Tap "Apply with Donny" → sheet opens, Donny generates pitch
- [ ] "Looks good — Send" inserts application successfully
- [ ] "Edit details" opens legacy form pre-filled with Donny's values
- [ ] Confirmation animation shows, CTAs navigate correctly
- [ ] Template fallback works when edge function is unavailable
- [ ] `donny_events` table has event rows for each action
- [ ] `campaign_applications` row has Donny-generated values
- [ ] Application status badge updates after applying

---

## Files Changed/Created Summary

### New Files
- `src/components/campaign-details/CampaignMetricsBar.tsx`
- `src/components/campaign-details/CampaignBriefSection.tsx`
- `src/components/campaign-details/CampaignReferencesGallery.tsx`
- `src/components/campaign-details/CampaignFootageSection.tsx`
- `src/components/campaign-details/CampaignDeliverablesBreakdown.tsx`
- `src/components/campaign-details/CampaignTimeline.tsx`
- `src/components/campaign-details/CampaignBudgetDetail.tsx`
- `src/components/campaign-details/BusinessProfileStrip.tsx`
- `src/components/campaign-details/StickyApplyCTA.tsx`
- `src/components/campaigns/OneTopApplySheet.tsx`
- `src/components/campaigns/ApplyConfirmation.tsx`
- `src/hooks/useDonnyApplyPitch.ts`
- `supabase/functions/donny-apply-pitch/index.ts`
- `supabase/migrations/[timestamp]_create_donny_events.sql`

### Modified Files
- `src/components/campaign-details/CampaignHero.tsx` — add cover image, distance, applicant count
- `src/components/campaign-details/CreatorCampaignDetails.tsx` — orchestrate new sections
- `src/hooks/useCampaignDetail.ts` — add match score, business profile, app count fetches
- `src/pages/CampaignDetailsPage.tsx` — wire sticky CTA and one-tap flow
- `src/integrations/supabase/types.ts` — add donny_events types (after migration)
