# DragonCandy V2 — Pre-Launch Improvement Playbook

## Production Launch: Next Week | Priority: CRITICAL

**Musk Algorithm Applied Throughout:**
1. **Question every requirement** — Does this feature actually serve the launch?
2. **Delete every possible step** — Remove redundant UI, dead code, placeholder data
3. **Simplify and optimize** — One flow, one pattern, one design language
4. **Accelerate cycle time** — Each prompt ≤ 30 min, build-test-commit
5. **Automate** — Donny AI handles the heavy lifting for businesses and creators

---

## BUILD DISCIPLINE RULES (Non-Negotiable)

```
- Copy ONE prompt → Claude Code executes → STOP checkpoint → verify on Lovable.dev → git push
- npm run build after EVERY change
- git pull origin main --rebase BEFORE starting
- git push origin main AFTER committing
- NEVER batch changes — one prompt at a time
- PROTECT desktop lg: Tailwind classes when writing mobile CSS
```

---

## PROMPT SEQUENCE OVERVIEW

| Order | Prompt | What It Fixes | Priority |
|-------|--------|---------------|----------|
| A1 | Campaign Wizard: Delivery-First Reorder | Delivery tier selected FIRST, scope gates content | P0 |
| A2 | Campaign Wizard: Media Upload & Visual Briefs | Business uploads sample images/reels + raw footage | P0 |
| A3 | Campaign Wizard: Scope-of-Work Time Validation | AI validates SOW fits within delivery window | P0 |
| B1 | Logo & Donny Icon Fix | Bigger logo, sharper resolution, Donny_icon.png for Ask Donny | P0 |
| C1 | Creator: Full Campaign Details View | Creators see ALL campaign data when campaign is posted | P0 |
| C2 | Creator: UX Theme Consistency | Match Creator dashboard/theme to Business/Restaurant design | P0 |
| C3 | Creator: Campaign Search & AI Matching | Search bar + Donny AI matching on Creator side | P1 |
| D1 | Brand Role: Login/Signup Visibility | Add Brand/Sponsor role to landing page and auth flow | P0 |
| D2 | Brand Role: UX Theme Consistency | Match Brand dashboard/theme to Business/Restaurant design | P1 |

---

## SECTION A: CAMPAIGN WIZARD IMPROVEMENTS

### PROMPT A1 — Delivery-First Campaign Wizard Reorder

```
\superpowers:brainstorming
/design-flow

CONTEXT: The Campaign Creation Wizard currently asks for content details
BEFORE the delivery tier. This is backwards. The delivery window
constrains EVERYTHING — scope of work, number of deliverables, and
what's achievable. A 1-3 hour DragonDash can't accommodate a 10-piece
content campaign. Delivery tier must come FIRST.

ELON'S ALGORITHM — QUESTION: "Why are we asking for scope before we
know the time constraint?" DELETE the old step order.

TASK: Restructure the campaign wizard steps so delivery tier is Step 1.

NEW STEP ORDER:

STEP 1 — "How fast do you need it?" (DELIVERY TIER — moved to first):
   - Three visual cards, tappable:
     Card A: "DragonDash ⚡" — "1-3 hours | Same-day content"
       Subtext: "Best for: 1-2 simple posts, quick photo/reel"
       Price indicator: "$$$ Premium"
       Badge: teal, glowing border
     Card B: "Express 🚀" — "24-48 hours | Next-day delivery"
       Subtext: "Best for: 2-4 deliverables, edited reels"
       Price indicator: "$$ Standard"
     Card C: "Standard 📅" — "5-7 days | Full production"
       Subtext: "Best for: 5-10 deliverables, full campaigns"
       Price indicator: "$ Value"
   - Selected card highlights with teal border + checkmark
   - Selection persists in React state for downstream validation

STEP 2 — "What do you need?" (Input — existing, unchanged):
   - Option A: Paste URL (Donny auto-generates brief)
   - Option B: Describe what you need (free text)
   - Option C: Quick campaign presets
   - NEW: Donny AI now GATES the number of deliverables based on
     Step 1 selection:
     * DragonDash: max 2 deliverables, simple content only
     * Express: max 4 deliverables
     * Standard: max 10 deliverables

STEP 3 — "Campaign Details" (AI-generated, editable):
   - Donny generates brief with deliverable count CAPPED by tier
   - Budget range auto-adjusts based on tier
   - Content type options filtered by tier (DragonDash = Photo or
     short Reel only, no long-form video)
   - NEW: "Estimated creation time" shown (e.g., "~90 min for creator")
   - NEW: Warning if scope exceeds delivery window capacity

STEP 4 — "Add Visuals & Footage" (NEW — see Prompt A2)

STEP 5 — "Review & Launch" (existing, enhanced)

PROGRESS BAR: Update to show 5 steps instead of 3.

TECHNICAL:
   - deliveryTier state added to wizard context
   - deliveryTier passed to Donny AI campaign generation prompt
   - Validation: if deliverables > tier max, show warning and
     auto-reduce with explanation

PROTECT: Do NOT modify any other pages.
PROTECT: Do NOT create new Supabase tables — use existing campaign schema.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Wizard flows correctly on mobile.
Commit: "campaigns: delivery-first wizard reorder with tier gating"

STOP and wait for approval.
```

