# Product Vision — DragonCandy

## 1. Vision & Mission

### Vision Statement

Every local restaurant has a thriving social media presence powered by content creators who earn a living doing what they love, funded by brands that see measurable returns on every dollar spent.

### Mission Statement

DragonCandy connects content creators, restaurants, and brand sponsors through an AI-powered marketplace that automates the entire content pipeline — from creative brief to published post — in under 24 hours.

### Founder's Why

Dame has been building DragonCandy from the ground up as a solo technical founder, combining deep product thinking with hands-on development. Through multiple design iterations, production-breaking incidents, and hard-won recovery strategies, Dame has developed the disciplined, incremental approach that separates products that ship from products that stall.

The motivation is clear: there's a massive gap in how restaurants and small businesses get social media content. It's either too expensive (agencies charging $3K–5K/month), too slow (weeks of back-and-forth), or too low quality (blurry phone photos posted once a month). Meanwhile, talented content creators struggle to find consistent paid work, and brands pour money into influencer campaigns with murky ROI. The three-sided marketplace that connects all of these parties doesn't exist yet — and Dame has the technical chops and marketplace intuition to build it.

Dame's background in tech and product management, combined with firsthand experience architecting DragonCandy's 35+ table Supabase backend, campaign workflows, and Stripe payment integration, means this isn't theoretical. The foundation is already built. The next step is making it exceptional.

### Core Values

**Speed is the product.** Content delivered in under 24 hours isn't a feature — it's the entire value proposition. Every architectural decision, every UI flow, every AI model selection should optimize for reducing time-to-delivery. If a process adds hours, question whether it belongs.

**AI handles the grunt work, humans bring the creativity.** The platform should never ask a user to do something a machine could do better. Creators bring their artistic eye and on-the-ground presence. Everything else — briefs, matching, scheduling, analytics — should be automated or AI-assisted.

**Earn trust through transparency.** All three sides of the marketplace see exactly what's happening: creators see fair pay upfront, businesses see content before it goes live, brands see real-time performance data. No black boxes, no hidden fees, no surprises.

**Ship weekly, even if it's small.** Learned the hard way that bulk changes break production. Every improvement is incremental, tested, and committed before moving to the next. Progress compounds.

**Premium feel, accessible price.** DragonCandy should look and feel like a $50K custom platform while being affordable for a taco shop with 200 Instagram followers. The design quality signals trust; the pricing signals inclusivity.

### Strategic Pillars

**Creator economics first.** If creators can't earn reliable income quickly, the marketplace dies. Every decision that pits creator experience against other concerns should default to what keeps creators active and earning.

**One-day content cycle.** The fundamental promise is that a restaurant can go from "I need content" to "content is posted" in a single day. Any feature that threatens this timeline needs a very strong justification.

**AI as the invisible operator.** Users shouldn't feel like they're "using AI." They should feel like DragonCandy just works — the matching is perfect, the briefs are smart, the analytics are instant. The AI should be felt, not seen.

**Local-first, scale later.** Dominate one city before expanding. Deep local network effects (creators who know the restaurants, brands who sponsor local campaigns) create defensibility that a national-first approach can't match.

### Success Looks Like

In 12 months, DragonCandy is the go-to platform in its launch city. 500+ active creators compete for gigs, knowing they'll earn $200–500/week consistently. 100+ restaurants have replaced their dead Instagram accounts with professional, creator-made content that actually drives foot traffic. Regional food brands sponsor campaigns through DragonCandy because the ROI dashboard shows them exactly how many new customers each campaign generated. The platform processes $100K+/month in transactions, Dame has a small team, and DragonCandy is expanding to its second city with investors interested. The app is featured in both restaurant industry trade publications and creator economy newsletters as the platform that finally cracked local content delivery.

---

## 2. User Research

### Primary Persona

Marcus, 28, is a part-time content creator who makes engaging food and lifestyle videos on his phone. He has 5K followers across Instagram and TikTok — enough to prove he's got talent, not enough to attract brand deals through DMs. He works a day job at a marketing agency but spends evenings and weekends shooting content because it's what he loves. His income from content is unpredictable: some months he'll land a $300 brand deal through a DM, other months nothing.

Marcus is tech-comfortable — he edits in CapCut, understands hashtag strategy, and knows what performs well on each platform. What he lacks isn't skill — it's a pipeline. He spends hours DMing restaurants trying to pitch his services, often getting ghosted. When he does land a gig, payment takes 30–45 days. He dreams of going full-time as a creator but can't justify it without consistent income.

Marcus would switch to a new platform immediately if it meant: (1) gigs come to him instead of him hustling for them, (2) payment happens within days, not weeks, and (3) the platform doesn't take 20%+ of his earnings like Fiverr.

### Secondary Personas

**Sofia, 42**, owns a popular taco restaurant that's been open for 6 years. Her food is outstanding — locals rave about it — but her Instagram has 340 followers and her last post was 3 weeks ago (a blurry photo of a burrito). She knows social media matters but has zero time to learn it. She tried hiring a freelancer once through Instagram DMs; the creator flaked after one post. She'd pay $100–200/month for someone to just handle her social media content, but she doesn't know where to find reliable people. She needs the process to be dead simple — she wants to approve content with one tap, not learn a new tool.

**James, 35**, is the marketing director at a regional hot sauce brand distributed in 200+ restaurants. He has $10K/month to spend on social media campaigns but his current approach — running Instagram ads and sponsoring food bloggers — delivers inconsistent results. He wants to sponsor content at restaurants that carry his products, creating authentic "in the wild" content featuring his brand. His biggest frustration is attribution: he can never tell which campaigns actually drove sales. He needs a platform that connects his budget to specific restaurants and creators, with a dashboard showing exactly what his money achieved.

