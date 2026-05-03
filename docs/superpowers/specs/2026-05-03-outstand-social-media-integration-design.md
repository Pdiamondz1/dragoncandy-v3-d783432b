# DragonCandy x Outstand.so: Social Media Integration Strategy & Design

**Date:** May 3, 2026
**Audience:** Lead Developer, Engineering Team, Business Stakeholders
**Status:** Approved Design — Ready for Implementation Planning

---

## Executive Summary

DragonCandy connects restaurants, creators, and brands for content delivery — but today, the social media posting that makes that content valuable happens entirely outside the platform. This integration closes the loop: content gets created, approved, AND published within DragonCandy, with Donny AI reducing friction to near-zero.

**Integration Partner:** Outstand.so — a unified, developer-first social media API supporting 10 platforms through a single REST API. White-label ready, usage-based pricing ($0.01/post after 1,000 included), and a 25-tool MCP server purpose-built for AI agent workflows.

### Core Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature Scope | Full suite (posting, scheduling, analytics, engagement) | Complete vision for dev team, even if phased |
| Account Model | Each role connects own accounts | Simplest foundation; delegated access designed for future |
| Interaction Model | Donny-first, manual UI as fallback | Aligns with "less typing" philosophy; Outstand MCP enables this |
| Rollout Strategy | Role-first (Restaurant → Creator → Brand → Cross-role) | Restaurants get value first; each phase builds on the last |
| Campaign Tie-in | Deep integration | Social hooks at every campaign lifecycle stage |

### Platform Priorities by Role

| Role | Primary Platforms | Secondary |
|------|-------------------|-----------|
| Restaurant | Instagram, TikTok, Google Business Profile, Facebook | YouTube, Threads |
| Creator | Instagram, TikTok, YouTube, X | Threads, LinkedIn |
| Brand | Instagram, TikTok, LinkedIn, YouTube | Facebook, X |

---

## 1. Restaurant Role: Social Media Strategy

### Value Proposition

> "Run your restaurant's entire social media presence without leaving DragonCandy — or just tell Donny what to post."

### Core Workflow: Daily Social Management

```
Step 1: CONNECT ACCOUNTS (one-time setup)
  └─ OAuth flow → Instagram, TikTok, Google Business, Facebook

Step 2: CONTENT SOURCES (3 input channels)
  ├─ Own photos/videos (uploaded by restaurant staff)
  ├─ Creator deliverables (from approved campaign content)
  └─ Donny-generated (AI creates posts from menu, events, trends)

Step 3: DONNY CREATES & SCHEDULES
  └─ "Donny, post today's lunch special to Instagram and Google Business"
     → Donny writes caption, selects hashtags, picks optimal time,
       schedules across platforms

Step 4: REVIEW & APPROVE (optional)
  └─ Content calendar shows scheduled posts → owner previews →
     approves or edits → publishes

Step 5: ENGAGE & MONITOR
  └─ Donny alerts on comments/mentions → suggests replies →
     restaurant approves or auto-responds

Step 6: TRACK PERFORMANCE
  └─ Unified analytics dashboard → engagement rates, reach,
     follower growth → feeds into ROI Dashboard
```

### Campaign-Integrated Workflow

When a creator's deliverable is approved within a campaign:

```
Creator submits deliverable → Restaurant approves content
                                       │
                                       ▼
                    ┌──────────────────────────────────┐
                    │  Donny prompts: "This reel is    │
                    │  approved! Want me to post it to  ��
                    │  your Instagram and TikTok? I'll  │
                    │  credit @creator and use your     │
                    │  brand hashtags."                  │
                    └──────────────────────────────────┘
                                       │
                         ┌─────────┬───┴────┬─────────���┐
                         ▼         ▼        ▼          ▼
                    Post now   Schedule   Edit first   Skip
```

### Key Restaurant Features

| Feature | Description |
|---------|-------------|
| **Content Calendar** | Visual weekly/monthly view of scheduled posts across all platforms. Drag-and-drop rescheduling. |
| **Social Analytics** | Engagement, reach, follower growth, best posting times. Feeds directly into existing ROI Dashboard. |
| **Engagement Hub** | Unified inbox for comments and mentions across platforms. Donny suggests replies, restaurant approves. |
| **UGC Reposting** | When creators tag the restaurant, Donny detects it and offers to reshare to the restaurant's accounts. |
| **Google Business Sync** | Auto-post updates, photos, and specials to Google Business Profile — critical for local search visibility. |
| **Donny Auto-Pilot** | Optional: Donny generates and schedules a weekly content plan based on menu, events, and trending topics. |

