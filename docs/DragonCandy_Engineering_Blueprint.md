# DragonCandy Engineering Blueprint
## OpenClaw Agent Team + Claude Code Prompts — Production Launch Sprint

---

## Part 1: Honest Assessment — OpenClaw vs. Claude Code for Launch Week

### The Reality Check (Musk Algorithm Step 1: Question Every Requirement)

**Do you actually need OpenClaw right now?** OpenClaw is powerful but introduces significant risk for a launch-week sprint:

- **Setup overhead**: Installing OpenClaw, configuring SOUL.md files, setting up channels, and debugging agent coordination takes 1–2 days minimum — days you don't have.
- **Security concerns**: OpenClaw runs with shell access and browser control on your local machine. Cisco's security team has already documented prompt injection vulnerabilities in community skills. For a production app handling user data, this is risky.
- **Merge conflict hell**: Multiple OpenClaw agents writing to the same Lovable.dev/GitHub repo will cause the exact same parallel-change disasters you've already experienced. OpenClaw agents don't inherently understand git branch isolation.

**The recommended hybrid approach:**

| Tool | Role | When |
|------|------|------|
| **Claude Code** (with `/superpowers` + `/design-flow`) | Primary builder — sequential, controlled, tested commits | NOW (launch week) |
| **OpenClaw** (post-launch) | Background automation: monitoring, testing, content generation, creator outreach | After launch stabilizes (Week 2+) |

This follows Musk's Algorithm perfectly: **delete the unnecessary step** (OpenClaw setup) from the critical path, **simplify** to one proven tool for the sprint, **accelerate** by going sequential, then **automate** with OpenClaw once the foundation is solid.

---

## Part 2: TheCirqle UX Patterns to Adopt (Keeping DragonCandy's Identity)

### What TheCirqle Gets Right (That DragonCandy Should Mirror)

**1. Clear Value Hierarchy on Every Page**
- Hero section with ONE clear headline + ONE CTA
- Social proof immediately visible (brand logos, metrics, testimonials)
- Feature sections with screenshot/video previews of the actual product

**2. Professional Dashboard UX**
- Clean data tables with real metrics (not placeholder "50/50/50")
- Card-based layouts with consistent spacing
- Navigation that clearly separates: Discovery → Campaign Management → Reporting → Settings

**3. Two-Sided Marketplace Clarity**
- Separate, clear entry points: "Book a Demo" (brands) vs "Join as Creator" (creators)
- Creator profiles show performance data (CPM, reach, engagement) not just portfolio images
- Campaign cards show budget, timeline, deliverables, and status

**4. AI as Infrastructure (Not Gimmick)**
- AI creator matching presented as data-driven scoring, not chatbot
- Predictive ROAS shown as clean metrics, not AI conversation
- Automated workflows (contracts, approvals, payments) feel native, not bolted-on

### What DragonCandy Keeps (Brand Differentiation)

| Element | Keep | Evolve |
|---------|------|--------|
| Color scheme | Teal `#4DD9C0`, Pink `#F9A8D4`, Gray `#A8A8A0` | Use teal as primary action color, pink as accent, gray as neutral background (not the dominant background) |
| DragonCandy logo | Yes — it's distinctive and memorable | Place it consistently top-left, smaller on dashboard pages |
| Donny AI | Yes — this is the moat | Present as intelligent toolbar/sidebar, not full-page chat |
| DragonDash | Yes — primary revenue feature | Make it the #1 CTA on the restaurant dashboard |
| Fun personality | Yes — differentiates from corporate tools | Keep in copy and micro-interactions, not in layout chaos |

### Current Issues Visible in Screenshots

1. **Login page**: Functional but the image carousel at bottom adds clutter. Social login icons (Google, Apple, Facebook) need to actually work or be removed.
2. **Restaurant dashboard**: "Ask Donny" search bar is good. Quick Actions cards are solid. But the bottom nav has too many icons (7) — simplify to 5 max.
3. **Browse Creators**: All cards show identical placeholder data ("Creator Name" + same image + same description). Needs real/varied seed data.
4. **Creator Portfolio**: "10/200" follower ratio and "Artist Name" labels are placeholder. The hero image is good but the data section needs real metrics.
5. **Creator/Business Profile**: "50 Projects / 50 Reels / 50 Projects" is placeholder and the third column repeats "Projects Completed." Reviews are all identical placeholder text.
6. **Available Campaigns**: Swipeable card UI is nice but "Available Campaigns" title appears twice (header and card). Campaign details need budget, timeline, deliverables.
7. **Messaging**: Clean layout but empty. Needs connection to Supabase real-time messaging.