**Platform admins** (initially Dame) who moderate content quality, resolve disputes between creators and businesses, manage creator onboarding and verification, and monitor platform health metrics like average delivery time and creator response rates.

### Jobs To Be Done

**Functional jobs:**
For creators — find paid content gigs that match my style and location without cold-pitching, deliver content within the expected timeframe, and get paid quickly.
For restaurants — get professional social media content for my business without managing the process, approve content easily, and see it posted.
For brands — fund content campaigns at restaurants that carry my products, reach local audiences authentically, and track ROI.

**Emotional jobs:**
For creators — feel like a professional, not a desperate freelancer begging for work. Feel valued and fairly compensated.
For restaurants — feel confident that my social media is handled by someone who cares about my business. Feel relieved, not overwhelmed.
For brands — feel smart about where marketing dollars go. Feel in control with clear data, not anxious about wasted spend.

**Social jobs:**
For creators — be known as a reliable, professional creator that businesses want to work with. Build a reputation and portfolio.
For restaurants — have a social media presence that makes customers say "I saw your post and had to come in."
For brands — be seen as the company that supports local businesses and creators, not just another advertiser.

### Pain Points

**Creator income instability (severity: critical, frequency: constant).** Creators currently hustle for every gig through DMs, personal networks, and unreliable platforms. There's no predictable pipeline. This is the #1 reason talented creators quit or never go full-time. The consequence is lost talent from the ecosystem.

**Content quality gap for small businesses (severity: high, frequency: daily).** Restaurants post low-quality content or nothing at all because they can't afford agencies and don't have time to learn content creation. The consequence is lost revenue — customers increasingly discover restaurants through social media, and businesses with dead accounts lose to competitors who post regularly.

**Campaign attribution opacity (severity: high, frequency: per-campaign).** Brands spend money on influencer and content campaigns but can't accurately measure what drove results. They know engagement numbers but not conversion. The consequence is reduced marketing spend on content campaigns in favor of performance marketing channels with better attribution.

**Payment delays (severity: medium, frequency: per-gig).** Creators typically wait 30–45 days for payment through freelance platforms or direct invoicing. This creates cash flow problems and erodes trust. The consequence is creator churn and reluctance to take on new gigs.

**Discovery and matching friction (severity: medium, frequency: per-campaign).** Finding the right creator for a specific restaurant's needs (right style, right location, right availability) is manual and time-consuming for everyone involved. The consequence is missed opportunities and suboptimal matches.

### Current Alternatives & Competitive Landscape

**Fiverr/Upwork** are the default freelance platforms. They work for finding one-off creators, but the experience is poor for local content: no location matching, race-to-the-bottom pricing, high platform fees (20%+), no campaign management, and no brand sponsor model. Creators compete on price rather than quality.

**Influencer marketing platforms (AspireIQ, Grin, CreatorIQ)** focus on big brands working with established influencers. They're expensive ($1K+/month), designed for national campaigns, and completely miss the local restaurant/small business market. A taco shop with 340 followers isn't their customer.

**Direct Instagram DMs** are the most common approach: businesses DM creators, or vice versa. It works sometimes but has zero infrastructure — no contracts, no payment protection, no quality assurance, no analytics. It doesn't scale and breaks down with any volume.

**Doing nothing / DIY** is the biggest competitor. Most small restaurants just don't do social media well, or they assign it to a teenager who works there. The content is low quality but "free." Switching requires proving that professional content drives enough additional revenue to justify the cost.

**Social media agencies** charge $2K–5K/month and produce decent content, but they're priced out of reach for most small restaurants. They also tend to produce generic content that lacks the authentic, local feel that performs best on social media.

### Key Assumptions to Validate

**Assumption 1: Restaurants will pay for content.** We assume small restaurants have budget ($100–300/month) and willingness to pay for social media content. To validate: interview 20 restaurant owners, test willingness to pay at different price points, track conversion from free trial to paid.

**Assumption 2: Content can be delivered in 24 hours.** We assume creators can shoot, edit, and upload quality content within a day of accepting a gig. To validate: run 10 pilot campaigns and measure actual delivery times. Identify where bottlenecks occur.

**Assumption 3: AI matching works at small scale.** We assume AI can effectively match creators to campaigns even with a small initial pool (50 creators). To validate: manually verify AI match quality for the first 50 matches. Track creator acceptance rates.

**Assumption 4: Brand sponsors will fund local campaigns.** We assume regional brands will pay to sponsor content at restaurants that carry their products. To validate: pitch 5 regional food brands, gauge interest and budget range, run 2 pilot sponsored campaigns.

**Assumption 5: Creators prefer platform gigs over direct hustle.** We assume creators will accept platform-sourced gigs even if the per-gig rate is slightly lower than what they'd negotiate directly, because the volume and reliability make up for it. To validate: survey 30 creators about their current income, gig frequency, and what trade-offs they'd accept.

**Assumption 6: One-tap approval reduces business churn.** We assume that making the approval process dead simple (one tap) will keep business owners engaged who would otherwise abandon a more complex tool. To validate: A/B test simplified vs. detailed approval flows, measure completion rates.

**Assumption 7: Fast payment drives creator retention.** We assume that paying creators within 48 hours (vs. the industry standard 30–45 days) will be a major retention driver. To validate: track creator retention rates against payment speed, survey creators on what matters most.

### User Journey Map

**Awareness:** Marcus hears about DragonCandy from another creator's Instagram story showing a payout notification — "$350 earned this week on DragonCandy." He's intrigued because it looks effortless. He sees the DragonCandy profile showcasing sample content from real restaurants, confirming it's legit.

