# Social Integration Audit & Prerequisite Enforcement

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce three prerequisites (profile completion, Outstand social account, Stripe setup) before any revenue-generating action, and wire post-campaign auto-scheduling + prompt-to-post so approved content flows seamlessly to connected social accounts.

**Architecture:** A reusable `PrerequisiteGate` component backed by a `usePrerequisiteStatus` hook. The gate wraps each gated feature and renders a branded checklist blocker when requirements are unmet. Post-campaign social publishing extends the existing `fire-campaign-social-hook` Stage 4 flow to auto-draft scheduled posts and surface a high-priority Donny nudge.

**Tech Stack:** React + TypeScript, Tailwind CSS, Supabase (Postgres, Edge Functions), React Query, Outstand API (via `outstand-proxy` edge function), existing Donny nudge system.

---

## 1. Audit Findings

### 1.1 Missing Prerequisite Enforcement

No hard gate currently prevents users from taking revenue-generating actions with incomplete setup. The only existing gates are authentication (`ProtectedRoute`), email verification (`VerifiedRoute`), role routing (`BusinessRoute`/`BrandRoute`), and a late-stage `PayoutGate` that blocks payouts but not campaign entry.

| Feature | Current enforcement | Gap |
|---|---|---|
| Campaign creation (3 wizards) | Auth only | No profile, social, or Stripe check |
| DragonShare | Monthly submission limit | No profile, social, or Stripe check |
| Promotions tool | Auth + role only | No profile, social, or Stripe check |
| Campaign application | Campaign status + duplicate check | No profile, social, or Stripe check |
| Campaign sponsorship | Auth + role only | No profile, social, or Stripe check |

### 1.2 Social Media Integration Gaps

- Profile URL fields (`instagram_url`, etc.) and Outstand-connected accounts are disconnected systems with no cross-validation.
- `campaign_social_hooks` infrastructure exists (5-stage system, `triple_post_sessions`, `fire-campaign-social-hook` edge function) but Stage 4 (content approved) creates records without pushing content to Outstand for actual posting.
- No "Post Now" or auto-schedule flow after content approval — users are prompted but must manually compose and post.
- Creators can accept campaigns for platforms they have no connected account on.

### 1.3 Content Delivery Flow

- Content submission, approval, and revision flows work (`CreatorContentSubmit`, `ContentApprovalPanel`, `RevisionRequestModal`).
- `PayoutGate` only fires at payout time, not at campaign entry. Users discover Stripe setup is required only after completing all deliverable work.
- `bulk-download-campaign-content` edge function exists as a manual fallback for downloading approved content.

---

## 2. Prerequisite Gate System

### 2.1 Prerequisites

All three roles (Content Creator, Restaurant/Business, Brand) must satisfy these before accessing gated features:

| # | Prerequisite | Creator check | Business/Brand check |
|---|---|---|---|
| 1 | Complete your profile | `creator_profiles`: `creator_name` + `bio` + `avatar_url` all non-null/non-empty | `business_profiles`: `business_name` + `description` + `logo_url` all non-null/non-empty |
| 2 | Connect a social media account | At least 1 row in `business_outstand_accounts` for this `user_id` | Same |
| 3 | Setup Stripe account | Via `check-prerequisite-status` RPC (see 2.3) — `stripe_onboarding_complete` column is not SELECT-able from the client due to column-level security | Same |

### 2.2 Gated Features

| Feature | Files affected | Gate placement |
|---|---|---|
| Create Campaign | `CampaignCreator.tsx`, `CampaignWizard.tsx`, `BrandCreateCampaign.tsx` | Wrap main content area |
| DragonShare | `CreatorDragonShare.tsx`, `BusinessDragonShare.tsx` | Wrap page content |
| Promotions | `BusinessPromotionalTools.tsx`, `PromotionSubmissionPage.tsx` | Wrap page content |
| Apply for Campaign | `CampaignDetailsPage.tsx` | Wrap apply button/form only (not the whole page — creators must still browse campaigns) |
| Sponsor Campaign | `BrandSponsorships.tsx`, `BusinessSponsorships.tsx`, `BusinessProposals.tsx` | Wrap page content |

### 2.3 `usePrerequisiteStatus` Hook

**File:** `src/hooks/usePrerequisiteStatus.ts`

Queries a single `SECURITY DEFINER` RPC function `check_prerequisite_status(p_user_id UUID)` that returns all three statuses in one call. This is necessary because `stripe_onboarding_complete` has had SELECT revoked from `anon` and `authenticated` roles (column-level security). The RPC runs as the function owner, reads the profile table and `business_outstand_accounts`, and returns a JSON object.

