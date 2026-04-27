# Donny RAG Multi-Agent Architecture + Pricing & Free Tier + UX Polish Completion

**Date:** 2026-04-27
**Status:** Approved
**Scope:** Three interconnected workstreams for launch readiness

---

## Overview

Three workstreams that complete the DragonCandy launch playbook:

1. **Donny RAG Multi-Agent Architecture** — Transform Donny from a static-prompt chatbot into a RAG-powered orchestrator with specialized sub-agents
2. **Section 6 Completion (UX Polish)** — Wire disconnected P5.3–P5.5 components, fix the broken tour system, delete redundant floating button
3. **Section 5 (Pricing & Free Tier)** — Build P4.1 (free hooks) and P4.2 (paid tiers + soft paywalls) from scratch

**Dependencies:** Workstream 1 is the foundation. Workstream 2 uses the Guidance Agent. Workstream 3 uses the Billing Agent for soft paywall personalization.

---

## Workstream 1: Donny RAG Multi-Agent Architecture

### 1.1 Database — pgvector + Knowledge Base

**Enable pgvector extension:**

```sql
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;
```

**New table: `donny_knowledge`**

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | default gen_random_uuid() |
| `content` | text | Knowledge chunk (200–500 tokens) |
| `metadata` | jsonb | `{ source_type, source_id, category, roles[], page_paths[] }` |
| `embedding` | vector(1536) | OpenAI text-embedding-3-small |
| `source_type` | text | `'help_article' \| 'feature_doc' \| 'pricing' \| 'tour' \| 'dragonshare' \| 'campaign'` |
| `created_at` | timestamptz | default now() |
| `updated_at` | timestamptz | default now() |

**Indexes:**
- IVFFlat on `embedding` column using cosine distance for fast similarity search
- `(source_type, created_at)` for filtered retrieval

**RLS:** Public read for embeddings (needed for edge function queries). Service role insert/update/delete.

**Seed data (~60–80 chunks):**
- 18 help articles chunked into ~36 chunks
- 10 feature descriptions (campaigns, DragonShare, org management, billing, messaging, etc.)
- 5 pricing/tier descriptions
- 5 tour/onboarding content chunks
- 5 DragonShare explainer chunks
- ~5 campaign workflow chunks

### 1.2 Embedding Utility — `generate-embedding` Edge Function

**Purpose:** Generate embeddings for knowledge chunks. Called at seed time and on-insert for new content.

**Input:** `{ texts: string[] }` (batch up to 100)
**Output:** `{ embeddings: number[][] }`
**Implementation:** Calls OpenAI `text-embedding-3-small` API (1536 dimensions, $0.02/1M tokens)
**Auth:** Service role only (internal utility, not user-facing)

### 1.3 Orchestrator — `donny-orchestrator` Edge Function

**Single entry point** replacing the existing `donny-help` edge function for all Donny interactions.

**Input:**
```typescript
{
  query: string;
  page_path: string;
  page_context?: Record<string, unknown>;  // page-specific structured data
  user_role: string;
  org_id?: string;
  conversation_history?: Array<{ role: 'user' | 'assistant'; content: string }>;
}
```

**Flow:**
1. Authenticate user (JWT from Authorization header)
2. Embed the query via `generate-embedding` (or inline OpenAI call)
3. Cosine similarity search → top 5 knowledge chunks from `donny_knowledge`
4. Fetch user context: org tier, recent activity, page state
5. Build Claude `tool_use` request with:
   - Donny persona system prompt
   - RAG context (top 5 chunks)
   - User context (role, org, tier, page)
   - 5 sub-agent tool definitions
   - Conversation history (last 10 messages)
6. Claude responds — either directly or by calling a sub-agent tool
7. If tool called → execute sub-agent module → feed result back to Claude → final response
8. Return response + log

**Output:**
```typescript
{
  answer: string;
  suggested_actions: Array<{ label: string; route: string }>;
  agent_used: string;  // which sub-agent handled it, or 'direct'
}
```