---

### PROMPT A2 — Campaign Wizard: Media Upload & Visual Briefs

```
\superpowers:brainstorming
/design-flow

CONTEXT: Businesses need to show creators EXACTLY what they want.
Right now, campaigns are text-only briefs. Businesses should be able to:
1. Upload sample images/video reels as visual references
2. Optionally send their OWN raw footage for the creator to use
3. Specify whether they want 1 piece of content or several

This visual brief dramatically speeds up creator delivery — especially
for DragonDash rush orders where every minute counts.

ELON'S ALGORITHM — ACCELERATE: Visual references eliminate back-and-forth
between business and creator. One upload now saves 3 messages later.

TASK: Add Step 4 "Add Visuals & Footage" to the campaign wizard.

STEP 4 — "Add Visuals & Footage" (NEW):

Section A — "Visual References" (optional):
   - Header: "Show creators what you're looking for"
   - Subtext: "Upload example images or short reels that match your vision"
   - Upload zone:
     * Drag-and-drop area with dashed teal border
     * "Browse files" button (teal outlined)
     * Accepted: .jpg, .png, .mp4, .mov (max 50MB per file)
     * Max 5 reference files
     * Thumbnail previews appear in a horizontal scroll row
     * Each thumbnail has an X to remove
   - File type badges auto-detected: "Photo" or "Video"

Section B — "Your Footage" (optional, toggle):
   - Toggle switch: "I have footage for the creator to use"
   - When ON, reveal:
     * Upload zone (same style as above)
     * "Raw footage the creator should use in the final content"
     * Max 10 files, max 200MB total
     * Progress bar for large uploads
   - When OFF: hidden (Elon: DELETE complexity when not needed)

Section C — "Content Deliverables" (moved here from Step 3):
   - Header: "How many pieces of content do you need?"
   - Stepper control: -/+ with number (1 to tier max)
   - For each deliverable, a mini-card:
     * Content type selector: Photo | Reel | Story | Video
     * Optional description field (1 line)
   - Example for 3 deliverables:
     "1. Photo — Hero shot of new dish"
     "2. Reel — 15-sec prep montage"
     "3. Story — Behind the scenes"
   - DragonDash tier: stepper max = 2, with tooltip:
     "DragonDash rush orders support up to 2 deliverables"

TECHNICAL:
   - Files upload to Supabase Storage bucket: campaign-media/
   - File references stored as JSONB array in campaigns table:
     campaign_media: [
       { type: 'reference', url: '...', filename: '...', mimetype: '...' },
       { type: 'footage', url: '...', filename: '...', mimetype: '...' }
     ]
   - Deliverables stored as JSONB array:
     campaign_deliverables: [
       { type: 'photo', description: 'Hero shot of new dish' },
       { type: 'reel', description: '15-sec prep montage' }
     ]
   - Upload with progress tracking using Supabase Storage JS client
   - On "Next": validate at least 1 deliverable defined

CREATOR VISIBILITY (implemented in Prompt C1):
   - When creator views a posted campaign, they see:
     * Visual references in a gallery/carousel
     * "Business provided footage" section (if footage uploaded)
     * Per-deliverable breakdown with types and descriptions

PROTECT: Do NOT modify any other pages.
PROTECT: Do NOT modify existing Supabase tables — add columns via migration.

VERIFY: npm run build succeeds. Upload works on mobile.
Commit: "campaigns: media upload + visual briefs + deliverable breakdown"

STOP and wait for approval.
```