**New RPC function** (`check_prerequisite_status`):
```sql
CREATE OR REPLACE FUNCTION check_prerequisite_status(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  v_role TEXT;
BEGIN
  -- Determine role from profiles
  SELECT role INTO v_role FROM profiles WHERE id = p_user_id;

  IF v_role = 'content_creator' THEN
    SELECT jsonb_build_object(
      'role', v_role,
      'profile_complete', (creator_name IS NOT NULL AND creator_name != '' AND bio IS NOT NULL AND bio != '' AND avatar_url IS NOT NULL AND avatar_url != ''),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM creator_profiles WHERE id = p_user_id;
  ELSE
    SELECT jsonb_build_object(
      'role', COALESCE(account_type, 'business_client'),
      'profile_complete', (business_name IS NOT NULL AND business_name != '' AND description IS NOT NULL AND description != '' AND logo_url IS NOT NULL AND logo_url != ''),
      'stripe_complete', COALESCE(stripe_onboarding_complete, false)
    ) INTO result FROM business_profiles WHERE id = p_user_id;
  END IF;

  -- Check Outstand connected accounts
  result = result || jsonb_build_object(
    'social_connected', EXISTS(SELECT 1 FROM business_outstand_accounts WHERE user_id = p_user_id)
  );

  RETURN COALESCE(result, '{"profile_complete":false,"social_connected":false,"stripe_complete":false}'::jsonb);
END;
$$;
```

The hook calls this via `supabase.rpc('check_prerequisite_status', { p_user_id: user.id })`.

```typescript
interface PrerequisiteItem {
  key: 'profile' | 'social' | 'stripe';
  met: boolean;
  label: string;       // Human-readable status text
  actionLabel: string;  // CTA button text (e.g., "Complete Profile")
  actionPath: string;   // Navigation target
}

interface PrerequisiteStatus {
  isLoading: boolean;
  items: PrerequisiteItem[];
  allMet: boolean;
  role: 'content_creator' | 'business_client' | 'brand';
}
```

**Caching:** `staleTime: 30_000` (30s) so the gate responds near-instantly when a user completes a step and navigates back. Query keys include `user.id` for cache isolation.

**Navigation targets for unmet items:**
- Profile incomplete → `/dashboard/creator/settings` or `/dashboard/business/settings`
- Social not connected → `/dashboard/creator/outstand` or `/dashboard/business/outstand`
- Stripe not setup → `/dashboard/creator/settings` (Stripe section) or `/dashboard/business/settings` (payment section)

### 2.4 `PrerequisiteGate` Component

**File:** `src/components/PrerequisiteGate.tsx`

**Props:**
```typescript
interface PrerequisiteGateProps {
  feature: string;   // For display text: "create a campaign", "use DragonShare", etc.
  children: ReactNode;
  inline?: boolean;  // When true, renders inline blocker instead of full-page (used for apply button)
}
```

**Rendering logic:**
- `isLoading` → Spinner (matches existing `Loader2` pattern)
- `allMet` → render `children`
- `!allMet` → render checklist blocker

**Checklist blocker UI (full-page mode):**
- White card, `rounded-2xl`, centered with `max-w-md mx-auto`, consistent with existing card patterns
- Header: "Almost there!" with sparkle icon (teal)
- Subheader: "Complete these steps to [feature]"
- 3 checklist rows, each with:
  - Left: teal checkmark circle (met) or gray empty circle (unmet)
  - Center: requirement name + status label
  - Right: teal pill button with `actionLabel` for unmet items → navigates to `actionPath`
- First unmet item gets a prominent full-width teal CTA at the bottom: "[actionLabel] to get started"

**Checklist blocker UI (inline mode, for campaign apply):**
- Compact card replacing the apply button area
- Same 3 checklist items in a smaller format
- Single CTA linking to the first unmet prerequisite

---

## 3. Post-Campaign Auto-Scheduling & Prompt-to-Post

### 3.1 Trigger

When content is approved and `fire-campaign-social-hook` fires for Stage 4 (content approved), in addition to the existing `triple_post_sessions` and `campaign_social_hooks` records, it now also:

1. **Auto-drafts a scheduled post** per party (restaurant, creator, brand) that has an Outstand-connected account
2. **Creates a Donny nudge** per party with "Post Now" and "Review Draft" actions

### 3.2 Auto-Draft Scheduled Post

After creating the `campaign_social_hooks` record for each party:

1. Query `business_outstand_accounts` for the party's `user_id` to get their connected platform(s)
2. Query approved deliverable media URLs from `file_uploads` joined with `campaign_deliverables` (deliverables define content specs; `file_uploads` stores the actual submitted media with `storage_path` pointing to Supabase Storage)
3. Generate an AI caption via Haiku (model routing: `social-caption` at T1) tailored to the party's role:
   - Restaurant: promotional tone, location context, call-to-action
   - Creator: personal/authentic tone, creator credit, branded hashtags
   - Brand: amplification tone, sponsor messaging, campaign hashtags
4. Call `donny-schedule` with `action: 'suggest_times'` for the party's primary platform
5. Insert into `donny_scheduled_posts`:
   - `status: 'draft'`
   - `caption`: AI-generated
   - `media_urls`: approved deliverable URLs
   - `platform`: from Outstand-connected account
   - `content_type`: derived from the campaign deliverable's `content_type` (e.g., `'photo'`, `'reel'`, `'story'`) — this is a required NOT NULL column
   - `scheduled_at`: AI-suggested optimal time
   - `campaign_id`: linked campaign
   - `ai_suggested_time: true`
   - `metadata: { source: 'campaign_social_hook', stage: 4, hook_id: <id> }`

### 3.3 Donny Nudge (Prompt-to-Post)

For each party, insert a `donny_nudges` record:

- `type: 'content'` (uses existing CHECK constraint value — `campaign_content_ready` is not in the allowed set)
- `priority: 'high'`
- `source_table: 'campaign_social_hooks'`
- `source_id: <hook_id>` (required NOT NULL, part of dedup unique index)
- `summary: 'Your campaign content is ready to share!'`
- `actions` (matches existing `NudgeAction` interface in `src/types/donnyNudge.ts`):
  1. `{ label: 'Post Now', variant: 'primary', action: 'post_now', payload: { scheduled_post_id, campaign_id } }`
  2. `{ label: 'Review Draft', variant: 'secondary', action: 'navigate', payload: { route: '/dashboard/[role]/content-calendar' } }`

**"Post Now" handler** (client-side, in `DonnyProvider.tsx` `executeAction` handler — action dispatch is centralized there, not in the presentational `DonnyNudgeCard`):
1. Read the `donny_scheduled_posts` entry by `scheduled_post_id`
2. Call `outstand-proxy` with `POST /v1/posts` using the draft's caption, media, and platform
3. Update `donny_scheduled_posts.status` to `'published'` and set `published_at`
4. Log to `social_post_log` with `post_type: 'campaign'` and `outstand_post_id` from the Outstand API response (required NOT NULL column)
5. Mark the nudge as `acted_at`
6. Show success toast: "Posted to [platform]!"

**"Review Draft" handler**: Navigates to the user's content calendar / scheduled posts page where they can edit the caption, change the time, or publish.

### 3.4 Edge Function Changes

**`fire-campaign-social-hook/index.ts`** — extend Stage 4 handler:
- After existing `campaign_social_hooks` + `triple_post_sessions` inserts
- Add: query Outstand accounts, generate caption, call `donny-schedule`, insert nudge
- Error handling: if auto-draft fails, log warning but don't fail the hook — the existing prompt system remains as fallback

**New edge function: `social-caption/index.ts`** (if not already exists):
- Model: Haiku (T1, `social-caption` routing key already in `model-routing.ts`)
- Input: campaign title, description, deliverable type, party role, platform
- Output: caption text + array of suggested hashtags
- Max tokens: 512

### 3.5 Prerequisite Gate Connection

Because the gate enforces Outstand account connection before any campaign action, by the time content is approved and Stage 4 fires, all parties are guaranteed to have at least one connected social account. No "connect your account first" dead-end at posting time.

---

## 4. File Inventory

### New Files

| File | Purpose |
|---|---|
| `src/hooks/usePrerequisiteStatus.ts` | Hook checking 3 prerequisites via `check_prerequisite_status` RPC |
| `src/components/PrerequisiteGate.tsx` | Gate component rendering checklist or children |
| `supabase/migrations/YYYYMMDD_check_prerequisite_status.sql` | `SECURITY DEFINER` RPC function for prerequisite checks |
| `supabase/functions/social-caption/index.ts` | AI caption generation edge function (Haiku T1) |

### Modified Files