**Auth:** Requires authenticated user (JWT)
**Performance target:** <3s p90 response time

### 1.4 Sub-Agent Tool Definitions

Each sub-agent is a module within the orchestrator. Claude invokes them via `tool_use` based on the query.

#### Campaign Agent (`campaign_agent`)

**Description for Claude:** "Use this tool when the user asks about campaigns, briefs, applications, matching, content delivery, or the campaign wizard."

**Input:** `{ query: string; campaign_id?: string; user_role: string; org_id?: string }`

**DB access:** `campaigns`, `campaign_applications`, `campaign_collaborations`, `campaign_brief_generations`

**Returns:** Campaign-specific context + action suggestions (e.g., "Apply to this campaign", "View your applications")

#### DragonShare Agent (`dragonshare_agent`)

**Description for Claude:** "Use this tool when the user asks about DragonShare, boosts, payouts, organic posts, post verification, or creator earnings from shares."

**Input:** `{ query: string; user_role: string; org_id?: string; post_id?: string }`

**DB access:** `dragonshare_posts`, `dragonshare_boosts`, `dragonshare_payouts`

**Returns:** Share/boost context + tier recommendations + payout status

#### Billing Agent (`billing_agent`)

**Description for Claude:** "Use this tool when the user asks about pricing, plans, subscription tiers, upgrading, downgrading, seats, billing, invoices, or payment methods."

**Input:** `{ query: string; org_id?: string; current_tier?: string }`

**DB access:** `organizations` (tier, seats), tier-features config (hardcoded in function)

**Returns:** Tier comparison data, upgrade path, cost estimates, personalized rationale

#### Guidance Agent (`guidance_agent`)

**Description for Claude:** "Use this tool when the user asks how to do something, needs help with a feature, asks about onboarding, or wants step-by-step instructions for any app feature."

**Input:** `{ query: string; page_path: string; user_role: string }`

**DB access:** `help_articles`, `profiles` (tour/coachmark state)

**Returns:** Step-by-step guidance, relevant help article references, tour trigger suggestions

#### General Agent (`general_agent`)

**Description for Claude:** "Use this tool for greetings, general questions about DragonCandy, or anything that doesn't fit the other agents. Also use when you need more context from the knowledge base."

**Input:** `{ query: string }`

**DB access:** RAG knowledge base only (no domain-specific tables)

**Returns:** General knowledge context for Claude to compose an answer

### 1.5 Frontend Integration

**No new UI components.** Donny is already accessible everywhere:
- **Mobile:** Bottom nav center icon → `DonnyMobileSheet` (tray + chat stages)
- **Desktop:** Top header Donny icon → same sheet/panel

**Changes to existing Donny tray/chat:**

1. **Tray stage** — Add page-aware suggestion chips using the existing `helpSuggestions.ts` data. Wire `getSuggestionsForPage(pathname)` into the tray's quick-action chips area.

2. **Chat stage** — Route all queries through `donny-orchestrator` instead of the old `donny-help` function. Update `useDonnyHelp` hook to call the new endpoint.

3. **External trigger** — Expose `openDonnyWithContext(query: string)` from the Donny tray provider so other components (help article CTAs, coachmarks) can open Donny with a pre-loaded question.

**Components to delete:**
- `src/components/donny-help/DonnyHelpButton.tsx` — redundant with existing nav
- `src/components/donny-help/DonnyHelpSheet.tsx` — absorbed into existing tray/chat

### 1.6 Logging

Extend `donny_help_logs` table with one new column:

```sql
ALTER TABLE donny_help_logs ADD COLUMN agent_used text;
```

Every orchestrator response logs: page_path, query, answer, suggested_actions, agent_used, rating (post-interaction).

---

## Workstream 2: Section 6 Completion (UX Polish Wiring)

### 2.1 Tour Fix (DCTour + useTour)

**Root cause:** `useTour` checked `onboarding_completed_at === null` and rendered the tour on every `DashboardLayout` mount, regardless of page. Same tour content on every page. No permanent dismissal working.

