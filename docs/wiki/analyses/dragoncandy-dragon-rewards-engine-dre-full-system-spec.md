---
title: DragonCandy — Dragon Rewards Engine (DRE) Full System Spec
type: analysis
created: 2026-06-27
updated: 2026-06-27
sources: [workspace]
tags: []
---

# DragonCandy — Dragon Rewards Engine (DRE) Full System Spec

> Imported from a Google Workspace doc (id `1FCd_G1JsfbRkjqd_X7s8WLruVzUwrrSW0bryIrfV528`) on 2026-06-27.

# 🐉 DragonCandy — Dragon Rewards Engine (DRE)

## Full System Spec: Configurable Growth, Gamification & Automatic Economy of Scale

*Internal Strategy Document — Prepared by Donny (DragonCandy AIOS) — June 2026* *Grounded in projected real activity targets from GTM, KPI Scorecard, and Pricing docs — not test data*

---

## 1\. What This Is & Why It Matters

The Dragon Rewards Engine (DRE) is a **fully configurable, platform-wide gamification and growth system** that turns every user action into a compounding growth event. It is not a loyalty program. It is an **automatic economy of scale** — a self-running machine that rewards activity, generates free marketing, drives referrals, and feeds Donny's data flywheel simultaneously.

**The core equation:**

Action → Dragon Points (DP) → Reward → Shareable Moment → New User → Repeat

Every reward either reduces friction, unlocks revenue, or creates a shareable moment that brings in the next user. The system is designed to grow the platform **without human intervention** after initial configuration.

**Why now:** Your GTM targets 50 active creators and 10 paying businesses by Day 90, with 15 creator signups/week and 3 business signups/week. The DRE is the engine that makes those numbers self-sustaining — not dependent on outreach alone.

---

## 2\. Real Activity Baseline (Projected, Not Test Data)

All reward thresholds and point values are calibrated against these projected real-user targets from internal strategy docs:

**Creator targets (GTM doc, North Star KPI Scorecard):**

- Target: 15 creator signups/week during first 90 days  
- Target: 50 active creators by Day 90; 200+ by Month 6  
- Creator retention target: 70%+ complete 2+ gigs after first  
- Creator weekly active rate target: 50%+ check app weekly  
- Average creator earnings target: $400+/month for active creators  
- Average campaign value: $200  
- Creator time to first gig acceptance: within 72 hours

**Restaurant / Business targets:**

- Target: 3 business signups/week during first 90 days  
- Target: 10 paying businesses by Day 90; 100+ by Month 6 (launch city)  
- Business retention target: 60%+ create 2+ campaigns within 60 days  
- Business time to first campaign: within 24 hours of onboarding  
- Campaign completion rate target: 80%+  
- GMV target: $10K/month by Month 3; path to $200K/month at 5% market capture

**Platform-wide targets (Y1 ARR: $300K–$600K; Y2: $2–$4.5M):**

- 10 completed campaigns/week by Day 90  
- Average ARPU: $350–$500/month (blended)  
- CAC target: $0 organic (referral \+ sharing \= the growth engine)  
- 30% of new creator signups from referrals by Month 2

---

## 3\. The Dragon Points (DP) Economy

### 3.1 Currency Design Rules

- **1 Dragon Point \= $0.01 in platform value** (redeemable against fees, upgrades, and credits)  
- Points are **non-transferable** between accounts (prevents gaming)  
- Points **expire after 12 months** of inactivity (drives re-engagement)  
- Points are **awarded in real-time** by Donny — the notification IS the reward moment  
- The **earn rate is configurable** by admin at any time (see Section 7: Configuration Engine)  
- **Bonus multiplier events** can be activated instantly (Daily Boosts, Hype Weeks)

### 3.2 Dragon Tier Thresholds

| Tier | DP Required | Color | Badge |
| :---- | :---- | :---- | :---- |
| Dragon Egg 🥚 | 0–499 | Grey | New member |
| Dragon Scout 🐉 | 500–2,499 | Green | 3 campaigns completed |
| Dragon Knight ⚔️ | 2,500–9,999 | Blue | 10+ campaigns, 4.5+ rating |
| Dragon Master 🏆 | 10,000–49,999 | Gold | 50+ campaigns, active ambassador |
| Dragon Legend 🌟 | 50,000+ | Red/Platinum | City Captain, elite tier |