---

### PROMPT A3 — Campaign Wizard: Scope-of-Work Time Validation

```
\superpowers:brainstorming

CONTEXT: When a business selects DragonDash (1-3 hours), the scope of
work must be completable within that window. A creator needs time to:
travel, shoot, edit, and upload. Donny AI must validate this.

ELON'S ALGORITHM — AUTOMATE: Donny should catch impossible timelines
before a campaign launches, not after a creator fails to deliver.

TASK: Add AI-powered scope validation to Step 5 (Review & Launch).

SCOPE TIME ESTIMATES (hardcoded baselines):
   - Photo (simple): 15 min shoot + 15 min edit = 30 min
   - Photo (styled/complex): 30 min shoot + 30 min edit = 60 min
   - Reel (15-30 sec): 30 min shoot + 45 min edit = 75 min
   - Reel (60 sec): 45 min shoot + 60 min edit = 105 min
   - Story (series): 20 min shoot + 20 min edit = 40 min
   - Video (long form): 60 min shoot + 90 min edit = 150 min
   - Travel/setup buffer: 30 min (flat)
   - Review/revision buffer: 15 min

VALIDATION LOGIC:
   totalEstimatedMinutes = sum(deliverable estimates) + travel + review

   DragonDash (1-3 hr = 180 min max):
     If totalEstimatedMinutes > 150 min → WARN (tight)
     If totalEstimatedMinutes > 180 min → BLOCK (impossible)
     Show: "⚡ This DragonDash campaign is estimated at ~X hours.
     Consider reducing deliverables or switching to Express."

   Express (24-48 hr):
     If totalEstimatedMinutes > 360 min → WARN
     (Creators have other commitments — 6 productive hours max)

   Standard (5-7 days):
     No practical limit for ≤10 deliverables

REVIEW STEP ADDITIONS:
   - "Estimated Creator Time" card with clock icon
   - Green checkmark: "Achievable within [tier] window"
   - Yellow warning: "Tight — creator may need to work fast"
   - Red block: "This exceeds [tier] capacity. Please reduce scope
     or upgrade to [next tier]." Launch button disabled.
   - Quick-fix suggestion: "Donny recommends: Remove 1 reel to fit
     within DragonDash. Or switch to Express for $XX less urgency fee."

   If business uploaded footage (from A2):
   - Reduce edit time estimates by 30% (creator has raw materials)
   - Show: "✓ Your footage will save the creator ~X minutes"

TECHNICAL:
   - Validation runs client-side in the Review step component
   - Time estimates stored in a config object (easy to tune later)
   - No new API calls — pure frontend logic
   - Donny AI suggestion generated via existing campaign analysis prompt

PROTECT: Do NOT modify any other pages or steps.

VERIFY: npm run build succeeds. Validation displays correctly on mobile.
Commit: "campaigns: scope-of-work time validation with tier gating"

STOP and wait for approval.
```

---

## SECTION B: LOGO & DONNY ICON FIX

### PROMPT B1 — Logo Size, Resolution & Donny Icon