---

## Part 3: The Master Claude Code Prompt

### How to Use This Prompt

Copy the prompt below into Claude Code with the `/superpowers` and `/design-flow` plugins active. Run it from your `C:/GIT/dragoncandy/` directory after pulling latest from main.

**CRITICAL: Run this as ONE prompt. Do NOT split it. Claude Code will work through it sequentially, committing after each verified step.**

---

```
\superpowers:brainstorming
\design-flow

CONTEXT: DragonCandy (dragoncandy.io) is a two-sided marketplace connecting restaurants/businesses with content creators. It's built with React/TypeScript on Lovable.dev, Supabase backend, Tailwind CSS. The app goes LIVE in production next week.

REFERENCE DESIGN: https://thecirqle.com/ — we want DragonCandy to feel this polished and professional, but keeping our own color scheme and brand identity.

DESIGN SYSTEM (from CLAUDE.md — DO NOT CHANGE THESE):
- Primary Teal: #4DD9C0
- Accent Pink: #F9A8D4
- Neutral Gray: #A8A8A0
- Background Light: #F5F5F0 (warm off-white, NOT pure white)
- Background Dark: #1A1A2E (for dark sections/cards)
- Text Primary: #2D2D2D
- Text Secondary: #6B6B6B
- Font: Keep existing font stack
- Border Radius: 12px for cards, 8px for buttons, 24px for pills
- Shadows: Use subtle, layered shadows (not flat borders)

MUSK ALGORITHM PRINCIPLES — APPLY TO EVERY DECISION:
1. Question every requirement — if a feature doesn't serve launch, skip it
2. Delete every unnecessary part — remove placeholder content, unused components, dead routes
3. Simplify and optimize — one clear user flow per role, no confusing navigation
4. Accelerate cycle time — one change at a time, npm run build after every step, commit after every working step
5. Automate — wire up Supabase connections so data flows automatically

═══════════════════════════════════════════════════════════════
PHASE 1: SURGICAL CLEANUP (Delete & Simplify)
═══════════════════════════════════════════════════════════════

STEP 1.1 — Audit and list every page/route in the app
- Run through src/pages/ and src/routes/ (or App.tsx routes)
- List every route, what component it renders, and whether it's: WORKING, PLACEHOLDER, or BROKEN
- STOP and show me the audit before making any changes

STEP 1.2 — Remove dead code and placeholder content
After I approve the audit:
- Delete any routes/pages that are empty shells or unreachable
- Remove duplicate components that do the same thing
- Delete unused imports and dead CSS classes
- npm run build → verify → git commit "chore: remove dead code and unused routes"

STEP 1.3 — Fix the bottom navigation bar
The current bottom nav has 7 icons. Simplify to 5:
- Home (dashboard)
- Search/Browse (creators or campaigns depending on role)
- Create (+) — the center pink button (keep this, it's distinctive)
- Messages
- Profile

Remove: the heart/favorites icon and the megaphone/campaigns icon (merge campaigns into the main dashboard view instead)

PROTECT: Do NOT change any existing page content — ONLY the navigation component
npm run build → verify → git commit "fix: simplify bottom nav to 5 items"

═══════════════════════════════════════════════════════════════
PHASE 2: DESIGN POLISH (TheCirqle-Level Professional)
═══════════════════════════════════════════════════════════════

IMPORTANT: Work through these ONE PAGE AT A TIME. Do NOT batch changes.
Each page gets its own commit. Test mobile (base Tailwind) AND desktop (lg: breakpoints) after every change.

STEP 2.1 — Login / Landing Page
Apply these TheCirqle-inspired patterns while keeping DC brand:
- Clean the hero: ONE headline, ONE subheadline, TWO CTAs ("Get Started" teal button + "Learn More" outline button)
- Remove or fix the social login icons — if Google OAuth isn't wired to Supabase Auth, remove the Google icon. Same for Apple and Facebook. Do NOT show broken auth options.
- Add social proof section below the fold: "Trusted by X restaurants" or placeholder for launch metrics
- The image carousel at bottom should use high-quality food/restaurant/creator imagery (if images are placeholder stock photos, that's fine for launch but make sure they're relevant to food/restaurants)
- Ensure the email/password fields have proper validation states (error borders, success states)
- Background: use the warm off-white #F5F5F0, NOT the current gray
npm run build → verify on mobile AND desktop → git commit "design: polish login/landing page"

STEP 2.2 — Restaurant/Business Dashboard
This is the MOST IMPORTANT page — it's what paying customers see first.
- Header: DragonCandy logo (smaller) + "Welcome back, [Business Name]" + hamburger menu
- "Ask Donny" search bar: keep it prominent but style it as a sleek, floating input with teal border glow on focus
- DragonDash CTA: Make this the HERO of the dashboard — large card with clear value prop: "Need content in hours, not days? Launch a DragonDash." Teal gradient button.
- Quick Actions: Keep the 3-card layout but ensure each card has:
  * An icon (not just text)
  * A clear action verb: "Launch Campaign" / "Find Creators" / "View Analytics"
  * Subtle hover state with slight lift (transform: translateY(-2px) + shadow increase)
- Remove any placeholder "50" metrics — either pull real data from Supabase or show empty states with "No campaigns yet — launch your first one!" messaging
- Add a "Recent Activity" section below Quick Actions showing latest campaign updates, creator messages, or Donny AI suggestions
npm run build → verify → git commit "design: polish restaurant dashboard"

STEP 2.3 — Browse Creators Page
Currently all cards show identical placeholder data. Fix this:
- If Supabase has real creator profiles: query and display them with actual data
- If no real data yet: create 6-8 varied seed creator profiles in Supabase with different:
  * Names, profile photos (use diverse placeholder images from UI Faces or similar)
  * Specialties (Food Photography, Video Reels, TikTok, Instagram Stories)
  * Locations (vary across NJ/NYC area)
  * Follower counts and ratings (realistic ranges: 1K-50K followers, 3.5-5.0 ratings)
- Each creator card should show: profile photo, name, specialty tags, location, follower count, rating, and a "View Profile" teal button
- Add filter/sort options at top: By Specialty, By Location, By Rating, By Price Range
- Change background from hot pink to the warm off-white #F5F5F0 with pink accent on the header section only
npm run build → verify → git commit "design: polish browse creators with varied data"

STEP 2.4 — Creator Profile Page
The business profile page (creatorbusiness_profile) needs real data:
- Hero image/cover photo: keep the full-width banner — it's a good pattern
- Profile card overlay: Creator name, rating (stars), location — keep this pattern
- Stats row: Replace the three "50" placeholders with:
  * "Projects Completed" (pull from Supabase or show 0)
  * "Avg. Response Time" (e.g., "< 2 hours")
  * "Repeat Clients" (pull from Supabase or show 0)
- Reviews section: If no real reviews, show "No reviews yet" empty state instead of identical fake reviews. If there are reviews in Supabase, display them.
- "GET IN TOUCH" CTA: Wire this to the messaging system — clicking should open a message thread with this creator
- Add a portfolio gallery section showing the creator's work samples
npm run build → verify → git commit "design: polish creator profile with real data"

STEP 2.5 — Creator Portfolio Page
- The "10/200" metric needs context — label it clearly (e.g., "10 of 200 posts")
- Artist thumbnails at bottom should link to individual work samples
- Add a "Hire This Creator" floating CTA button at the bottom
- Ensure the X (close) button navigates back properly
npm run build → verify → git commit "design: polish creator portfolio page"

STEP 2.6 — Available Campaigns Page (Creator View)
- Remove the duplicate "Available Campaigns" text (appears in both header and card)
- Each campaign card needs structured data:
  * Campaign title and description
  * Business name and logo
  * Budget range (e.g., "$200-$500")
  * Timeline (e.g., "Content due in 48 hours")
  * Deliverables (e.g., "3 Instagram Reels + 2 Stories")
  * Location requirement
- "Apply Now" button should check if creator is logged in, then create an application record in Supabase
- Add status badges: "New" (< 24hrs), "Urgent" (DragonDash), "Closing Soon"
npm run build → verify → git commit "design: polish available campaigns with structured data"

STEP 2.7 — Messaging Page
- Keep the teal (sent) / pink (received) message bubble pattern — it's on-brand
- Wire to Supabase Realtime for live message updates
- Add message timestamps
- The DragonCandy logo on received messages is a nice touch — keep it for system/Donny messages, use the other user's avatar for human messages
- Add a typing indicator
- Ensure the input field has proper send-on-enter behavior
- The phone icon in the header should either work (initiate a call/video) or be removed
npm run build → verify → git commit "design: polish messaging with realtime connection"

═══════════════════════════════════════════════════════════════
PHASE 3: BACKEND WIRING (Make It Actually Work)
═══════════════════════════════════════════════════════════════

STEP 3.1 — Authentication Flow
- Verify Supabase Auth is properly configured for email/password signup and login
- Ensure role selection during signup: "I'm a Restaurant/Business" vs "I'm a Creator"
- Store the role in the user's profile metadata
- Route users to the correct dashboard after login based on role
- Add password reset flow
- If Google OAuth is configured in Supabase, wire up the Google login button. If not, remove it.
npm run build → verify → git commit "feat: complete auth flow with role-based routing"

STEP 3.2 — Campaign Creation Flow + AI Visual Preview
This is the REVENUE ENGINE. It must be polished, functional, and smart.

- When a restaurant clicks "Launch Campaign" or "Start a DragonDash":

  * Step 1: Campaign details (title, description, content type, budget)
    - Option A: Paste URL → Donny auto-generates everything
    - Option B: Free text description → Donny assists
    - Option C: Quick presets ("New Menu Item" / "Grand Opening" / "Event" / "General")

  * Step 2: Select Delivery Tier
    - Standard Delivery (5-7 business days) — baseline pricing
    - DragonDash Express (24-48 hours) — premium pricing (~1.5x)
    - DragonDash Rush (same-day, under 6 hours) — highest tier (~2.5x)
    Each tier card shows: price range, expected turnaround, and what's realistic
    to deliver within that window (see Step 3.2B below for AI alignment logic)

  * Step 3: Target creators (location, specialty, follower range)

  * Step 4: AI VISUAL PREVIEW (NEW — see Step 3.2A below)

  * Step 5: Review & Pay (Stripe checkout or Stripe Connect)

- Save campaign to Supabase with status "active"
- Trigger notification to matching creators
npm run build → verify → git commit "feat: campaign creation wizard with tier selection"

STEP 3.2A — Campaign Visual Preview (Donny AI Generated)
═══════════════════════════════════════════════════════════
THE PROBLEM: When Donny generates a campaign, neither the business
nor the creator has a visual reference for what the final content
should look like. This causes misaligned expectations, revision
cycles, and dissatisfaction on both sides.

THE SOLUTION: After Donny generates the campaign brief (Step 1),
and the business selects a delivery tier (Step 2), show a
"Campaign Preview" card that BOTH the business and creator will see.

WHAT THE PREVIEW INCLUDES:
1. MOOD BOARD MOCKUP:
   - Donny calls the campaign/preview endpoint to generate a visual
     reference card based on the campaign brief
   - For photo campaigns: a styled layout mockup showing composition,
     lighting style, and shot angles described in text overlays
     (e.g., "Overhead flat-lay of signature dish, natural lighting,
     rustic table setting, Instagram square crop")
   - For video/reel campaigns: a storyboard strip showing 3-4 key
     frames with captions describing each scene
     (e.g., Frame 1: "Wide shot of restaurant exterior at golden hour"
     → Frame 2: "Close-up of chef plating the dish" → Frame 3:
     "Customer reaction shot, candid style" → Frame 4: "Menu item
     hero shot with restaurant branding visible")
   - For story campaigns: a phone-shaped preview frame showing the
     story layout with text overlay placement, sticker zones, and
     swipe-up CTA placement

2. CONTENT SPEC CARD (visible to both business and creator):
   - Platform: Instagram / TikTok / Both
   - Aspect ratio: 1:1 / 4:5 / 9:16
   - Duration (for video): 15s / 30s / 60s
   - Required elements: logo visible, menu item name, location tag
   - Brand voice notes: "Casual and fun" / "Professional and clean"
   - Hashtags Donny recommends
   - Caption draft (editable by business before launch)

3. REFERENCE EXAMPLES:
   - Show 2-3 thumbnail examples from existing platform content
     that match the style Donny is recommending
   - These can be pulled from a curated reference library stored
     in Supabase Storage, tagged by content type and cuisine style
   - If no reference library exists yet: use placeholder cards
     that say "Example: [Content Type] for [Cuisine Type]" with
     a generic food photography thumbnail

TECHNICAL IMPLEMENTATION:
- Supabase Edge Function: POST /api/donny/campaign/preview
  * Input: campaign brief JSON + delivery tier + content type
  * Output: JSON with mood_board_description, storyboard_frames[],
    content_specs{}, reference_image_urls[], estimated_completion_time
- The preview is stored in the campaigns table as a JSONB column
  (campaign_preview) so both business and creator see the SAME reference
- Creator sees this preview when they view the campaign listing and
  when they open an accepted campaign — it's their creative brief
- Business can edit the preview before launching (but edits are tracked)

npm run build → verify → git commit "feat: Donny AI campaign visual preview"

STEP 3.2B — Delivery Tier ↔ AI Analysis Alignment (CRITICAL FIX)
═══════════════════════════════════════════════════════════════════
THE PROBLEM: Right now when Donny generates a campaign, the AI
suggests deliverables and timelines that DON'T match the delivery
tier the business selected. A business picks "DragonDash Rush
(same-day)" but Donny generates a brief requiring 5 professional
video edits, location scouting, and multi-day shooting — impossible
to deliver in 6 hours.

THE FIX: Donny's campaign generation MUST be constrained by the
delivery tier. The AI analysis needs tier-aware guardrails.

TIER CONSTRAINT RULES (encode these in the Edge Function prompt):

┌─────────────────────┬────────────────────────────────────────────┐
│ STANDARD (5-7 days) │ Full creative freedom                      │
│                     │ Up to 10 deliverables                      │
│                     │ Multi-location shoots allowed               │
│                     │ Professional editing expected               │
│                     │ Storyboard + revision rounds included       │
│                     │ Expected completion: 5-7 business days      │
├─────────────────────┼────────────────────────────────────────────┤
│ DRAGONDASH EXPRESS  │ Max 5 deliverables                         │
│ (24-48 hours)       │ Single location only                       │
│                     │ Light editing (color correction + text)     │
│                     │ 1 revision round maximum                    │
│                     │ No complex storyboards — spontaneous style  │
│                     │ Expected completion: 24-48 hours            │
├─────────────────────┼────────────────────────────────────────────┤
│ DRAGONDASH RUSH     │ Max 3 deliverables                         │
│ (same-day, <6 hrs) │ Single location, already at the restaurant  │
│                     │ Minimal editing (filters + crop only)       │
│                     │ NO revision rounds — first draft is final   │
│                     │ Content style: authentic UGC, phone-shot    │
│                     │ Expected completion: 2-6 hours              │
└─────────────────────┴────────────────────────────────────────────┘

IMPLEMENTATION:
- In the Donny campaign generation Edge Function, INJECT the tier
  constraints into the Claude system prompt:
  "The business selected [TIER NAME] delivery. You MUST constrain
   your campaign brief to these limits: [max deliverables],
   [max locations], [editing level], [revision rounds], [style].
   The expected completion time shown to the creator MUST be
   [tier timeframe]. Do NOT suggest deliverables that cannot
   reasonably be completed within this window."

- After Donny generates the brief, run a VALIDATION check:
  * Count deliverables — reject if over tier max
  * Check for multi-location language — flag if Rush tier
  * Verify estimated_completion_time falls within tier range
  * If validation fails: Donny auto-adjusts and shows the business
    a note: "Donny adjusted your campaign to fit the [tier] timeline.
    Want to upgrade to Standard for more deliverables?"

- The campaign card (visible to creators) shows a PROMINENT badge:
  * Standard: gray badge "5-7 Day Delivery"
  * Express: teal badge "24-48 Hour Delivery ⚡"
  * Rush: pink badge with pulse animation "Same-Day Rush 🔥"

- The estimated_completion_time field in the campaigns table is
  auto-set by the tier selection — NOT by Donny's free-form analysis

npm run build → verify → git commit "feat: tier-aligned AI campaign generation"

STEP 3.2C — Secure Content Delivery Pipeline
═══════════════════════════════════════════════
THE PROBLEM: There is no secure, tracked way for a creator to
submit finished content back to the business for review. Content
could be shared via messaging (insecure, no version tracking,
no approval workflow) or off-platform entirely (loses all data
for the flywheel).

THE SOLUTION: A dedicated content delivery flow within the campaign,
with secure upload, watermarked preview, and accept/reject workflow.

CREATOR SUBMISSION FLOW:
1. Creator opens their "Active Campaign" → sees the visual preview
   brief from Step 3.2A as their creative reference
2. Creator taps "Submit Content" → upload interface opens:
   - Drag-and-drop (desktop) or camera roll picker (mobile)
   - Supported formats: JPG, PNG, MP4, MOV (max 500MB per file)
   - Multiple file upload for campaigns with multiple deliverables
   - Progress bar during upload → files go to Supabase Storage
     in a PRIVATE bucket (not publicly accessible)
   - Creator adds optional note: "Here's the final cut! Let me
     know if you want the text overlay adjusted."
3. Files are stored at path:
   campaigns/{campaign_id}/submissions/{creator_id}/{timestamp}/
4. Each submission creates a record in a "campaign_submissions" table:
   - id, campaign_id, creator_id, file_urls[], notes, status,
     submitted_at, reviewed_at, review_notes, revision_number

BUSINESS REVIEW FLOW:
1. Business receives notification: "[Creator Name] submitted content
   for [Campaign Name]"
2. Business opens campaign → "Content Submissions" tab
3. For each submitted file:
   - PREVIEW: Rendered inline (images display, videos play)
   - WATERMARK: Preview versions have a light DragonCandy watermark
     overlay — prevents screenshotting and using without payment.
     The watermark is applied client-side on the preview render,
     NOT burned into the stored file. Original clean files are
     only accessible after acceptance + payment.
   - ACCEPT button (green): Marks deliverable as approved
     → Triggers payment release via Stripe Connect
     → Grants business download access to clean (unwatermarked) files
     → Files get a signed URL (expires in 7 days) for download
   - REQUEST REVISION button (amber): Opens a text field for
     specific feedback → Creator receives the notes and can
     resubmit (tracked as revision_number + 1)
     → Revision limits enforced by tier (Rush: 0, Express: 1, Standard: 2)
   - REJECT button (red): Requires a reason selection:
     "Doesn't match brief" / "Quality issue" / "Wrong format" / "Other"
     → Creator is notified with the reason
     → Campaign can be reassigned to another creator or cancelled
4. Once ALL deliverables are accepted:
   - Campaign status changes to "completed"
   - Payment is fully released to creator via Stripe Connect
   - Both sides are prompted to leave a review
   - Content is logged in the data flywheel for Donny AI training

SECURITY MEASURES:
- All uploads go to a PRIVATE Supabase Storage bucket with RLS
  policies: only the submitting creator and the campaign owner
  can access files for that campaign
- Signed URLs for downloads expire after 7 days
- Watermarked previews prevent unauthorized use before payment
- All file access is logged (who viewed, when, from where)
- Content rights transfer is documented in the submission record:
  acceptance = rights transfer per platform ToS

SUPABASE SCHEMA ADDITION:
CREATE TABLE campaign_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id) NOT NULL,
  creator_id UUID REFERENCES profiles(id) NOT NULL,
  file_urls TEXT[] NOT NULL,
  file_types TEXT[] NOT NULL,
  notes TEXT,
  status TEXT DEFAULT 'pending_review'
    CHECK (status IN ('pending_review','accepted','revision_requested','rejected')),
  review_notes TEXT,
  revision_number INT DEFAULT 1,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: Only creator can insert, only campaign owner can update status
-- RLS: Both can read their own campaign's submissions

NOTE: This table is NEW and must be created via Supabase migration.
Show Dame the migration SQL and get approval before running it.

npm run build → verify → git commit "feat: secure content delivery with accept/reject"

STEP 3.3 — Creator Application Flow
- When a creator clicks "Apply Now" on a campaign:
  * Create an application record in Supabase linking creator to campaign
  * Update campaign's application count
  * Notify the business owner (in-app notification or message thread)
  * Show "Applied" state on the campaign card so creator knows they've applied
  * Creator sees the visual preview brief (from 3.2A) so they know
    exactly what's expected before applying
npm run build → verify → git commit "feat: creator application flow"

STEP 3.4 — Donny AI Integration Check
- Verify the "Ask Donny" input on the restaurant dashboard calls the Supabase Edge Function (donny-chat)
- Ensure Donny can respond with campaign suggestions, creator recommendations, and basic analytics
- Ensure Donny's campaign generation respects delivery tier constraints (from 3.2B)
- Verify the campaign/preview endpoint generates visual mockups (from 3.2A)
- If the Edge Function isn't deployed or isn't working, create a graceful fallback: "Donny is warming up! In the meantime, try our Quick Actions below."
npm run build → verify → git commit "feat: verify Donny AI integration with tier alignment"

═══════════════════════════════════════════════════════════════
PHASE 4: LAUNCH READINESS CHECKS
═══════════════════════════════════════════════════════════════

STEP 4.1 — Mobile Responsiveness Pass
- Test every page on mobile viewport (375px width)
- Fix any overflow, text truncation, or touch target issues
- Ensure the bottom nav doesn't overlap content
- Verify all modals and overlays are scrollable on mobile
npm run build → verify → git commit "fix: mobile responsiveness pass"

STEP 4.2 — Empty States & Error Handling
- Every page that loads data should have:
  * Loading state (skeleton or spinner with DragonCandy branding)
  * Empty state ("No campaigns yet — create your first one!")
  * Error state ("Something went wrong. Please try again." with retry button)
- Forms should have validation with clear error messages
npm run build → verify → git commit "fix: add empty states and error handling"

STEP 4.3 — Performance & SEO Basics
- Add proper <title> and <meta description> to each page
- Ensure images have alt text
- Lazy load images below the fold
- Add a favicon if not already present
npm run build → verify → git commit "chore: SEO basics and performance"

STOP HERE. Push to GitHub. Verify on Lovable.dev preview.
Report what's working and what still needs attention.

═══════════════════════════════════════════════════════════════
RULES — FOLLOW THESE ON EVERY STEP:
═══════════════════════════════════════════════════════════════

1. ONE change at a time. Never batch multiple page changes.
2. npm run build after EVERY change. If it fails, fix immediately before moving on.
3. git commit after every working step with a descriptive message.
4. PROTECT existing desktop (lg:) Tailwind classes when editing mobile styles.
5. Do NOT modify Supabase table schemas without showing me the migration first.
6. Do NOT install new npm packages without listing them first and getting approval.
7. If a step requires data that doesn't exist in Supabase, create seed data — do NOT leave placeholders.
8. Reference CLAUDE.md for any design system questions.
9. If something is broken and will take more than 30 minutes to fix, SKIP IT and flag it for a follow-up prompt.
10. After Phase 2, do a git push origin main. After Phase 3, do another push. After Phase 4, final push.
```

