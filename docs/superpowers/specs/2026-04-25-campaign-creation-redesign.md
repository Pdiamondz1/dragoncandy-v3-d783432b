# Campaign Creation Redesign — "Donny-First" (Approach B)

**Date:** 2026-04-25
**Status:** Draft
**Scope:** Campaign creation flow only (first piece of the full pipeline redesign)
**Timeline:** 3-4 weeks
**Approach:** Unified 2-screen wizard with Donny AI driving campaign generation from URL extraction

---

## Problem Statement

The current campaign creation flow has three separate wizards (Business 5-step, Brand 4-step, Anonymous 5-step) with fragmented state management, schema mismatches, missing validation, and excessive manual input. Restaurants spend 8-15 minutes typing 12-15 fields across 5 steps with high abandonment. Donny AI exists but isn't integrated into creation — it's a sidebar helper, not the driver.

## Solution Overview

Replace all 3 wizards with a single 2-screen flow where Donny is the primary interface:

- **Screen 1 ("The Drop"):** Paste a URL, drop a photo, or type a sentence. Donny extracts business context and generates campaign ideas.
- **Screen 2 ("The Launchpad"):** 3 AI-generated campaign ideas as swipeable cards. Tap one → full campaign expands inline with all fields pre-filled. Edit anything. Launch.

Target: under 2 minutes, near-zero typing.

---

## Screen 1 — "The Drop"

### Input Modes

One `SmartInput` component with three modes:

1. **Paste a URL** — Donny detects source type (Google Business, Instagram, website, Yelp) and extracts: business name, location, cuisine, photos, reviews, rating, price range, aesthetic/vibe. Extraction starts immediately on paste detection — no submit button needed.
2. **Drop a photo** — Donny uploads the image to Supabase storage, then sends the signed URL to the `donny-campaign-generate` edge function which analyzes the image via the AI model's vision capabilities and infers campaign context. Returns a `BusinessContext` with `source_type: 'photo'`.
3. **Type a sentence** — Fallback. e.g., "I'm opening a new ramen spot in Austin next month." Sent to `donny-campaign-generate` with `source_type: 'manual'`.

### Donny Personality

During extraction, Donny shows contextual commentary:
- "Checking out your Google reviews... 4.7 stars, nice!"
- "Love the food photography on your Instagram"
- "Looks like you're in Austin — great creator market there"

Placeholder text cycles through examples:
- "Paste your Google Business link..."
- "Paste your Instagram profile..."
- "Or just describe your business..."

Below the input: 3 small action chips — `📎 Paste URL` · `📸 Upload Photo` · `✏️ Type it`

### Error Handling

If the URL is inaccessible or unrecognized, Donny says "I couldn't read that link — want to try a different one, or just tell me about your business?" and gracefully falls back to text input.

---

## Screen 2 — "The Launchpad"

### Campaign Idea Cards

Top section: 3 campaign ideas. Horizontally swipeable on mobile (Tailwind `snap-x snap-mandatory` on the scroll container, `snap-center` on each card, ~85% viewport width per card, peek-showing next card edge, dot indicators). Side-by-side clickable cards on desktop.

Each card shows:
- Emoji + campaign title (e.g., "🍜 Weekend Reel Blitz")
- One-line description
- Budget range badge
- Timeline badge
- Platform icons (Instagram, TikTok, etc.)

Idea diversity enforced in AI prompt: 3 ideas cover different campaign types (e.g., UGC content pack, event-driven buzz, ongoing creator partnership).

### Regenerate Ideas

Below the idea cards: a "Regenerate" link/button. Behavior:
- Re-calls `donny-campaign-generate` with the same `BusinessContext`
- Replaces all 3 idea cards with new results
- Clears any selected idea and editor state
- Shows Donny loading state with commentary: "Let me think of something different..."
- User edits to a previously selected idea are discarded (not preserved across regeneration)

### Tap-to-Expand Editor