*Tiers are based on DP accumulated AND verified activity milestones — points alone don't unlock a tier. Both conditions must be met.*

---

## 4\. Reward Trigger Matrix — By Role

### 4A. CREATOR Triggers

#### 🟢 Onboarding & First-Time Actions

| Trigger | Dragon Points | Bonus Reward | Shareable? |
| :---- | :---- | :---- | :---- |
| Complete creator profile (100%) | 250 DP | Donny AI coaching session unlocked | ✅ "I joined DragonCandy" card |
| Connect first social account | 150 DP | "Dragon Connected" badge | ✅ Badge share |
| Submit first DragonShare post | 300 DP | Priority queue for next 48hrs | ✅ "First Drop" badge |
| Apply to first campaign | 200 DP | — | — |
| **Complete first campaign** | **1,000 DP** | **Dragon Scout tier unlocked \+ $10 platform credit** | ✅ **"First Gig Done" earnings card** |
| Get first DragonShare boost | 400 DP | Featured in restaurant browse for 7 days | ✅ Boost celebration card |

#### 🔵 Content & Activity Triggers

| Trigger | Dragon Points | Bonus Reward | Shareable? |
| :---- | :---- | :---- | :---- |
| Submit any DragonShare post | 75 DP | — | — |
| Campaign delivered on time | 150 DP | Rating boost signal to Donny matching | — |
| Campaign approved first submission | 300 DP | — | — |
| Receive 5-star rating | 250 DP | — | — |
| **Post 5 pieces of content in 7 days** | **750 DP bonus** | **"On Fire" badge for 7 days** | ✅ Streak card |
| Post 10 pieces in 30 days | 1,500 DP | Dragon Knight milestone progress \+500 DP | ✅ Monthly milestone card |
| Post 20 pieces in 30 days | 3,000 DP | Permanent \+2% commission rate for 90 days | ✅ Power Creator card |
| Maintain 7-day content streak | 500 DP | Streak multiplier 1.5× for next 48hrs | ✅ Streak card |
| Maintain 30-day active streak | 2,000 DP | Dragon Knight unlock eligibility | ✅ Legend streak card |
| Share DragonCandy-tagged content to any channel | 200 DP/share | — | ✅ Auto-generated |

#### 🟡 Referral Triggers

| Trigger | Dragon Points | Cash Bonus | Shareable? |
| :---- | :---- | :---- | :---- |
| Refer a creator (joins platform) | 300 DP | — | — |
| **Refer a creator (completes first gig)** | **750 DP** | **$25 cash** | ✅ "I brought someone in" card |
| Refer a restaurant (signs up) | 500 DP | — | — |
| **Refer a restaurant (completes first campaign)** | **1,250 DP** | **$50 cash** | ✅ Restaurant referral card |
| Refer a brand (activates account) | 1,500 DP | $100 cash | — |

#### 🔴 Milestone Triggers

| Trigger | Dragon Points | Bonus Reward | Shareable? |
| :---- | :---- | :---- | :---- |
| Complete 3 campaigns | 1,000 DP | Dragon Scout confirmed \+ profile badge | ✅ Scout badge card |
| Complete 10 campaigns (4.5+ rating) | 3,000 DP | Dragon Knight \+ merch kit eligible | ✅ Knight badge card |
| Complete 25 campaigns | 5,000 DP | \+5% permanent commission boost | ✅ Milestone card |
| Complete 50 campaigns (4.8+ rating) | 10,000 DP | Dragon Master \+ City Captain eligible | ✅ Master badge card |
| Earn $1,000 total on platform | 2,000 DP | "Dragon Earner" badge | ✅ Earnings milestone card |
| Earn $5,000 total on platform | 5,000 DP | Featured creator spotlight (DC social channels) | ✅ Spotlight card |
| Earn $10,000 total on platform | 10,000 DP | Dragon Legend eligible \+ $500 equipment grant | ✅ Legend card |

---

### 4B. RESTAURANT / BUSINESS Triggers

#### 🟢 Onboarding & First-Time Actions