**Fix — three guards:**

1. **Route guard:** Tour only renders on dashboard home routes: `/dashboard/business`, `/dashboard/creator`, `/dashboard/brand`. Not on sub-pages like `/dashboard/business/campaigns`.

2. **DB guard:** `profiles.onboarding_completed_at IS NOT NULL` → no tour. Already exists but wasn't being respected properly.

3. **Session guard:** `sessionStorage.setItem('dc_tour_dismissed', 'true')` set immediately on skip/complete, before the async DB update completes. Check on mount.

**Additional fixes:**
- Mount delay: 500ms after dashboard renders before showing tour (let DOM elements exist)
- Tour renders **inside the dashboard home page component**, not in `DashboardLayout` (prevents re-mount on navigation)

**`data-tour` attributes** to add to existing components:

| Attribute | Component | File |
|-----------|-----------|------|
| `data-tour="org-switcher"` | `<OrgUnitSwitcher>` | OrgUnitSwitcher.tsx |
| `data-tour="brief-generator"` | Brief hero card | Restaurant dashboard |
| `data-tour="bottom-nav-add"` | Center Donny button | MobileBottomNav.tsx |
| `data-tour="donny-help"` | Donny nav icon | MobileBottomNav.tsx / header |
| `data-tour="profile-completion"` | Profile completion bar | Creator dashboard |
| `data-tour="browse-campaigns"` | Campaigns nav entry | Sidebar / bottom nav |
| `data-tour="dragonshare-nav"` | DragonShare nav entry | Sidebar / bottom nav |
| `data-tour="free-trio"` | 3-card hero grid | Brand dashboard |
| `data-tour="dragonshare-inbox"` | DragonShare inbox nav | Sidebar / bottom nav |

**"Show me around again"** in Settings → resets `onboarding_completed_at` to null + clears `dc_tour_dismissed` from sessionStorage.

### 2.2 Coachmark Wiring

The `<Coachmark>` component exists and is fully functional. It needs to be placed on 6 pages:

| Coachmark Key | Wraps | Page | Trigger |
|---------------|-------|------|---------|
| `org_switcher` | `<OrgUnitSwitcher>` | Dashboard header | First render when org has 2+ units |
| `apply_with_donny` | `<ApplyWithDonnyButton>` | Campaign Detail | First visit as creator |
| `dragonshare_submit` | Submit CTA | Creator DragonShare inbox | First visit to Boost tab |
| `dragonshare_inbox` | First post card | Brand DragonShare inbox | First time brand sees a post |
| `delete_org_danger` | Danger Zone section heading | Settings page | First visit to Danger Zone |
| `boost_tier_recommended` | Donny-recommended tier badge | Boost confirmation sheet | First time brand sees recommendation |

Each checks `profiles.dismissed_coachmarks` jsonb array. On "Got it" → appends key to array → never shows again. Auto-dismiss at 8 seconds also records dismissal.

### 2.3 WhyExpander Wiring

The `<WhyExpander>` component exists. Place on 6 locations:

| Expander Key | Adjacent To | Page | Explainer Text |
|--------------|------------|------|----------------|
| `match_score` | Match score badge | Campaign cards, Match Reports | "Donny scores creators 0–100 based on content fit, audience overlap, and past performance." |
| `delivery_tier` | DragonDash / Express / Standard badge | Campaign detail | "DragonDash = same-day. Express = 48 hours. Standard = 5 business days." |
| `donny_score` | Donny score on posts | DragonShare inbox | "Donny estimates reach and engagement potential. Higher scores get higher boost recommendations." |
| `per_seat_pricing` | Per-seat cost line | OrgBillingPage | "Each seat is one team member. Your plan includes some seats free; extras are billed monthly." |
| `soft_delete_vs_gdpr` | Delete account section | Settings Danger Zone | "Soft delete preserves your data for 30 days in case you change your mind. GDPR erasure permanently removes everything." |
| `take_rate` | Fee breakdown | Boost confirmation sheet | "Creator receives 80%. DragonCandy's 20% covers payment processing, verification, and platform costs." |