Tap a card → it expands in-place, revealing the full pre-filled campaign:

| Field | Component | Behavior |
|-------|-----------|----------|
| Title | EditableField (text) | Pre-filled, editable |
| Description | EditableField (textarea) | Pre-filled, editable |
| Platforms | PlatformChips (toggle) | Pre-selected based on business social presence |
| Deliverables | DeliverablesList (add/remove) | Pre-filled, e.g., "2 Reels, 1 Story" |
| Budget | BudgetSlider (range) | Pre-filled, draggable |
| Timeline | TimelinePicker (date) | Pre-filled, calendar picker |
| Tier | TierBadge + change link | Auto-selected by Donny with reasoning |
| Cost breakdown | CostBreakdown | Read-only, updates as budget/tier change |

**EditableField pattern:** Displays as read-only text by default (clean, not form-like). Tap/click → transforms into editable input inline. Donny's pre-filled value shown in teal, user edits in default color. Small "Reset" link restores Donny's suggestion.

### Brand-Only Fields

Visible only for brand accounts, below the standard fields:

| Field | Component |
|-------|-----------|
| Budget Pool | EditableField (currency) |
| Per-Creator Cap | EditableField (currency) |
| Usage Rights | Toggle chips (default: 6-month digital) |
| Exclusivity | Toggle (default: off) |

### Delivery Tier

Donny auto-selects based on campaign context:
- Tight deadline → DragonDash (rush) with explanation: "Tight timeline — rush delivery so creators prioritize it. Adds $X express fee."
- Standard timeline → Standard with explanation: "Standard timeline — best creator pool at lowest cost."

Shown as inline badge with "Change" link that opens a simple dropdown. Not a wizard step.

**Important:** The DB column `delivery_type` uses values `standard`, `expedited`, `dragonrush`. The UI displays these as "Standard", "Express", "DragonDash". The existing mapping layer in `src/lib/campaignUtils.ts` (`mapDeliveryType`/`mapDeliveryTierToDb`) handles this translation. The new wizard continues to use this mapping layer — we do NOT change DB values or CHECK constraints.

### Launch

Full-width teal pill button at bottom. One tap publishes the campaign, triggers escrow creation, and sends notifications.

Anonymous users: "Launch" triggers `AuthenticationModal`. Campaign data persists in localStorage. On signup/login, data migrates to account.

---

## Desktop Split View

On viewports ≥ 768px, Screen 2 renders as a split layout:

- **Left panel:** Donny conversation flow — SmartInput, ExtractionFeed, IdeaCards (vertical stack), CampaignEditor
- **Right panel:** Live campaign preview — renders `CampaignMarketplaceListItem` with current `editedCampaign` data, updating in real-time as user edits fields

Header on right panel: "What creators will see"

Mobile renders the same components in a single-column flow (no split).

---

## Data Architecture

### BusinessContext

Structured object from URL or photo extraction:

```typescript
interface BusinessContext {
  source_url: string
  source_type: 'google_business' | 'instagram' | 'website' | 'yelp' | 'photo' | 'manual'
  business_name: string
  cuisine_type?: string
  location: { city: string; state?: string; country: string }
  rating?: number
  review_count?: number
  price_range?: '$' | '$$' | '$$$' | '$$$$'
  photos: string[]
  vibe_tags: string[]
  hours?: Record<string, string>
  social_links?: { instagram?: string; tiktok?: string; website?: string }
  review_highlights?: string[]
}
```

Cached in `business_contexts` table with 7-day TTL. Repeat campaigns skip extraction.

### IdeaDeliverable

AI-generated deliverable description, mapped to the structured `Deliverable` type at edit time:

```typescript
interface IdeaDeliverable {
  description: string            // e.g., "Instagram Reel showcasing weekend brunch"
  content_type: ContentType      // 'video_reel' | 'photo' | 'story' | 'carousel' | 'tiktok' | 'youtube_short'
  platform: Platform             // 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'google_business' | 'multi_platform'
  aspect_ratio: AspectRatio      // '9:16' | '16:9' | '1:1' | '4:5'
  estimated_duration?: number    // seconds, for video content
}
```

