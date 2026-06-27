---
title: DragonCandy — Dame AI: The Business Growth Agent System Spec
type: analysis
created: 2026-06-27
updated: 2026-06-27
sources: [workspace]
tags: []
---

# DragonCandy — Dame AI: The Business Growth Agent System Spec

> Imported from a Google Workspace doc (id `10EIM7k8-itL4IQIXyZ0A4rhSMa0OD0pYLEgRMGC6VGc`) on 2026-06-27.

# 🐉 DragonCandy — Dame AI

## The Business Growth Agent: Full System Spec

### An autonomous second agent that runs DragonCandy's growth engine so founders don't have to

*Internal Strategy Document — Prepared by Donny (DragonCandy AIOS) — June 2026* *Grounded in current platform state: 39 users, 0 new signups this week, 2 of 17 campaigns active*

---

## 1\. The Problem This Solves

Right now DragonCandy has a fully built platform, a working payment stack, a real data flywheel, and 39 users — but **0 new signups this week** and **0 new DragonShare boosts**. The platform isn't growing because growth requires human time that the founders don't have.

The marketing budget target is **$0 organic for the first 90 days.** That's not a constraint — it's a design requirement. The answer is a second AI agent whose entire job is to run the business of DragonCandy: manage the website, keep social channels alive, write outreach, find press opportunities, track suppliers and creators, and deliver a weekly operating brief — like a full-time growth manager, running 24/7 at AI cost.

**Donny AI** (the existing agent) serves the platform users — creators, restaurants, brands. It connects, matches, campaigns, schedules.

**Dame AI** (the new agent proposed here) serves the company itself — it runs DragonCandy's growth, marketing, and business operations. Two agents, two mandates, one company.

The name "Dame" comes from the founder. It's fitting — this agent carries the company's external face and growth engine.

---

## 2\. What Dame AI Is

Dame AI is a **scheduled, autonomous business operations agent** that:

- Runs on a weekly cadence (with daily micro-tasks)  
- Has read/write access to DragonCandy's website content, social channels, app store listings, outreach templates, and the AIOS internal dashboard  
- Reports to founders via the weekly brief (already built in AIOS) and a dedicated Dame dashboard section  
- Costs roughly **$50–200/month in AI compute** — replacing what would otherwise be a $65–85K/year community manager \+ $55–75K/year social media manager \+ $60–75K/year SEO content strategist

Dame AI doesn't replace human judgment on strategy. It executes the work that strategy calls for — relentlessly, at scale, without burnout.

---

## 3\. Dame AI's Six Operating Domains

### Domain 1: 🌐 Website Management & Content Curation

**What Dame does:**

