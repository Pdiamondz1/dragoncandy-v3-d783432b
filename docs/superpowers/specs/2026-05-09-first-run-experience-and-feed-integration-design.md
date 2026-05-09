# First-Run Experience & Feed → Campaign Integration

**Date:** 2026-05-09
**Status:** Approved
**Scope:** Guided first-run onboarding for all roles, Dragon Feed integration into Campaign Creator, social media audit documentation

---

## Problem Statement

Users who sign up for DragonCandy complete a profile wizard and land on a tile-heavy dashboard with no clear direction. The existing tour system points at UI elements but doesn't guide users through doing anything. The Dragon Feed (inspiration content) exists as an isolated feature with no connection to campaign creation, making it useless as a tool. New users feel overwhelmed, clueless about what to do first, and unimpressed.

## Goals

1. Every new user, regardless of role, is guided through their core features within 60 seconds of reaching the dashboard
2. The Dragon Feed becomes a style reference tool embedded inside campaign creation (not a standalone destination)
3. No user should have to think about how to use the app — each step leads naturally to the next
4. Social media integration audit findings are documented with clear phase boundaries for post-launch work

## Non-Goals

- Gamification beyond mission completion (no XP, badges, or leaderboards)
- Social media Phase 3-4 implementation (documented, deferred)
- Donny AI-blocked features (caption rewriter, growth insights — template alternatives suffice)
- Desktop-first design (mobile-first; desktop inherits via responsive)

---

## Architecture

### Role Mapping

| Display Name | DB Role Value | Profile Table |
|-------------|---------------|---------------|
| Restaurant | `business_client` | `business_profiles` |
| Creator | `content_creator` | `creator_profiles` |
| Brand | `brand` | `business_profiles` (with `account_type = 'brand'`) |

All TypeScript code uses the DB role values. "Restaurant/Creator/Brand" are UI-facing labels only.

### Data Model

New nullable JSONB column on `profiles` table:

```sql
ALTER TABLE profiles ADD COLUMN first_run_missions JSONB DEFAULT NULL;
```

**Type safety:** Supabase generates this as `Json | null`. Create a `parseFirstRunMissions(json: Json | null, role: UserRole): RoleMissions | null` utility that narrows the JSONB to the correct typed union with runtime validation.

Shape varies by role (keyed off DB role values):

```typescript
type RestaurantMissions = {
  browse_inspiration: boolean;
  create_campaign: boolean;
  launch_campaign: boolean;
  completed_at?: string; // ISO timestamp when all missions done
};

type CreatorMissions = {
  view_campaigns: boolean;
  add_portfolio: boolean;
  apply_campaign: boolean;
  completed_at?: string;
};

type BrandMissions = {
  select_style: boolean;
  browse_creators: boolean;
  create_sponsorship: boolean;
  completed_at?: string;
};
```

**State transitions:**
- `NULL` → missions initialized on first dashboard visit (populated with all `false`)
- Individual keys flip to `true` as each mission completes
- When all role-specific keys are `true`, `completed_at` is set and the checklist disappears permanently

### Conditional Rendering

```typescript
const { data: profile } = useProfile();
const missions = profile?.first_run_missions;
const isFirstRun = missions && !missions.completed_at;

if (isFirstRun) {
  return <FirstRunDashboard role={role} missions={missions} />;
}
return <FullDashboard />;
```

### Tour System Changes

The existing `DCTour` component currently auto-fires 500ms after first dashboard mount when `onboarding_completed_at` is null. Changes:
- Remove auto-fire behavior
- Add a `?` button (top-right corner) that triggers the tour on demand
- Tour becomes an optional recap, not a first-visit interruption
- `onboarding_completed_at` is still set (by the existing wizard), but no longer triggers auto-tour

---

## Design: First-Run Experience

### Visual Treatment

All roles share the same structural pattern with role-specific accents:

| Element | Restaurant | Creator | Brand |
|---------|-----------|---------|-------|
| Gradient | Teal → Pink | Teal → Teal-light → Pink | Pink → Pink-light → Teal |
| CTA text | "Create Your First Campaign" | "See Campaigns For You" | "Find Your Creators" |
| Accent color | `#4DD9C0` | `#4DD9C0` | `#EC4899` |
| Emoji | 🐉 | 🎬 | 🏢 |