```
\superpowers:brainstorming
/design-flow

CONTEXT: The DragonCandy logo is too small in both mobile and desktop
views. It's approximately 80-90px in the header currently — needs to be
at least 120px on mobile and 160px on desktop. The resolution is blurry
on high-DPI screens. The Donny_icon.png needs to be used for the
Ask Donny search bar icon.

ELON'S ALGORITHM — SIMPLIFY: Logo is the first brand impression. It
must be crisp and prominent. Don't overcomplicate — just make it bigger
and sharper.

TASK: Fix logo sizing, resolution, and add Donny icon.

1. LOGO SIZING:
   - Mobile (< 768px): logo width = 100px, height = auto
   - Tablet (768-1024px): logo width = 120px
   - Desktop (> 1024px): logo width = 140px
   - Use responsive Tailwind: w-[100px] md:w-[120px] lg:w-[140px]
   - Ensure aspect ratio preserved (no squishing)

2. LOGO RESOLUTION:
   - Check if current logo file is sufficiently high-res (≥ 512px wide)
   - If the source image is low-res, this is a design asset issue —
     flag to Dame that a higher-resolution logo file is needed
   - Add image-rendering: crisp-edges for PNG logos
   - Ensure the logo is served as PNG (not compressed JPEG)
   - If SVG version exists, prefer SVG for infinite scalability

3. DONNY ICON FOR ASK DONNY BAR:
   - Locate Donny_icon.png in the project assets
   - Replace the current search/magnifying-glass icon in the
     "Ask Donny..." bar with Donny_icon.png
   - Donny icon sizing: 32px on mobile, 36px on desktop
   - Position: left side of the input bar, vertically centered
   - Add subtle teal glow/shadow behind the icon for emphasis
   - Ensure the icon is circular and has proper padding

4. CONSISTENCY:
   - Apply logo size changes to ALL pages where the header appears:
     Landing page, Dashboard, Creator pages, Browse pages, etc.
   - The header component should be shared — verify it's a single
     component used everywhere (DRY principle)
   - If logo sizing is hardcoded in multiple places, consolidate to
     a single Header component with the logo

PROTECT: Do NOT modify page layouts, content, or routing.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Logo renders crisp at 375px AND 1440px.
Commit: "branding: larger logo + Donny icon for Ask Donny bar"

STOP and wait for approval.
```

---

## SECTION C: CREATOR ROLE IMPROVEMENTS

### PROMPT C1 — Creator: Full Campaign Details View

```
\superpowers:brainstorming
/design-flow

CONTEXT: When a campaign is posted and available to creators, the
creator currently sees a swipeable card with:
- A stock/generic image
- "Available Campaigns" as the title (not the actual campaign name)
- "Use our AI-powered campaign wizard..." (generic copy)
- "Company Name" (placeholder)
- "Apply Now" button

This is CRITICALLY broken for launch. Creators MUST see the full
campaign brief to decide whether to apply. Without details, creators
can't evaluate if the gig is right for them.

ELON'S ALGORITHM — QUESTION: "Why are we hiding the most important
information from the people who need it most?" FIX immediately.

TASK: Rebuild the creator's campaign card and detail view.

1. CAMPAIGN CARD (swipeable — keep the format):
   - Campaign cover image (from campaign_media references, or business
     logo as fallback — NOT stock photos)
   - Campaign TITLE (actual title from campaigns table, not "Available Campaigns")
   - Business name + verified badge (if applicable)
   - Budget range: "$200 - $500" (prominent, in teal)
   - Delivery tier badge:
     DragonDash ⚡ (teal bg, white text) |
     Express 🚀 (pink bg) |
     Standard 📅 (gray bg)
   - Content type pills: "Photo" "Reel" "Story" (from deliverables)
   - Number of deliverables: "3 deliverables"
   - Distance: "2.3 mi away" (calculated from creator location)
   - Posted time: "Posted 2 hours ago"
   - Applicant count: "5 creators applied"
   - DELETE: "Use our AI-powered campaign wizard..." text
   - DELETE: Generic stock images

2. CAMPAIGN DETAIL VIEW (tap card to expand):
   - Full campaign description (from Donny AI generated brief)
   - Visual references gallery (from campaign_media, type: 'reference')
     * Horizontal scroll of thumbnails
     * Tap to view full-size
   - "Business Footage Available" section (if footage uploaded):
     * Badge: "📹 Raw footage provided"
     * Description: "The business has footage for you to use"
     * Footage thumbnails (viewable, downloadable after acceptance)
   - Deliverables breakdown:
     * Numbered list of each deliverable with type + description
     * "1. Photo — Hero shot of new dish"
     * "2. Reel — 15-sec prep montage"
   - Timeline & deadline:
     * Delivery tier with time remaining
     * "Due: 3 hours from acceptance" (DragonDash)
     * "Due: 48 hours from acceptance" (Express)
   - Budget details:
     * Total budget
     * Per-deliverable breakdown (if available)
     * "Payment via Stripe upon approval"
   - Business info:
     * Business name, location, rating
     * "View Business Profile" link
   - Requirements/notes from business (if any)

3. APPLICATION FLOW (bottom sheet):
   - "Apply for This Campaign" button (teal, full-width)
   - Bottom sheet slides up with:
     * Creator's proposed rate (pre-filled from their profile rate)
     * Available dates/times selector
     * Short pitch text area (optional): "Why you're a great fit"
     * Portfolio piece selector: "Attach a sample" (from their uploads)
     * "Submit Application" button
   - Success: "Application sent! The business will respond within 24h."

4. TABS ON CAMPAIGN LIST:
   - "Available" | "Applied" | "Active" | "Completed"
   - Applied tab: shows status per campaign (Pending/Accepted/Declined)
   - Active tab: shows current campaigns with deadlines and upload buttons

PROTECT: Do NOT modify restaurant-side pages or dashboard.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Cards render correctly on mobile.
Commit: "creator-campaigns: full campaign details with visual briefs"

STOP and wait for approval.
```

