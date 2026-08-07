---
title: "Dragon Rewards Engine — Part 2: Community, Redemption & Implementation"
type: analysis
created: 2026-06-27
updated: 2026-08-07
sources: [workspace]
tags: [dre, dragon-points, leaderboards, redemption, database, build-plan]
---

# Dragon Rewards Engine — Part 2: Community, Redemption & Implementation

> Split from the single "Dragon Rewards Engine (DRE) Full System Spec" page on 2026-08-07 —
> see [[Dragon Rewards Engine — Part 1: The Points Economy & Earning]] for the DP economy, the
> per-role trigger matrix, boosts, the welcome pack, the config engine and social sharing.
>
> Originally imported from a Google Workspace doc (id `1FCd_G1JsfbRkjqd_X7s8WLruVzUwrrSW0bryIrfV528`) on 2026-06-27.

## 9\. 🏆 Leaderboards & Community Mechanics

### Public Leaderboards (Opt-In)

Users opt into the leaderboard to appear. Visible to all users on the platform.

- **Top Creators This Month** — by DP earned, campaigns completed, earnings  
- **Top Restaurants This Month** — by campaigns run, boosts given, creator ratings  
- **Top Referrers** — by successful referrals (both roles)  
- **City Leaderboard** — per-metro rankings (drives local competitive energy)

### Donny-Powered Nudges (The Coaching Layer)

Donny coaches every user toward their next reward — proactively:

**For Creators:**

- "You're 2 DragonShare posts away from your On Fire badge 🔥 Post today\!"  
- "Your streak is at 5 days — tomorrow's post keeps your 1.5× multiplier alive"  
- "You're 150 DP away from Dragon Knight. Want me to find you a matching campaign right now?"  
- "A restaurant near you just boosted a creator post — want me to submit your content to them?"

**For Restaurants:**

- "You're 2 campaigns away from Dragon Partner badge — want me to launch one now?"  
- "A creator just posted about your cuisine type organically. Boost it for 300 DP \+ pay them automatically?"  
- "Your referral link has been clicked 12 times — 0 signups yet. Want me to draft a follow-up message?"  
- "You haven't launched a campaign in 14 days. Your Dragon streak is at risk. Launch takes 60 seconds — go?"

---

## 10\. 💰 DP Redemption — What Points Are Worth

| Redemption | Cost (DP) | Real Value | Who Can Redeem |
| :---- | :---- | :---- | :---- |
| $5 platform credit | 500 DP | $5 | All roles |
| $10 platform credit | 900 DP | $10 | All roles |
| $25 platform credit | 2,000 DP | $25 | All roles |
| Free Express delivery upgrade | 1,500 DP | $25 | Restaurants, Brands |
| Free DragonDash upgrade | 5,000 DP | $75 | Restaurants, Brands |
| 1 month Starter subscription | 10,000 DP | $149 | Restaurants, Brands |
| \+5% commission boost (30 days) | 2,000 DP | Variable | Creators |
| Featured in creator browse (7 days) | 3,000 DP | Marketing value | Creators |
| 500 Donny AI credits | 1,000 DP | $50–$125 | All roles |
| Dragon Merch Kit (Knight level) | 15,000 DP | $150 | Creators (Knight+) |
| Equipment grant ($500 value) | 50,000 DP | $500 | Creators (Master+) |

**Redemption is configurable** — admins can add, remove, or reprice any redemption option in the Config Panel.

---

## 11\. 🗄️ Database Architecture (Supabase)

Minimal new tables needed — wires into your existing event ledger:

\-- Core points ledger

dragon\_point\_events (

  id uuid PRIMARY KEY,

  user\_id uuid REFERENCES profiles,

  event\_type text,           \-- e.g. 'campaign\_completed', 'referral\_success'

  points\_awarded int,

  multiplier\_applied decimal, \-- 1.0 baseline, 2.0 during boost

  source\_id uuid,            \-- references campaign\_id, dragonshare\_post\_id, etc.

  created\_at timestamptz

)

\-- User point balances (materialized for performance)

dragon\_point\_balances (

  user\_id uuid PRIMARY KEY,

  total\_earned int,

  total\_redeemed int,

  balance int,               \-- total\_earned \- total\_redeemed

  tier text,                 \-- 'egg', 'scout', 'knight', 'master', 'legend'

  last\_activity\_at timestamptz,

  streak\_days int,

  streak\_last\_updated date

)

\-- Redemptions

dragon\_point\_redemptions (

  id uuid PRIMARY KEY,

  user\_id uuid REFERENCES profiles,

  redemption\_type text,

  points\_spent int,

  value\_delivered text,

  created\_at timestamptz

)

\-- DRE Configuration (admin-controlled, no code deploy needed)

dre\_config (

  id uuid PRIMARY KEY,

  config\_key text UNIQUE,    \-- e.g. 'referral\_creator\_multiplier'

  config\_value jsonb,        \-- flexible: numbers, booleans, schedules

  updated\_by uuid,

  updated\_at timestamptz

)

\-- Active boost events

dre\_boost\_events (

  id uuid PRIMARY KEY,

  boost\_name text,

  trigger\_category text,     \-- 'dragonshare', 'referral', 'campaign', 'share', etc.

  multiplier decimal,

  starts\_at timestamptz,

  ends\_at timestamptz,

  target\_segment text,       \-- 'all', 'creators', 'restaurants', 'new\_users', etc.

  is\_active boolean

)

\-- Share card tracking