| Trigger | Dragon Points | Bonus Reward | Shareable? |
| :---- | :---- | :---- | :---- |
| Complete business profile | 200 DP | Free Donny AI brief generation (3 uses) | — |
| Connect first social account | 200 DP | "Dragon Den" badge | ✅ "We're on DragonCandy" card |
| Create first campaign | 500 DP | Free Express delivery upgrade ($25 value) | — |
| **Complete first campaign** | **1,000 DP** | **"Dragon Restaurant" badge \+ 1 free DragonDash** | ✅ **"First campaign done" card** |
| First DragonShare boost | 350 DP | Creator featured on restaurant profile | ✅ Boost celebration card |

#### 🔵 Campaign & Activity Triggers

| Trigger | Dragon Points | Bonus Reward | Shareable? |
| :---- | :---- | :---- | :---- |
| Launch a campaign | 150 DP | — | — |
| Rate a creator (any rating) | 100 DP | — | — |
| Give a 5-star rating | 200 DP | Creator gets bonus DP (goodwill mechanic) | — |
| Boost a DragonShare post | 300 DP | — | — |
| Complete 5 campaigns | 1,500 DP | "Dragon Kitchen" badge \+ featured in creator browse | ✅ Milestone card |
| **Complete 10 campaigns** | **3,000 DP** | **"Dragon Partner" badge \+ 1 month subscription credit** | ✅ **10-campaign card** |
| Complete 25 campaigns | 5,000 DP | Permanent 1% take rate reduction | ✅ Partner card |
| Complete 50 campaigns | 10,000 DP | Dragon Master Restaurant \+ custom creator pool | ✅ Elite card |
| Upgrade subscription tier | 500 DP | — | — |
| Run campaigns in 3 consecutive months | 1,000 DP | Loyalty badge | — |
| Post testimonial / case study | 750 DP | Featured in DragonCandy marketing content | ✅ Story card |

#### 🟡 Referral Triggers

| Trigger | Dragon Points | Cash Bonus / Credit | Shareable? |
| :---- | :---- | :---- | :---- |
| Refer a restaurant (signs up) | 500 DP | — | — |
| **Refer a restaurant (completes first campaign)** | **1,250 DP** | **$200 platform credit** | ✅ "I brought them in" card |
| Refer 3 restaurants (all complete campaigns) | 4,000 DP | 1 free DragonDash delivery | ✅ Triple referral card |
| Refer a brand (activates) | 2,000 DP | $300 platform credit | — |

---

### 4C. BRAND / SPONSOR Triggers

| Trigger | Dragon Points | Bonus Reward | Shareable? |
| :---- | :---- | :---- | :---- |
| Complete brand profile | 300 DP | Donny AI brief package (5 uses free) | — |
| Launch first sponsored campaign | 1,000 DP | "Dragon Brand" status | ✅ Brand launch card |
| Sponsor 3 campaigns in 30 days | 2,500 DP | Premium creator browse placement | — |
| Sponsor 10 campaigns | 5,000 DP | Dragon Brand Partner badge | ✅ Partner card |
| Refer a restaurant | 750 DP | — | — |
| Refer another brand (activates) | 2,000 DP | $500 platform credit | — |

---

## 5\. 🔥 Daily Boosts & Hype Events (The Fun Part)

This is the mechanic that makes the platform feel alive. **Donny activates these — fully automated, configurable.**

### 5A. Daily Dragon Boost

Every day, one rotating reward category gets a **2× or 3× multiplier** for 24 hours:

| Day Example | Boost Active | Multiplier | Donny Announcement |
| :---- | :---- | :---- | :---- |
| Monday | DragonShare submissions | 2× DP | "🔥 MONDAY BOOST: Double points on all DragonShare posts today\!" |
| Tuesday | Campaign completions | 3× DP | "🐉 TRIPLE TUESDAY: 3× points if you complete a campaign today\!" |
| Wednesday | Referrals | 2× DP | "💸 REFERRAL WEDNESDAY: Double points on every referral link clicked\!" |
| Thursday | Content streaks | 2× DP | "⚡ STREAK THURSDAY: Keep your streak alive for double points\!" |
| Friday | New signups (welcome boost) | 2× DP | "🎉 WELCOME FRIDAY: New members get double points on everything this week\!" |
| Saturday | Social shares | 3× DP | "📱 SHARE SATURDAY: Triple points for every DragonCandy share to social\!" |
| Sunday | Restaurant boosts | 2× DP | "🚀 BOOST SUNDAY: Restaurants get double DP for every creator boost today\!" |

**Configuration:** Admins can override the daily boost from the DRE Config Panel at any time. Schedule weeks in advance or activate spontaneously.