---

### PROMPT C2 — Creator: UX Theme Consistency

```
\superpowers:brainstorming
/design-flow

CONTEXT: The Creator's dashboard, pages, and overall UX experience
looks different from the Business/Restaurant side. Inconsistencies:
- Creator pages have a gray/dark background vs pink on business side
- Different header styles between roles
- Different card styles, button styles, typography
- Bottom nav icons may differ between roles
- The "Available Campaigns" page (creator) has a gray bg while the
  Restaurant dashboard has a pink header

The design system should be UNIFIED across all roles. The brand colors
(teal #4DD9C0, pink #F9A8D4, gray #A8A8A0, dark #1A1A2E) should be
used consistently. Role-specific accents are fine, but the foundational
UI patterns must match.

ELON'S ALGORITHM — SIMPLIFY: One design system, not three. Shared
components, shared tokens, shared patterns.

TASK: Unify the Creator UX with the Business/Restaurant design system.

1. SHARED DESIGN TOKENS (verify in tailwind.config or design-tokens):
   - Primary: teal #4DD9C0
   - Accent: pink #F9A8D4
   - Neutral: gray #A8A8A0
   - Dark/text: #1A1A2E
   - Background: white or very light gray (#F9FAFB)
   - Card: white with subtle shadow and 12px radius

2. CREATOR HEADER (match Business header):
   - Same layout: Logo (left) | Title/welcome (center) | Menu (right)
   - Same background color (white or light, NOT gray)
   - Same logo sizing (from Prompt B1)
   - Role-specific text: "Welcome back, [Creator Name]"
   - Same notification bell + avatar pattern

3. CREATOR DASHBOARD:
   - Same card component (DCCard) as Business dashboard
   - Stats row: "Active Gigs" | "Pending Applications" | "Total Earned" | "Avg Rating"
   - Donny AI bar: Same style, different placeholder:
     "Ask Donny... 'Find campaigns near me' or 'Update my portfolio'"
   - Quick Actions: "Browse Campaigns" (teal) | "Update Portfolio" (outlined)
   - Active Gigs feed (same style as Business "Active Campaigns")

4. BOTTOM NAV (same 5 icons for both roles):
   - Home | Campaigns | + (create/apply) | Messages | Profile
   - The "+" button: For Business = "Create Campaign",
     For Creator = "Quick Apply" or "Update Portfolio"
   - Same icon style, same teal accent on active tab

5. PAGE BACKGROUNDS:
   - All pages: white or #F9FAFB background
   - Remove any role-specific background colors (gray on creator pages)
   - Cards and sections provide visual structure, not page backgrounds

6. TYPOGRAPHY:
   - Same font family across all roles
   - Same heading sizes, body text sizes
   - Same color for headings (#1A1A2E) and body (#4A4A4A)

PROTECT: Do NOT modify campaign creation wizard or messaging.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Creator and Business pages look
visually cohesive when switching between accounts.
Commit: "creator-ux: unified design system with business dashboard"

STOP and wait for approval.
```

---

### PROMPT C3 — Creator: Campaign Search & AI Matching