- Monitors the internal feature release log (from Donny's knowledge base and AIOS briefings)  
- When a new feature ships, Dame auto-drafts a website update: updated feature copy for the relevant landing page section, an updated FAQ entry, and a changelog post  
- Presents draft to founders via AIOS for one-tap approval before publishing  
- Manages the website's blog/content section — publishes one article per week on topics relevant to creators, restaurants, or the food content economy (see Domain 4 for sourcing)  
- Monitors dragoncandy.io contact form submissions and drafts personalized responses within 2 hours, presented to founders for review and send

**Hard rules:**

- Dame NEVER publishes to the live website without founder approval  
- All drafts appear in the AIOS dashboard as "Pending Review" items  
- Donny's email compose tool (`compose_email_link`) handles contact responses — founder clicks the link, reviews, and sends

**Concrete example — this week:**

- Feature shipped: Stripe payment infrastructure repaired (from this week's brief)  
- Dame drafts: "Our payment engine just got a major upgrade — creators now get paid faster than ever. Here's what changed." → website changelog \+ social post \+ email to existing users  
- Founders review → one tap → published

**Tools needed:**

- Read access to AIOS briefings and Donny knowledge (already exists)  
- Website CMS write access (Lovable.dev deploy hook or headless CMS integration)  
- `compose_email_link` for contact responses (already exists in Donny)  
- Google Workspace export for draft staging (already exists)

---

### Domain 2: 📱 App Store & Social Channel Management

**App Store (Apple \+ Google Play):**

- Dame monitors the feature release cadence and drafts updated App Store / Google Play descriptions when new features ship  
- Tracks App Store reviews — flags any review under 3 stars to founders within 24 hours with a suggested response draft  
- Maintains keyword-optimized metadata (title, subtitle, keywords) — refreshes quarterly based on what's ranking for "creator marketplace," "food content," "restaurant marketing app"  
- Drafts screenshots and release notes copy for each version update

**Social Channels (Instagram, TikTok, X/Twitter, LinkedIn):**

- Dame produces a **weekly content calendar** — 5 posts per week across platforms, pre-scheduled, founder-reviewed Sunday for the week ahead  
- Content types rotate on a fixed cadence:  
  - **Monday** — Platform feature spotlight or Donny AI demo (screen recording prompt)  
  - **Tuesday** — Creator spotlight (sourced from DragonCandy's active creators, drafted by Dame)  
  - **Wednesday** — Restaurant case study or "before/after social media" educational post  
  - **Thursday** — Industry insight or creator economy data point (Dame sources from web)  
  - **Friday** — Community post — earnings milestone, \#DragonDashed campaign success, or community question  
- Dame writes all captions, selects hashtags, drafts the visual brief (what the image/video should show), and schedules via the Outstand integration already in the platform  
- For video content: Dame writes the script and shot list — a human films it, Dame edits the caption and posts

**Growth mechanics:**

- Dame monitors DragonCandy's follower count weekly — flags if growth rate drops below target  
- Engages with comments on DragonCandy's posts (drafts replies for founder review on high-priority comments)  
- Identifies and drafts responses to relevant conversations in the creator economy space on X/Twitter — the "be helpful first" community strategy from the GTM doc, executed systematically

**Hard rules:**

- No post goes live without founder approval (one-tap in AIOS)  
- Dame never auto-posts — it pre-schedules pending review

---

### Domain 3: 🎯 Marketing Manager — Outreach & Pipeline

This is the highest-leverage domain. Dame replaces the outbound hustle that currently costs founders 15–20 hours/week.

**Creator Outreach (Supply Side):**

- Every week, Dame produces a list of **10 new food creators to reach out to** in the current target metro (Hoboken → Manhattan → Palm Beach)  
- Sources: public TikTok/Instagram profiles, YouTube food channels, local food blog directories  
- For each creator, Dame produces:  
  - Profile summary (follower count, engagement rate, content style, recent posts)  
  - Personalized outreach message (using the "Donny writes it, human sends it" architecture already documented in the Influencer Outreach wiki)  
  - Their Instagram/TikTok profile link \+ the message pre-copied, ready to paste  
- Founders review the list, tap "Send" on whichever look promising — takes 10 minutes instead of 3 hours

**Restaurant / Supplier Outreach (Demand Side):**

- Dame produces a list of **5 new restaurants or suppliers to target** each week in the active metro  
- Sources local restaurant directories (Yelp, Google Maps, OpenTable), identifies accounts with thin or absent social media presence (the ideal customer)  
- Produces a personalized outreach package for each:  
  - Restaurant name, cuisine, social media audit (what they post, how often, quality)  
  - Personalized opening line referencing their specific situation  
  - Full pitch email with DragonCandy value prop tailored to their cuisine type  
  - QR code link to their free campaign brief (Donny generates one from their website URL)  
- Founders review → `compose_email_link` → send

**Supplier / Brand Outreach:**

- Dame tracks regional food and beverage brands that distribute through restaurants in target metros  
- Produces quarterly outreach list for brand sponsorship conversations  
- Drafts the sponsor deck intro email and follow-up sequence

**Weekly Outreach Tracker:**

- Dame maintains a running outreach log: who was contacted, what was sent, response status  
- Flags any contact that hasn't responded in 5 days with a follow-up draft ready  
- Reports outreach pipeline in the weekly brief: "10 creators contacted, 3 responded, 1 signed up"

---

### Domain 4: 📰 Publications, Press & Events

**Press & Publication Targeting:**

- Dame runs a monthly scan for:  
  - Food industry publications (Nation's Restaurant News, QSR Magazine, Restaurant Business)  
  - Creator economy publications (Creator Economy Report, Influencer Marketing Hub)  
  - Tech/startup press (TechCrunch, The Information food tech beat, NJ/NYC local business press)  
  - Podcast opportunities (food entrepreneur podcasts, creator economy shows)  
- For each opportunity, Dame produces: publication name, audience size, submission/contact details, a tailored pitch angle, and a draft pitch email  
- Founders review the monthly press list — pick which to pursue, tap to generate the full pitch

**Conference & Event Calendar:**

- Dame maintains a running events calendar — food festivals, restaurant industry conferences, creator economy summits, local business networking events in target metros  
- Produces monthly "Events to Consider" briefing with:  
  - Event name, date, location, cost, audience profile  
  - Recommended action: speak / exhibit / attend / sponsor  
  - Draft application or outreach if applicable  
- Flags high-priority events 8 weeks in advance (enough time to prepare)

**Key events Dame tracks:**

- NRA Show (National Restaurant Association — largest food industry conference)  
- NYC Food & Wine Festival, Smorgasburg (local presence events)  
- Creator Economy Conference, VidCon (creator-side visibility)  
- TechCrunch Disrupt, Collision (startup press \+ investor visibility)  
- Local NJ/NYC hospitality events and restaurant association meetings

**Article & Content Seeding:**

- When DragonCandy hits a milestone (10th campaign, $10K GMV, first creator earns $1K), Dame drafts a press release and identifies 5 journalists to pitch  
- Dame monitors relevant Reddit communities (r/Entrepreneur, r/restaurants, r/ContentCreators) for questions where DragonCandy is a genuine answer — drafts non-promotional helpful responses for founder to post

---

### Domain 5: 📊 Weekly Operating Brief — Run It Like a Real Business

This is Dame's most important output. Every Monday morning, founders receive a full operating brief — **not a data dump, but a judgment call document** that tells them what happened, what it means, and exactly what to do this week.

**The Dame Weekly Brief structure:**

---

**🐉 Dame Weekly Brief — Week of \[Date\]**

**THE ONE-LINE SUMMARY** \[Dame writes a single sentence: what was the most important thing that happened last week and what it means for growth\]

**PLATFORM NUMBERS (vs. last week and vs. targets)**

- New signups: X (target: 3+/week) — \[status: on track / at risk / off track\]  
- Active campaigns: X of Y total — \[status\]  
- DragonShare boosts: X — \[status\]  
- Creator:Restaurant ratio: X:Y — \[status\]  
- Social following: Instagram X (+/-Y), TikTok X (+/-Y), X X (+/-Y)  
- Outreach pipeline: X creators contacted, Y responded, Z signed up

**WHAT WORKED THIS WEEK** \[Dame identifies the 1–3 things that drove positive movement\]

**WHAT DIDN'T WORK** \[Dame identifies the 1–3 problems, plainly stated — no spin\]

**THIS WEEK'S TOP 3 ACTIONS** \[Specific, executable — not vague. "Send the 10 creator outreach messages Dame prepared" not "do outreach"\]

1. \[Action \+ why \+ estimated time to execute\]  
2. \[Action \+ why \+ estimated time to execute\]  
3. \[Action \+ why \+ estimated time to execute\]

**OUTREACH QUEUE READY FOR YOUR REVIEW**

- \[Creator 1\]: \[Handle\] — \[Follower count\] — \[Message ready to send\]  
- \[Creator 2\]: \[Handle\] — \[Follower count\] — \[Message ready to send\]  
- ... (10 total)

**RESTAURANT TARGETS THIS WEEK**

- \[Restaurant 1\]: \[Name, cuisine, why they're a good target\] — \[Email draft ready\]  
- ... (5 total)

**CONTENT CALENDAR — THIS WEEK**

- Mon: \[Post title/topic\] — \[Draft ready\]  
- Tue: \[Post title/topic\] — \[Draft ready\]  
- Wed: \[Post title/topic\] — \[Draft ready\]  
- Thu: \[Post title/topic\] — \[Draft ready\]  
- Fri: \[Post title/topic\] — \[Draft ready\]

**EVENTS & PRESS OPPORTUNITIES** \[Any upcoming deadlines or high-priority press pitches\]

**DONNY SYSTEM HEALTH** \[Brief: any issues with campaigns, payments, user complaints flagged this week\]

---

**This brief is generated automatically every Monday.** Founders review it — takes 15 minutes — approve the content calendar, send the outreach messages, and execute the top 3 actions. The rest of the week runs.

This is the "run it as a real business" mechanic you described. The agent does the analysis and prep. Founders do the judgment and execution on the highest-leverage items only.

---

### Domain 6: 🔄 Automatic Economy of Scale — The Amplification Engine

This domain connects Dame AI to the Dragon Rewards Engine (DRE) built separately. Together they create the automatic growth loop.

**Dame's role in the amplification engine:**

**Content Amplification:**

- When a creator earns a DRE milestone (Dragon Knight badge, earnings milestone), Dame auto-generates a social post celebrating it — tags the creator if they've shared their handle, uses \#DragonDashed, links to platform  
- When a restaurant completes their 10th campaign, Dame generates a case study draft — interviews them (via Donny-generated message), writes it up, publishes it to the DragonCandy blog and social channels  
- Every piece of user-generated content that flows through DragonShare that hits \>1,000 organic views gets flagged by Dame — "This post is performing well — do you want to boost it and feature it on DragonCandy's channels?"

**Referral Amplification:**

- Dame tracks who's in the referral pipeline — who shared a link, who clicked, who converted  
- Sends a personal thank-you message (via `compose_email_link`) to every user who successfully refers someone — "You just helped DragonCandy grow. Here's your reward credit."  
- Flags the top referrer each week in the Dame Brief — "This creator referred 3 people this week — they deserve a personal thank-you from you"

**SEO & Organic Discovery:**

- Dame maintains a content pipeline of articles targeting high-intent search terms:  
  - "How to get paid as a food creator" → creator acquisition  
  - "Best way to get social media content for my restaurant" → restaurant acquisition  
  - "How to find local food influencers" → restaurant acquisition  
  - "Food content creator jobs near me \[city\]" → creator acquisition per metro  
- One article per week, Dame writes it, founders review and approve, publishes to dragoncandy.io/blog  
- Over 6–12 months this becomes a significant organic acquisition channel at $0 additional cost

**Community Building:**

- Dame monitors mentions of DragonCandy across social platforms  
- Flags every mention for founder awareness — "Someone posted about DragonCandy on TikTok — here's the post, do you want to respond?"  
- Identifies communities where DragonCandy should have a presence (local food creator Facebook groups, restaurant owner subreddits) and drafts an intro post for founders to review and share

---

## 4\. Dame vs. Donny — Clear Separation of Concerns

|  | Donny AI | Dame AI |
| :---- | :---- | :---- |
| **Serves** | Platform users (creators, restaurants, brands) | The company (founders, growth engine) |
| **Lives in** | The app — creator/restaurant/brand dashboards | AIOS internal dashboard — founders only |
| **Primary job** | Connect, match, campaign, schedule, pay | Grow, market, outreach, publish, brief |
| **Trigger** | User action (ask Donny, create campaign) | Schedule (weekly cadence \+ daily micro-tasks) |
| **Output** | Campaign briefs, creator matches, payments | Content drafts, outreach lists, press pitches, briefs |
| **Autonomy** | High — Donny acts on user requests in real-time | Drafts only — founders approve before anything goes live |
| **Cost** | \~$2.28/month production AI spend (current) | \~$50–200/month additional (scheduled batch processing) |

They share the same AI infrastructure (Claude Sonnet/Haiku via model routing) and the same knowledge base (Donny's RAG, AIOS internal docs). Dame is a new **scheduled agent surface** built on the existing stack.

---

## 5\. What Dame AI Is NOT

**Dame does not replace strategic decisions.** Founders still decide:

- Which markets to enter  
- What to charge  
- Which features to prioritize  
- Which press opportunities to pursue  
- Which partnerships to form

**Dame does not self-publish.** Every piece of content, every outreach message, every article goes through founder approval in AIOS before it touches the outside world. Dame is the preparer; founders are the decision-makers.

**Dame does not replace human relationships.** The personalized DM to a creator, the in-person visit to a restaurant, the handshake at a food festival — these are founder-executed. Dame prepares everything for those moments; it doesn't replace them.

---

## 6\. Technical Architecture — How to Build Dame AI

Dame AI is built on the existing Donny infrastructure with a new scheduled execution layer.

### 6A. New Database Tables

\-- Dame's weekly task queue

dame\_tasks (

  id uuid PRIMARY KEY,

  task\_type text,          \-- 'creator\_outreach', 'restaurant\_outreach', 'content\_draft', 

                           \--  'press\_pitch', 'weekly\_brief', 'app\_store\_update'

  status text,             \-- 'pending\_review', 'approved', 'sent', 'skipped'

  payload jsonb,           \-- the full draft content

  auto\_generated\_at timestamptz,

  reviewed\_at timestamptz,

  reviewed\_by uuid,

  scheduled\_for date,

  created\_at timestamptz

)

\-- Outreach pipeline tracker

dame\_outreach\_log (

  id uuid PRIMARY KEY,

  target\_type text,        \-- 'creator', 'restaurant', 'brand', 'press'

  target\_name text,

  target\_handle text,

  target\_platform text,

  outreach\_draft text,     \-- the full message Dame prepared

  status text,             \-- 'draft', 'sent', 'responded', 'converted', 'declined'

  sent\_at timestamptz,

  responded\_at timestamptz,

  notes text,

  week\_of date,

  created\_at timestamptz

)

\-- Content calendar

dame\_content\_calendar (

  id uuid PRIMARY KEY,

  scheduled\_date date,

  platform text,           \-- 'instagram', 'tiktok', 'x', 'linkedin', 'blog'

  content\_type text,       \-- 'feature\_spotlight', 'creator\_spotlight', 'case\_study', 'industry\_insight', 'community'

  caption\_draft text,

  visual\_brief text,       \-- what the image/video should show

  hashtags text\[\],

  status text,             \-- 'draft', 'approved', 'scheduled', 'published'

  outstand\_post\_id text,   \-- reference once scheduled in Outstand

  created\_at timestamptz

)

\-- Events & press tracker

dame\_opportunities (

  id uuid PRIMARY KEY,

  opportunity\_type text,   \-- 'conference', 'press\_pitch', 'podcast', 'publication'

  name text,

  description text,

  deadline date,

  event\_date date,

  cost\_estimate text,

  audience\_profile text,

  recommended\_action text,

  pitch\_draft text,

  status text,             \-- 'identified', 'pitched', 'accepted', 'declined', 'attended'

  priority text,           \-- 'high', 'medium', 'low'

  created\_at timestamptz

)

\-- Dame's weekly brief store

dame\_weekly\_briefs (

  id uuid PRIMARY KEY,

  week\_of date,

  brief\_md text,           \-- full markdown brief

  platform\_snapshot jsonb, \-- stats snapshot at time of generation

  top\_3\_actions jsonb,

  outreach\_queue jsonb,

  content\_queue jsonb,

  status text,             \-- 'draft', 'delivered', 'archived'

  created\_at timestamptz

)

### 6B. Scheduled Edge Functions

dame-weekly-orchestrator     — runs Monday 6am ET

  → pulls platform stats from Supabase

  → calls Dame weekly brief generator

  → generates 10 creator outreach drafts

  → generates 5 restaurant outreach drafts

  → generates 5-post content calendar

  → checks dame\_opportunities for this week's deadlines

  → writes all to dame\_tasks \+ dame\_weekly\_briefs

  → notifies founders via AIOS notification

dame-daily-monitor           — runs daily 8am ET

  → checks for new platform activity (signups, boosts, campaign completions)

  → flags anything noteworthy (milestone reached, no activity for 3 days)

  → checks social mentions (manual trigger for now, API integration later)

dame-content-scheduler       — runs when founder approves a content item

  → passes approved caption \+ visual brief to Outstand scheduling

  → logs to dame\_content\_calendar with outstand\_post\_id

dame-outreach-followup       — runs daily

  → checks dame\_outreach\_log for contacts with no response in 5 days

  → drafts follow-up message

  → adds to dame\_tasks as 'pending\_review'

### 6C. AIOS Dashboard — Dame Section

New section in the AIOS internal dashboard (already has the sidebar structure):

**Dame Hub** (new nav item in the AIOS sidebar)

- **Weekly Brief** — this week's full brief, with approve/skip actions on each item  
- **Outreach Queue** — list of creator/restaurant targets with one-click `compose_email_link` for each  
- **Content Calendar** — weekly calendar view, approve/edit/skip each post  
- **Press & Events** — opportunities list, sorted by deadline  
- **Pipeline** — outreach log showing sent/responded/converted tracking

All approvals are one-tap. Founders spend 15–20 minutes on Monday reviewing the week's Dame output, make decisions, and the machine runs.

---

## 7\. What Dame Costs vs. What It Replaces

### AI Compute Cost (Dame running weekly)

- Weekly brief generation: \~5,000 tokens/week \= \~$0.075/week  
- 10 creator outreach drafts: \~2,000 tokens/week \= \~$0.03/week  
- 5 restaurant outreach drafts: \~1,500 tokens/week \= \~$0.023/week  
- 5 content calendar posts: \~3,000 tokens/week \= \~$0.045/week  
- Monthly total: \~**$0.70–$2.00/week \= $3–$8/month**  
- With additional features (press research, event scanning): \~**$20–50/month**  
- At full scale with daily micro-tasks: \~**$50–200/month**

### What Dame Replaces (from your existing marketing team plan)

- Social Media Manager: **$72–90K/year loaded**  
- Creator Community Manager: **$65–85K/year loaded**  
- SEO & Content Strategist: **$78–98K/year loaded**  
- Subtotal replaced: **\~$215–273K/year**

**ROI at $200/month AI cost vs. $215K/year in salaries: Dame pays for itself by Day 1\.**

The human marketing team you've documented becomes relevant at Year 2 scale — when you're in 3 metros with 500+ users and the volume requires humans. Dame gets you to that scale without the burn rate.

---

## 8\. The Automatic Economy of Scale — How Dame \+ Donny \+ DRE Create It

This is the full picture of the three-agent system working together:

DAME AI (Business Growth Agent)

  ↓ produces outreach lists

FOUNDERS send outreach to creators/restaurants

  ↓ they sign up

DONNY AI (Platform Agent)

  ↓ onboards them, matches them, runs campaigns

DRAGON REWARDS ENGINE (Gamification Layer)

  ↓ rewards their activity, generates shareable moments

USERS share milestones to social media

  ↓ generates organic visibility

NEW CREATORS/RESTAURANTS discover DragonCandy

  ↓ they sign up

DAME AI tracks the growth, reports in weekly brief

  ↓ identifies what's working, doubles down

CYCLE REPEATS — getting faster each week

**The specific economy of scale mechanism:**

- More users → more campaigns → more DRE activity → more social shares → more visibility → more signups  
- More signups → Dame surfaces more outreach opportunities → founders send more targeted messages → higher conversion  
- More content → Dame produces better case studies → more press → more credibility → faster conversion  
- More data → Donny matches better → higher campaign success → more restaurant retention → more GMV  
- More GMV → more resources → Dame activates more channels → growth accelerates

This is automatic in the sense that each layer feeds the next without manual intervention. **The founders' only recurring job is the Monday 15-minute review.**

---

## 9\. This Week's Immediate Actions (Current State)

Based on the live platform data (39 users, 0 new signups this week, 2/17 campaigns active):

**Dame's immediate outputs if activated today:**

**Creator Outreach List (Hoboken/JC focus):** Dame would identify 10 local food creators from public TikTok/Instagram who post about Hoboken/Jersey City restaurants and aren't yet on DragonCandy. For each, draft a personalized message referencing their specific recent content and linking to a Donny-generated campaign brief from one of the 15 stalled published campaigns.

**Restaurant Reactivation:** 14 published campaigns have no applications. Dame would draft a personalized nudge for each restaurant: "Your campaign has been live for X days — here are 3 creators who match your brief. Want Donny to invite them directly?"

**Content Calendar (this week):**

- Mon: "How DragonCandy's payment system works — creators get paid in 48 hours" (addresses trust concern, promotes recent Stripe fix)  
- Tue: Creator spotlight featuring one of the 16 existing creators on the platform  
- Wed: "What great restaurant social media looks like — before/after" (educational, targets restaurant owners)  
- Thu: "Why micro-creators (1K–50K followers) outperform big influencers for local restaurants" (industry insight, creator acquisition)  
- Fri: \#DragonDashed — showcase a recent DragonShare boost success

**Press Pitch:** The Stripe infrastructure repair story \+ the upcoming Dragon Rewards Engine launch \= a legitimate tech/startup story. Dame would draft a pitch to 3 NJ/NYC tech journalists: "Local AI startup launches gamified creator economy platform — here's how it works."

---

## 10\. Phased Build Plan

### Phase 1 — The Weekly Brief Machine (2 weeks)

- `dame_weekly_briefs` table \+ `dame_weekly-orchestrator` edge function  
- Basic AIOS "Dame Hub" section showing the generated brief  
- Platform stats pulled from existing Supabase data  
- Manual outreach list generation (Dame writes drafts, shows them in AIOS)

### Phase 2 — Outreach Pipeline (2–3 weeks)

- `dame_outreach_log` table  
- Creator discovery integration (public social API data)  
- Restaurant targeting (Google Maps/Yelp public data)  
- `compose_email_link` integration for one-click outreach sending  
- Follow-up scheduler

### Phase 3 — Content Calendar (2 weeks)

- `dame_content_calendar` table  
- Content generation pipeline (Dame writes, founders approve)  
- Outstand integration for scheduling approved posts  
- Social performance tracking (views, follows, engagement)

### Phase 4 — Press & Events (2 weeks)

- `dame_opportunities` table  
- Monthly press scan automation  
- Event calendar with deadline tracking  
- Pitch draft generation

### Phase 5 — Full Amplification Engine (ongoing)

- Connect Dame outputs to DRE (milestone posts, case studies)  
- SEO article pipeline (one per week, published to blog)  
- Community monitoring (mentions, relevant conversations)  
- Full economy of scale loop instrumented and measured

**Total build time: 8–11 weeks. Total ongoing AI cost: $50–200/month.**

---

## 11\. Summary — What Dame AI Gives You

| Need | Dame AI Delivers |
| :---- | :---- |
| Website stays current with new features | Auto-drafted updates, one-tap approval |
| Social channels post consistently | 5 posts/week, drafted \+ scheduled, founder-reviewed Sunday |
| App Store stays optimized | Quarterly refresh, review monitoring, release notes |
| Outreach to creators every week | 10 targeted creator messages, personalized, ready to send |
| Outreach to restaurants every week | 5 targeted restaurant pitches, ready to send |
| Press & conference pipeline | Monthly scan, pitches drafted, deadlines tracked |
| Weekly operating review | Full brief delivered Monday morning, 15 min to review |
| Growth analysis | What worked, what didn't, top 3 actions — every week |
| Economy of scale | Three-agent system (Dame \+ Donny \+ DRE) self-amplifies |
| Marketing budget | $50–200/month AI cost replacing $215–273K/year in salaries |

**The founders' job becomes:** strategy, relationship-building, and the 15-minute Monday review. Dame handles the execution.

---

*Dame AI System Spec — DragonCandy Internal* *Prepared by Donny, DragonCandy AIOS — June 2026* *For founder review and engineering handoff* *Companion doc: Dragon Rewards Engine (DRE) Full System Spec*