---

## 2. Creator Role: Social Media Strategy

### Value Proposition

> "Every deliverable you create on DragonCandy becomes content for your own channels too — Donny handles the cross-posting so you can focus on creating."

### Core Workflow: Campaign Content to Personal Brand Growth

```
Step 1: CONNECT ACCOUNTS (one-time setup)
  └�� OAuth flow → Instagram, TikTok, YouTube, X

Step 2: CREATE CAMPAIGN CONTENT (existing DragonCandy flow)
  └─ Creator produces deliverables for restaurant/brand campaigns →
     uploads to DragonCandy → gets approved

Step 3: DONNY CROSS-POST PROMPT (the magic moment)
  └─ "Your reel for Sakura Sushi just got approved! Want me to
     post a version to your Instagram and TikTok? I'll adjust
     the caption for your audience and add your portfolio hashtags."
     ├─ Cross-post now
     ├─ Schedule for later
     ├─ Customize caption/hashtags
     └─ Skip

Step 4: STANDALONE CONTENT CREATION (beyond campaigns)
  └─ Creators post their own original content — behind-the-scenes,
     day-in-my-life, portfolio highlights. Donny helps write
     captions and schedule.

Step 5: BUILD SOCIAL PROOF
  └─ Analytics from connected accounts automatically enhance the
     creator's DragonCandy profile — follower counts, engagement
     rates, top posts become portfolio proof points.

Step 6: WIN MORE CAMPAIGNS
  └─ Verified social metrics make the creator more competitive →
     restaurants/brands see real engagement data → more invitations
     and higher rates.
```

### The Creator Flywheel

Every campaign deliverable feeds a growth loop:

```
        ┌──��───────────────────────────────┐
        │  Create content via DC campaigns │
        └──────────────┬───────────────────┘
                       │
                       ▼
        ┌──────��─────────────��─────────────┐
        │  Cross-post to own socials       │
        │  (via Donny + Outstand)          │
        └──────────────┬───────────────────┘
                       │
                       ▼
        ┌────────────────���─────────────────┐
        │  Grow audience & metrics         │
        │  (engagement, followers, reach)  │
        └──────────────┬────────────────��──���
                       │
                       ▼
        ┌──────────���─────────────────────���─┐
        │  Stronger DC profile             │
        │  (verified metrics = social      │
        │   proof for restaurants/brands)  │
        └──────────────┬──────────────���────┘
                       │
                       ▼
              More campaigns & higher rates
                       │
                       └──────── loops back to top
```

### Key Creator Features

| Feature | Description |
|---------|-------------|
| **Auto Cross-Post** | When campaign content is approved, Donny offers to post a creator-branded version to their own channels with one tap. |
| **Portfolio Analytics** | Real engagement data from connected accounts feeds into the creator's DragonCandy profile — verified, not self-reported. |
| **Content Calendar** | Schedule posts across personal channels. Campaign deadlines and social posts in one unified calendar view. |
| **Donny Caption Writer** | Donny rewrites campaign captions for the creator's personal voice — different tone, hashtags, and CTA for their audience vs. the restaurant's. |
| **Growth Insights** | Donny analyzes which campaign content performed best on creator's socials and recommends what types of campaigns to apply for next. |
| **Verified Creator Badge** | Creators with connected and active social accounts get a "Verified" badge on their profile — builds trust with restaurants and brands. |

---

## 3. Brand Role: Social Media Strategy

### Value Proposition

> "Sponsor a campaign and watch it go live across the restaurant's, creator's, AND your own channels — with real-time performance data flowing back to your dashboard."

### Core Workflow: Sponsorship to Amplification to Measurement