```
\superpowers:brainstorming
/design-flow

CONTEXT: Creators currently browse campaigns by swiping cards with no
way to search, filter, or get AI-recommended matches. For creators with
specific skills (food photography, reel editing, etc.), finding the right
campaigns quickly is critical — especially for DragonDash where time
matters.

ELON'S ALGORITHM — AUTOMATE: Donny AI should proactively match creators
to campaigns based on their skills, location, and track record. Manual
browsing is the slow path.

TASK: Add search, filtering, and AI matching to the Creator campaigns page.

1. SEARCH BAR (top of Available Campaigns):
   - Full-width search input with Donny icon (left)
   - Placeholder: "Search campaigns... 'food photography near me'"
   - On submit: filters campaign list by keyword match on title,
     description, content type, business name
   - Debounced search (300ms) for real-time filtering

2. FILTER BAR (below search):
   - Content Type pills: All | Photo | Video | Reel | Story
   - Delivery Tier pills: All | DragonDash ⚡ | Express | Standard
   - Sort dropdown: Nearest | Highest Budget | Newest | Ending Soon
   - Distance radius: 5mi | 10mi | 25mi | 50mi (pill select)
   - Budget range: Min/Max slider (optional, collapsed by default)

3. AI MATCHING — "Donny's Picks" Section:
   - At the top of the campaign list, BEFORE regular campaigns:
   - Header: "🎯 Donny's Picks for You"
   - Subtext: "Matched based on your skills, location, and ratings"
   - 2-3 campaign cards with a match score badge:
     "95% Match" (teal badge)
   - Match criteria shown on hover/tap: "Matches your: Food Photography,
     Reel Editing, Philadelphia location"

   MATCHING ALGORITHM (client-side for MVP, edge function later):
   - Skills match: compare creator's content_specialties tags against
     campaign deliverable types (photo, reel, story, video)
   - Location proximity: calculate distance between creator location
     and business location (haversine formula)
   - Rating fit: higher-rated creators matched to higher-budget campaigns
   - Availability: if creator has < 2 active gigs, boost match score
   - Score = (skillMatch * 0.4) + (proximity * 0.3) + (rating * 0.2)
            + (availability * 0.1)
   - Show top 3 matches

4. EMPTY STATES:
   - No campaigns match search: "No campaigns found. Try different
     filters or ask Donny for suggestions."
   - No campaigns in area: "No campaigns in your area yet. Expand your
     search radius or check back soon."
   - No Donny matches: "We're still learning your preferences. Complete
     more campaigns to improve your matches."

5. CAMPAIGN COUNT:
   - Show total available: "12 campaigns available in your area"
   - Update dynamically as filters change

PROTECT: Do NOT modify restaurant-side pages.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Search and filters work on mobile.
Commit: "creator-campaigns: search, filters, and AI matching"

STOP and wait for approval.
```

---

## SECTION D: BRAND ROLE IMPROVEMENTS

### PROMPT D1 — Brand Role: Login/Signup & Landing Page Visibility