---

## Part 4: OpenClaw Agent Team Architecture (Post-Launch)

### When to Deploy OpenClaw

**NOT during launch week.** Deploy OpenClaw agents once DragonCandy is live, stable, and has real users. Here's the team structure for Week 2+:

### Agent Team Design

#### Agent 1: "Scout" — QA & Monitoring Agent
**SOUL.md Purpose**: Monitor DragonCandy production for errors, broken flows, and performance issues.
**Skills**: Browser automation, Supabase log reading, error screenshot capture
**Channel**: Slack or Discord (posts alerts)
**Cron**: Every 6 hours, run through critical user flows (login → dashboard → browse creators → apply to campaign → send message) and report any failures
**Model**: Claude Sonnet 4 (cost-efficient for repetitive checks)

#### Agent 2: "Builder" — Engineering Agent  
**SOUL.md Purpose**: Execute code changes from a prioritized task queue. Never touches production directly — always works on feature branches.
**Skills**: OpenCode integration, GitHub PR creation, npm run build verification
**Channel**: Telegram (receives task assignments)
**Workflow**: Receives task → creates branch → makes changes → runs build → creates PR → notifies Dame for review
**Model**: Claude Opus 4.6 (needs deep reasoning for code changes)

#### Agent 3: "Donny Ops" — AI Assistant Monitor
**SOUL.md Purpose**: Monitor Donny AI's Supabase Edge Function performance, log response quality, flag when the AI gives bad recommendations.
**Skills**: Supabase query runner, response quality scorer, cost tracker
**Channel**: WhatsApp (sends daily digest)
**Cron**: Daily at 9 AM — summarize yesterday's Donny conversations, flag any that got negative user feedback, report API costs
**Model**: Claude Haiku 4.5 (lightweight analysis)