**Consideration:** Marcus visits dragoncandy.com. The landing page shows a creator earnings calculator and sample campaigns near his area. He watches a 30-second video showing the gig flow: accept, shoot, upload, get paid. No interviews, no bidding wars, no haggling. He signs up in under 2 minutes.

**First use:** Marcus completes his creator profile — uploads 5 portfolio pieces, sets his location radius, and selects his content styles (food photography, video reels). Within hours, AI matches him to his first gig: shoot content for a new pizza spot 15 minutes from his apartment. The brief is already written — he just needs to show up, shoot, and upload.

**Magic moment:** Marcus shoots the content in 45 minutes, uploads it that evening, and by the next morning the restaurant has approved it. He sees "$150 — paid" in his DragonCandy wallet. He earned money doing what he loves, with zero hustle involved. He screenshots the payout and texts his friend: "Bro, check this app out."

**Habit formation:** Over the next month, Marcus completes 8 gigs through DragonCandy, earning $1,200. He's now getting matched to campaigns before he finishes his current one. He starts checking DragonCandy daily — not anxiously, but excitedly, the way you check a well-stocked job board when you know good opportunities are coming.

**Advocacy:** Marcus posts a "Creator Spotlight" story that DragonCandy features on their page. He refers 3 creator friends. His portfolio on DragonCandy becomes his professional showcase — restaurants request him specifically for repeat gigs. He's now considering going full-time.

---

## 3. Product Strategy

### Product Principles

**If the AI can do it, the user shouldn't have to.** Every form, selection, and decision point in the app should ask: "Can AI handle this, or at least pre-fill it?" Creative briefs, creator matching, content scheduling, hashtag selection, caption writing, analytics summaries — AI should handle all of these by default, with human override available.

**24-hour cycle or it's broken.** The core content delivery loop — from brief to approved content — must complete within a single day. Any feature, flow, or process that adds days to the cycle should be scrutinized hard. Speed is the product.

**Three dashboards, one truth.** Each user type (creator, business, brand) sees a dashboard tailored to their needs, but all three are looking at the same underlying data. A campaign's status, content, and metrics should be consistent across all views.

**Earn in days, not months.** Creators get paid within 48 hours of content approval. This is non-negotiable for v1. Fast payment is the single biggest differentiator for creator retention.

**One-tap everything for businesses.** Restaurant owners are busy. Every interaction they have with DragonCandy should be achievable in one tap: approve content, request changes, launch a campaign. If it takes more than 2 taps, the UX is wrong.

**Show the money.** Every screen should connect actions to revenue impact. Creators see earnings. Businesses see content driving engagement. Brands see campaign ROI. Nobody should wonder "is this working?"

### Market Differentiation

DragonCandy occupies a unique position that no current platform addresses. Fiverr and Upwork are generic freelance marketplaces where content creation is one of thousands of categories — there's no specialization in local food/restaurant content, no brand sponsor model, and no AI automation. Influencer marketing platforms like AspireIQ and Grin serve national brands working with established influencers — they're prohibitively expensive for a taco shop and don't offer the local, authentic content that performs best on social media.

The three-sided marketplace model is the key defensibility. By having brands subsidize content creation, DragonCandy can offer businesses affordable content (the brand is paying part of the cost) and creators higher pay (the brand's budget supplements the business's payment). This creates a network effect: more brands attract more businesses (who want subsidized content), more businesses attract more creators (who want more gigs), and more creators attract more brands (who want a larger pool of talent). Each side's participation makes the platform more valuable to the other two.

AI automation compounds this advantage. As more campaigns flow through the platform, the AI matching, brief generation, and analytics become smarter. A human-powered competitor would need linear headcount growth to match DragonCandy's throughput — while DragonCandy scales with compute.

### Magic Moment Design

The magic moment differs for each user type, but they share a common trigger: the first time a user sees the complete loop close.

**For creators:** Accept a matched gig → shoot content → upload → see "$150 — paid" in wallet within 48 hours. The path from signup to this moment should be under 72 hours. This requires: a fast onboarding flow (under 5 minutes), AI matching that surfaces a relevant gig within 24 hours of profile completion, and instant payment processing upon business approval.

**For businesses:** Describe what they need in plain language → see a generated creative brief → watch matched creator deliver content → approve with one tap → see it posted. The path from signup to this moment should be under 48 hours. This requires: an AI brief generator that works from natural language input, a creator pool with sufficient density in the local area, and a dead-simple approval flow.

**For brands:** Fund a campaign → watch creators produce content → see real-time analytics showing reach, engagement, and estimated impact. The path from campaign launch to first analytics should be under 72 hours.

For MVP, the creator and business magic moments are the priority. Brand magic moment is secondary and can be slightly longer to achieve.

### MVP Definition

**In scope — must ship in v1:**

**AI Creative Brief Generator.** A business describes what they need in plain language ("We just launched a spicy chicken sandwich"), and AI generates a complete creative brief with content ideas, suggested angles, hashtags, and posting schedule. This is the starting point for every campaign and must work reliably from day one. "Done" means: any restaurant owner can type a sentence and get a usable brief within 30 seconds.

**Smart Creator Matching.** AI analyzes creator profiles (portfolio, style, location, ratings, availability) and matches them to campaigns. The match should surface the top 3–5 creators for any given brief. "Done" means: for a campaign in the launch city, at least 3 relevant creators are suggested within seconds, and at least one accepts within 24 hours.

**Creator Gig Flow.** Creators see matched gigs in their dashboard, accept with one tap, upload content through the app, and track their earnings. "Done" means: a creator can go from seeing a gig to uploading completed content in a single seamless flow without leaving the app.