```
\superpowers:brainstorming
/design-flow

CONTEXT: DragonCandy has THREE distinct user roles:
1. Restaurant/Business Client — hires creators for local content
2. Brand/Sponsor — runs paid sponsorship campaigns
3. Content Creator — creates content for businesses and brands

Currently, the Brand/Sponsor role is COMPLETELY MISSING from:
- The landing page (no mention of brands or sponsors)
- The login page (no brand signup option)
- The signup flow (only Business and Creator roles shown)

This is a critical gap. Brands are a key revenue stream at $499-2,000/mo
per the business model. They must be able to find, sign up, and use
the platform.

ELON'S ALGORITHM — QUESTION: "Why are we hiding our highest-ARPU
customer from the signup flow?" FIX immediately.

TASK: Add Brand/Sponsor role to landing page and auth flow.

1. LANDING PAGE ADDITIONS:
   - Hero CTAs: Add a third option or modify existing:
     CTA 1 (teal): "I'm a Business — Get Started"
     CTA 2 (pink): "I'm a Brand/Sponsor — Launch Campaigns"
     CTA 3 (outlined): "I'm a Creator — Join the Marketplace"
   - If 3 CTAs is too crowded, use 2 CTAs + a text link:
     CTA 1: "Get Started" (teal)
     CTA 2: "I'm a Creator" (outlined)
     Text link below: "Brands & Sponsors — learn more"

   - NEW SECTION on landing page: "For Brands & Sponsors"
     * Headline: "Scale Your Creator Campaigns Across Local Markets"
     * Subtext: "Run sponsored content campaigns with vetted local
       creators. AI-powered targeting, real-time analytics, and
       multi-location management."
     * 3 mini-feature cards:
       "Multi-Location Campaigns" — run across cities
       "Performance Analytics" — track engagement & ROI
       "Managed Creator Network" — vetted, rated creators
     * CTA: "Launch Your First Campaign" (teal)

   - Navigation: Add "For Brands" link between "For Businesses"
     and "For Creators"

2. SIGNUP FLOW — Add Brand/Sponsor role:
   - Role selection screen now shows THREE cards:
     Card A: "I'm a Business" (teal card, restaurant icon)
       Subtext: "Restaurants & local businesses looking for content"
     Card B: "I'm a Brand/Sponsor" (pink card, megaphone icon)
       Subtext: "Brands running sponsored creator campaigns"
     Card C: "I'm a Creator" (outlined card, camera icon)
       Subtext: "Content creators looking for gigs"
   - Role stored in profiles table as user_role: 'brand'
   - After signup, Brand users route to Brand dashboard (Prompt D2)

3. LOGIN PAGE:
   - Below the login form, add text:
     "New here? Sign up as a Business, Brand, or Creator"
   - "Sign up" is a link to the role selection screen
   - Ensure all three roles are mentioned in the copy

PROTECT: Do NOT modify dashboards or campaign flows yet.
PROTECT: Do NOT change Supabase auth logic — only UI and role field.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. All 3 roles selectable on mobile.
Commit: "auth: brand/sponsor role added to landing page and signup"

STOP and wait for approval.
```

---

### PROMPT D2 — Brand Role: Dashboard & UX Consistency

```
\superpowers:brainstorming
/design-flow

CONTEXT: The Brand/Sponsor role needs its own dashboard experience,
but it must follow the SAME design system as Business and Creator
dashboards. The Brand dashboard focuses on:
- Multi-location campaign management
- Sponsorship campaign creation and tracking
- Creator network performance analytics
- Budget allocation across campaigns

ELON'S ALGORITHM — SIMPLIFY: The Brand dashboard is a VARIANT of the
Business dashboard, not a new design. Same components, different data.

TASK: Create the Brand dashboard with unified design system.

1. BRAND DASHBOARD LAYOUT (mirrors Business dashboard):
   - HEADER: Same as Business — Logo | "Welcome back, [Brand Name]" | Menu
   - DONNY AI BAR: Same component, different placeholder:
     "Ask Donny... 'Create a sponsored campaign for 5 cities'"

2. STATS ROW (Brand-specific metrics):
   - Active Campaigns | Total Reach | Avg. Engagement | Total Spend
   - Same card component as Business stats row
   - Same styling: number + label + trend arrow

3. QUICK ACTIONS:
   - "Create Sponsorship Campaign" (teal) → campaign wizard
     (same wizard as Business, with "Sponsorship" campaign type option)
   - "Browse Creators by Market" (outlined) → creator browse with
     multi-city filter
   - "View Campaign Reports" (text link)

4. ACTIVE CAMPAIGNS FEED:
   - Same list component as Business
   - Additional columns: "Markets" (showing cities), "Creators Assigned"
   - Campaign cards show: name, status, markets, budget spent/total

5. BOTTOM NAV (same 5 icons as all roles):
   - Home | Campaigns | + Create | Messages | Profile
   - Consistent across Business, Creator, and Brand

6. BRAND-SPECIFIC PAGES (phase 2, post-launch):
   - Multi-location campaign creation (select cities)
   - Creator performance dashboard by market
   - Sponsorship analytics with ROI tracking
   - For MVP launch: Brand uses the same campaign wizard as Business
     with a "Sponsorship" type flag

7. DESIGN CONSISTENCY CHECKLIST:
   - Same background color as Business (#F9FAFB or white)
   - Same card component (DCCard)
   - Same typography scale
   - Same button styles (teal primary, pink accent, outlined secondary)
   - Same bottom nav
   - Same Donny AI bar component
   - Same header component (role-aware title/subtitle)

PROTECT: Do NOT modify Business or Creator dashboards.
PROTECT: Desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Brand dashboard matches design system.
Commit: "brand-dashboard: unified UX with business design system"

STOP and wait for approval.
```

