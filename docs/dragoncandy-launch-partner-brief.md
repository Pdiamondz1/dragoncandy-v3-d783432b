# DragonCandy Launch Sprint — Partner Brief
**What's shipping in the next 17 working days, and why it matters.**

For: business partners, advisors, anyone helping with launch.
By: Dame, founder. Last updated: April 2026.

---

## The bottom line

We're shipping a focused launch sprint that turns DragonCandy from "an MVP for one restaurant at a time" into a real platform: **team accounts, a fix for the broken creator application flow, a brand-new way for creators and brands to make money off organic content (DragonShare), free-forever value at signup for both restaurants and brands, and a tighter UX across all three roles.** Production goes live in roughly two and a half weeks. Execution is sequential, one-prompt-at-a-time through Claude Code, with approval gates between every step.

Every decision in this sprint is filtered through one product question: **does this require the user to type?** If yes, can it be a tap, a paste, a swipe, or a Donny suggestion instead? Less typing equals less abandonment equals more conversion.

---

## Six things shipping

### 1. Fix the launch blocker (Days 1–2)
Creators currently can't successfully apply to campaigns — the form fails silently with "Failed to submit application." This is the only true launch blocker. We diagnose first (a read-only audit), apply the single recommended fix, then **delete the application form entirely** and replace it with a one-tap "Apply with Donny" button. Donny pre-fills the rate from the creator's profile, picks the best portfolio sample matching the campaign's content type, drafts a one-sentence pitch from the creator's last successful work, and submits. Five fields become one tap.

**Why this matters:** the application form had five typed fields; on mobile, every field is friction; every friction point is a failed application; every failed application is creator churn AND a lost campaign for a paying restaurant. We're losing on both sides of the marketplace simultaneously.

### 2. Team & multi-restaurant/multi-brand accounts (Days 3–7)
Restaurants with multiple locations and brands with multiple products currently have to create separate accounts for each one. We're shipping a proper organization model: one billing relationship per company, multiple sub-accounts (locations or products), three roles (Owner, Admin, Standard), invitation by email with magic links, and per-seat billing through Stripe. A switcher in the header makes it one tap to move between locations.

We're also shipping account deletion — currently impossible. The policy is soft delete with a 30-day recovery window, role-tiered destruction rights (only owners can delete the whole org), and a manual GDPR escape hatch for full data erasure. Delivered campaign content stays with the brand or restaurant that paid for it; the creator's identity gets anonymized to "Former DragonCandy Creator." This is legally clean and respects all three sides of the marketplace.

**Why this matters:** every multi-location restaurant we've tried to onboard has bounced because they couldn't manage all five locations from one account. Same story with consumer brands managing multiple products. This unlocks our highest-LTV segment immediately.

### 3. DragonShare — the new organic-content revenue stream (Days 8–11)
Creators are constantly posting reels and photos of restaurants and brands they love — for free, every day, to social platforms that capture all the value. **DragonShare turns that organic behavior into a three-way revenue stream.**

How it works: a creator pastes the link to one of their organic posts into DragonCandy. Donny identifies the restaurant or brand mentioned, scores the post's predicted reach, and routes it to that brand's "Boost" inbox. The brand sees the post with Donny's recommended boost amount ($25, $50, $100, or $250). One tap pays the creator. DragonCandy takes 20%, the creator gets 80%.

We're shipping **Brand Boost** first as the wedge, but the underlying schema supports two more models we'll layer in post-launch: Performance Bounty (brands set standing bounties for posts that hit engagement thresholds) and Affiliate QR (creator gets a unique trackable link for the restaurant, paid per redemption).

**Why this matters strategically — this is the most important addition in the whole sprint:** every DragonShare post that flows through the platform feeds the data flywheel. Donny's matching algorithm gets better with every event logged. After ~5,000 posts, the matching is genuinely defensible — no competitor can replicate it without an equivalent data set. Features can be copied; data flywheels cannot.

### 4. Free-at-signup magic moments (Days 12–13)
Right now a brand-new signup lands on a sparse dashboard and has to figure out what to do. 70% of SaaS users churn in the first 7 days, and most of that happens in the first 7 minutes. We're closing that gap with role-specific free tools that deliver value before a creator is ever hired.

**Restaurants** — paste your website URL, get a full Donny-generated campaign brief in 60 seconds (target audience, content angles, deliverable mix, posting schedule). One brief per week, free forever. Creator delivery is the paid step.

**Brands** — three permanent free tools at signup: a Match Report (top 5 ranked creators for any brief), a Brand Brief Generator (positioning, persona, content angles from a product URL), and Sponsored Campaign Templates (5 pre-built templates customizable any time). All free as the basic tier.

**Why this matters:** the time-to-first-value problem is the #1 SaaS killer. We're solving it by making Donny do something useful for free, immediately, and only charging when the user wants to actually deploy creators or run analytics.