### 5B. Hype Week Events

**Scheduled 1–2× per month** — platform-wide events with elevated rewards:

**🐉 Dragon Drop Week**

- Duration: 7 days  
- All point values: 1.5×  
- Special limited badge: "Dragon Drop \[Month\] Participant"  
- Donny countdown timer on dashboard: "Dragon Drop ends in 2d 14h"  
- Push notifications \+ email \+ in-app banner

**⚡ Speed Week (DragonDash Hype)**

- Duration: 3 days  
- All Express and DragonDash deliveries: 3× DP  
- Rush surcharge waived for Dragon Knight and above  
- Unlocks "Speed Demon" badge for creators who complete 3 rush deliveries

**💰 Referral Blitz**

- Duration: 48 hours  
- All referral DP values: 3×  
- Cash bonus increased by 50%  
- Leaderboard showing top referrers in real-time  
- Winner: 10,000 DP \+ featured creator/restaurant spotlight

**🏆 Monthly Dragon League**

- Month-long competition  
- Separate leaderboards: Creators, Restaurants, Brands  
- Top 3 in each category win: DP prize pool \+ featured placement \+ merch  
- Public leaderboard drives FOMO and competitive sharing

**🆓 Free Week (Acquisition Event)**

- Targeted at new signups only  
- First 7 days: 3× all points, free DragonDash upgrade on first campaign  
- Donny personalizes the welcome sequence for each new user  
- Converts trial users to habitual users before the week ends

### 5C. Surprise Drop Mechanic

**Donny randomly activates "Dragon Drops" — unannounced 2-hour reward bursts:**

- "🐉 SURPRISE\! The next 2 hours: triple points on DragonShare posts. GO\!"  
- Creates urgency, drives app opens, generates social posts about the surprise  
- Activated 2–3× per week during growth phases  
- Can be admin-triggered for special moments (launch day, milestone celebrations)

---

## 6\. 🎁 First-Time on the App — Dragon Welcome Pack

Every new user gets this on signup. **This must create a shareable moment.**

### Creators — Dragon Creator Welcome Pack

- 🎯 **500 DP immediately** on signup completion  
- 🆓 **3 free Donny AI brief consultations** (normally credit-gated)  
- 🚀 **Priority matching queue** for first 72 hours (Donny surfaces you to restaurants)  
- 🏅 **"Dragon Egg" badge** — shareable card generated instantly  
- 📱 **Donny welcome message** — personalized, explains next 3 actions to earn first 1,000 DP  
- 🎯 **"Your first gig is waiting" CTA** — Donny surfaces the best-matched campaign immediately

### Restaurants — Dragon Business Welcome Pack

- 🎯 **500 DP immediately** on profile completion  
- 🆓 **First campaign: free Express delivery upgrade** ($25 value, no code needed — automatic)  
- 🆓 **3 free Donny AI brief generations** (normally credit-gated on Free tier)  
- 🏅 **"Dragon Den" badge** — shareable "We're on DragonCandy" social card  
- 📱 **Donny welcome message** — "Your first creator match is ready. Here's your brief."  
- ⏱️ **72-hour countdown** — Donny nudges if no campaign created: "Your 3 free briefs expire in 24hrs"

### Brands — Dragon Brand Welcome Pack

- 🎯 **750 DP** on profile completion  
- 🆓 **5 free Donny AI sponsored brief packages**  
- 🏅 **"Dragon Brand" preview badge**  
- 📱 **Donny welcome** — shows creator pool size in their target markets

---

## 7\. 🔧 The Configuration Engine — Admin Control Panel

**This is the key differentiator: every element of the DRE is configurable without a code deployment.**

### 7A. What Admins Can Configure (in real-time)

**Point Values**

- Adjust any trigger's DP value (e.g., raise referral DP from 750 to 1,500 during a growth push)  
- Set global multipliers (1.0× \= baseline, 2.0× \= double event, 0.5× \= point budget constraint)  
- Configure per-role multipliers independently (boost creators only, or restaurants only)

**Boost Engine**

- Schedule Daily Boost calendar (which category gets boosted on which day)  
- Activate/deactivate any boost in real-time  
- Set boost duration (2 hours, 24 hours, 7 days)  
- Set boost multiplier (2×, 3×, 5×, custom)  
- Activate Surprise Drops with one click

**Hype Events**