The AI prompt enforces exact enum values from the existing `ContentType`, `Platform`, and `AspectRatio` union types. When a `CampaignIdea` is selected, `IdeaDeliverable[]` maps to `Deliverable[]` (adding `id`, `status: 'pending'`).

### CampaignIdea

Returned by the enhanced `donny-campaign-generate` edge function:

```typescript
interface CampaignIdea {
  id: string
  emoji: string
  title: string
  description: string
  campaign_type: 'ugc_content' | 'launch_hype' | 'ongoing_presence' | 'event_promo' | 'seasonal'
  recommended_platforms: Platform[]
  deliverables: IdeaDeliverable[]
  budget_range: { min: number; max: number }
  timeline_days: number
  tier: DeliveryTier
  tier_reasoning: string
  style_direction: string
  target_creator_persona: string[]
  key_messages: string[]
  hashtags: string[]
}
```

### EditableCampaign

The single source of truth for what gets saved to the DB. Starts as a copy of the selected `CampaignIdea`, accumulates user edits:

```typescript
interface EditableCampaign {
  // From CampaignIdea (pre-filled)
  title: string
  description: string
  campaign_type: CampaignIdea['campaign_type']
  platforms: Platform[]
  deliverables: Deliverable[]           // mapped from IdeaDeliverable on selection
  budget_min: number                    // snake_case, matches DB schema
  budget_max: number
  deadline: string                      // ISO date string
  delivery_type: 'standard' | 'expedited' | 'dragonrush'  // DB values, not UI labels
  style_direction: string
  target_creator_persona: string[]
  key_messages: string[]
  hashtags: string[]

  // UI metadata (not saved to DB)
  tier_reasoning: string
  emoji: string
  original_idea_id: string              // tracks which CampaignIdea this came from
}
```

### BrandFields

Additional fields for brand accounts, stored separately and merged on launch:

```typescript
interface BrandFields {
  budget_pool: number
  per_creator_cap: number
  usage_rights_days: number             // default: 180 (6 months)
  exclusivity_days: number              // default: 0 (none)
  geographic_scope: 'city' | 'region' | 'national'
  target_creator_count: number
  tagline?: string
}
```

**Note on type generation:** The existing codebase has brand-specific columns (`per_creator_cap`, `usage_rights_days`, `exclusivity_days`, `geographic_scope`, `target_creator_personas`, `tagline`) that are present in the DB but missing from the auto-generated Supabase types. The existing code uses `as any` to bypass this. As part of this work, we regenerate the Supabase types (`supabase gen types typescript`) to include these columns and remove all `as any` casts.

### Unified Hook: useCampaignCreator

Replaces `useCampaignWizard`, `useBrandCampaignWizard`, and `useAnonymousCampaignWizard`:

```typescript
interface UseCampaignCreator {
  // Screen 1 state
  inputMode: 'url' | 'photo' | 'text'
  inputValue: string
  isExtracting: boolean
  businessContext: BusinessContext | null
  extractionMessages: string[]

  // Screen 2 state
  campaignIdeas: CampaignIdea[] | null
  selectedIdeaId: string | null
  editedCampaign: EditableCampaign | null
  isExpanded: boolean

  // Role adaptation
  userRole: 'business_client' | 'brand' | null   // null = anonymous (no auth)
  brandFields: BrandFields | null

  // Actions
  submitInput: (value: string, mode: 'url' | 'photo' | 'text') => Promise<void>
  selectIdea: (ideaId: string) => void
  regenerateIdeas: () => Promise<void>
  updateField: <K extends keyof EditableCampaign>(field: K, value: EditableCampaign[K]) => void
  updateBrandField: <K extends keyof BrandFields>(field: K, value: BrandFields[K]) => void
  launchCampaign: () => Promise<void>
  saveDraft: () => Promise<void>

  // Persistence
  draftId: string | null
  isAuthenticated: boolean
}
```