**Business Approval Flow.** Businesses receive content for review, preview it, and approve or request changes with a single tap. "Done" means: a restaurant owner can approve content in under 10 seconds from a notification.

**Payment Processing.** Stripe Connect handles marketplace payments — collecting from businesses/brands, taking the platform fee, and paying creators. Creators receive payment within 48 hours of content approval. "Done" means: money flows correctly through all three parties with no manual intervention.

**Campaign Dashboard.** Each user type sees their relevant view — creators see gigs and earnings, businesses see content and campaign status, brands see sponsored campaigns and analytics. "Done" means: every user can answer "what's happening with my campaigns?" at a glance.

**Real-time Campaign Analytics.** Basic metrics visible to all parties — reach, engagement, content status, delivery timeline. "Done" means: the dashboard shows live campaign data, not stale reports.

**Messaging System.** In-app messaging between creators and businesses for coordination (e.g., "Can I come shoot at 2pm?"). "Done" means: messages send and receive in real-time without requiring email or phone exchange.

### Explicitly Out of Scope

**Mobile native apps.** v1 is web-only with responsive design. Mobile apps (iOS/Android) are deferred to month 4–6 after validating product-market fit on web. Tempting because creators live on their phones, but building and maintaining native apps doubles the engineering effort. Mobile-responsive web covers 80% of the need.

> **Update (2026-06-01):** This stance evolved. Rather than a separate native build, DragonCandy adopted a **Capacitor wrapper** — one web codebase serving both dragoncandy.io and a downloadable iPhone app, which sidesteps the "double the engineering effort" concern above. **Phase 1 (Capacitor foundation) has shipped.** See the Apple App Store workstream in `PROJECT_CONTEXT.md` and the [[Capacitor Native Shell]] wiki entity.

**Advanced analytics / attribution modeling.** v1 shows basic engagement metrics (impressions, likes, comments, shares). Advanced attribution (foot traffic correlation, sales lift modeling) is deferred to month 3–4. Tempting because brands want ROI data, but accurate attribution requires integration with POS systems and foot traffic data that are complex to build and validate.

**Content scheduling and auto-posting.** v1 focuses on content delivery to the business — the business or creator posts manually. Auto-scheduling via social media API integrations (Instagram Graph API, TikTok API) is deferred to month 2–3. Tempting because it completes the loop, but social media API integrations are notoriously finicky and would delay launch.

**Creator tiers / certification program.** v1 treats all approved creators equally. A tiered system (Bronze/Silver/Gold) with different rates and priority matching is deferred to month 3–4. Good for quality assurance long-term, but premature with a small creator pool.

**Multi-city expansion.** v1 launches in one city. Expansion tooling (market management, regional pricing, local onboarding flows) is deferred until the model is proven. Tempting to go wide, but marketplace businesses win by going deep first.

**White-label / API access.** Some brands may want to embed DragonCandy's functionality in their own platforms. Deferred indefinitely until there's strong demand signal.

### Feature Priority (MoSCoW)

**Must Have (P0):** AI creative brief generator, smart creator matching, creator gig acceptance and upload flow, business one-tap approval, Stripe marketplace payments (business → platform → creator), campaign dashboard for all user types, in-app messaging, creator and business onboarding, basic campaign analytics.

**Should Have (P1):** Brand sponsor campaign flow, AI content quality scoring, creator portfolio showcase, business content library (past campaigns), push/email notifications, creator ratings and reviews, admin moderation tools.

**Could Have (P2):** Content scheduling and auto-posting, advanced ROI analytics, creator tier system, referral program, bulk campaign creation, content template library, AI caption and hashtag optimizer.

**Won't Have (this time):** Mobile native apps, multi-city management tools, white-label API, POS integration for attribution, video editing tools, social media account management, creator payroll/tax reporting.

### Core User Flows

**Flow 1: Business Creates a Campaign**
Trigger: Restaurant owner logs in and wants new social media content.
Steps: (1) Tap "New Campaign" → (2) Describe what they need in plain text → (3) AI generates a creative brief with content ideas, hashtags, and timeline → (4) Business reviews and confirms (one tap to approve, or edits before confirming) → (5) AI matches top creators and sends gig invitations → (6) Matched creator accepts → (7) Creator shoots and uploads content → (8) Business receives notification, previews content → (9) Business approves with one tap → (10) Creator gets paid, content is marked ready for posting.
Outcome: Professional content delivered within 24 hours.
Success criteria: End-to-end completion in under 24 hours, business satisfaction rating 4+/5.

**Flow 2: Creator Completes a Gig**
Trigger: Creator receives a gig match notification.
Steps: (1) Open notification → (2) Review brief, location, and pay → (3) Accept gig (one tap) → (4) Coordinate timing via in-app message → (5) Shoot content at the location → (6) Upload content through the app → (7) Business approves → (8) Payment appears in wallet within 48 hours.
Outcome: Creator earns money for quality content.
Success criteria: Gig acceptance within 4 hours of notification, content uploaded within 24 hours of acceptance, payment within 48 hours of approval.

**Flow 3: Brand Sponsors a Campaign**
Trigger: Brand wants to fund content at restaurants carrying their products.
Steps: (1) Brand creates a sponsored campaign with budget and target restaurants → (2) AI generates briefs incorporating brand messaging → (3) Matched restaurants and creators execute the campaign → (4) Brand monitors real-time analytics dashboard → (5) Campaign completes, brand sees full performance report.
Outcome: Brand gets authentic, local content featuring their products with measurable reach.
Success criteria: Campaign launches within 48 hours of creation, analytics visible in real-time, brand satisfaction rating 4+/5.