| File | Change |
|---|---|
| `src/pages/CampaignCreator.tsx` | Wrap with `<PrerequisiteGate feature="create a campaign">` |
| `src/pages/CampaignWizard.tsx` | Wrap with `<PrerequisiteGate feature="create a campaign">` |
| `src/pages/BrandCreateCampaign.tsx` | Wrap with `<PrerequisiteGate feature="create a campaign">` |
| `src/pages/CreatorDragonShare.tsx` | Wrap with `<PrerequisiteGate feature="use DragonShare">` |
| `src/pages/BusinessDragonShare.tsx` | Wrap with `<PrerequisiteGate feature="use DragonShare">` |
| `src/pages/BusinessPromotionalTools.tsx` | Wrap with `<PrerequisiteGate feature="use Promotions">` |
| `src/pages/PromotionSubmissionPage.tsx` | Wrap with `<PrerequisiteGate feature="submit a promotion">` |
| `src/pages/CampaignDetailsPage.tsx` | Wrap apply button/form with `<PrerequisiteGate feature="apply for this campaign" inline>` |
| `src/pages/BrandSponsorships.tsx` | Wrap with `<PrerequisiteGate feature="manage sponsorships">` |
| `src/pages/BusinessSponsorships.tsx` | Wrap with `<PrerequisiteGate feature="manage sponsorships">` |
| `src/pages/BusinessProposals.tsx` | Wrap with `<PrerequisiteGate feature="manage proposals">` |
| `supabase/functions/fire-campaign-social-hook/index.ts` | Extend Stage 4: auto-draft post + create nudge |
| `supabase/functions/_shared/model-routing.ts` | Verify `social-caption` routing entry exists (already present — no-op) |
| `src/contexts/DonnyProvider.tsx` | Add `post_now` action handler in `executeAction` (action dispatch is centralized here) |

### Unchanged (Reference)

| File | Why referenced |
|---|---|
| `src/hooks/useProfileCompletion.ts` | Existing completion logic — prerequisite hook uses similar field checks but simpler (essential fields only) |
| `src/components/projects/PayoutGate.tsx` | Existing gate pattern — `PrerequisiteGate` follows the same wrapper pattern |
| `supabase/functions/_shared/cost-ledger.ts` | Cost logging for AI calls in `social-caption` |
| `supabase/functions/outstand-proxy/index.ts` | "Post Now" uses this to publish to Outstand |
| `supabase/functions/donny-schedule/index.ts` | Auto-draft uses `suggest_times` action |

---

## 5. Testing Strategy

### 5.1 Prerequisite Gate Tests

- **All unmet**: User with no profile, no social, no Stripe → all 3 items show as unmet, children not rendered
- **Partial**: User with profile complete but no social/Stripe → 1 met, 2 unmet, children not rendered
- **All met**: User with all 3 complete → children rendered, no checklist visible
- **Role-specific**: Creator checks `creator_profiles`, business checks `business_profiles`
- **Inline mode**: Apply button area shows compact gate, rest of campaign page remains visible
- **Navigation**: CTA buttons navigate to correct settings pages per role

### 5.2 Auto-Scheduling Tests

- Content approval triggers Stage 4 hook → `donny_scheduled_posts` entry created with `status: 'draft'`
- Caption generated matches party role (restaurant vs creator vs brand tone)
- Scheduled time comes from `donny-schedule suggest_times`
- Donny nudge created with correct actions and metadata

### 5.3 Prompt-to-Post Tests

- "Post Now" action → calls `outstand-proxy` → updates post status to `published` → logs to `social_post_log`
- "Review Draft" action → navigates to content calendar
- Error case: Outstand API failure → toast error, post remains in `draft` status

### 5.4 Re-Audit Verification

After implementation, verify:
1. Each of the 5 gated features shows the checklist for a user missing any prerequisite
2. No bypass paths remain (direct URL, deep link, programmatic)
3. Completing each prerequisite updates the checklist without full page reload (React Query invalidation)
4. Content approval → auto-draft + nudge fires for all parties with connected accounts
5. "Post Now" publishes successfully and logs correctly

---

## 6. Scope Boundaries

**In scope:**
- `PrerequisiteGate` component + `usePrerequisiteStatus` hook
- Integration into all 5 gated features (11 files)
- `social-caption` edge function for AI caption generation
- Extending `fire-campaign-social-hook` Stage 4 with auto-draft and nudge
- "Post Now" action handler in `DonnyProvider.tsx`

**Out of scope (deferred):**
- Donny AI MCP integration for advanced caption rewriting
- DragonDash Rush Posting premium feature
- Phase 3-4 brand amplification dashboard UI
- UGC detection and reposting automation
- Campaign eligibility filtering by connected platform (separate future work)
- Delegated posting permissions UI (infrastructure exists, no UI yet)