One hook, one state tree. `EditableCampaign` is the single source of truth — starts as a copy of the selected `CampaignIdea`, accumulates user edits. Brand fields are additive. Anonymous persistence uses localStorage keyed by generated draft ID.

**`userRole` mapping:** Derived from `profile.role` in the auth context. `business_client` maps to the restaurant experience (simple fields). `brand` maps to the expanded experience (brand fields visible). `null` (no auth session) maps to the anonymous experience (auth gate on launch). This aligns with the existing `UserRole` type in the codebase.

### Draft Auto-Save Behavior

- **Auto-save triggers:** On screen transition (Screen 1 → Screen 2), on idea selection, and on a 30-second debounce after any field edit.
- **Authenticated users:** Draft saved to DB via `campaigns` table with `status: 'draft'`.
- **Anonymous users:** Draft saved to localStorage keyed by a generated UUID. Includes `BusinessContext`, selected `CampaignIdea`, and `EditableCampaign` state.
- **On browser close/refresh:** Last auto-saved state is restored. Authenticated users re-fetch from DB. Anonymous users re-hydrate from localStorage.
- **On auth migration:** Anonymous localStorage draft is written to DB, localStorage is cleared.

---

## Edge Function Architecture

### Refactoring `donny-campaign-generate` (not creating a new function)

The existing `donny-campaign-generate` edge function already performs URL extraction (fetches HTML, extracts title/meta/body text, sends to OpenAI GPT-4o). Rather than creating a duplicate `donny-extract-business` function, we **refactor and enhance** `donny-campaign-generate` to:

1. Accept a richer input: `{ source_url?: string, source_type: BusinessContext['source_type'], photo_url?: string, manual_text?: string, role: 'business_client' | 'brand' | null }`
2. Perform smarter extraction based on `source_type` (structured data parsing for Google Business, Open Graph + image analysis for Instagram, generic HTML for websites)
3. Return a two-part response: `{ business_context: BusinessContext, campaign_ideas: CampaignIdea[] }`
4. The function remains backward-compatible: if called with the old signature `{ source_url, campaignGoal }`, it returns the old `CampaignAnalysis` format. New callers use the new signature. This allows Phase 2 coexistence.

### Backward Compatibility with `generate-campaign-analysis`

The existing `generate-campaign-analysis` edge function (used by old wizards) is **not modified**. It continues to accept `{ campaignGoal: string }` and return `CampaignAnalysis`. During Phase 2, old wizards still call `generate-campaign-analysis` while the new wizard calls `donny-campaign-generate`. In Phase 3, when old wizards are deleted, `generate-campaign-analysis` can be deprecated.

### Architecture

```
donny-campaign-generate (ENHANCED — existing function)
  Input: source_url | photo_url | manual_text + source_type + role
  Output: { business_context: BusinessContext, campaign_ideas: CampaignIdea[3] }
  Backward-compatible: old callers still work with old signature
        │
        ▼
create-campaign-escrow (EXISTING — unchanged)
  Triggered on launch

generate-campaign-analysis (EXISTING — unchanged, deprecated after Phase 3)
  Still used by old wizards during Phase 2 coexistence
```

No new edge functions. One enhanced function. Everything downstream (escrow, notifications, matching) unchanged.

---

## Component Architecture