```
Step 1: CONNECT ACCOUNTS (one-time setup)
  └─ OAuth flow → Instagram, TikTok, LinkedIn, YouTube

Step 2: SPONSOR A CAMPAIGN (existing DragonCandy flow)
  └─ Brand discovers and sponsors a restaurant campaign →
     sets budget, terms, content requirements

Step 3: CONTENT GETS CREATED & APPROVED
  └─ Creator produces deliverables → restaurant approves →
     brand reviews sponsored content for brand guidelines compliance

Step 4: DONNY AMPLIFICATION PROMPT
  └─ "The sponsored reel for Sakura Sushi x Coca-Cola is live on
     the restaurant's Instagram! Want me to amplify it?"
     ├─ Repost to brand's Instagram & LinkedIn with sponsor copy
     ├─ Create a "behind the sponsorship" story for brand's TikTok
     └─ Start tracking engagement across all 3 parties' posts

Step 5: MULTI-CHANNEL PERFORMANCE TRACKING
  └─ Unified view: how did the sponsored content perform across
     the restaurant's accounts, the creator's accounts, AND the
     brand's own accounts?

Step 6: SPONSORSHIP ROI REPORT
  └─ Donny generates a per-sponsorship ROI report: total reach,
     engagement, cost-per-impression, and recommendation for
     next sponsorship.
```

### The Brand Multiplier Effect

One sponsored campaign produces content across three audiences:

```
                 ┌─────────────────────────┐
                 │  1 Sponsored Campaign    │
                 └────────┬────────────────┘
              ┌───────────┼──���────────────┐
              ▼           ▼               ▼
     ┌────────────┐ ┌──────────┐  ┌────────────┐
     │ Restaurant │ │ Creator  │  │   Brand    │
     │            │ │          │  │            │
     │ Posts to   │ │ Cross-   │  │ Amplifies  │
     │ IG, TikTok │ │ posts to │  │ on IG,     │
     │ GBP, FB    │ │ IG, TT,  │  │ TikTok,    │
     │            │ │ YT, X    │  │ LinkedIn,  │
     │ 15K local  │ │ 50K      │  │ YouTube    │
     │ followers  │ │ engaged  │  │ 200K brand │
     │            │ │ followers│  │ followers  │
     └─────┬──────┘ └────┬─────┘  └─────┬──────┘
           └──────────────┼────────���─────┘
                          ▼
              265K+ combined reach
              All tracked in one dashboard
```

### Key Brand Features

