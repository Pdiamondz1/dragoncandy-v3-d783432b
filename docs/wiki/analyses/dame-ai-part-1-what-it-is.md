---
title: "Dame AI — Part 1: What It Is & The Six Domains"
type: analysis
created: 2026-06-27
updated: 2026-08-07
sources: [workspace]
tags: [dame, growth-agent, strategy]
---

# Dame AI — Part 1: What It Is & The Six Domains

> Split from the single "Dame AI: The Business Growth Agent System Spec" page on 2026-08-07:
> at ~30,200 chars it sat just under the wiki sync's 31,000-char skip cliff, so one edit would
> have silently dropped it from Donny's RAG entirely. Build-side content is in
> [[Dame AI — Part 2: Architecture, Cost & Build Plan]].
>
> Originally imported from a Google Workspace doc (id `10EIM7k8-itL4IQIXyZ0A4rhSMa0OD0pYLEgRMGC6VGc`) on 2026-06-27.


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
- Monitors dragoncandy.com contact form submissions and drafts personalized responses within 2 hours, presented to founders for review and send

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
- One article per week, Dame writes it, founders review and approve, publishes to dragoncandy.com/blog  
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