#### Agent 4: "Growth" — Marketing & Outreach Agent
**SOUL.md Purpose**: Find and reach out to potential restaurant customers and content creators in target launch cities.
**Skills**: Web scraping (restaurant listings), email drafting, social media research
**Channel**: Slack
**Cron**: Daily — research 10 restaurants in target city, draft personalized outreach emails, queue for Dame's review
**Model**: Claude Sonnet 4

### OpenClaw Setup Prompt (for Week 2+)

```bash
# Install OpenClaw
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Run onboarding
openclaw onboard

# Create agent workspace structure
mkdir -p agents/{scout,builder,donny-ops,growth}

# Each agent gets:
# - SOUL.md (identity + rules)
# - MISSIONS.md (current objectives)  
# - HEARTBEAT.md (check-in cadence)
# - skills/ (custom skills folder)
```

### Critical Safety Rules for OpenClaw with DragonCandy

1. **NEVER give OpenClaw agents direct write access to the production Supabase database.** Use read-only API keys. All writes go through PRs that Dame reviews.
2. **Run OpenClaw on a dedicated VM or container**, not your primary development machine. If an agent goes rogue, you can kill the VM.
3. **Use the Agent Trust Hub skill scanner** before installing any community skills. Cisco already found data exfiltration in third-party skills.
4. **Set spending limits** on the Anthropic API key used by OpenClaw. Multiple agents running 24/7 can burn through credits fast.
5. **Require PR review for all code changes.** The Builder agent creates PRs, but Dame merges them.

