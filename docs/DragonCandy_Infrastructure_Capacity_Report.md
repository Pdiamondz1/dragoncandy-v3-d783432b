# DRAGONCANDY

## Infrastructure Capacity Report — Scaling to 250 Daily Active Users

*A Plain-English Assessment of Whether Our Systems Can Handle 100 Restaurants, 100 Creators, and 50 Brands Using All Features Daily*

Prepared by the DragonCandy Team

Confidential — For Internal Use

*Updated May 2026*

---

## The Bottom Line

**Our current infrastructure cannot reliably support 250 daily active users using all features.** The database server (Supabase MICRO tier) will run out of memory and connections under that load. The fix is a single settings change — upgrading from MICRO to SMALL compute — at an additional cost of approximately $49/month. No code changes, no downtime, no migration. Everything else (disk space, edge functions, hosting, authentication) is fine at 250 users.

The Donny AI assistant — which powers campaign generation, creator matching, and the in-app chat — runs on Anthropic's Claude API. At 250 users, Donny AI will cost an estimated $150-$400/month in API fees. That's well within our 15% revenue cap for AI costs and maintains the ~90% margin on AI-powered features.

**Total infrastructure cost at 250 DAU: approximately $370-$520/month** (up from $295/month today).

---

## Section 1: What We're Running Today

Think of our infrastructure like a restaurant kitchen. The database is the stove (where all the cooking happens), edge functions are the line cooks (they execute specific tasks on demand), hosting is the dining room (what customers see), and AI is the head chef (the intelligence behind the operation). Here's what each piece looks like right now:

### The Current Kitchen

| Component | What It Is (Plain English) | Current Plan | Monthly Cost |
|-----------|---------------------------|-------------|-------------|
| **Supabase Database** | The central brain of the app — stores every user profile, campaign, message, payment, and file record. Also handles real-time messaging and runs 56 backend functions. | Pro plan, MICRO compute | $25 |
| **Lovable.dev Hosting** | The "storefront" — serves the DragonCandy website and app to users' browsers and phones. | Standard plan | $50 |
| **Claude AI (Anthropic)** | Powers Donny AI — the assistant that generates campaign briefs, matches creators, and chats with users. Also powers all development work. | Max plan (development) + API usage (production) | $200 |
| **OpenAI** | Supplementary AI for specific tasks like text embeddings (helping Donny understand and search through campaign data). | Subscription | $20 |
| **TOTAL** | | | **$295/month** |

### Current Usage (37 Users, Pre-Revenue)

| Resource | What It Means | Current Usage | Maximum Allowed |
|----------|--------------|---------------|-----------------|
| **Database connections** | How many people can talk to the database at the same time. Like phone lines — if all 60 are busy, the next caller gets a busy signal. | 20 of 60 (33%) | 60 |
| **Memory (RAM)** | The database's short-term working memory. More users = more things to remember at once. When it fills up, the database slows to a crawl or crashes. | 39% of 1 GB | 1 GB |
| **Disk storage** | Long-term storage for all data. Like a filing cabinet. | 211 MB of 8 GB (3%) | 8 GB |
| **CPU** | Processing power. How fast the database can answer questions. | 3% | Shared 2-core |
| **Edge functions deployed** | Backend programs that handle specific tasks (payments, AI calls, emails, etc.). | 56 active | Unlimited on Pro |

**The concern:** With only 37 users, we're already using 39% of our memory. That's not a problem today, but it means we don't have 7x headroom to serve 7x the users.

---

## Section 2: What 250 Daily Active Users Actually Means

"250 daily active users" doesn't mean 250 people sitting on the app simultaneously. It means 250 unique people use the app at least once during a given day. Based on typical SaaS usage patterns, here's what that translates to in actual system load:

### Peak Concurrent Users

| Time of Day | Expected Concurrent Users | What They're Doing |
|-------------|--------------------------|-------------------|
| Morning (8-11 AM) | 30-50 | Restaurants checking dashboards, reviewing applications, checking messages |
| Midday (11 AM-2 PM) | 60-90 | Peak activity — creators browsing campaigns, businesses posting campaigns, Donny AI conversations |
| Afternoon (2-5 PM) | 40-70 | Content submissions, payment processing, messaging |
| Evening (5-9 PM) | 50-80 | Creators uploading content, businesses reviewing deliverables, social media scheduling |

**Peak concurrent users: 60-90.** That's the number our infrastructure needs to handle without slowing down.

### Daily System Requests by Feature

Here's what 250 users actually generate in terms of system activity, broken down by feature:

| Feature | Requests per User/Day | Total Daily Requests | What Happens Behind the Scenes |
|---------|----------------------|---------------------|-------------------------------|
| **Dashboard loads** | 3-5 | 750-1,250 | 4-6 database queries each (campaigns, earnings, stats, deadlines) |
| **Messaging** | 5-10 messages | 1,250-2,500 | Each message = 1 database write + 1 real-time broadcast to the other person |
| **Campaign browsing** | 3-8 page views | 750-2,000 | Database reads with filters (location, budget, content type) |
| **Donny AI conversations** | 2-5 messages | 500-1,250 | Each message = 1 Anthropic API call + 1-3 database operations + potential tool calls |
| **Social media manager** | 1-3 actions | 250-750 | Compose, schedule, or publish posts via Outstand.so integration |
| **File uploads/downloads** | 0.5-2 | 125-500 | Supabase Storage read/write |
| **Payment actions** | 0.2-1 | 50-250 | Stripe API call + database update + webhook processing |
| **Campaign creation** | 0.1-0.5 | 25-125 | Donny AI generation (heavy — uses Claude Sonnet) + database writes |
| **Creator matching** | 0.1-0.3 | 25-75 | AI scoring of all creators in area (uses Claude Haiku) |
| **TOTAL** | | **~3,725-8,700/day** | |

That's roughly **150-360 requests per hour** during business hours, or **2.5-6 requests per second** at peak. This is well within what a properly sized database can handle — the bottleneck isn't speed, it's connections and memory.

---

## Section 3: Where We'll Hit Walls (and How to Fix Them)

### Problem 1: Database Connections — CRITICAL

**What it is:** Every time a user loads a page, sends a message, or triggers an AI action, the app opens a connection to the database. Think of it like phone lines at a call center. Our current plan allows 60 simultaneous connections.

**Why it's a problem at 250 users:**

| Connection Consumer | Connections Used |
|-------------------|-----------------|
| Active page sessions (peak 60-90 users) | 15-30 (pooled via Supavisor) |
| Real-time messaging subscriptions | 20-40 (one per user with chat open) |
| Edge functions (AI calls, payments, etc.) | 10-20 (burst during peak) |
| Supabase internal processes | 8-10 (auth, storage, system) |
| **TOTAL AT PEAK** | **53-100** |

At peak, we'll regularly hit or exceed the 60-connection ceiling. When that happens, users see errors: pages won't load, messages won't send, Donny AI won't respond.

**The fix:** Upgrade to SMALL compute (90 connections). Cost: +$49/month.

### Problem 2: Memory (RAM) — CRITICAL

**What it is:** The database keeps frequently-used data and active query results in memory (RAM) for speed. More users = more data in memory = more RAM consumed. When RAM fills up, the database starts writing to disk — which is 100x slower — and everything grinds.

**Why it's a problem at 250 users:**

| Memory Consumer | Estimated Usage |
|----------------|----------------|
| Active connections (5-10 MB each) | 300-600 MB |
| Query caches and buffers | 150-250 MB |
| Real-time subscription state | 50-100 MB |
| PostgreSQL system overhead | 100-150 MB |
| **TOTAL AT PEAK** | **600 MB - 1.1 GB** |

Our current limit is 1 GB. We'll be operating at the edge or over capacity during peak hours.

**The fix:** Upgrade to SMALL compute (2 GB RAM). Cost: included in the same $49/month upgrade.

### Problem 3: Real-Time Messaging Connections — WATCH

**What it is:** When users have the messaging page open, they hold a persistent WebSocket connection (a live, open phone line) so messages appear instantly. Each open chat tab = 1 real-time connection.

**Current limit:** Supabase Pro supports up to 500 concurrent real-time connections.

**At 250 users:** If half have messaging open at once, that's 125 connections. Well within the 500 limit. **No action needed yet**, but worth monitoring as we approach 500+ users.

### What's NOT a Problem

| Resource | Why It's Fine |
|----------|-------------|
| **Disk storage** | 211 MB today. At 250 users: ~1.5-2 GB. Limit is 8 GB. Plenty of room. |
| **Authentication** | Supabase Auth handles thousands of users. 250 is trivial. |
| **Edge functions** | 56 deployed, Pro plan allows 2 million invocations/month. At 250 users we'll use ~90,000/month (4.5%). |
| **File storage** | Supabase Storage scales independently. No limit concerns. |
| **Hosting (Lovable.dev)** | Static site hosting. 250 users is nothing. |

---

## Section 4: Donny AI Costs at 250 Users

