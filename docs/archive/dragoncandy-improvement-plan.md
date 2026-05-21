# DragonCandy Production Launch Plan
## OpenClaw Agent Team + Claude Code Prompts + Elon's Algorithm

---

## PART 1: HONEST ASSESSMENT — OpenClaw vs. Claude Code

### The Reality Check

You're launching next week. OpenClaw is powerful but **young, risky, and requires significant setup time**. Here's the honest breakdown:

**OpenClaw Strengths:**
- Can deploy multiple named agents with persistent memory (SOUL.md files)
- Agents can coordinate via messaging platforms (Slack, Discord)
- Community skills ecosystem for extending capabilities
- Runs locally on your machine — you own the data

**OpenClaw Risks for YOUR timeline:**
- Security concerns are real — Cisco found data exfiltration in third-party skills
- Setup alone takes hours before any productive work begins
- Agents can take unintended actions (the MoltMatch dating profile incident)
- Merge conflicts between agents hitting the same repo are not solved by OpenClaw
- One of its own maintainers warned it's "too dangerous" for non-technical users
- You'd be debugging OpenClaw setup when you should be shipping DragonCandy

### Recommended Hybrid Approach

**For launch (this week): Claude Code with sequential, disciplined prompts**
- Use Claude Code with `/superpowers` and `/design-flow` plugins
- One change at a time, `npm run build` after every step
- This is battle-tested in your workflow and won't introduce new failure modes

**For post-launch (weeks 2-4): Deploy OpenClaw agent team**
- Once the app is stable and live, set up OpenClaw agents for ongoing development
- Each agent owns a clear domain with strict file boundaries
- Use SOUL.md + MISSIONS.md pattern from the ClawCon 2026 playbook

---

## PART 2: ELON'S ALGORITHM APPLIED TO DRAGONCANDY

### Step 1: Question Every Requirement

Looking at your current 8 screens, here's what I'd challenge:

| Current Feature | Question | Verdict |
|---|---|---|
| Phone call button in messaging | Do restaurants actually call creators through the app? | DELETE — messaging is enough for MVP |
| Image carousel on login page | Do stock photos build trust or look generic? | REPLACE — use 1 strong hero image or video grid like TheCirqle |
| 3 identical feature cards on landing ("Transform your content...") | Copy is duplicated. Does this convert? | REWRITE — each card needs unique, specific value prop |
| Creator Portfolio "10/200" counter | What does this metric mean to a restaurant owner? | SIMPLIFY — show engagement rate + content samples |
| "Artist Name" labels in portfolio | These are placeholder labels shipping to production | FIX — pull real creator data or hide empty states |
| 7-icon bottom nav bar | Too many icons. Users get lost | REDUCE to 5: Home, Campaigns, +Create, Messages, Profile |
| DragonDash as separate CTA from campaigns | Is this confusing for new users? | MERGE — DragonDash is a campaign speed option, not a separate flow |

### Step 2: Delete Every Possible Step

**Current user flow (Restaurant):** Landing → Login → Dashboard → Browse Creators → View Portfolio → Get In Touch → Messaging → Create Campaign → Wait

**Simplified flow:** Landing → Login → Dashboard (with Donny AI front and center) → "Create Campaign" (Donny handles creator matching automatically) → Approve & Pay → Content Delivered

That's 6 steps instead of 9. Donny AI eliminates manual browsing by recommending creators based on the campaign brief.

### Step 3: Simplify and Optimize