---

## Part 5: Priority Sequence Summary

| Priority | What | Tool | Timeline |
|----------|------|------|----------|
| **P0** | Run the Phase 1–4 Claude Code prompt above | Claude Code + `/superpowers` + `/design-flow` | Days 1–5 |
| **P1** | Verify live deployment on Lovable.dev | Manual testing | Day 5–6 |
| **P2** | Fix any launch-blocking issues found in testing | Claude Code (targeted fix prompts) | Day 6–7 |
| **P3** | LAUNCH | Go live | Day 7 |
| **P4** | Set up OpenClaw Scout agent for monitoring | OpenClaw | Week 2 |
| **P5** | Set up remaining OpenClaw agents | OpenClaw | Week 2–3 |
| **P6** | Resume Donny Super Agent roadmap (Prompt 1B-4+) | Claude Code | Week 3+ |

---

## Appendix: TheCirqle vs. DragonCandy Feature Mapping

| TheCirqle Feature | DragonCandy Equivalent | Status |
|-------------------|----------------------|--------|
| AI Creator Discovery | Donny AI Creator Matching | Built (needs polish) |
| Campaign Management | Campaign Create + DragonDash | Built (needs wiring) |
| Campaign Visual Previews | Donny AI mood boards + storyboards (Step 3.2A) | **NEW — added to blueprint** |
| Delivery Tier Alignment | AI-constrained briefs per tier (Step 3.2B) | **NEW — critical fix** |
| Content Approvals | Secure upload + watermark + accept/reject (Step 3.2C) | **NEW — added to blueprint** |
| Turn Into Ads | Future (Phase 2+) | Not started |
| Reporting/Analytics | View Analytics dashboard | Placeholder |
| RoAS Forecasting | Donny AI predictions | Future |
| Automated Contracts | Future | Not started |
| Payment/Payout | Stripe Connect | Configured (needs testing) |
| Creator Profiles with CPM/Reach data | Creator Portfolio + Profile | Built (needs real data) |

**Key insight**: DragonCandy doesn't need feature parity with TheCirqle for launch. TheCirqle serves enterprise e-commerce brands. DragonCandy serves local restaurants. The feature set is simpler. What matters is that the features you DO have work flawlessly and look professional.