- Schedule Hype Weeks in advance (calendar view)  
- Configure per-event rules: which triggers are boosted, multiplier, duration, eligible user segments  
- Set event-specific badges and rewards  
- Target events by user segment: new users only, Dragon Scout+, specific metros

**Reward Redemption Rules**

- Configure what DP can be redeemed for (subscription discounts, DragonDash credits, cash equivalents)  
- Set redemption minimums (e.g., minimum 500 DP to redeem)  
- Enable/disable specific redemption categories  
- Set expiry rules (currently: 12 months inactivity)

**Tier Thresholds**

- Adjust DP thresholds for each tier  
- Add or modify tier-specific perks  
- Enable/disable specific tiers

**Budget Controls**

- Set monthly DP issuance cap (total DP that can be earned platform-wide per month)  
- Set per-user daily DP earning cap (prevents farming)  
- Set cash bonus budget cap per month (auto-pauses cash bonuses when budget hit)

**Notification & Messaging**

- Configure which events trigger push notifications  
- Set Donny's nudge timing (e.g., nudge after 3 days of inactivity vs. 7 days)  
- A/B test Donny's reward announcement copy

### 7B. Configurable Scenarios (Pre-Built Templates)

The admin panel includes pre-built configuration templates that can be activated in one click:

| Scenario Template | What It Does | When to Use |
| :---- | :---- | :---- |
| **Growth Sprint** | 2× all referral DP, 1.5× content DP, free DragonDash week | New market launch, slow month |
| **Creator Acquisition** | 3× creator referral DP, boost daily \= creator-focused all week | Creator supply shortage |
| **Restaurant Push** | 3× restaurant referral DP, free Express upgrade for referrals | Demand shortage |
| **Retention Mode** | 2× streak bonuses, loyalty DP for monthly active users | Post-launch churn risk |
| **Viral Event** | 3× share DP, social card featured on DC channels | Product launch, press moment |
| **Holiday Hype** | Full multiplier event with branded holiday badge | Thanksgiving, New Year, Valentine's |
| **Steady State** | All values at 1.0× baseline | Normal operations |

---

## 8\. 📱 The Social Sharing Engine — Free Marketing at Scale

**Every major reward triggers an auto-generated shareable card.** Donny writes the copy. The platform generates the image. The user shares it. DragonCandy grows.

### How It Works

1. User earns a milestone reward  
2. Donny generates a personalized share card instantly (in-app, mobile-native)  
3. Card includes: user's name/handle, achievement, DragonCandy branding, \#DragonDashed tag, unique UTM referral link  
4. User taps "Share" → posts to IG, TikTok, X, LinkedIn, or copies link  
5. Every click on that link: tracked, attributed to that user's referral, earns them DP  
6. Every new signup from that link: cash referral bonus triggered automatically

### Card Templates (Donny auto-generates copy for each)

**For Creators:**

- "First Gig Done" — "I just got paid $\[amount\] for my first video on DragonCandy 🐉 \#DragonDashed"  
- "Streak Card" — "Day \[X\] on DragonCandy. \[X\] gigs done. $\[amount\] earned. The dragon doesn't stop. 🔥"  
- "Earnings Milestone" — "I just hit $\[1K/5K/10K\] earned on DragonCandy. If you shoot food content, you need to be on this. \[link\] 🐉"  
- "Badge Unlocked" — "Dragon Knight status unlocked 🐉⚔️ 10 campaigns. Zero cold pitching. All DragonCandy."  
- "Referral Win" — "My friend just completed their first DragonCandy gig. We both got paid. Join us 👇 \[link\]"

**For Restaurants:**

- "We're Live" — "We just launched our first creator campaign on DragonCandy 🐉 Real content, real creators, real fast. \#DragonDashed"  
- "Campaign Milestone" — "10 campaigns on DragonCandy. Our Instagram hasn't looked better. If you run a restaurant, you need to see this. \[link\]"  
- "Boost Card" — "We just boosted an amazing creator who posted about us organically. If you're a food creator in \[city\], come shoot with us on DragonCandy."

### UTM Architecture

Every shared card link includes:

- `utm_source=dragoncandy_share`  
- `utm_medium=user_share_card`  
- `utm_campaign=[card_type]`  
- `utm_content=[user_id]` (for referral attribution)  
- Pre-attached referral code → automatic bonus on first qualifying action

---

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