**TheCirqle patterns to adopt (with DragonCandy's teal/pink/gray palette):**

1. **Dark, professional dashboard** — TheCirqle uses dark UI for their logged-in experience. Your dashboard should feel like a command center, not a candy store.
2. **Data-forward creator cards** — Show engagement rates, content type specialties, and response time instead of generic "Use our AI-powered campaign wizard" copy.
3. **Video grid hero** — Replace stock photo carousel with actual creator content thumbnails (even placeholder videos look more professional).
4. **Social proof bar** — Add a logo strip of restaurants already on the platform (even if it's 5 beta partners).
5. **Clear role separation** — TheCirqle has separate flows for brands vs. creators. DragonCandy needs the same clean separation at login.

### Step 4: Accelerate Cycle Time

Use the prompt sequence below — each prompt is designed to be run in Claude Code in under 30 minutes, tested, committed, and moved on.

### Step 5: Automate

Donny AI IS the automation layer. Every manual step a restaurant owner would take should have a Donny shortcut.

---

## PART 3: OPENCLAW AGENT TEAM STRUCTURE (Post-Launch)

### Agent Roster for DragonCandy

```
ORCHESTRATOR — "Drake" (Chief of Staff)
├── Routes tasks to specialist agents
├── Enforces CLAUDE.md design system
├── Validates `npm run build` passes before any merge
└── SOUL.md: "You are Drake, DragonCandy's engineering lead.
     You never approve changes that break the build.
     You enforce one-change-at-a-time discipline.
     Design tokens: teal #4DD9C0, pink #F9A8D4, gray #A8A8A0."

FRONTEND — "Pixel"
├── Owns: src/components/, src/pages/, Tailwind styles
├── Never touches: supabase/, edge-functions/, database
├── SOUL.md: "You are Pixel, DragonCandy's frontend specialist.
     You write React/TypeScript with Tailwind CSS.
     You follow CLAUDE.md design system religiously.
     Mobile-first. Test every change at 375px, 768px, 1440px.
     You protect working desktop lg: classes when editing mobile styles."

BACKEND — "Forge"
├── Owns: supabase/functions/, migrations/, RLS policies
├── Never touches: src/components/, src/pages/
├── SOUL.md: "You are Forge, DragonCandy's backend engineer.
     You write Supabase Edge Functions in Deno/TypeScript.
     You own database migrations, RLS policies, and API endpoints.
     Every function must have error handling and rate limiting.
     You never expose user data without proper auth checks."

AI/DONNY — "Spark"
├── Owns: Donny AI integration, Claude API calls, AI features
├── Never touches: UI components or database schema
├── SOUL.md: "You are Spark, Donny AI's specialist.
     You integrate Claude Sonnet 4 API calls.
     You optimize prompts for cost (Haiku for simple, Sonnet for complex).
     You implement prompt caching for 90% cost reduction.
     Every AI response must have fallback handling."

QA — "Scout"
├── Owns: Testing, validation, bug triage
├── Reviews output from all other agents before merge
├── SOUL.md: "You are Scout, DragonCandy's QA engineer.
     You test every change across mobile and desktop.
     You verify Supabase RLS policies actually restrict access.
     You check that no placeholder text ships to production.
     You flag any 'Creator Name' or 'Artist Name' placeholders."
```

### OpenClaw Setup Commands (for post-launch)

```bash
# Install OpenClaw
npm install -g openclaw

# Create workspace
mkdir ~/dragoncandy-agents && cd ~/dragoncandy-agents
openclaw onboard

# Create each agent
openclaw agents add --name Drake --soul ./agents/drake/SOUL.md
openclaw agents add --name Pixel --soul ./agents/pixel/SOUL.md
openclaw agents add --name Forge --soul ./agents/forge/SOUL.md
openclaw agents add --name Spark --soul ./agents/spark/SOUL.md
openclaw agents add --name Scout --soul ./agents/scout/SOUL.md

# Connect to Discord/Slack for coordination
openclaw config set channels.discord.enabled true
openclaw config set channels.discord.botToken "YOUR_TOKEN"
openclaw gateway restart
```

### Critical Safety Rules for OpenClaw Agents

1. **Run in a VM or container** — never on your primary machine
2. **Disable auto-push** — agents propose PRs, YOU merge them
3. **File scope boundaries are mandatory** — agents that touch files outside their domain get killed
4. **Every agent runs `npm run build` before marking work "done"**
5. **No agent has access to production Supabase credentials**

---

## PART 4: CLAUDE CODE PROMPTS — THE LAUNCH SEQUENCE

These are designed to run sequentially in Claude Code with the `/superpowers` and `/design-flow` plugins. Each prompt is self-contained, testable, and follows the one-change-at-a-time rule.

---

### PROMPT 1: Design System Reset — Kill the Placeholder Look

```
\superpowers:brainstorming
/design-flow

CONTEXT: DragonCandy.io is a two-sided marketplace connecting restaurants
with content creators. We launch in production next week. The app currently
looks like a prototype — placeholder text, inconsistent styling, generic
stock photos. We need it to look and feel as professional as thecirqle.com
while keeping our brand colors.

DESIGN SYSTEM (from CLAUDE.md — DO NOT CHANGE THESE):
- Primary teal: #4DD9C0
- Accent pink: #F9A8D4
- Neutral gray: #A8A8A0
- Dark background for dashboards: #1A1A2A (new)
- Card background: #FFFFFF with subtle shadow
- Text primary: #1A1A2A
- Text secondary: #6B7280
- Border radius: 12px for cards, 8px for buttons, 24px for pills
- Font: Keep current font stack but ensure consistent weights

ELON'S ALGORITHM — QUESTION & DELETE:
Before making ANY change, ask: "Does this element help a restaurant owner
hire a creator or help a creator find work?" If no → DELETE IT.

TASK: Create a global design token file and update the Tailwind config.

1. CREATE or UPDATE src/styles/design-tokens.css:
   - CSS custom properties for ALL colors, spacing, shadows, radii
   - Dark mode variant using the #1A1A2A base
   - Elevation system: shadow-sm, shadow-md, shadow-lg (not flat, not overdone)

2. UPDATE tailwind.config.ts:
   - Extend colors with dragoncandy namespace:
     dc-teal, dc-pink, dc-gray, dc-dark, dc-card
   - Add animation utilities: fade-in, slide-up, scale-in
   - Ensure responsive breakpoints are mobile-first (sm:, md:, lg:)

3. CREATE src/components/ui/DCButton.tsx:
   - Primary (teal bg, white text)
   - Secondary (outlined, teal border)
   - Ghost (transparent, teal text on hover)
   - Sizes: sm, md, lg
   - Loading state with spinner
   - All buttons have subtle hover scale (1.02) and press scale (0.98)

4. CREATE src/components/ui/DCCard.tsx:
   - Clean white card with 12px radius and subtle shadow
   - Optional teal left-border accent variant
   - Hover lift animation (translateY -2px + shadow increase)

PROTECT: Do NOT modify any page-level components or routing.
Only touch: design tokens, tailwind config, and new UI primitives.

VERIFY: npm run build succeeds. No existing pages break.
Commit: "design-system: establish production design tokens and UI primitives"

STOP and wait for approval before proceeding.
```

---

### PROMPT 2: Landing Page — First Impression Overhaul

```
\superpowers:brainstorming
/design-flow

CONTEXT: The DragonCandy landing page currently shows:
- Generic hero with "UNLEASH YOUR CREATIVITY" headline
- 3 feature cards with IDENTICAL copy ("Transform your content with
  intelligent AI editing tools and suggestions")
- Stock photo carousel at the bottom
- No social proof, no clear value proposition for restaurants

TheCirqle.com reference points to adopt (NOT copy):
- Bold, clear headline that states WHAT the platform does
- Video/content grid showing real creator work
- Social proof logos of brands using the platform
- Testimonial quotes with real metrics
- Separate CTAs for brands vs. creators

TASK: Rewrite the landing page to convert restaurant owners and creators.

1. HERO SECTION:
   Headline: "Local Content. Created Fast. Powered by AI."
   Subheadline: "DragonCandy connects restaurants and local businesses
   with vetted content creators. Get professional social media content
   in hours, not weeks."
   CTA 1 (teal): "I'm a Business — Get Started"
   CTA 2 (outlined): "I'm a Creator — Join the Marketplace"
   Background: Subtle gradient from white to very light gray

2. SOCIAL PROOF BAR (below hero):
   - Scrolling logo strip (even if placeholder logos for now)
   - Text: "Trusted by restaurants and creators in [City]"

3. HOW IT WORKS — 3 steps (replace the 3 identical cards):
   Step 1: "Describe Your Campaign" — "Tell Donny AI what you need.
   Paste your website URL and get a complete campaign brief in seconds."
   Step 2: "Get Matched with Creators" — "Our AI scores and matches you
   with local creators based on style, audience, and track record."
   Step 3: "Content Delivered Fast" — "Choose DragonDash for content in
   hours, or standard delivery in days. Approve, pay, done."

4. FEATURE SECTION — 3 cards with UNIQUE copy:
   Card 1: "AI-Powered Campaigns" — "Donny AI generates complete campaign
   briefs from your website URL. Target audience, content style, posting
   schedule — all automated."
   Card 2: "Vetted Creator Network" — "Every creator is scored on
   engagement, reliability, and content quality. No guesswork."
   Card 3: "DragonDash Rush Delivery" — "Need content today? DragonDash
   connects you with available creators for same-day turnaround."

5. DELETE: Stock photo carousel at bottom. Replace with a single
   "Ready to get started?" CTA section.

6. NAVIGATION: Simplify to: Logo | How It Works | For Businesses |
   For Creators | Login | Get Started (teal button)

PROTECT: Do NOT touch the login page, dashboard, or any other page.
Only modify the landing/index page and its components.

VERIFY: npm run build succeeds. Page renders correctly at 375px and 1440px.
Commit: "landing: professional landing page with clear value proposition"

STOP and wait for approval.
```

---

### PROMPT 3: Login & Auth — Clean and Trustworthy

```
\superpowers:brainstorming
/design-flow

CONTEXT: Current login page has the right elements but needs polish:
- Logo is good
- Email/Password fields need better styling
- Social auth buttons (Google, Apple, Facebook) need proper branding
- "Don't Have An Account?" → Sign Up flow needs role selection

TASK: Polish the login experience and add role selection to signup.

1. LOGIN PAGE UPDATES:
   - Center the form vertically and horizontally
   - Add subtle card container with shadow (use DCCard)
   - Style email/password inputs: 48px height, rounded-lg, gray-100 bg,
     focus ring in teal
   - Login button: Full width, teal, 48px height, bold text
   - Social auth buttons: Proper brand colors (Google multi-color,
     Apple black, Facebook blue), each 44px, in a row with proper spacing
   - Add "or continue with" divider between password and social buttons

2. SIGN UP FLOW — Add role selection FIRST:
   - After clicking "Sign Up", show a role selection screen:
     Option A: "I'm a Business" (teal card with restaurant icon)
     Option B: "I'm a Creator" (pink card with camera icon)
   - Tapping a card proceeds to the signup form with role pre-selected
   - Role gets stored in the Supabase profiles table

3. FORGOT PASSWORD:
   - Add "Forgot password?" link below login button
   - Links to Supabase's built-in password reset flow

PROTECT: Do NOT modify dashboard, landing page, or any other page.
PROTECT: Do NOT change Supabase auth configuration — only UI changes.

VERIFY: npm run build succeeds. Login renders at 375px without overflow.
Commit: "auth: polished login page with role-based signup flow"

STOP and wait for approval.
```

---

### PROMPT 4: Restaurant Dashboard — Command Center

```
\superpowers:brainstorming
/design-flow

CONTEXT: The restaurant dashboard currently shows:
- "Ask Donny..." search bar (good — keep and enhance)
- "Start A DragonDash" CTA card (good concept, needs polish)
- "Quick Actions" with 3 cards (good structure, needs data)
- Pink header with welcome message
- 7-icon bottom nav (too many)

TheCirqle reference: Their dashboard is data-forward, showing campaign
metrics, creator pipelines, and actionable insights immediately.

ELON'S ALGORITHM: Delete the bottom nav icons down to 5.

TASK: Rebuild the restaurant dashboard as a professional command center.

1. HEADER:
   - White/light background (not pink)
   - Left: DragonCandy logo (smaller, 40px)
   - Center: "Welcome back, [Business Name]" in dark text
   - Right: Notification bell + Profile avatar
   - Subtitle: "Create content and drive revenue" in gray

2. DONNY AI BAR (prominent, sticky):
   - Full-width input with teal left icon (sparkle/AI icon)
   - Placeholder: "Ask Donny anything... 'Create a campaign for our
     new brunch menu'"
   - On focus: expand with quick-action chips below:
     "Generate Campaign" | "Find Creators" | "Check Analytics"

3. STATS ROW (new — like TheCirqle's dashboard):
   - 4 metric cards in a row:
     Active Campaigns | Pending Content | Total Spend | Avg. Engagement
   - Each card: number + label + trend arrow (up/down)
   - Pull from Supabase if data exists, show "0" with "Launch your
     first campaign" prompt if empty

4. QUICK ACTIONS (simplified):
   - "Create Campaign" (teal) — goes to campaign creation wizard
   - "Browse Creators" (outlined) — goes to creator browse page
   - Remove "View Analytics" from quick actions (it's in the stats row)

5. ACTIVE CAMPAIGNS FEED:
   - List of current campaigns with: campaign name, status badge
     (active/pending/completed), creator assigned, due date
   - If empty: "No active campaigns yet. Let Donny help you create one."

6. BOTTOM NAV (reduce to 5):
   - Home (house) | Campaigns (megaphone) | + Create (teal circle) |
     Messages (chat) | Profile (person)
   - Remove: heart icon, play icon (these aren't core actions)

PROTECT: Do NOT modify the landing page, login, or creator-side pages.
PROTECT: Working desktop lg: Tailwind classes must be preserved.

VERIFY: npm run build succeeds. Dashboard renders at 375px and 1440px.
Commit: "dashboard: professional restaurant command center with stats"

STOP and wait for approval.
```

---

### PROMPT 5: Browse Creators — Data-Driven Cards

```
\superpowers:brainstorming
/design-flow

CONTEXT: Browse Creators page currently shows:
- Pink background with "BROWSE CREATORS" header
- Creator cards all use the same stock photo
- All cards say "Creator Name" and identical description text
- "View Portfolio" buttons alternate between pink and teal

TheCirqle reference: Their creator discovery shows real metrics per
creator — engagement rate, audience demographics, content specialties,
and predicted ROAS. The UI is clean, filterable, and data-forward.

ELON'S ALGORITHM: The description "Use our AI-powered campaign wizard
to define your goals and find the perfect creators" is on every card.
This copy belongs on a LANDING PAGE, not on individual creator cards.
DELETE it from cards. Replace with actual creator data.

TASK: Redesign creator browse with filtering and data-rich cards.

1. HEADER:
   - Clean white background
   - "Find Creators" (not "BROWSE CREATORS" — action-oriented)
   - Subtitle: "Discover local creators matched to your brand"

2. FILTER BAR:
   - Content type pills: All | Food | Lifestyle | Reels | Photography
   - Location dropdown (pull from creator profiles)
   - Sort: Relevance | Rating | Price (low-high) | Availability
   - "Ask Donny to find creators" quick link

3. CREATOR CARDS (redesigned):
   - Square thumbnail (creator's best work, not stock photos)
   - Creator display name (pulled from profiles table)
   - Location badge (city, state)
   - Star rating (if available)
   - 2 key metrics: "XX projects completed" | "Avg X-day delivery"
   - Content type tags (Food, Reels, etc.)
   - "View Profile" button (teal, consistent)
   - Favorite/heart icon in top-right corner

4. EMPTY STATE:
   - If no creators match filters: "No creators found in this area.
     Try expanding your search or ask Donny for recommendations."

5. GRID LAYOUT:
   - Mobile: 1 column, full-width cards
   - Tablet: 2 columns
   - Desktop: 3 columns

PROTECT: Do NOT modify creator profile/portfolio pages yet.
PROTECT: Do NOT touch backend queries — only UI changes.

VERIFY: npm run build succeeds. Grid looks correct at 375px, 768px, 1440px.
Commit: "creators: data-driven browse page with filtering"

STOP and wait for approval.
```

---

### PROMPT 6: Creator Profile — Professional Portfolio

```
\superpowers:brainstorming
/design-flow

CONTEXT: The creator/business profile page currently shows:
- Full-width cover photo (good concept)
- Creator name, rating, location (good data)
- Stats row: "50 / 50 / 50" all identical (placeholder)
- Third stat label says "Projects Completed" twice
- Reviews section: all 3 reviews have identical text
- "GET IN TOUCH" CTA at bottom

TheCirqle reference: Creator profiles show verified metrics, content
samples with engagement data, audience demographics, and clear
booking/contracting flow.

ELON'S ALGORITHM: Fix the duplicate "Projects Completed" label.
Delete identical review placeholders — show real reviews or hide section.

TASK: Polish the creator profile into a professional portfolio.

1. HERO / COVER:
   - Keep full-width cover photo
   - Overlay gradient at bottom for text readability
   - Creator avatar (circular, 80px) positioned overlapping cover bottom
   - Name, rating, location below avatar

2. STATS ROW (fix duplicates):
   - Stat 1: "Projects Completed" (from campaigns table)
   - Stat 2: "Reels Created" (from content table)
   - Stat 3: "Avg. Delivery Time" (calculated)
   - If no data: show "New Creator" badge instead of fake numbers

3. CONTENT SHOWCASE:
   - Grid of creator's actual uploaded work (from Supabase storage)
   - Each item shows: thumbnail + type badge (Photo/Reel/Story)
   - If no content: "This creator hasn't uploaded portfolio pieces yet"
   - Remove the "10/200" counter — unclear what it means

4. ABOUT SECTION (new):
   - Creator bio text
   - Content specialties (tags)
   - Availability status: "Available Now" (green) or "Busy" (gray)
   - Rate range: "$XX - $XXX per project"

5. REVIEWS:
   - Only show if real reviews exist in database
   - Each review: star rating, review text, reviewer name, date
   - If none: hide entire section (don't show placeholder text)

6. CTA:
   - "Hire This Creator" (teal, full-width on mobile)
   - "Message" (outlined, secondary)

PROTECT: Do NOT modify browse page, dashboard, or messaging.

VERIFY: npm run build succeeds. Profile renders correctly on mobile.
Commit: "profile: professional creator portfolio with real data"

STOP and wait for approval.
```

---

### PROMPT 7: Messaging — Clean Chat UX

```
\superpowers:brainstorming
/design-flow

CONTEXT: The messaging page currently shows:
- "Creator Name" header with phone icon
- Chat bubbles: pink (left/business) and teal (right/creator)
- DragonCandy logo avatar for business messages
- Creator photo avatar for creator messages
- "Enter Text Here...." input at bottom
- "+" button for attachments, send arrow button

The layout is actually solid — the colors match the brand. Main issues:
- "Creator Name" is placeholder text
- Phone call button is unnecessary for MVP (DELETE per Elon's Algorithm)
- No message timestamps
- No typing indicator
- No read receipts

TASK: Polish messaging without breaking the core chat structure.

1. HEADER:
   - Show real creator/business name from conversation data
   - Remove phone call button (DELETE — not needed for launch)
   - Add "View Profile" link instead
   - Show online/offline status (from Supabase presence if available,
     otherwise just show "Recently Active")

2. CHAT BUBBLES:
   - Keep pink (business) and teal (creator) colors — they work well
   - Add timestamps below each message (small, gray text)
   - Add subtle message animations (slide-in from left/right)
   - Group consecutive messages from same sender (no avatar repeat)

3. INPUT BAR:
   - Change placeholder to "Type a message..."
   - Keep "+" button for attachments
   - Send button: teal bg with white arrow
   - Disable send button when input is empty

4. EMPTY STATE:
   - When no conversation selected: "Select a conversation or start
     a new one from a creator's profile"

5. CONVERSATIONS LIST (if sidebar exists):
   - Show last message preview, timestamp, unread count badge
   - Sort by most recent

PROTECT: Do NOT modify the real-time messaging Supabase logic.
PROTECT: Do NOT touch any other pages.

VERIFY: npm run build succeeds. Chat renders correctly on mobile.
Commit: "messaging: polished chat interface with timestamps"

STOP and wait for approval.
```

---

### PROMPT 8: Campaign Creation Wizard (The Core Flow)

```
\superpowers:brainstorming
/design-flow

CONTEXT: This is the most important flow in DragonCandy — it's where
revenue happens. A restaurant owner creates a campaign, Donny AI
generates the brief, creators get matched, content gets delivered.
This flow does not appear to be fully built yet.

TheCirqle reference: They have AI-generated briefs, automated contracts,
content approvals, and integrated payments — all in one flow.

ELON'S ALGORITHM: This is where we ACCELERATE. The entire campaign
creation should take under 3 minutes with Donny AI doing the heavy lifting.

TASK: Build the campaign creation wizard as a multi-step form.

STEP 1 — "What do you need?" (Input):
   - Option A: "Paste your website or menu URL" (Donny auto-generates)
   - Option B: "Describe what you need" (free text, Donny assists)
   - Option C: "Quick campaign" preset buttons:
     "New Menu Item" | "Grand Opening" | "Event Promotion" | "General Content"

STEP 2 — "Campaign Details" (AI-generated, editable):
   After URL/description input, Donny generates:
   - Campaign title (editable)
   - Description (editable)
   - Content type: Photo / Video / Reel / Story (selectable)
   - Number of deliverables (1-10 slider)
   - Budget range (drag slider or manual input)
   - Timeline: Standard (5-7 days) or DragonDash (same-day, premium price)

STEP 3 — "Review & Launch":
   - Summary card showing all campaign details
   - "Estimated cost: $XX - $XXX"
   - "Donny will match you with X creators in your area"
   - "Launch Campaign" button (teal, prominent)
   - "Save as Draft" secondary option

POST-LAUNCH:
   - Campaign appears in dashboard under "Active Campaigns"
   - Matched creators receive notification to apply
   - Restaurant owner gets "X creators interested" updates

TECHNICAL:
   - Each step is a component within a single page (not separate routes)
   - Progress indicator at top (Step 1 of 3, Step 2 of 3, Step 3 of 3)
   - Back/Next navigation between steps
   - Data persists in React state across steps
   - On "Launch": POST to Supabase campaigns table via existing API

PROTECT: Do NOT modify any other pages.
PROTECT: Do NOT create new Supabase tables — use existing campaign schema.

VERIFY: npm run build succeeds. Wizard flows correctly on mobile.
Commit: "campaigns: multi-step creation wizard with Donny AI integration"

STOP and wait for approval.
```

---

### PROMPT 9: Creator Side — Available Campaigns & Applications

```
\superpowers:brainstorming
/design-flow

CONTEXT: The creator's view of available campaigns currently shows:
- Swipeable campaign cards with images (good concept)
- "Available Campaigns" header with location
- "Apply Now" button
- Company name and description on each card

This is actually one of the stronger pages. It needs data polish,
not a redesign.

TASK: Polish the creator campaign discovery experience.

1. CAMPAIGN CARDS (enhance existing):
   - Keep the swipeable card format — it works well
   - Add to each card:
     * Budget range ("$200 - $500")
     * Content type badge (Photo/Reel/Story)
     * Timeline badge: "Standard" or "DragonDash ⚡" (with teal highlight)
     * Distance from creator ("2.3 mi away")
     * Number of applicants ("3 creators applied")
   - Remove generic "Use our AI-powered campaign wizard" text

2. FILTER/SORT:
   - Content type filter: All | Photo | Video | Reels
   - Sort: Nearest | Highest Budget | Newest | DragonDash Only
   - Location radius slider (5mi, 10mi, 25mi, 50mi)

3. APPLICATION FLOW:
   - "Apply Now" opens a bottom sheet (not a new page)
   - Creator writes a short pitch (optional)
   - Selects available dates
   - Confirms rate
   - Submit → "Application sent! You'll hear back within 24 hours."

4. APPLIED CAMPAIGNS:
   - Tab or toggle: "Available" | "Applied" | "Active"
   - Applied shows status: Pending / Accepted / Declined

PROTECT: Do NOT modify restaurant-side pages or dashboard.

VERIFY: npm run build succeeds. Cards render correctly on mobile.
Commit: "creator-campaigns: polished discovery with application flow"

STOP and wait for approval.
```

---

### PROMPT 10: Final Production Sweep

```
\superpowers:brainstorming

CONTEXT: DragonCandy goes live in production this week. This is the
final quality sweep before launch.

ELON'S ALGORITHM — STEP 5: AUTOMATE (the QA process)

TASK: Comprehensive production readiness audit.

1. PLACEHOLDER HUNT — Find and fix ALL placeholder text:
   - Search entire codebase for: "Creator Name", "Artist Name",
     "Company Name", "Lorem", "placeholder", "TODO", "FIXME"
   - Every instance must either pull real data or show a proper
     empty state ("No name provided")

2. EMPTY STATES — Every list/grid must handle zero data:
   - No campaigns: "Launch your first campaign with Donny AI"
   - No creators in area: "No creators found — expand your search"
   - No messages: "Start a conversation from a creator's profile"
   - No reviews: Section hidden entirely (not empty cards)
   - No portfolio items: "Upload your first piece to showcase your work"

3. LOADING STATES:
   - Every data-fetching component needs a skeleton loader
   - No blank white screens while Supabase queries run
   - Skeleton should match the component's shape (card skeleton, list skeleton)

4. ERROR HANDLING:
   - API failures show a friendly "Something went wrong. Try again."
   - Not raw error messages or blank screens
   - Network offline: "You're offline. Reconnect to continue."

5. MOBILE RESPONSIVE CHECK:
   - Every page must render without horizontal scroll at 375px
   - Touch targets: minimum 44px height for all buttons and links
   - Bottom nav must not overlap page content

6. PERFORMANCE:
   - Images: ensure all images use lazy loading
   - Remove any unused imports or dead code
   - Verify no console.log statements in production code

PROTECT: Do NOT add new features. Only fix, polish, and harden.

VERIFY: npm run build succeeds with zero warnings.
Test: Every page loads, every button is tappable, every empty state works.
Commit: "production: final sweep — placeholders, empty states, loading, errors"

STOP. App is ready for launch review.
```

---

## PART 5: EXECUTION SEQUENCE

| Day | Prompt | Time Est. | Validates |
|-----|--------|-----------|-----------|
| Day 1 AM | Prompt 1: Design System | 30 min | Build passes, tokens work |
| Day 1 PM | Prompt 2: Landing Page | 45 min | Page looks professional |
| Day 2 AM | Prompt 3: Login/Auth | 30 min | Login works, role select works |
| Day 2 PM | Prompt 4: Dashboard | 45 min | Dashboard loads with real/empty data |
| Day 3 AM | Prompt 5: Browse Creators | 30 min | Cards show real data or proper empty states |
| Day 3 PM | Prompt 6: Creator Profile | 30 min | No placeholder text, real metrics |
| Day 4 AM | Prompt 7: Messaging | 30 min | Chat works with timestamps |
| Day 4 PM | Prompt 8: Campaign Wizard | 60 min | Full flow from input to launch |
| Day 5 AM | Prompt 9: Creator Campaigns | 30 min | Application flow works |
| Day 5 PM | Prompt 10: Production Sweep | 45 min | Zero placeholders, all empty states |

**Total estimated time: ~6 hours of focused Claude Code work across 5 days.**

---

## PART 6: TheCirqle UX PATTERNS → DragonCandy TRANSLATION

| TheCirqle Pattern | DragonCandy Adaptation |
|---|---|
| Dark, professional dashboard | Dark mode (#1A1A2A) for logged-in dashboard |
| AI Creator Discovery with metrics | Donny AI creator matching with engagement scores |
| Campaign lifecycle management | Campaign wizard → active tracking → content delivery |
| Turn content into paid ads | Future: Connect to Meta/TikTok ad accounts |
| ROAS forecasting | Future: Donny AI predicts campaign performance |
| Automated contracts & payouts | Stripe Connect for creator payouts (already planned) |
| Logo bar of trusted brands | Logo bar of beta restaurant partners |
| Video grid hero | Creator content thumbnails on landing page |

The key difference: TheCirqle serves enterprise e-commerce brands at $2K+/month.
DragonCandy serves local restaurants at $200-500/month. Your UX needs to be
SIMPLER and faster — restaurant owners have 5 minutes between lunch and dinner
rush, not an hour to configure a campaign. That's why Donny AI is your killer
advantage over TheCirqle.