Donny AI is the brain of DragonCandy. Every time a user asks Donny a question, generates a campaign brief, or gets a creator match recommendation, we pay Anthropic (the company that makes Claude AI) a small fee based on how much text was processed. Here's what that costs at scale.

### How Donny AI Uses Different Models

Think of it like a restaurant kitchen with two chefs:

| Chef (AI Model) | What It Handles | Cost per Call | Speed |
|----------------|----------------|--------------|-------|
| **Claude Haiku** (the fast, cheap chef) | Quick tasks: nudge messages, creator matching scores, social media captions | $0.001-$0.005 | Very fast |
| **Claude Sonnet** (the experienced chef) | Complex tasks: campaign brief generation, full Donny chat conversations, campaign previews, performance analysis | $0.01-$0.08 | Fast |

We route every AI request to the cheapest model that can handle it. Simple tasks go to Haiku (pennies). Complex tasks go to Sonnet (a few cents). This is called "model routing" and it's how we keep AI costs at ~90% margin.

### Projected Monthly AI Costs at 250 Users

| AI Feature | Calls/User/Month | Total Monthly Calls | Avg Cost/Call | Monthly Cost |
|-----------|-----------------|--------------------|--------------:|-------------:|
| **Donny Chat** (conversations) | 15-30 | 3,750-7,500 | $0.04 | $150-$300 |
| **Campaign Generation** | 0.5-2 | 125-500 | $0.06 | $7.50-$30 |
| **Creator Matching** | 0.5-1 | 125-250 | $0.003 | $0.38-$0.75 |
| **Campaign Previews** | 0.3-1 | 75-250 | $0.03 | $2.25-$7.50 |
| **Social Captions** | 1-3 | 250-750 | $0.002 | $0.50-$1.50 |
| **Nudge Frames** | 0.2-0.5 | 50-125 | $0.002 | $0.10-$0.25 |
| **Auto-Pilot** (daily posts) | 1 (Growth+ users) | ~1,500 | $0.03 | $45 |
| **Apply Pitch** (creator apps) | 0.3-1 | 75-250 | $0.02 | $1.50-$5.00 |
| **TOTAL** | | **~5,950-11,125** | | **$207-$390** |

**Bottom line: Donny AI costs approximately $200-$400/month to serve 250 daily active users.** That's $0.80-$1.60 per user per month — well within the $0.30-$5.00 per-customer range we projected in the original pricing briefing.

### AI Cost as a Percentage of Revenue

At 250 users (100 restaurants, 100 creators, 50 brands), assuming the hybrid pricing model:

| Revenue Source | Monthly Revenue |
|---------------|----------------|
| Restaurant subscriptions (avg $350 x 100) | $35,000 |
| Brand subscriptions (avg $800 x 50) | $40,000 |
| Take rate on campaigns (~$200K volume x 6% avg) | $12,000 |
| DragonDash rush fees (~20 orders x $35 avg) | $700 |
| **Total monthly revenue** | **~$87,700** |

**AI costs as % of revenue: 0.2-0.4%.** Our internal cap is 15%. We are operating at less than 1/30th of the ceiling. AI costs are not a concern at this scale — and Anthropic's pricing continues to drop every quarter.

### Built-In Cost Controls

We already have three safeguards built into the platform to prevent AI costs from spiraling:

1. **Tier-based credit system:** Free users get limited Donny calls. Starter gets 50/month. Growth gets 200/month. Only Pro gets unlimited. This gates AI usage to paying customers.

2. **Model routing matrix:** Every AI request is automatically sent to the cheapest capable model. Campaign previews downgrade from Sonnet to Haiku when a user is in "conservation" mode (approaching their monthly limit).

3. **Hourly rate limiting:** No user can make more than a set number of Donny calls per hour, preventing abuse or runaway API costs from a single user.

---

## Section 5: The Upgrade Path — What to Spend and When

### Immediate (Before 75 Users)

| Change | What It Does | Monthly Cost | One-Time Effort |
|--------|-------------|-------------|----------------|
| Upgrade Supabase to SMALL compute | Doubles RAM (1 GB to 2 GB), increases connections (60 to 90), gives dedicated CPU | +$49/month | 2 clicks in the Supabase dashboard. No downtime. |
| **New total infrastructure cost** | | **$344/month** | |

### At 250 Users

| Expense | Monthly Cost | Notes |
|---------|-------------|-------|
| Supabase Pro + SMALL compute | $74 | $25 base + $49 compute |
| Lovable.dev hosting | $50 | No change needed |
| Claude AI (Max plan for development) | $200 | Covers all development work |
| Anthropic API (Donny AI production) | $200-$400 | Usage-based, scales with users |
| OpenAI (embeddings) | $20-$40 | Slight increase for more data |
| **TOTAL** | **$544-$764/month** | |