### Success Metrics

**Primary metric (North Star): Campaigns completed per week.** This single metric reflects all three sides of the marketplace working: businesses are creating campaigns, creators are delivering content, and the platform is processing payments. Target: 10 campaigns/week by day 90.

**Secondary metrics:**
Creator retention rate (monthly) — target: 70%+ of creators who complete one gig complete a second within 30 days.
Business retention rate (monthly) — target: 60%+ of businesses who complete one campaign create a second within 60 days.
Average delivery time (brief to approved content) — target: under 24 hours.
Average payment time (approval to creator payout) — target: under 48 hours.
Platform take rate — target: 15% average across all transactions.

**Leading indicators:**
Creator sign-ups per week — target: 15/week during first 90 days.
Business sign-ups per week — target: 3/week during first 90 days.
Gig acceptance rate — target: 80%+ of matched gigs accepted within 12 hours.
Content approval rate (first submission) — target: 85%+ approved without revision requests.

### Risks

**Chicken-and-egg marketplace risk (likelihood: high, impact: critical).** Without creators, businesses won't sign up. Without businesses, creators won't sign up. Mitigation: seed the supply side first — recruit 50 creators before launching to businesses. Offer creators guaranteed minimum earnings for the first month. Run "showcase campaigns" with partner restaurants to build the initial content library.

**Content quality inconsistency (likelihood: medium, impact: high).** Creator-submitted content may vary wildly in quality, damaging business trust. Mitigation: implement AI content quality scoring at upload, require portfolio review during creator onboarding, establish clear content guidelines with examples, allow businesses to rate creators.

**Payment processing complexity (likelihood: medium, impact: high).** Three-way marketplace payments (business pays, platform takes fee, creator receives net) with optional brand sponsorship add complexity to Stripe Connect flows. Mitigation: start with simple two-party flows (business → creator via platform), add brand sponsorship payment flow in Phase 2.

**24-hour delivery promise is unrealistic (likelihood: medium, impact: medium).** Creators may not be available on demand, especially in early days with a small pool. Mitigation: track delivery times religiously, allow 48-hour windows for initial campaigns, expand creator pool aggressively in launch city, implement creator availability scheduling.

**AI matching quality at low volume (likelihood: medium, impact: medium).** With only 50 initial creators, AI matching may feel random rather than smart. Mitigation: supplement AI matching with manual curation for first 30 days, use basic criteria (location, style, availability) rather than trying to be clever with sparse data.

**Restaurant owner tech adoption (likelihood: medium, impact: medium).** Target users (busy restaurant owners) may not engage with yet another app. Mitigation: make onboarding under 2 minutes, enable SMS/email notifications so they don't need to open the app, make approval literally one tap.

**Brand sponsor acquisition (likelihood: medium, impact: low for v1).** Brands may be slow to adopt a new platform without proof of concept. Mitigation: defer brand features to Phase 2, run 2–3 pilot sponsored campaigns manually to build case studies before building the full brand flow.

**Regulatory/legal risk (likelihood: low, impact: medium).** Marketplace payment regulations, contractor vs. employee classification, content licensing rights. Mitigation: use Stripe Connect's compliant marketplace framework, include clear terms of service about creator-as-contractor status, include content licensing terms in creator agreement.

---

## 4. Brand Strategy

### Positioning Statement

For content creators who want reliable income, restaurants that need professional social media content, and brands that want measurable local marketing, DragonCandy is the AI-powered content marketplace that delivers professional social media content in under 24 hours. Unlike Fiverr, agency hiring, or influencer platforms, DragonCandy uses AI to automate matching, briefs, and analytics while a three-sided marketplace model means everyone earns more and pays less.

### Brand Personality

DragonCandy is the confident, creative friend who always has a plan. Imagine someone who runs a popular food account but also understands the business side — they dress well, they're plugged into what's trending, they get excited about great content, and they're dead reliable when it comes to money and deadlines. They're not corporate or stiff, but they're not sloppy either. They show up on time, deliver what they promised, and make it look easy.

DragonCandy would never use jargon like "leverage synergies" or "optimize your content pipeline." It would say "let's get your food in front of people" and "here's what we made — looks amazing, right?" The personality is energetic without being exhausting, professional without being stuffy, and tech-forward without being intimidating.

If DragonCandy were at a dinner party, it'd be the person everyone wants to sit next to — funny, interesting, generous with advice, and genuinely excited about what other people are building.

### Voice & Tone Guide

DragonCandy's voice is constant: confident, direct, encouraging, and plain-spoken. The tone shifts depending on context — more energetic for wins, more calm and helpful for problems, more authoritative for money matters.

**Onboarding:**
DO: "You're in. Let's set up your profile so we can start matching you with gigs." / DON'T: "Welcome to the DragonCandy ecosystem! Let's leverage our AI-powered platform to optimize your content delivery journey."

**Error states:**
DO: "That upload didn't go through — try a shorter video under 60 seconds." / DON'T: "Oops! Something went wrong. We're so sorry for the inconvenience."

**Empty states:**
DO: "No gigs yet — but they're coming. Make sure your portfolio has at least 5 pieces so our AI can match you." / DON'T: "It's empty here! Why not explore our platform features while you wait?"

**Success / payment:**
DO: "You just earned $150 — nice work. Payment hits your account within 48 hours." / DON'T: "Congratulations! Your payment of $150.00 has been successfully processed and will be disbursed in accordance with our payment schedule."

**Marketing copy:**
DO: "Professional content for your restaurant. Delivered tomorrow." / DON'T: "Unlock the power of AI-driven content creation solutions for your food service establishment."

### Messaging Framework