```
CampaignCreator (page-level)
├── CampaignCreatorMobile (< 768px)
│   ├── DropScreen
│   │   ├── DonnyGreeting
│   │   ├── SmartInput
│   │   └── ExtractionFeed
│   └── LaunchpadScreen
│       ├── IdeaCarousel (horizontal swipe)
│       │   └── IdeaCard (×3)
│       ├── RegenerateButton
│       ├── CampaignEditor (expanded inline)
│       │   ├── EditableField (reusable, type-safe per field)
│       │   ├── PlatformChips
│       │   ├── DeliverablesList
│       │   ├── BudgetSlider
│       │   ├── TimelinePicker
│       │   ├── TierBadge
│       │   ├── BrandFieldsPanel (conditional)
│       │   └── CostBreakdown
│       └── LaunchButton
├── CampaignCreatorDesktop (≥ 768px)
│   ├── LeftPanel
│   │   ├── SmartInput
│   │   ├── ExtractionFeed
│   │   ├── IdeaCards (vertical stack)
│   │   ├── RegenerateButton
│   │   └── CampaignEditor
│   └── RightPanel
│       └── CampaignPreviewCard
└── AuthGateModal (anonymous users)
```

`CampaignEditor` is shared between mobile and desktop. `SmartInput` is one component with 3 modes. `IdeaCard` is shared with different container layouts.

### Reused Existing Components

| Component | Status |
|-----------|--------|
| MediaUploader | Keep — used in SmartInput for photo drops |
| PlatformSelector | Evolve → PlatformChips (simpler toggle) |
| DeliverableBuilder | Evolve → DeliverablesList (pre-filled, lighter) |
| CostBreakdown | Keep — child of CampaignEditor, updates on budget/tier change |
| CampaignMarketplaceListItem | Keep — desktop live preview |
| AuthenticationModal | Keep — anonymous auth gate |
| DonnyAvatar, DonnyMessage | Keep — used in ExtractionFeed |

---

## Migration Plan

### Phase 1 — Build (Week 1-3)

- New `CampaignCreator` page + `useCampaignCreator` hook
- Enhance `donny-campaign-generate` edge function (backward-compatible)
- All new components
- Regenerate Supabase types to include brand-specific columns
- New routes (using `/create` suffix to match existing URL convention):
  - `/campaign/create` (keep existing route, new component replaces `AnonymousCampaignWizard`)
  - `/dashboard/business/campaigns/create` (keep existing route, new component replaces `CampaignWizard`)
  - `/dashboard/brand/campaigns/create` (keep existing route, new component replaces `BrandCreateCampaign`)

**Note:** We reuse the existing `/create` routes rather than introducing `/new`. The old page components are swapped out for the new `CampaignCreator` component at the same routes. This avoids redirect complexity and preserves bookmarks.

### Phase 2 — Validate (Week 3-4)

- Old wizard components remain in codebase but are no longer routed to
- Monitor for issues — old components can be re-routed temporarily if needed
- Fix collaboration creation bug (counter-offer acceptance → collaboration trigger)

### Phase 3 — Cleanup (Week 4+)

- Delete old wizard pages: `CampaignWizard.tsx`, `BrandCreateCampaign.tsx`, `AnonymousCampaignWizard.tsx`
- Delete old hooks: `useCampaignWizard.ts`, `useBrandCampaignWizard.ts`, `useAnonymousCampaignWizard.ts`, `useAnonymousCampaign.ts`
- Delete orphaned step components
- Deprecate `generate-campaign-analysis` edge function (no longer called by any frontend code)
- Standardize `budget_min`/`budget_max` naming in frontend code (DB already uses snake_case)
- Remove debug `console.log` statements

### Database Changes

**New table:**

```sql
create table business_contexts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references profiles(id),
  source_url text not null,
  source_type text not null,
  extracted_data jsonb not null,
  extracted_at timestamptz default now(),
  expires_at timestamptz default now() + interval '7 days'
);

-- RLS policy: users can only access their own business contexts
alter table business_contexts enable row level security;

create policy "Users can read own business contexts"
  on business_contexts for select
  using (auth.uid() = profile_id);

create policy "Users can insert own business contexts"
  on business_contexts for insert
  with check (auth.uid() = profile_id);

create policy "Users can delete own business contexts"
  on business_contexts for delete
  using (auth.uid() = profile_id);
```