Each logs a row to `why_expander_views` on first open.

### 2.4 DragonShareExplainer Wiring

The `<DragonShareExplainer>` component exists with role-specific content. Wire to:

- **Creator DragonShare inbox** (`/creator/dragonshare`): Full explainer visible when "Submitted" tab has 0 entries. Collapses to "How it works" header link once the creator has 1+ submissions.
- **Brand DragonShare inbox** (`/business/dragonshare`, `/brand/dragonshare`): Brand version visible when 0 verified posts. Collapses to "How DragonShare works" header link after first post.

### 2.5 Help Article "Talk to Donny" CTA

On `/help/:slug` article pages, add a "Talk to Donny about this" teal CTA button that:
- Calls `openDonnyWithContext("Help me understand: {article.title}")` from the Donny tray provider
- Opens the existing Donny tray/chat with the article context pre-loaded
- The orchestrator receives the article slug in `page_context`, RAG retrieves the article, Guidance Agent responds

Replaces the current "Talk to a human" as primary CTA. "Talk to a human" becomes secondary (outlined, mailto fallback).

---

## Workstream 3: Section 5 — Pricing & Free Tier

### 3.1 New Database Tables

#### `campaign_brief_generations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | default gen_random_uuid() |
| `org_id` | uuid | references organizations, nullable for anonymous |
| `user_id` | uuid | references profiles, nullable for anonymous |
| `source_url` | text | The URL that was pasted |
| `brief_jsonb` | jsonb | The generated brief content |
| `ip_address` | inet | For anonymous rate limiting |
| `generated_at` | timestamptz | default now() |

**Indexes:** `(org_id, generated_at DESC)`, `(ip_address, generated_at DESC)`
**RLS:** Org members read own org's rows. Authenticated insert. Service role full.

#### `campaign_templates`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | default gen_random_uuid() |
| `title` | text | Template name |
| `description` | text | One-line description |
| `category` | text | `'product_launch' \| 'seasonal' \| 'ugc' \| 'brand_awareness' \| 'event'` |
| `template_data` | jsonb | Pre-filled campaign wizard fields |
| `is_active` | boolean | default true |
| `created_at` | timestamptz | default now() |

**RLS:** Public read, service role write.

**Seed 5 templates:**
1. Product Launch — UGC-focused launch campaign
2. Seasonal Promo — Holiday/seasonal content push
3. UGC Collection — Authentic user-generated content
4. Brand Awareness — Long-term brand storytelling
5. Event Coverage — Event-day creator content

#### `pricing_funnel_events`

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid pk | default gen_random_uuid() |
| `user_id` | uuid | references profiles |
| `org_id` | uuid | references organizations |
| `feature_key` | text | Which feature triggered the paywall |
| `current_tier` | text | Org's tier at the time |
| `required_tier` | text | Minimum tier for the feature |
| `action` | text | `'viewed' \| 'clicked_upgrade' \| 'dismissed'` |
| `created_at` | timestamptz | default now() |

**Indexes:** `(feature_key, action, created_at)` for conversion analysis
**RLS:** Insert-only for authenticated users. Service role full.

### 3.2 Tier Feature Map — `src/lib/pricing/tier-features.ts`

Centralized config mapping features to minimum required tiers:

| Feature Key | Free | Starter ($199) | Growth ($499) | Pro ($999) |
|-------------|------|----------------|---------------|------------|
| `brief_generation` | 1/week | unlimited | unlimited | unlimited |
| `match_report` | 1/month | unlimited | unlimited | unlimited |
| `campaign_templates` | read + clone | read + clone | read + clone | read + clone |
| `creator_delivery` | no | yes | yes | yes |
| `dragondash` | no | no | yes | yes |
| `basic_analytics` | no | yes | yes | yes |
| `advanced_analytics` | no | no | yes | yes |
| `multi_unit` | 1 unit | 1 unit | unlimited | unlimited |
| `api_access` | no | no | no | yes |
| `custom_branding` | no | no | no | yes |
| `priority_support` | no | no | no | yes |