**Style direction:** Bold gradient hero card (Option A treatment) with warm, playful copy (Option B tone). Sparkle/dragon/candy decorations for brand personality. Premium SaaS energy with approachable voice.

### First-Run Dashboard Structure (All Roles)

```
┌──────────────────────────────┐
│  Logo              [?] button │
├──────────────────────────────┤
│  ┌────────────────────────┐  │
│  │   GRADIENT HERO CARD   │  │
│  │   Welcome, {name}!     │  │
│  │   {role-specific copy} │  │
│  │   [ PRIMARY CTA ]      │  │
│  └────────────────────────┘  │
│                              │
│  ┌────────────────────────┐  │
│  │   YOUR MISSIONS        │  │
│  │   1. ● Active mission  │  │
│  │   2. ○ Locked          │  │
│  │   3. ○ Locked          │  │
│  └────────────────────────┘  │
│                              │
│  "Takes about 60 seconds ⚡"  │
└──────────────────────────────┘
```

Nothing else on screen. No stats, no tiles, no activity feed, no social media. Full dashboard reveals only after all missions complete.

A small "Skip for now" text link appears below the missions panel. Tapping it sets `completed_at` to the current timestamp and immediately renders the full dashboard. This is an escape hatch, not a prominent option.

### Restaurant Missions

| # | Mission | Copy | Trigger | Completes When |
|---|---------|------|---------|----------------|
| 1 | Browse inspiration | "See what creators are making" | CTA button + mission "GO" | User scrolls the InspirationStrip (any scroll interaction) OR taps to select at least 1 inspiration piece |
| 2 | Create a campaign | "Donny does the work" | Unlocks after mission 1 | User reaches Launchpad (Donny generates ideas) |
| 3 | Launch it! | "Creators start applying" | Unlocks after mission 2 | Campaign saved as draft OR published |

### Creator Missions

| # | Mission | Copy | Trigger | Completes When |
|---|---------|------|---------|----------------|
| 1 | See what's out there | "Campaigns matched to your skills" | CTA button + mission "GO" | User views campaign list (scrolls or taps into 1+ campaign) |
| 2 | Show your best work | "Add 1 portfolio piece" | Unlocks after mission 1 | User uploads or links 1 portfolio item |
| 3 | Apply to a campaign | "Your first pitch" | Unlocks after mission 2 | User submits an application |

### Brand Missions

| # | Mission | Copy | Trigger | Completes When |
|---|---------|------|---------|----------------|
| 1 | Pick your vibe | "What content style fits your brand?" | CTA button + mission "GO" | User selects 1+ content style from tap-grid (hardcoded options: UGC Reels, Flat-lay Product, Behind the Scenes, Event Coverage, Food Photography, Lifestyle, Testimonial, Unboxing) |
| 2 | Meet your matches | "Creators who fit your style" | Unlocks after mission 1 | User views matched creator list |
| 3 | Sponsor a campaign | "Your first brand deal" | Unlocks after mission 2 | User initiates sponsorship creation (reaches brief step) |

### Mission Completion Behavior

When a mission completes:
1. Mission item animates to "done" state (checkmark, subtle green)
2. Next mission unlocks (fade in, becomes tappable)
3. If all missions done: brief celebration animation → checklist fades out → full dashboard renders with transition

When all missions complete:
- `first_run_missions.completed_at` is set to current timestamp
- Checklist component unmounts
- Full dashboard renders (stats, tiles, activity, social media — everything)
- This state is permanent; first-run never shows again

---

## Design: Dragon Feed → Campaign Creator Integration

### InspirationStrip Component

A new horizontal scrollable strip embedded in the Campaign Creator's DropScreen, below the existing URL/Photo/Describe input options.

**Location:** `src/components/campaign-creator/InspirationStrip.tsx`

**Data source:** New `useInspirationStrip` hook (not the existing `useBusinessDragonFeed` which shuffles randomly). Queries `creator_profiles` where `is_completed=true` and `allow_portfolio_in_feed=true`, then merges with the user's likes from `analytics_events`.

**Ordering priority:**
1. Previously liked items (from `analytics_events` where event_type = `dragon_feed_like`) appear first
2. Remaining items sorted by recency (not shuffled)
3. Limited to 8 items on initial fetch (lazy-load more on scroll)

