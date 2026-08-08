---
title: "Dragon Rewards Engine — Part 1: The Points Economy & Earning"
type: analysis
created: 2026-06-27
updated: 2026-08-07
sources: [workspace]
tags: [dre, dragon-points, gamification, rewards]
---

# Dragon Rewards Engine — Part 1: The Points Economy & Earning

> Split from the single "Dragon Rewards Engine (DRE) Full System Spec" page on 2026-08-07:
> at ~30,500 chars it sat just under the wiki sync's 31,000-char skip cliff, so one edit would
> have silently dropped it from Donny's RAG entirely. Community, redemption and implementation
> are in [[Dragon Rewards Engine — Part 2: Community, Redemption & Implementation]].
>
> Originally imported from a Google Workspace doc (id `1FCd_G1JsfbRkjqd_X7s8WLruVzUwrrSW0bryIrfV528`) on 2026-06-27.


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

