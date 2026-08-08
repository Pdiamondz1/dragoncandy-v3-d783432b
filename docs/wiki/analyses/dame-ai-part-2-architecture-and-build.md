---
title: "Dame AI — Part 2: Architecture, Cost & Build Plan"
type: analysis
created: 2026-06-27
updated: 2026-08-07
sources: [workspace]
tags: [dame, growth-agent, architecture, build-plan]
---

# Dame AI — Part 2: Architecture, Cost & Build Plan

> Split from the single "Dame AI: The Business Growth Agent System Spec" page on 2026-08-07 —
> see [[Dame AI — Part 1: What It Is & The Six Domains]] for the problem statement, the six
> operating domains, and the Dame-vs-Donny separation of concerns.
>
> Originally imported from a Google Workspace doc (id `10EIM7k8-itL4IQIXyZ0A4rhSMa0OD0pYLEgRMGC6VGc`) on 2026-06-27.

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