**Tagline:** "Content that works. Delivered fast."

**Homepage headline:** "Your restaurant's social media, handled."

**Value propositions:**
For creators: "Get matched to paid gigs. Create content you love. Get paid in days, not months."
For businesses: "Describe what you need. We'll match you with a creator. Content delivered by tomorrow."
For brands: "Sponsor content campaigns at restaurants that carry your products. See exactly what your money did."

**Objection handlers:**
"I can just post my own content" → Your food deserves better than blurry phone photos. Our creators make content that stops the scroll — and it costs less than you'd think.
"How do I know the creator will be good?" → Every creator is vetted with a portfolio review. Plus, you approve everything before it goes live. If you don't love it, it doesn't post.
"I don't have time for another platform" → That's the point. You describe what you need, approve what we deliver, and you're done. Most business owners spend less than 5 minutes per campaign.
"How is this different from Fiverr?" → Fiverr is a generic freelancer marketplace. DragonCandy is built specifically for restaurant content — AI writes the briefs, matches local creators, and delivers in 24 hours. No bidding, no searching, no waiting.

### Elevator Pitches

**5-second:** DragonCandy delivers professional social media content to restaurants in 24 hours, powered by AI.

**30-second:** Restaurants need social media content but can't afford agencies. Content creators want consistent paid work but can't find it. DragonCandy uses AI to match them — generating creative briefs, finding the perfect local creator, and delivering approved content in under 24 hours. Brands fund the campaigns and see real-time ROI.

**2-minute:** Every restaurant owner knows they should be posting on Instagram and TikTok, but most of them are too busy cooking to create content. Meanwhile, there are thousands of talented content creators in every city who can't find consistent paid work. The current options are broken — Fiverr is a race to the bottom, agencies charge $3K/month, and DMing creators on Instagram is a coin flip.

DragonCandy fixes this with a three-sided AI marketplace. A restaurant owner types "we just launched a spicy chicken sandwich" and our AI generates a complete creative brief. Within hours, a matched local creator shoots the content. The restaurant approves with one tap. The creator gets paid within 48 hours. The whole cycle happens in under 24 hours.

Here's what makes it defensible: brands sponsor these campaigns. A hot sauce company pays to have their product featured in the content, subsidizing the cost for restaurants and increasing creator pay. Everyone wins. And because AI handles the matching, briefs, and analytics, the platform scales without linear headcount growth.

We're launching next week in our first city with 50 creators and 10 businesses. The goal is 500 creators and 100 businesses within 6 months, processing $50K+/month in transactions.

### Competitive Differentiation Narrative

The content creation industry has a massive gap at the local level. National influencer platforms serve big brands and big creators — they're not built for a taco shop that needs one great video a month. Freelance marketplaces like Fiverr offer no specialization, no location matching, and no campaign intelligence. Agencies deliver quality but at prices that exclude 90% of restaurants.

DragonCandy is the first platform designed specifically for local content delivery. AI automation means a restaurant owner doesn't need to write a brief, search for a creator, or negotiate terms — it all happens automatically. The three-sided model with brand sponsors means costs are subsidized, creators earn more, and brands get measurable local marketing. And because every transaction and piece of content flows through the platform, DragonCandy builds a data moat — better matching, better briefs, better analytics with every campaign completed.

### Brand Anti-Patterns

**Never sound corporate.** Banned words: leverage, synergy, solution, ecosystem, optimize, utilize, streamline, onboard (as a verb in marketing copy). Never use stock photography of people in suits or generic "diverse team in an office" imagery. Never use buzzword-laden descriptions when plain language is clearer.

**Never look cheap.** No garish gradients, no clipart, no poorly kerned text, no cramped layouts. Every pixel should communicate "this platform handles money and it's serious about it." No free-tier badge designs or "powered by" watermarks in user-facing content.

**Never be slow.** No loading screens that take more than 2 seconds. No multi-step wizards when a single form would do. No "we'll get back to you in 3–5 business days." If something takes time, show progress — never leave users staring at a blank screen.

**Never make users do AI's job.** No blank brief templates that expect business owners to write creative direction. No creator search pages with 20 filter dropdowns. No manual payment reconciliation. If a human has to do something a machine could do, it's a bug.

**Never be vague about money.** Show exact dollar amounts, never ranges. Show platform fees upfront, never hidden in fine print. Show payment timelines with specific dates, never "typically within X business days."

---

## 5. Design Direction

### Design Philosophy

**Content-forward UI.** The most important thing on every screen is the content itself — photos, videos, campaign visuals. The interface should frame content, not compete with it. Large media previews, minimal chrome, let the work speak.

**Effortless interaction.** Every action should feel lighter than expected. One tap to approve, one sentence to create a brief, one glance to check earnings. The app should feel like gravity is on your side — things flow downhill toward completion.

**Dark mode first, light mode available.** The target audience — creators and food industry professionals — spends significant time on phones and screens. Dark mode reduces eye strain and makes food photography pop. Design in dark mode first, then adapt light.

**Distinct but unified dashboards.** Each user type gets a tailored experience, but all three should feel like the same app. Shared design language, shared components, differentiated by content and emphasis.

### Visual Mood

DragonCandy's visual language sits at the intersection of creative studio and premium fintech. Think: the vibrancy of TikTok's best food content wrapped in the trustworthiness of a banking app. The teal and pink palette provides energy and personality that most marketplace platforms lack — this isn't another gray-and-blue SaaS tool.

The aesthetic is modern, card-based, and spacious. Content cards float on dark surfaces with subtle depth. Animations are smooth but purposeful — nothing moves just for decoration. Typography is bold and confident at large sizes, clean and readable at body sizes. The overall feeling should be: "this app is fun to use AND I trust it with my money."