### At 500 Users (Next Milestone)

| Change | Monthly Cost |
|--------|-------------|
| Upgrade Supabase to MEDIUM compute (4 GB RAM, 120 connections) | +$99/month (replaces $49 SMALL) |
| Anthropic API increase | $400-$800/month |
| **Total infrastructure** | **$794-$1,189/month** |

### At 1,000 Users

| Change | Monthly Cost |
|--------|-------------|
| Upgrade Supabase to LARGE compute (8 GB RAM, 160 connections) | +$199/month |
| Anthropic API increase | $800-$1,600/month |
| Consider read replicas for analytics queries | +$0-$100/month |
| **Total infrastructure** | **$1,269-$2,089/month** |

### The Scaling Curve (Infrastructure Cost vs. Revenue)

| Users | Monthly Infra Cost | Monthly Revenue | Infra as % of Revenue |
|------:|------------------:|----------------:|----------------------:|
| 37 (today) | $295 | $0 | N/A |
| 100 | $400-$500 | $40,000 | 1.0-1.3% |
| 250 | $544-$764 | $87,700 | 0.6-0.9% |
| 500 | $794-$1,189 | $175,000 | 0.5-0.7% |
| 1,000 | $1,269-$2,089 | $350,000 | 0.4-0.6% |

**Infrastructure costs shrink as a percentage of revenue at every scale point.** This is the SaaS advantage — the platform gets cheaper to operate per customer as it grows.

---

## Section 6: Security and Performance Advisories

The Supabase platform continuously monitors our database for security vulnerabilities and performance issues. Here's the current status:

### Items Flagged (Non-Critical)

| Category | Issue | Risk Level | Action |
|----------|-------|-----------|--------|
| Storage | Two public storage buckets (profile-assets, promotion-videos) allow file listing | Low | Tighten SELECT policies to prevent directory browsing |
| Indexes | One unused index on analytics_events (5.4 MB) | Low | Monitor — may become useful as data grows |

No critical security or performance issues were found. All database tables have Row Level Security (RLS) enabled, which means users can only see their own data — even if someone tried to hack the API directly.

---

## Section 7: Action Items

| Priority | Action | Cost | When |
|----------|--------|------|------|
| **NOW** | Upgrade Supabase compute from MICRO to SMALL | +$49/mo | Before onboarding past 75 users |
| **MONITOR** | Track database connection count and RAM usage weekly | $0 | Ongoing |
| **AT 400 USERS** | Evaluate upgrade to MEDIUM compute | +$50/mo more | When connections regularly exceed 75 |
| **AT 500 USERS** | Consider read replicas for analytics queries | +$100/mo | When analytics_events table exceeds 1M rows |

### How to Upgrade (2-Minute Process)

1. Log into Supabase dashboard (supabase.com)
2. Select the DragonCandy_v3 project
3. Go to **Project Settings** > **Compute and Disk**
4. Select **Small** compute add-on
5. Confirm. The upgrade happens live — no downtime, no data loss, no code changes.

---

## Glossary for Non-Technical Readers

**Database connection:** A live communication channel between the app and the database. Like a phone call — each active user uses one or more connections while they're on the app.

**RAM (Memory):** The database's fast, short-term memory. More RAM = faster queries and more simultaneous users. When it runs out, everything slows down dramatically.

**Edge function:** A small program that runs on Supabase's servers whenever a user triggers a specific action (like asking Donny a question or processing a payment). We have 56 of these.

**Real-time connection (WebSocket):** A persistent, always-open connection between a user's browser and our server. Used for instant messaging — so new messages appear without refreshing the page.

**Compute tier:** The size of the virtual server running our database. MICRO is the smallest (like a studio apartment), SMALL has more room (like a 1-bedroom), and so on up to XLARGE.

**API call:** When our software sends a request to another company's service (like asking Anthropic's Claude AI to generate a campaign brief). Each call has a small cost.

**Model routing:** The system that automatically sends each AI request to the cheapest AI model capable of handling it. Simple tasks go to the fast, cheap model (Haiku). Complex tasks go to the smarter, more expensive model (Sonnet).

**Connection pooling (Supavisor):** A system that lets multiple users share a smaller number of database connections, like a call center routing calls through fewer phone lines. Reduces the total connections needed.

---

*Confidential — For Internal Use*

*Prepared by the DragonCandy Team — Updated May 2026*

*Data sourced from live Supabase project dashboard, Anthropic API pricing (May 2026), and production usage metrics from dragoncandy.io.*