| Feature | Description |
|---------|-------------|
| **Sponsorship Amplification** | One-tap repost of sponsored campaign content to the brand's own channels with Donny-written sponsor copy. |
| **Cross-Party Analytics** | See how sponsored content performed across ALL parties — restaurant, creator, AND brand accounts. Total reach, impressions, engagement. |
| **Creator Vetting by Metrics** | Browse creators with verified, real-time social metrics. Filter by engagement rate, audience size, platform strength, content niche. |
| **Donny Sponsorship Intelligence** | "Which campaigns should I sponsor next?" — Donny recommends based on past sponsorship ROI, trending content categories, and audience overlap. |
| **Brand Guidelines Enforcement** | Set brand voice, required hashtags, mandatory disclosures (#ad, #sponsored). Donny auto-applies when amplifying content. |
| **Sponsorship ROI Reports** | Donny generates per-sponsorship reports: cost-per-impression, engagement rate, audience demographics, and "sponsor again?" recommendation. |

---

## 4. Donny AI: The Social Media Brain

### Architecture

```
User ──→ Donny AI ──→ Outstand MCP (25 tools) ──→ 10 Social Platforms
 │         │              │
 │    Interprets     Handles OAuth,
 │    intent,        rate limits,
 │    writes copy,   media formatting,
 │    picks time     platform rules
 │
 ���─ "Post my special to Instagram"
    (natural language, zero UI navigation)
```

### Donny Capabilities via Outstand MCP

| Category | What Donny Can Do |
|----------|-------------------|
| **Create** | Write captions, select hashtags, format per platform requirements |
| **Schedule** | Pick optimal posting times based on analytics, queue content |
| **Publish** | Post to multiple platforms simultaneously in one action |
| **Analyze** | Pull engagement stats, track follower growth, identify trends |
| **Engage** | Read comments, draft replies, detect mentions and tags |
| **Manage** | Upload media, list connected accounts, manage connections |

### Example Commands by Role

**Restaurant:**
- "Donny, post our new salmon roll photo to Instagram and Google Business with today's lunch special pricing"
- "Donny, schedule a week of posts using the content from our last 3 campaigns"
- "Donny, what's our best performing post this month?"
- "Donny, reply to the Google reviews from this week — thank positive ones, address concerns professionally"

**Creator:**
- "Donny, cross-post that approved reel to my TikTok and Instagram — use my voice, not the restaurant's"
- "Donny, what kind of campaign content gets me the most engagement on my channels?"
- "Donny, schedule my behind-the-scenes from the shoot for Thursday at 6pm on all platforms"
- "Donny, show me how my follower count has grown since I started on DragonCandy"

**Brand:**
- "Donny, amplify the Sakura Sushi campaign to our LinkedIn and Instagram with sponsor copy"
- "Donny, how did our last 5 sponsorships perform across all channels?"
- "Donny, which campaigns in the marketplace would reach an audience that overlaps with ours?"
- "Donny, generate a sponsorship ROI report for Q2 and post the highlights to our LinkedIn"

### Donny Automation Levels

Users choose how much autonomy to give Donny:

| Level | Behavior | Best For |
|-------|----------|----------|
| **Manual** | Donny suggests, user approves every action. Full control. | New users, sensitive brands |
| **Assisted** (default) | Donny drafts posts and schedules them. User reviews before publish. | Most users |
| **Auto-Pilot** | Donny generates, schedules, and publishes autonomously. User gets notification summaries. | Power users, high-volume restaurants |

---

## 5. Campaign Lifecycle: Social Media Hooks

Social media is woven into every stage of the campaign flow, not bolted on as an afterthought.

```
┌──────────────────┐    ┌───���──────────────────────────────────────┐
│ CAMPAIGN CREATED │───▶│ Social Hook: Donny offers to announce    │
│ Restaurant       │    │ the campaign on restaurant's socials.    │
│ publishes        │    │ "Looking for creators! Apply on DC"      │
└────────┬────────���┘    └────────────────��─────────────────────────┘
         │
         ▼
┌──────────────────┐    ┌───────────��─────────────���────────────────┐
│ BRAND SPONSORS   │─���─▶│ Social Hook: Brand can announce          │
│ Brand backs      │    │ partnership on LinkedIn. "Proud to       │
│ campaign         │    │ sponsor local creators at [Restaurant]"  │
└────────��─────────┘    └──────────��────────────────────────���──────┘
         │
         ▼
┌─────────────��────┐    ┌──────────────────────────────────────────┐
│ CREATOR MATCHED  │───▶│ Social Hook: Creator can share           │
│ Application      │    │ excitement. "Excited to create for       │
│ accepted         │    │ [Restaurant]! Stay tuned" (optional)     │
└────────┬─────────┘    └──────────���────────────────────────────���──┘
         │
         ▼
┌──────────────────┐    ┌───────���────────────────���─────────────────┐
│ CONTENT APPROVED │───▶│ TRIPLE SOCIAL HOOK (key moment):         │
│ *** KEY MOMENT   │    │ → Restaurant: Donny posts deliverable    │
│                  │    │ → Creator: Donny cross-posts creator     │
│                  │    │   version to creator's channels          │
│                  │    │ → Brand: Donny amplifies sponsored       │
│                  │    │   content to brand's channels            │
└────────┬─────────┘    └───────���─────────────────────────────────���┘
         │
         ▼
┌──────────────────┐    ┌──────��──────────────��────────────────────┐
│ CAMPAIGN         │───▶│ Analytics Hook: Aggregate social         │
│ COMPLETE         │    │ performance across all 3 parties →       │
│ Payment released │    │ feed into ROI Dashboard → Donny          │
│                  │    │ generates campaign performance summary   │
└──────────────────���    └─────────────────���────────────────────────┘
```

---

## 6. Technical Architecture

### System Layers

```
┌─────────────────────────────────────────────────────┐
│  FRONTEND (React + TypeScript)                      │
│  Content Calendar | Post Composer | Analytics       │
│  Dashboard | Account Settings | Engagement Hub      │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────┴────���────────────────────────┐
│  DONNY AI (MCP Client)                              │
│  Natural language → social media actions             │
│  Outstand MCP 25-tool integration                   │
└───────────────────────┬───────��─────────────────────┘
                        │
┌─────────���─────────────┴───────��─────────────────────��
│  SUPABASE BACKEND                                   │
│  Edge Functions (Outstand API proxy)                │
│  Encrypted Token Storage (AES-256)                  │
│  Social Post Records | Analytics Cache              │
└───────────────────────┬─────────────────────────────┘
                        │
┌───��───────────────────┴──────────────────────────��──┐
│  OUTSTAND.SO API                                    │
│  Unified API → 10 social platforms                  │
│  Handles OAuth, rate limits, media formatting       │
└──��────────────────────┬──────��──────────────────────┘
                        │
    ┌───────┬───────┬───┴───┬────────┬────────┐
    IG    TikTok  GBP     FB    LinkedIn  YouTube
                   X    Threads  Bluesky  Pinterest
```

### Key Technical Decisions

| Decision | Detail |
|----------|--------|
| **API Proxy** | All Outstand API calls go through Supabase Edge Functions — never direct from client |
| **Token Storage** | OAuth tokens encrypted with AES-256 in Supabase, following existing `toast_connections` pattern |
| **Outstand Auth** | Bearer token API key stored as Supabase secret, not exposed to frontend |
| **Social Account Linking** | New `social_connections` table linking profile_id to Outstand social_account_id per platform |
| **Post Records** | New `social_posts` table tracking all posts (Outstand post_id, platform, status, analytics) |
| **Analytics Caching** | Pull analytics from Outstand periodically, cache in Supabase for fast dashboard rendering |
| **White-Label** | Outstand's white-label mode enabled — no third-party branding surfaces to users |
| **BYOK Future** | Architecture supports Bring Your Own Keys if users want to connect their own platform developer apps |

### Outstand.so API Reference

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/posts` | Create and optionally schedule a post |
| `GET /v1/posts` | List posts with filtering |
| `GET /v1/posts/{id}` | Get post details and analytics |
| `DELETE /v1/posts/{id}` | Delete or cancel a scheduled post |
| `POST /v1/posts/{id}/comments` | Publish a comment/reply |
| `GET /v1/posts/{id}/comments` | Retrieve comments |
| `POST /v1/media` | Get presigned upload URL |
| `POST /v1/media/{id}/confirm` | Confirm upload completion |
| `GET /v1/social-accounts` | List connected social accounts |
| `GET /v1/social-accounts/{id}/metrics` | Get account-level metrics |
| `POST /v1/social-networks` | Initiate OAuth connection |
| `DELETE /v1/social-networks/{id}` | Disconnect a social account |

### Outstand Pricing (for cost planning)

| Component | Cost |
|-----------|------|
| Base fee | $5/month (includes 1,000 posts) |
| Per-post overage | $0.01 per additional post |
| Per connected account | $0.50/month |
| Volume discount | Available for 500K+ monthly posts |

---

## 7. Implementation Phases

### Phase 1: Restaurant Social Media (~4-5 weeks)

**Goal:** Full social media experience for restaurants. Establishes the foundation reused by all later phases.

| Step | Deliverable | Type |
|------|-------------|------|
| 1a | Outstand API client & encrypted token storage in Supabase Edge Functions | Backend / Foundation |
| 1b | Donny MCP integration — wire Outstand's 25-tool MCP server into Donny with role-aware prompting | AI / Foundation |
| 1c | Account connection UI — OAuth flow in restaurant settings, connected account display | Frontend |
| 1d | Post creation & scheduling — Donny-first + manual composer, multi-platform publish, content calendar | Frontend + Backend |
| 1e | Analytics & engagement — per-post and account-level analytics, engagement hub, ROI Dashboard integration | Frontend + Backend |

**Foundation work in Phase 1 (reused by Phases 2-4):**
- Outstand API client (Edge Function)
- OAuth flow components
- Donny MCP social tool routing
- Content calendar component
- Post composer component
- Analytics fetching and caching layer

### Phase 2: Creator Social Media (~3-4 weeks)

**Goal:** Cross-posting, portfolio analytics, and personal brand growth tools for creators.

| Deliverable | Notes |
|-------------|-------|
| Creator account connection | Reuses Phase 1 OAuth components, configured for creator platforms |
| Cross-post on content approval | Hook into campaign approval flow, Donny prompts creator to cross-post |
| Donny caption rewriter | Takes restaurant-facing caption, rewrites for creator's voice and audience |
| Creator content calendar | Reuses Phase 1 calendar, adds campaign deadline integration |
| Portfolio analytics (verified) | Pull real metrics from connected accounts into creator's DC profile |
| Verified Creator badge | Badge logic based on connected + active accounts |
| Growth insights | Donny analyzes cross-post performance, recommends campaign types |
| Standalone posting | Creators can post non-campaign content through DragonCandy |

### Phase 3: Brand Social Media (~3-4 weeks)

**Goal:** Sponsorship amplification, cross-party analytics, and brand intelligence.

| Deliverable | Notes |
|-------------|-------|
| Brand account connection | Reuses Phase 1 OAuth, configured for brand platforms (LinkedIn priority) |
| Sponsorship amplification | One-tap repost of sponsored content to brand's channels |
| Brand guidelines enforcement | Set voice, hashtags, disclosures; Donny auto-applies |
| Cross-party analytics | Aggregate performance across restaurant + creator + brand accounts per sponsorship |
| Creator vetting by metrics | Enhance creator browse with verified social metrics and filtering |
| Donny sponsorship intelligence | AI-powered recommendations for which campaigns to sponsor |
| Sponsorship ROI reports | Per-sponsorship reports with cost-per-impression, reach, engagement |
| Brand content calendar | Reuses Phase 1 calendar, adds sponsorship timeline integration |

### Phase 4: Cross-Role & Advanced (~3-4 weeks)

**Goal:** Tie all three roles together in the campaign lifecycle. Advanced automation.

| Deliverable | Notes |
|-------------|-------|
| Campaign social hooks (all 5 stages) | Social prompts at campaign creation, sponsorship, matching, approval, completion |
| Triple-post on content approval | Simultaneous posting to restaurant, creator, and brand channels on approval |
| Donny Auto-Pilot mode | Autonomous content generation, scheduling, and publishing with notification summaries |
| UGC detection & reposting | Donny detects when creators tag restaurants, offers to reshare |
| Unified cross-role analytics | Combined dashboard showing campaign social performance across all parties |
| Donny weekly content planner | AI generates a week of content based on menu, events, trends, past performance |
| Delegated posting (architecture) | Build the permission model for future cross-account posting (Phase 2 of delegated access) |
| Performance-based recommendations | Donny uses historical data to recommend optimal posting strategies per role |

---

## 8. Guiding Principles for Implementation

| Principle | Detail |
|-----------|--------|
| **Donny First, UI Second** | Every social action should be achievable via Donny. The manual UI is fallback, not primary. |
| **Never Store Secrets Client-Side** | Outstand API keys and OAuth tokens live in Supabase with AES-256 encryption. Edge Functions proxy all calls. |
| **White-Label Everything** | Users see "DragonCandy Social" not "Powered by Outstand." No third-party branding surfaces. |
| **Build for Reuse** | Phase 1 components (OAuth, posting, analytics) are role-agnostic. Phases 2-3 configure, not rebuild. |
| **Respect Existing Patterns** | Follow the existing Toast POS integration pattern for OAuth token storage and Edge Function proxy design. |
| **RLS on Everything** | All new social tables follow existing Row Level Security patterns. Users can only access their own social data. |

---

## 9. 2026 Market Context

This integration is informed by current social media marketing trends:

**Restaurants:**
- Instagram and Google Business Profile are non-negotiable for local discovery
- 61% of diners say TikTok food content directly influences where they eat
- Short-form video (Reels, TikTok, YouTube Shorts) is the highest-engagement format
- Staff-led content (EGC) is emerging as a powerful, underused asset in hospitality

**Creators:**
- Creator economy revenue growing 16.2% YoY to $20.6 billion in 2026
- Shift toward long-term brand partnerships over one-off sponsorships
- Micro-influencers with local community trust preferred over large national creators
- 92% of consumers trust UGC over traditional brand advertising

**Brands:**
- Focus on 2-3 platforms done well rather than spreading thin
- AI-driven personalization is becoming foundational
- Performance-driven influencer marketing — brands want measurable ROI, not just impressions
- Authenticity and values-driven branding matter more than polish, especially for Gen Z and Millennials

---

## 10. Success Metrics

How we know this integration is working:

| Metric | Target | Measured By |
|--------|--------|-------------|
| Social accounts connected per role | 60% of active users connect at least 1 account within 30 days | Supabase `social_connections` table |
| Posts published through DragonCandy | 500+ posts/month within 60 days of Phase 1 launch | Outstand API analytics |
| Campaign content cross-posted | 40% of approved deliverables get cross-posted by creators | Cross-post prompt acceptance rate |
| Donny social command usage | 70% of social actions initiated through Donny vs. manual UI | Analytics events |
| Brand amplification rate | 50% of sponsored content amplified to brand's channels | Sponsorship amplification tracking |
| Time-to-post reduction | 80% reduction in time from content approval to social publish | Timestamp deltas |
| Creator profile engagement lift | 25% increase in campaign application rates for verified creators | Application rate comparison |