### Color Palette

**Primary — Dragon Teal:** `#4DD9C0`
CSS: `--color-primary`
Tailwind: `dragon-teal`
Use for: primary CTAs, active states, key metrics, earnings displays, progress indicators. This is the "go" color — it signals action and success.
Hover: `#3BC4AD` / Active: `#2AAF99`

**Secondary — Candy Pink:** `#F9A8D4`
CSS: `--color-secondary`
Tailwind: `candy-pink`
Use for: secondary actions, accents, creator-related highlights, notification badges, featured content. This is the "personality" color — it signals creativity and energy.
Hover: `#F78DC2` / Active: `#F472B0`

**Background — Deep Charcoal:** `#1A1A2E`
CSS: `--color-bg`
Tailwind: `dragon-bg`
Use for: page backgrounds in dark mode. Deep enough to be restful, warm enough to avoid feeling sterile.

**Surface — Elevated Charcoal:** `#25253D`
CSS: `--color-surface`
Tailwind: `dragon-surface`
Use for: cards, modals, dropdowns, any elevated surface. Provides subtle depth against the background.

**Surface Hover:** `#2D2D4A`
CSS: `--color-surface-hover`
Tailwind: `dragon-surface-hover`
Use for: hover states on card surfaces.

**Neutral Gray:** `#A8A8A0`
CSS: `--color-neutral`
Tailwind: `dragon-neutral`
Use for: borders, dividers, disabled states, placeholder text.

**Text Primary:** `#F5F5F5`
CSS: `--color-text`
Tailwind: `dragon-text`
Use for: primary text in dark mode.

**Text Muted:** `#9CA3AF`
CSS: `--color-text-muted`
Tailwind: `dragon-text-muted`
Use for: secondary text, labels, timestamps.

**Success:** `#34D399`
CSS: `--color-success`
Tailwind: `dragon-success`
Use for: payment confirmed, content approved, campaign completed.

**Warning:** `#FBBF24`
CSS: `--color-warning`
Tailwind: `dragon-warning`
Use for: pending actions, approaching deadlines, low availability.

**Error:** `#F87171`
CSS: `--color-error`
Tailwind: `dragon-error`
Use for: failed uploads, payment issues, validation errors.

**Info:** `#60A5FA`
CSS: `--color-info`
Tailwind: `dragon-info`
Use for: tips, informational banners, new feature highlights.

**Light mode overrides:**
Background: `#F9FAFB` / Surface: `#FFFFFF` / Text Primary: `#111827` / Text Muted: `#6B7280`

### Typography

**Heading font: Inter**
Google Fonts: `Inter:wght@500;600;700;800`
CSS: `--font-heading: 'Inter', sans-serif`
Weights: Semi-bold (600) for subheadings, Bold (700) for primary headings, Extra-bold (800) for hero/display text.

**Body font: Inter**
Google Fonts: (same import)
CSS: `--font-body: 'Inter', sans-serif`
Weights: Regular (400) for body text, Medium (500) for emphasis.

**Mono font: JetBrains Mono**
Google Fonts: `JetBrains+Mono:wght@400;500`
CSS: `--font-mono: 'JetBrains Mono', monospace`
Use for: code, API keys, transaction IDs, technical data.

**Type scale:**

| Token | Size | Line Height | Use |
|-------|------|-------------|-----|
| `--text-xs` | 0.75rem (12px) | 1.5 | Captions, timestamps |
| `--text-sm` | 0.875rem (14px) | 1.5 | Secondary text, labels |
| `--text-base` | 1rem (16px) | 1.6 | Body text |
| `--text-lg` | 1.125rem (18px) | 1.5 | Emphasis text, card titles |
| `--text-xl` | 1.25rem (20px) | 1.4 | Section headings |
| `--text-2xl` | 1.5rem (24px) | 1.3 | Page headings |
| `--text-3xl` | 1.875rem (30px) | 1.2 | Dashboard headers |
| `--text-4xl` | 2.25rem (36px) | 1.1 | Hero/display text |
| `--text-5xl` | 3rem (48px) | 1.0 | Landing page hero |

### Spacing & Layout

**Base unit: 4px.** All spacing derives from multiples of 4px.

| Token | Value | Use |
|-------|-------|-----|
| `--space-1` | 4px | Tight gaps (icon to label) |
| `--space-2` | 8px | Inline spacing, button padding vertical |
| `--space-3` | 12px | Form field padding |
| `--space-4` | 16px | Card padding, standard gaps |
| `--space-5` | 20px | Section dividers |
| `--space-6` | 24px | Card internal spacing |
| `--space-8` | 32px | Section spacing |
| `--space-10` | 40px | Large section gaps |
| `--space-12` | 48px | Page section spacing |
| `--space-16` | 64px | Major section spacing |
| `--space-24` | 96px | Page top/bottom padding |

**Max content width:** 1280px (`--max-w-content`)
**Card max width:** 400px (`--max-w-card`)

**Responsive breakpoints:**
`sm`: 640px / `md`: 768px / `lg`: 1024px / `xl`: 1280px / `2xl`: 1536px

**Grid system:** 12-column grid with 16px gutters at `md`+ breakpoints. Single column below `md`.

### Component Philosophy

**Border radius:** Generous but not bubbly. Cards and containers use `12px` (`--radius-lg`). Buttons use `8px` (`--radius-md`). Inputs use `8px`. Tags and badges use `9999px` (full pill). Avatars are circular.