Rate-limited features include period and limit: `{ tier: 'free', limit: 1, period: '7d' }`.

### 3.3 `useTierGate(featureKey)` Hook

```typescript
interface TierGateResult {
  allowed: boolean;
  reason: 'tier' | 'rate_limit' | null;
  requiredTier: string;
  currentTier: string;
  openPaywall: () => void;
}
```

- Reads org's `subscription_tier` from AuthContext
- Looks up feature in tier-features map
- For rate-limited features, queries the relevant table (e.g., `campaign_brief_generations` for `brief_generation`)
- `openPaywall()` opens the `SoftPaywallSheet` with the feature context

### 3.4 Soft Paywall Sheet — `<SoftPaywallSheet />`

Bottom sheet component (non-blocking):

- **Title:** "[Feature Name] is part of [Tier Name]"
- **Value prop:** One-line description from tier-features config
- **Donny rationale:** Personalized line from the Billing Agent via orchestrator (e.g., "Based on your 3 campaign drafts, Starter saves ~$1,200/mo vs. agency fees")
- **Primary CTA:** "Upgrade to [Tier]" (teal) → triggers Stripe Checkout
- **Secondary:** "Maybe later" (outlined) → closes sheet
- **Back button / swipe down:** Always closes — never traps the user
- **Logging:** Every view, click, and dismiss logs to `pricing_funnel_events`

### 3.5 `/pricing` Public Page

Public route (no auth required). Design system consistent with landing page.

- **4-tier comparison grid:** Free / Starter $199 / Growth $499 / Pro $999
- **"Most Popular" badge** on Growth
- **Annual toggle:** 20% discount (uses Stripe Coupon)
- **Feature comparison rows** matching tier-features map
- **Per-seat add-on footnotes:** Starter $29/seat, Growth $39/seat, Pro $49/seat
- **Enterprise:** "Talk to sales" link below the grid
- **CTA per tier:** "Start Free" / "Upgrade" → Stripe Checkout or signup

### 3.6 Stripe Integration

#### `STRIPE_PRICES.md`

Document all Stripe test-mode Price IDs:
- Monthly base prices: starter, growth, pro
- Annual base prices: starter, growth, pro (20% discount)
- Per-seat metered prices: starter ($29), growth ($39), pro ($49)

#### `create-checkout-session` Edge Function

**Input:** `{ tier: string, billing_period: 'monthly' | 'annual', org_id: string }`
**Flow:**
1. Auth: requires authenticated user who is org owner
2. Look up or create Stripe Customer for the org
3. Create Stripe Checkout Session with correct Price ID + per-seat quantity line item
4. Return `{ checkout_url: string }`

**Webhook handling:** On `checkout.session.completed` → update `organizations.subscription_tier`. Extend the existing `stripe-webhook` function.

#### `create-billing-portal-session` Edge Function

**Input:** `{ org_id: string }`
**Flow:**
1. Auth: requires authenticated user who is org owner/admin
2. Look up Stripe Customer ID from org
3. Create Stripe Customer Portal session
4. Return `{ portal_url: string }`

