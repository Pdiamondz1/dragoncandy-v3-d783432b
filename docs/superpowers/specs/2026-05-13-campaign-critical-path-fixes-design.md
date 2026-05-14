# Campaign-to-Content Delivery System: Critical Path Fixes & UX Overhaul

> Design spec for fixing the end-to-end campaign lifecycle and simplifying the experience for non-technical users.

## Problem Statement

The campaign lifecycle has critical bugs that prevent the end-to-end flow from working: Restaurants can't see Creator-uploaded content (RLS + missing component), Creators can't respond to counter offers (data fetching gap), Stripe charges the wrong amount during negotiations (edge function ignores agreed price), and messaging doesn't deliver reliably (notification filter too restrictive). Beyond bugs, the campaign creation UX exposes unnecessary fields and unclear deliverables.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Deliverables model | Donny generates, Restaurant adjusts | North Star: less typing. Non-technical users shouldn't pick content types. |
| Post scheduling | After content approval | Reduces campaign creation friction. Donny suggests optimal times. |
| Counter offer Accept button | Hide while counter pending | Eliminates ambiguity — only counter offer actions visible during negotiation. |
| Stripe sandbox guard | TEST MODE banner + test card helper | Visible but not blocking — users can still complete checkout. |
| Creator-per-campaign | One (multiple apply, pick one) | Simplifies delivery. Campaign closes to applications after hire. |
| Budget model | Single proposed budget (not range) | Simpler mental model. Counter offers handle negotiation. |

---

## Phase 1: Critical Path Fixes

### 1.1 Content Visibility for Restaurant

**Root causes:**

**(A) RLS policy blocks cross-user file access.**
Current policy on `file_uploads`: `uploaded_by = auth.uid()`. Restaurant (campaign owner) is blocked from SELECT on Creator's uploads.

New migration adds two policies:
- Campaign owner can view deliverables: `EXISTS (SELECT 1 FROM campaigns WHERE id = campaign_id AND user_id = auth.uid())`
- Collaborator can view campaign files: `EXISTS (SELECT 1 FROM campaign_collaborations WHERE campaign_id = file_uploads.campaign_id AND creator_id = auth.uid())`

**(B) CampaignContentGallery component never rendered.**
Component exists at `src/components/campaigns/CampaignContentGallery.tsx` but is imported nowhere. Render in:
- `src/pages/BrandCampaignDetails.tsx` (Restaurant view)
- `src/components/my-campaigns/ActivePhaseView.tsx` (Creator view)

**(C) No Realtime subscription for new uploads.**
`src/hooks/useCampaignContentGallery.ts` — add Supabase Realtime channel on `file_uploads` filtered by `campaign_id`, invalidate query on INSERT.

### 1.2 Counter Offer Flow

**Root causes:**

**(A) Creator can't act on counter offers.**
`src/components/applications/DetailedApplicationCard.tsx` lines 47-49, 181-210. Action buttons render conditionally on `application.status === 'counter_offered' && latestPendingOffer`. Investigate whether `useCounterOffers` returns data for the Creator role. Fix: ensure query fetches by `application_id` regardless of role.

**(B) Stripe charges original budget, not agreed counter offer amount.**
`supabase/functions/create-campaign-escrow/index.ts` lines 68-71. Edge function reads price from campaign table, ignoring counter offers. Fix: query `application_counter_offers` for accepted offer → use `proposed_rate`. Fall back to `application.proposed_rate` or campaign budget.

**(C) Accept button confusion during negotiation.**
`src/components/campaigns/ApplicationCard.tsx` lines 247-289. When any counter offer has `status === 'pending'`, hide Accept/Reject buttons. Show only counter offer response actions. Accept reappears at agreed price after resolution.

### 1.3 Messaging Delivery

**Root causes:**

**(A) Notification filter too restrictive.**
`src/hooks/useNotifications.ts` lines 479-481. Subscription filters `recipient_id=eq.${user.id}` which misses campaign messages where recipient_id may be null. Fix: broaden filter or use client-side filtering after receiving all relevant messages.

**(B) Campaign conversations not appearing in sidebar.**
`get_user_conversations` RPC depends on `sender_id` or `recipient_id` matching. Fix: ensure `useSendMessage` always sets `recipient_id`. For campaign context, derive recipient from collaboration partner.

**(C) No message delivery validation.**
`src/hooks/useMessageMutations.ts` lines 26-41. `recipient_id` can be null. Fix: validate it's set for all messages; auto-derive from collaboration if not provided.

### 1.4 AI Matching

Investigate `supabase/functions/match-creators/index.ts` — verify it's invoked, check for profile completeness filters, check scoring thresholds. Add graceful degradation: show partial matches at lower scores, "No creators yet — browse All Creators" fallback.

### 1.5 All Creators — Invite + Pagination

Add "Invite" button per creator card in All Creators tab (reuse `useInviteCreator` from AI Matches). Paginate at 10 per page with "Load More".

### 1.6 Stripe Test Mode

New `StripeTestModeHelper` component: yellow TEST MODE banner + expandable test card section with copy buttons (Visa 4242, Mastercard 5555, Decline 4000, Connect routing/account). Display before Stripe Checkout redirect.

### 1.7 Creator Sees Updated Campaign Details

Add Realtime subscription on `campaigns` table in Creator's campaign detail hook. Invalidate cache on UPDATE.

### 1.8 Notifications Audit

Verify all lifecycle events fire: application received, counter offer sent, application accepted, content submitted, content approved/revision, message sent, campaign invitation.

---

## Phase 2: Campaign UX Overhaul

### 2.1 Single Proposed Budget
Replace `budget_min`/`budget_max` with single `proposed_budget` column. UI shows one input. Backward compat: read `proposed_budget` first, fall back to `budget_min`.

### 2.2 Remove Unused Fields
Hide from all UI: `per_creator_cap`, `usage_rights_days`, `exclusivity_days`, `target_creator_count`. Keep database columns.

### 2.3 One Creator Per Campaign
On acceptance: set `accepting_applications = false`. Auto-decline pending applications with notification. Show "Position Filled" badge. Disable Apply button.

### 2.4 Donny-Generated Deliverables
Enhance `donny-campaign-generate` to output structured deliverables. Show as cards with content type icon + platform badge + description + remove. "Add Content" button. Summary line with total count.

### 2.5 Posting Urgency
Replace raw deadline picker with urgency selector: This weekend / Next week / Within 2 weeks / Flexible. Maps to deadline + tier suggestion. Override with specific date available.

### 2.6 Post-Approval Auto-Scheduling
Wire `fire-campaign-social-hook` trigger on content approval. Donny nudge to Restaurant. Drafts appear in OutstandManager Drafts tab.

### 2.7 Campaign Reuse
Surface `useDuplicateCampaign()`: Re-Launch button on completed campaigns, Re-Hire with auto-invitation, Templates section on creation page.

---

## Implementation Order

Phase 1: 1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6 → 1.7 → 1.8
Phase 2: 2.2 → 2.1 → 2.3 → 2.4 → 2.5 → 2.6 → 2.7
