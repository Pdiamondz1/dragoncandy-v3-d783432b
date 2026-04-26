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
2. **Drop a photo** — Donny analyzes the image (food shot, interior, menu, event flyer) and infers campaign context.
3. **Type a sentence** — Fallback. e.g., "I'm opening a new ramen spot in Austin next month."

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

Top section: 3 campaign ideas. Horizontally swipeable on mobile (CSS `scroll-snap-type: x mandatory`, ~85% viewport width per card, peek-showing next card edge, dot indicators). Side-by-side clickable cards on desktop.

Each card shows:
- Emoji + campaign title (e.g., "🍜 Weekend Reel Blitz")
- One-line description
- Budget range badge
- Timeline badge
- Platform icons (Instagram, TikTok, etc.)

Idea diversity enforced in AI prompt: 3 ideas cover different campaign types (e.g., UGC content pack, event-driven buzz, ongoing creator partnership).

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

Structured object from URL extraction:

```typescript
interface BusinessContext {
  source_url: string
  source_type: 'google_business' | 'instagram' | 'website' | 'yelp' | 'manual'
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

### CampaignIdea

Returned by enhanced `generate-campaign-analysis` edge function:

```typescript
interface CampaignIdea {
  id: string
  emoji: string
  title: string
  description: string
  campaign_type: 'ugc_content' | 'launch_hype' | 'ongoing_presence' | 'event_promo' | 'seasonal'
  recommended_platforms: Platform[]
  deliverables: Deliverable[]
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
  userRole: 'restaurant' | 'brand' | 'anonymous'
  brandFields: BrandFields | null

  // Actions
  submitInput: (value: string, mode: 'url' | 'photo' | 'text') => Promise<void>
  selectIdea: (ideaId: string) => void
  updateField: (field: string, value: any) => void
  launchCampaign: () => Promise<void>
  saveDraft: () => Promise<void>

  // Persistence
  draftId: string | null
  isAnonymous: boolean
}
```

One hook, one state tree. `EditableCampaign` is the single source of truth — starts as a copy of the selected `CampaignIdea`, accumulates user edits. Brand fields are additive. Anonymous persistence uses localStorage keyed by generated draft ID.

---

## Edge Function Architecture

```
donny-extract-business (NEW)
  Input: URL
  Output: BusinessContext
        │
        ▼
generate-campaign-analysis (ENHANCED)
  Input: BusinessContext + role
  Output: CampaignIdea[3]
        │
        ▼
create-campaign-escrow (EXISTING — unchanged)
  Triggered on launch
```

One new edge function. One enhanced function. Everything downstream (escrow, notifications, matching) unchanged.

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
│       ├── CampaignEditor (expanded inline)
│       │   ├── EditableField (reusable)
│       │   ├── PlatformChips
│       │   ├── DeliverablesList
│       │   ├── BudgetSlider
│       │   ├── TimelinePicker
│       │   ├── TierBadge
│       │   └── BrandFieldsPanel (conditional)
│       └── LaunchButton
├── CampaignCreatorDesktop (≥ 768px)
│   ├── LeftPanel
│   │   ├── SmartInput
│   │   ├── ExtractionFeed
│   │   ├── IdeaCards (vertical stack)
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
| CostBreakdown | Keep — shown before launch |
| CampaignMarketplaceListItem | Keep — desktop live preview |
| AuthenticationModal | Keep — anonymous auth gate |
| DonnyAvatar, DonnyMessage | Keep — used in ExtractionFeed |

---

## Migration Plan

### Phase 1 — Build (Week 1-3)

- New `CampaignCreator` page + `useCampaignCreator` hook
- New `donny-extract-business` edge function
- Enhanced `generate-campaign-analysis` edge function
- All new components
- New routes:
  - `/campaign/new` (anonymous + authenticated)
  - `/dashboard/business/campaigns/new` (business)
  - `/dashboard/brand/campaigns/new` (brand)

### Phase 2 — Redirect (Week 3-4)

- Old `/create` routes redirect to `/new` routes
- Old wizard components remain but unreachable
- Monitor for issues — redirects reversible
- Fix collaboration creation bug (counter-offer acceptance → collaboration trigger)

### Phase 3 — Cleanup (Week 4+)

- Delete old wizard pages: `CampaignWizard.tsx`, `BrandCreateCampaign.tsx`, `AnonymousCampaignWizard.tsx`
- Delete old hooks: `useCampaignWizard.ts`, `useBrandCampaignWizard.ts`, `useAnonymousCampaignWizard.ts`, `useAnonymousCampaign.ts`
- Delete orphaned step components
- Run schema migration: `dragonrush` → `dragondash`, standardize `budget_min`/`budget_max`
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
```

**Schema fixes:**

```sql
update campaigns set delivery_tier = 'dragondash' where delivery_tier = 'dragonrush';
```

No columns dropped or renamed. New columns added as nullable.

---

## Design System Compliance

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

---

## Bug Fixes Included

| Bug | Fix |
|-----|-----|
| `dragonrush` vs `dragondash` tier mismatch | DB migration + unified constant |
| `budgetMin` vs `budget_min` schema drift | Standardize to snake_case |
| `ai_analysis` cast to `any` | Typed with Zod schema |
| Hard-coded `SUPABASE_URL` in CampaignApplyForm | Use env variable |
| Debug `console.log` in useAnonymousCampaignWizard | Remove |
| Counter-offer acceptance doesn't create collaboration | Wire up trigger |
| Notifications blast all creators | Filter by location + content type |
| No future-date validation on deadlines | Add to validation schema |

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
| URL scraping fails | Graceful fallback to text input |
| AI generates poor ideas | Prompt engineering + "Regenerate" button + full inline editing |
| Anonymous auth migration loses data | localStorage draft keyed by UUID, unit-tested |
| Brand users miss power features | Brand fields always visible for brand accounts |
| Old wizard links bookmarked | 301 redirects from old routes |