Used by OrgBillingPage "Manage subscription" button (currently broken because this function doesn't exist).

### 3.7 Restaurant Free Hook — Brief Generator Hero

Renders on the restaurant dashboard as a hero card (existing dashboard widgets move below):

- **Headline:** "Generate a free campaign brief in 60 seconds. No card required."
- **Single input:** URL field with placeholder "https://your-restaurant.com"
- **CTA:** "Generate brief — free" (teal, full-width, 56px)
- **On submit:** Calls existing `donny-campaign-generate` edge function
- **Progress:** Uses `GenerateBriefProgress` component from P5.2 — 4-step staggered animation: "Reading your menu" → "Studying your tone" → "Picking creators" → "Drafting deliverables"
- **On complete:** Full-page brief reveal (Goals, Target audience, Content angles, Deliverable mix, Suggested budget, Posting schedule)
- **CTAs:** "Launch this campaign with creators" (pre-populates wizard) | "Save brief, decide later" (saves to drafts)
- **Rate limit:** `useTierGate('brief_generation')` — 1/week free, soft paywall on second attempt

### 3.8 Brand Free Trio — Dashboard Hero Grid

3-card hero on brand dashboard:

- **Card A — Match Report** (teal accent): "Get the top 5 creators for your brief — ranked and scored. 1 report/month free." CTA: "Generate match report" → calls `donny-match-report` edge function
- **Card B — Brand Brief** (pink accent): "Paste your product URL. Donny builds positioning, persona, and content angles. 1/week free." CTA: "Generate brand brief" → same brief flow with brand persona prompt
- **Card C — Sponsored Templates** (gray accent): "5 brand-specific campaign templates. Customize and launch any time." CTA: "Browse templates" → opens template browser, clone to drafts

**Below grid:** Slim banner — "These tools stay free forever. Add creator delivery, real-time analytics, and multi-market campaigns when you're ready." [See plans → /pricing]

**Existing widgets** render below the hero when user has data.

### 3.9 Unauthenticated Brief Preview (Landing Page Lead Magnet)

- Brief generator input embedded on the public landing page
- Rate limit: 1x per IP per day (checked in edge function via `x-forwarded-for` header, tracked in `campaign_brief_generations` with null `org_id`/`user_id`)
- Brief generates → full reveal → "Save this brief — sign up free, no card required"
- Brief stored in `localStorage` as `pendingBrief`
- On signup → onboarding flow checks `localStorage.getItem('pendingBrief')` → auto-attaches to new account's campaign drafts → clears localStorage

### 3.10 Downgrade Safety

When an org downgrades tier:
- In-flight campaigns/DragonDash deliveries complete normally
- Future gated actions blocked via `useTierGate`
- No data deleted — user sees their data but can't create new gated content
- Soft paywall surfaces on next gated attempt with "Reactivate [Tier]" messaging

---

## Protect Rules (All Workstreams)

- Brand color palette is FIXED: teal `#4DD9C0`, pink `#F9A8D4`, gray `#A8A8A0`, dark `#1A1A2E`
- All `lg:` desktop Tailwind classes preserved — mobile-first changes only
- No new dependencies without explicit approval (except: pgvector extension is Supabase-native)
- Stripe test mode only — no live keys
- No raw error messages to users — always friendly fallbacks
- Reduced-motion users get full functionality without animation
- Idempotent migrations with `IF NOT EXISTS` and `ON CONFLICT`

## Verify Criteria

### Workstream 1 (Donny RAG)
- `donny-orchestrator` edge function responds in <3s
- Query on Campaign Detail page → Campaign Agent handles it
- Query about pricing → Billing Agent handles it
- General question → General Agent with RAG context
- `donny_help_logs` records `agent_used` for every interaction
- Existing Donny tray/chat works on both mobile and desktop

### Workstream 2 (UX Polish)
- Tour fires once on first dashboard load after signup, never again after dismiss
- Tour does NOT fire on sub-page navigation
- All 6 coachmarks appear on first encounter, never after dismissal
- All 6 WhyExpanders expand/collapse and log to `why_expander_views`
- DragonShareExplainer shows on empty inboxes, collapses after first entry
- "Talk to Donny" on help articles opens existing Donny tray with context
- `npm run build` passes

### Workstream 3 (Pricing)
- `/pricing` page renders 4 tiers at mobile and desktop
- Free Restaurant: generate brief → success → second attempt in same week → soft paywall
- Free Brand: 3-card grid renders → generate Match Report → see top 5
- Soft paywall: "Maybe later" always works, back button always works
- Stripe Checkout (test card) → return → tier updated → gated feature unlocked
- OrgBillingPage "Manage subscription" opens Stripe Customer Portal
- `pricing_funnel_events` captures views, clicks, dismissals
- Anonymous landing page brief → signup → brief auto-attached to drafts
- `npm run build` passes