**Delivery tier mapping:** No DB migration for tier values. The existing `delivery_type` column keeps its CHECK constraint (`standard`, `expedited`, `dragonrush`). The existing mapping layer in `campaignUtils.ts` translates between UI labels (`DragonDash`, `Express`, `Standard`) and DB values. The new wizard uses this same mapping layer.

**Budget field naming:** The DB uses `budget_min`/`budget_max` (snake_case). The new `EditableCampaign` interface uses the same snake_case names. Frontend code that still uses `budgetMin`/`budgetMax` is updated in Phase 3 cleanup to use snake_case consistently.

No columns dropped or renamed. New columns added as nullable.

---

## Design System Compliance

All styling uses Tailwind utility classes (no raw CSS):

| Element | Tailwind Classes |
|---------|-----------------|
| Primary buttons | `bg-teal-400 text-white rounded-full w-full font-bold` |
| Idea cards | `bg-white rounded-2xl border border-teal-300 p-4 shadow-sm` |
| Selected state | `border-2 border-teal-400 ring-2 ring-teal-400/20` |
| Platform chips | `rounded-full px-3 py-1 text-sm font-medium` |
| Badges | `bg-gray-100 rounded-full px-2 py-1 text-xs` |
| Donny avatar | `rounded-full ring-2 ring-teal-400` |
| Background (mobile) | `bg-[#A8A8A0]` |
| Launch button | `bg-gradient-to-r from-teal-400 to-emerald-400 rounded-full w-full py-4 text-white font-bold text-lg` |
| Swipe container | `flex overflow-x-auto snap-x snap-mandatory gap-4` |
| Swipe card | `snap-center flex-shrink-0 w-[85vw]` |

---

## Bug Fixes Included

| Bug | Fix |
|-----|-----|
| UI/DB tier mismatch (`dragondash` vs `dragonrush`) | Keep DB values, use existing mapping layer consistently in new wizard |
| `budgetMin` vs `budget_min` schema drift | New code uses snake_case; old code updated in Phase 3 |
| `ai_analysis` cast to `any` | Typed with Zod schema |
| Hard-coded `SUPABASE_URL` in CampaignApplyForm | Use env variable |
| Debug `console.log` in useAnonymousCampaignWizard | Remove |
| Counter-offer acceptance doesn't create collaboration | Wire up trigger |
| Notifications blast all creators | Filter by location + content type |
| No future-date validation on deadlines | Add to validation schema |
| Brand columns missing from Supabase generated types | Regenerate types with `supabase gen types typescript` |
| Brand column access uses `as any` casts | Replace with proper typed access after type regeneration |

---

## Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Creation time | 8-15 min | Under 2 min |
| Steps to launch | 5 (+ backtracking) | 2 screens, linear |
| Fields to type | 12-15 | 0-2 |
| Wizards to maintain | 3 codepaths | 1 unified |
| Components in wizard | ~29 | ~12 |

---

## Out of Scope (Deferred to Approach C)

- Proactive campaign suggestions from Donny
- Recurring campaign templates
- One-tap campaign duplication
- Auto-invite creators on publish
- Mid-flight campaign optimization
- Yelp extraction
- TikTok profile extraction
- Calendar/event integration
- Campaign performance analytics enhancements

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| URL scraping fails | Graceful fallback to text input — Donny says "couldn't read that, tell me about your business" |
| AI generates poor ideas | Prompt engineering + Regenerate button on Screen 2 + full inline editing of all fields |
| AI returns invalid enum values for deliverables | Zod validation on edge function response; fallback to safe defaults (video_reel, instagram, 9:16) |
| Anonymous auth migration loses data | localStorage draft keyed by UUID, auto-save on 30s debounce, unit-tested |
| Brand users miss power features | Brand fields always visible for brand accounts — nothing hidden behind toggles |
| Old wizard links bookmarked | Same `/create` routes, new components — no URL change needed |
| Phase 2 coexistence breaks old flow | `generate-campaign-analysis` untouched; `donny-campaign-generate` backward-compatible |