**Visual treatment:**
```
┌─────────────────────────────────────────┐
│ 🔥 Inspiration from creators  [See all →] │
│                                           │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐  →→→    │
│ │     │ │     │ │     │ │     │          │
│ │img/v│ │img/v│ │img/v│ │img/v│          │
│ │     │ │     │ │     │ │     │          │
│ ├─────┤ ├─────┤ ├─────┤ ├─────┤          │
│ │label│ │label│ │label│ │label│          │
│ └─────┘ └─────┘ └─────┘ └─────┘          │
└─────────────────────────────────────────┘
```

**Interaction:**
- Tap to select as style reference (teal border appears, checkmark overlay)
- Multiple selections allowed
- "See all →" opens full Dragon Feed as a bottom sheet (consistent with existing `FeedLightbox.tsx` pattern)
- Selected items persist across the DropScreen → Launchpad transition

### Inspiration → Campaign Generation Flow

Selected inspiration content is passed to the `donny-campaign-generate` edge function as structured metadata (not raw IDs):

```typescript
// Enhanced payload to donny-campaign-generate
{
  business_context: { /* existing fields */ },
  input_type: "url" | "photo" | "text" | "inspiration",
  input_value: string,
  inspiration_refs: InspirationRef[] // resolved metadata from selections
}

type InspirationRef = {
  media_url: string;       // portfolio URL of the selected content
  creator_name: string;    // creator who made it
  content_label: string;   // auto-classified label (e.g., "Food reel", "UGC style")
  media_type: "image" | "video";
};
```

**Edge function modification:** The frontend resolves selected Dragon Feed items into `InspirationRef` objects before calling the edge function. The edge function appends these to the system prompt as style references:

```
Style references the user selected:
- Food reel by @creator_sarah (video): [url]
- UGC-style product shot by @mike_creates (image): [url]

Generate campaign ideas that match these content styles and formats.
```

The LLM uses these as creative direction signals — matching format (reel vs photo vs stories), tone (polished vs authentic), and content type (food close-ups, behind-scenes, testimonials). URLs are included so vision-capable models can reference the actual visual style.

### Launchpad "Inspired By" Badge

When inspiration was selected, the Launchpad screen shows a pink badge:

```
┌──────────────────────────────┐
│ ← Campaign Ideas             │
├──────────────────────────────┤
│ ┌──────────────────────────┐ │
│ │ [thumb] Inspired by       │ │
│ │         Food reel style  ✕│ │
│ └──────────────────────────┘ │
│                              │
│ 🐉 Donny's ideas for you    │
│ ┌──────────────────────────┐ │
│ │ Idea 1 (teal border)     │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Idea 2                   │ │
│ └──────────────────────────┘ │
│ ┌──────────────────────────┐ │
│ │ Idea 3                   │ │
│ └──────────────────────────┘ │
└──────────────────────────────┘
```

The badge can be dismissed (✕) which removes the style constraint and regenerates ideas.

### Mission 1 Completion via Feed

For the restaurant first-run, Mission 1 ("Browse inspiration") completes when:
- User performs any scroll interaction on the InspirationStrip (detected via `onScroll` event), OR
- User taps to select at least 1 inspiration piece

Generous detection: any engagement with the strip counts. This means the first mission can complete organically as part of campaign creation — no separate "go browse the feed" step required.

### Analytics Tracking

Log all mission events to `analytics_events`:
- `event_type: 'first_run_mission_complete'` with payload `{ role, mission_key, elapsed_seconds_since_signup }`
- `event_type: 'first_run_all_complete'` when all missions done
- `event_type: 'first_run_skipped'` if user hits "Skip for now"

These power the >80% completion rate success criterion measurement.

---

## Social Media Integration Audit Reference

### Phase Status Summary

| Phase | Scope | Status | Launch-Critical |
|-------|-------|--------|-----------------|
| Phase 1 | Restaurant social media | Production-ready (7/7 deliverables) | Yes — ships at launch |
| Phase 2 | Creator social media | 80% complete (5/7, 2 Donny-blocked) | Yes — ships with template alternatives |
| Phase 3 | Brand social media | 20% built (1/8 complete, 4 partial) | No — post-launch |
| Phase 4 | Cross-role orchestration | 10% built (1/6 partial) | No — post-launch |

### Phase 1 Verification (Complete)