---

## EXECUTION ORDER

Execute prompts in this order for maximum safety and minimal merge conflicts:

```
Phase 1 — Foundation (Day 1):
  B1: Logo & Donny Icon (safe, touches only header component)
  D1: Brand Role Auth (touches landing + auth pages only)

Phase 2 — Campaign Wizard (Day 2-3):
  A1: Delivery-First Reorder (restructures wizard steps)
  A2: Media Upload & Visual Briefs (adds new wizard step)
  A3: Scope Validation (adds validation to review step)

Phase 3 — Creator Experience (Day 3-4):
  C1: Full Campaign Details (rebuilds campaign cards/detail view)
  C2: UX Theme Consistency (unifies design across roles)
  C3: Campaign Search & AI Matching (adds search + filters)

Phase 4 — Brand Dashboard (Day 4-5):
  D2: Brand Dashboard & UX Consistency

Phase 5 — Final QA Sweep:
  Run the Production Sweep from the existing improvement plan (Prompt 10)
  Test all 3 roles end-to-end on mobile and desktop
```

---

## SUPABASE MIGRATIONS NEEDED

```sql
-- Migration: Add campaign media and deliverables columns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS campaign_media JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS campaign_deliverables JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS delivery_tier TEXT DEFAULT 'standard'
    CHECK (delivery_tier IN ('dragondash', 'express', 'standard')),
  ADD COLUMN IF NOT EXISTS estimated_creation_minutes INTEGER;

-- Create storage bucket for campaign media
INSERT INTO storage.buckets (id, name, public)
VALUES ('campaign-media', 'campaign-media', true)
ON CONFLICT (id) DO NOTHING;

-- RLS policy for campaign media bucket
CREATE POLICY "Business users can upload campaign media"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'campaign-media' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can view campaign media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'campaign-media' AND auth.role() = 'authenticated');

-- Ensure profiles table has brand role support
-- (Verify user_role column accepts 'brand' value)
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_user_role_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_user_role_check
  CHECK (user_role IN ('business', 'creator', 'brand'));
```

---

## NOTEBOOKLM INTEGRATION

To generate a podcast or briefing doc from this playbook:

```bash
# Create a NotebookLM notebook for the DragonCandy V2 improvements
notebooklm create "DragonCandy V2 Pre-Launch Improvements"

# Add this playbook and the existing improvement plan as sources
notebooklm source add ./DragonCandy_V2_Improvement_Playbook.md
notebooklm source add ./dragoncandy-improvement-plan.md
notebooklm source add ./dragoncandy-musk-algorithm-openclaw_1.md

# Generate a briefing doc for the team
notebooklm generate report --format briefing-doc

# Generate a podcast overview for Dame to review while commuting
notebooklm generate audio "Focus on the campaign wizard improvements
and creator experience fixes. Emphasize why delivery-first ordering
matters and how visual briefs accelerate creator delivery."

# Download outputs
notebooklm download report ./DC_V2_Briefing.md
notebooklm download audio ./DC_V2_Overview.mp3
```

---

## SUCCESS CRITERIA

Before declaring launch-ready, ALL of these must be true:

- [ ] Campaign Wizard: Delivery tier is Step 1, gates scope downstream
- [ ] Campaign Wizard: Business can upload visual references and raw footage
- [ ] Campaign Wizard: Scope validation warns/blocks impossible timelines
- [ ] Logo: 100px+ on mobile, 140px+ on desktop, sharp on retina
- [ ] Donny icon: Donny_icon.png used in Ask Donny bar (not magnifying glass)
- [ ] Creator: Sees full campaign details (title, budget, tier, deliverables, media)
- [ ] Creator: Dashboard matches Business design system
- [ ] Creator: Can search/filter campaigns and see AI-matched recommendations
- [ ] Brand: Can sign up from landing page and login page
- [ ] Brand: Has a dashboard with consistent design system
- [ ] All roles: Consistent header, bottom nav, card styles, typography
- [ ] npm run build passes on every commit
- [ ] No placeholder text ("Creator Name", "Company Name", "Lorem") in production