**Shadows:** Minimal in dark mode — use surface color differentiation for depth instead of shadows. In light mode, use subtle shadows: `0 1px 3px rgba(0,0,0,0.1)` for cards, `0 4px 12px rgba(0,0,0,0.1)` for modals.

**Borders:** 1px, using `--color-neutral` at 20% opacity in dark mode. Used sparingly — prefer surface color changes over borders for separation.

**Buttons:**
Primary: Dragon Teal bg, white text, `--radius-md`, 12px vertical / 24px horizontal padding.
Secondary: transparent bg with teal border, teal text.
Ghost: no bg, no border, teal text. For inline actions.
Danger: Error red bg, white text. Only for destructive actions.
All buttons: 44px minimum height (touch target), bold (600) text.

**Cards:** `--color-surface` background, `--radius-lg` corners, `--space-6` internal padding. Content cards (showing media) use zero padding on the media area — the image/video bleeds to the card edges.

**Inputs:** `--color-surface` background, 1px border `--color-neutral` at 30% opacity, `--radius-md` corners, `--space-3` padding, `--text-base` font size. Focus state: teal border, subtle teal glow.

### Iconography & Imagery

**Icon style:** Outline icons at 1.5px stroke weight. Clean, geometric, modern.
**Icon library:** Lucide React — consistent, extensive, MIT licensed.
**Icon sizes:** 16px (inline with text), 20px (buttons and nav), 24px (feature icons), 32px (empty states).

**Photography direction:** Authentic, warm, well-lit food photography and creator-at-work imagery. Never stock photos. User-generated content from the platform should be the primary visual asset. When placeholder imagery is needed, use food photography with warm tones and shallow depth of field.

**Illustration style:** None for v1 — photography and icons carry the visual story. If illustrations are added later, they should be simple line illustrations that complement the teal/pink palette.

### Accessibility Commitments

**WCAG 2.1 AA compliance** for all interactive elements.
**Color contrast:** Minimum 4.5:1 for body text, 3:1 for large text (18px+ bold or 24px+ regular). All color combinations in the palette have been chosen to meet these ratios against their intended backgrounds.
**Keyboard navigation:** All interactive elements reachable via Tab. Visible focus indicators (2px teal outline with 2px offset).
**Touch targets:** Minimum 44x44px for all tappable elements.
**Screen reader support:** Semantic HTML, ARIA labels on icon-only buttons, alt text on all images, live regions for dynamic content updates.
**Reduced motion:** Respect `prefers-reduced-motion` — disable all animations and transitions when enabled.
**Text scaling:** UI remains usable at 200% zoom.

### Motion & Interaction

**Default transition:** 150ms ease-out for hover/focus state changes.
**Page transitions:** 200ms fade for route changes.
**Card animations:** 300ms ease for expand/collapse. Subtle 2px translate-y on hover.
**Loading states:** Skeleton screens (pulsing surface-colored shapes) for content. Teal spinner for discrete loading moments.
**Toasts:** Slide in from bottom-right, 200ms ease-out entry, auto-dismiss after 5 seconds with fade-out.
**Modals:** Fade-in backdrop (150ms), scale-up modal (200ms ease-out from 95% to 100%).
**Content approval animation:** On approval tap, the card flashes teal briefly (150ms) and the status badge updates with a smooth color transition.

**What doesn't animate:** Data in tables/lists, text content, navigation changes within a dashboard view. Only transitions between states and user-triggered interactions get motion.

### Design Tokens

| Token | CSS Variable | Tailwind | Value |
|-------|-------------|----------|-------|
| Primary | `--color-primary` | `dragon-teal` | `#4DD9C0` |
| Primary Hover | `--color-primary-hover` | `dragon-teal-hover` | `#3BC4AD` |
| Secondary | `--color-secondary` | `candy-pink` | `#F9A8D4` |
| Secondary Hover | `--color-secondary-hover` | `candy-pink-hover` | `#F78DC2` |
| Background | `--color-bg` | `dragon-bg` | `#1A1A2E` |
| Surface | `--color-surface` | `dragon-surface` | `#25253D` |
| Surface Hover | `--color-surface-hover` | `dragon-surface-hover` | `#2D2D4A` |
| Neutral | `--color-neutral` | `dragon-neutral` | `#A8A8A0` |
| Text | `--color-text` | `dragon-text` | `#F5F5F5` |
| Text Muted | `--color-text-muted` | `dragon-text-muted` | `#9CA3AF` |
| Success | `--color-success` | `dragon-success` | `#34D399` |
| Warning | `--color-warning` | `dragon-warning` | `#FBBF24` |
| Error | `--color-error` | `dragon-error` | `#F87171` |
| Info | `--color-info` | `dragon-info` | `#60A5FA` |
| Font Heading | `--font-heading` | `font-heading` | `'Inter', sans-serif` |
| Font Body | `--font-body` | `font-body` | `'Inter', sans-serif` |
| Font Mono | `--font-mono` | `font-mono` | `'JetBrains Mono', monospace` |
| Radius SM | `--radius-sm` | `rounded-sm` | `4px` |
| Radius MD | `--radius-md` | `rounded-md` | `8px` |
| Radius LG | `--radius-lg` | `rounded-lg` | `12px` |
| Radius Full | `--radius-full` | `rounded-full` | `9999px` |
| Shadow SM | `--shadow-sm` | `shadow-sm` | `0 1px 3px rgba(0,0,0,0.1)` |
| Shadow MD | `--shadow-md` | `shadow-md` | `0 4px 12px rgba(0,0,0,0.1)` |
| Transition Fast | `--transition-fast` | — | `150ms ease-out` |
| Transition Base | `--transition-base` | — | `200ms ease-out` |
| Transition Slow | `--transition-slow` | — | `300ms ease` |