All 7 deliverables verified operational:
- OAuth + account management
- Compose + schedule (multi-platform)
- Content calendar (week/month/day views)
- Analytics dashboard (KPIs, charts)
- Engagement hub (comments, replies)
- Published feed (with error details)
- Edge function proxy (security, tenant scoping)

### Phase 2 Gaps (Donny-Blocked)

| Feature | Current State | Stopgap |
|---------|--------------|---------|
| Caption rewriter | `DonnyCaptionRewriter.tsx` exists, AI call stubbed | Template-based tone swap (casual/professional/playful) |
| Growth insights | `DonnyPerformanceInsights.tsx` placeholder UI | Static "posting consistency" tips |

These ship with template alternatives at launch. Full AI integration deferred to post-launch Donny MCP wiring.

### Phases 3-4 Deferred Items

**Phase 3 (Brand):**
- Sponsorship intelligence (AI recommends campaigns to sponsor)
- ROI report generation (currently static template)
- Brand calendar with sponsorship markers

**Phase 4 (Cross-Role):**
- Donny Auto-Pilot (autonomous scheduling)
- UGC detection (creator tags restaurant → offer reshare)
- Unified cross-role analytics dashboard
- Weekly content planner (AI-generated calendar)
- Full delegated posting permission enforcement

All deferred to post-launch. Architecture (DB tables, edge functions, component shells) is in place for when these are ready to build.

---

## Document Updates Required

### PROJECT_CONTEXT.md

Add to "Active Workstreams":
```
- First-Run Experience: Progressive disclosure + mission-based onboarding
  for all three roles. Dragon Feed integrated as style reference into
  Campaign Creator. State machine architecture (first_run_missions JSONB).
```

Add to "Key Principles & Learnings":
```
**Setup disguised as action.** Every onboarding step should feel like
progress toward a goal, not homework. Show value first (what's possible),
then collect what you need (portfolio, preferences), then guide the action
(create, apply, sponsor). Never ask users to configure before they
understand why.
```

### CLAUDE.md

Add `first_run_missions` to the profiles table in the Database Tables section.

Add under Project Structure:
```
├── components/
│   ├── first-run/          # FirstRunDashboard, MissionChecklist, MissionItem
│   ├── campaign-creator/
│   │   └── InspirationStrip.tsx  # Dragon Feed reference in campaign creation
```

---

## Implementation Phases

| Phase | Work | Dependencies |
|-------|------|-------------|
| 1 | DB migration (`first_run_missions` column) + `useFirstRunMissions` hook + `FirstRunDashboard` shell component | None |
| 2 | Restaurant first-run path: hero card, mission list, completion logic | Phase 1 |
| 3 | `InspirationStrip` component + integration into `DropScreen.tsx` + edge function payload enhancement | Phase 1 |
| 4 | Creator first-run path: campaign browse guidance, portfolio prompt, apply guidance | Phase 1 |
| 5 | Brand first-run path: style selection tap-grid, creator matching view, sponsorship initiation | Phase 1 |
| 6 | Tour system refactor: remove auto-fire, add `?` button trigger | Phase 1 |
| 7 | Document updates (PROJECT_CONTEXT.md, CLAUDE.md) | Phases 2-6 |

---

## Success Criteria

- New users reach their first meaningful action (campaign created, application submitted, sponsorship started) within 60 seconds of dashboard landing
- Zero users see a "what do I do now?" empty state on first visit
- Dragon Feed content influences at least 30% of restaurant campaigns (measured via `inspiration_refs` field presence)
- Mission completion rate > 80% (users who start missions complete all 3)
- No regression in existing dashboard functionality for users who've already completed onboarding

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Users skip missions and want full dashboard immediately | Frustration | Add small "Skip missions" text link at bottom (sets `completed_at` immediately) |
| InspirationStrip loads slowly (many images) | Poor first impression | Lazy-load with skeleton placeholders; limit initial fetch to 8 items |
| Mission completion detection is fragile | Users get stuck | Generous completion criteria (viewing counts, not requiring full actions) |
| Existing users see first-run on next visit | Confusion | Migration sets `first_run_missions = '{"completed_at": "migrated"}'` for ALL existing users where `created_at < migration_timestamp` (not just those with `onboarding_completed_at` set — catches the ~30 organic users who may have activity but no completion flag) |