### 5. Real pricing wired to Stripe (Day 13)
Free / $199 Starter / $499 Growth / $999 Pro / Enterprise (custom). Per-seat billing on top. The pattern that's different from competitors: **soft paywalls, never hard.** When a free user tries something that requires a paid tier, they don't get blocked — they get a contextual upsell sheet with Donny adding personalized rationale ("Based on your last 3 briefs, you'd save ~$1,200/mo on agency fees with Starter"). Tap upgrade or tap "maybe later" — the back button always works.

**Why this matters:** soft paywalls outperform hard paywalls on conversion AND retention. Hard paywalls feel like a trap. Soft paywalls feel like a recommendation. We log every paywall surfaced and every conversion to a funnel events table to keep tuning.

### 6. UX/UI polish (Days 14–15)
Not a redesign — pre-launch redesigns kill launches. This is a tokens-and-polish pass: unified design system across all three role experiences (currently Restaurant, Creator, and Brand visually drift), skeleton loaders on every data-fetching page so nothing ever shows a blank screen, empty states everywhere with friendly guidance, and micro-interactions on the four highest-frequency actions (Apply with Donny, Boost a post, Generate brief, Switch org unit). The brand colors don't change. The dragon stays. The vibe gets tighter.

---

## The money math

The four-layer revenue stack stays unchanged from the strategic blueprint:
- **SaaS subscription** ($199–$999/mo per org) — the anchor, 80–90% gross margin
- **Marketplace take rate** on creator deals — 15–20%, scales with GMV
- **Donny AI usage** — generous free tier, paid usage credits at margin above 70%
- **DragonDash rush premiums** — 50–100% markup, almost pure profit margin

What this sprint adds:
- **Per-seat billing** — $29 to $49 per additional teammate per month, multiplies revenue per org by 2–4x for any team of 3+ members
- **DragonShare Brand Boost** — net new revenue line at 20% take rate; estimate $5K–$25K/mo additional revenue within 90 days post-launch as creator volume builds

---

## Timeline & confidence

17 working days plus 2 buffer days. The sequence:
- **Days 1–2** — Fix the launch blocker
- **Days 3–7** — Team accounts, deletion, RBAC, per-seat billing
- **Days 8–11** — DragonShare (Brand Boost first)
- **Days 12–13** — Free tier hooks + paid pricing
- **Days 14–15** — UX/UI polish
- **Days 16–17** — Pre-launch sweep + end-to-end QA across all three roles

**Highest schedule risk:** Phase 2 (team accounts) is the biggest body of work. If we're behind on Day 5, the safe fallback is to defer per-seat billing into the post-launch backlog and ship with flat-tier billing. The other four phase-2 prompts (schema, switcher, invites, deletion) are non-negotiable.

**Highest strategic upside:** Phase 3 (DragonShare). Even if the boost mechanic doesn't generate huge revenue in the first 90 days, the data flowing into the matching algorithm is the moat we've been talking about for a year. Every event logged from Day 8 onward compounds.

---

## What partners can help with

1. **Bring 5–10 launch-week brands to the table.** The free trio is built for them; the moment we open the gate, we want a queue of brands ready to sign up so we can collect data on what they boost and what they don't. Real boosts in the first week feed Donny's training set faster than synthetic ones.

2. **Identify 20–30 creators in the launch metro who already post about local restaurants and brands organically.** These are the natural DragonShare power users. We onboard them manually in week 1, get them comfortable submitting their organic posts to DC, and they become the supply side of the new flywheel.

3. **Restaurant outreach.** The free Brief Generator is a strong cold-outreach tool — paste their website URL, generate a brief, send it to them as an email saying "we made this for you, free, sign up to claim it." Conversion math suggests 3–8% on freemium signups; we want to test that within the first 30 days.

4. **Press/launch narrative.** "AI-powered platform that turns creators' organic posts into revenue for everyone" is a stronger story than "another influencer marketplace." DragonShare is the headline.

---

## Three things we're explicitly NOT doing in this sprint

- **No new color palette or visual rebrand.** Pre-launch redesigns kill launches. Polish only.
- **No social media auto-publishing.** We ship with manual "Download & Post" flows; the Meta/TikTok/YouTube API integrations require 2–6 weeks of approval timelines we don't have. They land in v1.1 post-launch.
- **No multi-agent OpenClaw deployment.** Sequential single-agent (Claude Code) for the launch sprint. OpenClaw stays parked until weeks 2–4 post-launch.

---

## The one-line summary for everyone you brief

**"DragonCandy is shipping a 17-day launch sprint that fixes the broken application flow, opens the platform to multi-location restaurants and multi-product brands, and adds DragonShare — a new feature that turns creators' free organic posts into a three-way revenue stream. Free value for both restaurants and brands at signup, paid tiers from $199, and a data flywheel that compounds with every post."**

---

*Companion document: `dragoncandy-launch-improvement-playbook.md` — the technical execution doc with all 19 Claude Code prompts. Read this first; consult that one when you want to know how a specific feature gets built.*