dre\_share\_events (

  id uuid PRIMARY KEY,

  user\_id uuid,

  card\_type text,

  platform text,             \-- 'instagram', 'tiktok', 'x', 'copy\_link'

  utm\_code text,

  clicks int DEFAULT 0,

  conversions int DEFAULT 0,

  created\_at timestamptz

)

**Donny listens to existing event streams** (`dragonshare_events`, `payment_events`, `donny_actions`, `analytics_events`) and triggers DP awards via edge function — no new event infrastructure needed.

---

## 12\. 🔄 The Automatic Economy of Scale — How It Compounds

This is the flywheel you asked for. Every layer feeds the next:

LAYER 1 — ACTION

User does something valuable (posts content, completes campaign, refers someone)

LAYER 2 — REWARD

Donny awards DP instantly \+ notifies user with excitement

LAYER 3 — GAMIFICATION PULL

User sees they're X DP from next tier/reward → motivated to do more

LAYER 4 — SHAREABLE MOMENT

Milestone triggers auto-generated share card with UTM referral link

LAYER 5 — SOCIAL REACH

User shares to IG/TikTok/X → DragonCandy reaches their audience for free

LAYER 6 — NEW USER ACQUISITION

Friend clicks link → lands on platform → gets Welcome Pack → enters loop at Layer 1

LAYER 7 — DATA FLYWHEEL

Every action logged → Donny matching gets smarter → better outcomes →

more activity → more data → smarter Donny → repeat

LAYER 8 — REVENUE GROWTH

More activity \= more campaigns \= more GMV \= more take-rate revenue \=

more creator earnings \= more creator retention \= more restaurants joining

**At scale, this engine requires zero human intervention.** Donny coaches, nudges, rewards, and generates share cards automatically. Admins tune the dials. Users grow the platform.

---

## 13\. 📊 Metrics That Tell You It's Working

Track these weekly from Day 1:

**Growth Metrics:**

- % of new signups from referral links (target: 30%+ by Month 2\)  
- Share card generation rate (% of milestone earners who share)  
- Share card click-to-signup conversion rate (target: 15%+)  
- Viral coefficient: K \= (invites sent per user) × (conversion rate) — target K \> 1.0

**Engagement Metrics:**

- Daily Active Rate (target: 50%+ of creators weekly)  
- Average DP earned per user per week (by role)  
- Streak completion rate (% maintaining 7-day streaks)  
- Daily Boost participation rate (actions taken on boost days vs. non-boost days)

**Reward Economy Health:**

- DP issued vs. DP redeemed ratio (healthy: 60/40 — saving incentivizes future activity)  
- Redemption category distribution (tells you which rewards drive most behavior)  
- Tier progression rate (% of Dragon Eggs becoming Scouts within 30 days — target: 40%)

**Revenue Impact:**

- GMV uplift on Hype Week vs. baseline weeks  
- Campaign creation rate on Daily Boost days vs. non-boost days  
- Referral CAC vs. organic CAC (target: referral CAC \= $0 cash, vs. paid CAC $500–$1,500)

---

## 14\. 🚀 Build Phases

### Phase 1 — The Engine Core (Weeks 1–3)

- `dragon_point_events` \+ `dragon_point_balances` tables  
- Donny edge function listens to existing events → awards DP  
- DP balance displayed on creator and restaurant dashboards  
- Basic tier badge display on profiles

### Phase 2 — Badges \+ Tiers (Weeks 3–5)

- Full tier system with milestone verification  
- Badge display on public profiles  
- Donny nudge messages toward next reward

### Phase 3 — Daily Boosts \+ Hype Events (Weeks 5–7)

- `dre_boost_events` table \+ multiplier logic in DP award function  
- Daily Boost UI (banner on dashboard showing today's boost)  
- Admin panel: activate/deactivate boosts, set multipliers

### Phase 4 — Social Sharing Engine (Weeks 7–9)

- Share card auto-generation (Donny writes copy, platform generates image)  
- UTM link system \+ `dre_share_events` tracking  
- Share sheet integration (iOS native \+ web)

### Phase 5 — Redemption \+ Leaderboards (Weeks 9–12)

- `dragon_point_redemptions` table \+ redemption UI  
- Public leaderboards (opt-in)  
- Monthly Dragon League event system

### Phase 6 — Full Config Panel (Weeks 12–16)

- `dre_config` table \+ admin UI  
- Pre-built scenario templates  
- Budget cap controls \+ real-time monitoring dashboard

---

## 15\. Summary: What This Builds

The Dragon Rewards Engine is not a feature. It is **the growth infrastructure** of DragonCandy — the system that turns a marketplace into a community, turns users into evangelists, and turns every transaction into a marketing event.

**It gives you:**

- ✅ Automatic user acquisition through social sharing (target: K \> 1.0 viral coefficient)  
- ✅ Automatic retention through streaks, tiers, and Donny nudges  
- ✅ Configurable reward economics tunable in real-time — no code deploys  
- ✅ Daily urgency through rotating boosts and Hype Events  
- ✅ A fun, game-like experience that keeps creators and restaurants checking the app daily  
- ✅ Free marketing at scale through every earned share card  
- ✅ Data flywheel fuel — every gamified action logs to the event ledger Donny trains on  
- ✅ A self-sustaining growth loop requiring zero human intervention after configuration

**The automatic economy of scale you described is this:** when K \> 1.0, the platform grows itself. The DRE is engineered to get you there and keep you there.

---

*Dragon Rewards Engine Full System Spec — DragonCandy Internal* *Prepared by Donny, DragonCandy AIOS — June 2026* *For founder review and engineering handoff*
