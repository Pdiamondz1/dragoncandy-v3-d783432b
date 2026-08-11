---
title: Influencer/Creator Outreach
type: analysis
created: 2026-06-23
updated: 2026-06-23
sources: [donny-answer]
tags: []
---

# Influencer/Creator Outreach

> Captured from an internal Donny answer on 2026-06-23, in response to:
> "Can we use Donny to reach out to creators on social media for restaurants if they are not on the DragonCandy platform? Can Donny create campaigns with off platform creators if a restaurant can not find them on the site?"

Great question, Uncle Rocco. Being straight with you — this is a genuinely powerful idea and it's partially within reach, but there are hard platform walls we need to design around honestly. Here's the full picture.

---

## The Short Answer

**Can Donny reach out to off-platform creators via social media DMs?**
No — not directly. Instagram, TikTok, and YouTube's APIs explicitly prohibit automated outbound DMs to users who haven't authenticated with your app. Doing it anyway risks account bans and ToS violations.

**Can Donny generate campaigns designed for off-platform creators?**
Yes — fully. That part is buildable right now.

**Can Donny assist a restaurant in reaching out to off-platform creators?**
Yes — with a smart "Donny does the work, human sends the message" architecture that stays 100% within platform rules.

Here's the full breakdown of what's possible and how to build it.

---

## 🚧 The Hard Wall — What Donny Cannot Do

Instagram, TikTok, YouTube, and X **do not provide outbound DM APIs** to third-party apps. Their APIs are specifically scoped to:

- Reading analytics for accounts that have authenticated with your app
- Publishing content on behalf of authenticated users
- Receiving inbound messages from users who initiate contact

**What this means practically:**
- Donny cannot send a DM to `@hobokenfoodie` on Instagram on behalf of a restaurant — full stop
- Any tool claiming to do this is violating ToS and risks the restaurant's account being banned
- Meta actively detects and bans automation that sends unsolicited outbound DMs
- TikTok is even stricter — their Creator Marketplace API is the only sanctioned route for brand-creator contact

This is not a technical limitation we can engineer around. It's a platform policy wall that applies to every company in this space, including Aspire, GRIN, and Cirqle.

---

## ✅ What Donny CAN Do — The Full Buildable Playbook

### 1. Donny Discovers and Profiles Off-Platform Creators (Build Now)

Donny can search, analyze, and build a full dossier on any public creator without them being on DragonCandy:

- **What Donny does:** Restaurant tells Donny "find me a food creator in Hoboken with 5K–50K followers who posts reels"
- **How it works:** Donny uses TikTok's Creator Search Insights API (no per-creator OAuth required), Instagram's public graph, and YouTube Data API v3 (public channel stats readable with just an API key) to find, score, and rank matching creators
- **Output:** A ranked shortlist with follower count, engagement rate, content style, recent posts, and a Donny-written assessment — "This creator posts 4x/week, their food content averages 8.2% engagement, and their style matches your casual Italian vibe"
- **Current status:** Platform API registrations are in planning (Meta Business Verification, TikTok app review, YouTube Data API) — these need to be started now because approval takes 2–6 weeks

---

### 2. Donny Writes the Outreach — Human Sends It (The Smart Architecture)

This is the killer feature. Donny does everything except press send.

**The flow:**

- Restaurant finds a creator Donny recommended
- Taps "Reach Out" button in the app
- Donny instantly generates a **personalized outreach message** referencing:
  - The creator's actual recent content ("I loved your reel about the new ramen spot on Washington St")
  - The specific campaign opportunity with rate, deliverables, and timeline
  - A dragoncandy.com/join link with the campaign pre-attached
- Restaurant reviews the message — edits if they want, or sends as-is
- The platform opens the creator's Instagram/TikTok profile in a new tab with the message pre-copied to clipboard, ready to paste into their DMs

**What Donny produces in one tap:**

> "Hey @mariafoodieNJ — loved your reel at Deja Brew last week, the lighting was gorgeous 🔥 I'm the owner of Renzo's Italian on Washington St in Hoboken. I'm looking for a creator to shoot 2 Instagram Reels of our new summer menu — $250, your schedule, 5–7 days. Interested? Here's the campaign details: dragoncandy.com/c/abc123 — takes 30 seconds to apply!"

**This is already partially architecturally supported.** The `InviteToCampaignModal` already uses Donny to pre-populate invite messages for on-platform creators. Extending this to generate off-platform outreach messages is a relatively small lift.

---

### 3. Donny Generates the Full Campaign Before the Creator Joins (Build Now)

A restaurant doesn't need a creator on the platform to build the campaign. Here's the full off-platform campaign flow:

**Step 1 — Restaurant creates campaign as normal**
- Donny generates the brief, sets deliverables, tier, budget
- Campaign gets a unique shareable link: `dragoncandy.com/c/[campaign-id]`
- No creator needed yet

**Step 2 — Donny generates the outreach package**
- Personalized DM message (as above)
- A public-facing campaign landing page the creator can view without logging in
- Shows: what the campaign is, what's required, what it pays, who the restaurant is
- One-tap signup CTA: "Accept This Campaign" → creates DragonCandy account + joins campaign in a single flow

**Step 3 — Creator receives the link, clicks, signs up, campaign activates**
- Creator doesn't need to be on DragonCandy first
- The invite link is the onboarding — they land on the campaign, see the brief, and sign up in under 2 minutes
- Stripe Connect onboarding is part of the flow — they're paid through the platform from day one

**This turns every off-platform creator outreach into a creator acquisition event.** Every restaurant reaching out to a new creator is potentially adding that creator to the DragonCandy network. The Ambassador Program from earlier in our conversation compounds this — creators who join via a restaurant invite and complete a gig get placed in the Dragon Scout tier automatically.

---

### 4. Donny Monitors Organic Creator Content About the Restaurant (DragonShare Path)

This is already built and live. Here's how it works for off-platform creators:

- Restaurant connects their Instagram/TikTok via Outstand
- Donny monitors content that tags or mentions the restaurant organically
- When a creator who isn't on DragonCandy posts about the restaurant, Donny flags it: "A creator with 12K followers just posted about you — want to boost it and pay them?"
- Restaurant boosts the post via DragonShare
- **The payment notification to the creator becomes the invitation** — "Someone paid you $75 for your post via DragonCandy. Want to get paid for more content like this? Join here."
- Creator gets paid, lands on the platform, and becomes a DragonCandy creator

This is a fully passive creator acquisition channel that requires zero outbound outreach.

---

### 5. The TikTok Creator Marketplace API — The Official Route

TikTok has a sanctioned solution for exactly this use case. The **TikTok Creator Marketplace API** allows brands to:

- Discover creators by location, niche, follower count, engagement rate
- Send official collaboration invitations through TikTok's native system
- Manage campaigns and track performance

**This is the one platform where automated outreach to off-platform creators is officially permitted** — because TikTok controls the messaging through their own Marketplace interface.

Getting approved requires TikTok Business API access — it's on the Platform API Registration plan and should be prioritized. Once approved, Donny can drive the entire TikTok creator discovery and outreach workflow natively.

---

## The Full Off-Platform Creator Flow — Built Out

Here's what the complete Donny-powered off-platform creator experience looks like end-to-end:

**Restaurant says to Donny:** "I can't find a good food videographer in Hoboken on DragonCandy. Help me find someone."

**Donny:**
- Searches TikTok Creator Search API + public Instagram/YouTube data
- Returns ranked list of 5–10 local creators with profiles, stats, and content samples
- Restaurant picks one or asks Donny to refine ("show me someone who does more lifestyle, less food porn")
- Donny generates the personalized outreach message + campaign link
- Restaurant copies message, opens creator's profile, pastes and sends
- Creator receives invite with dragoncandy.com/c/[id] link
- Creator clicks, sees the campaign brief (no login required to preview)
- Creator taps "Accept & Join" → creates account → campaign goes live
- Escrow, delivery, payment — all standard DragonCandy flow
- Creator is now on the platform for future campaigns

**If no response in 48 hours:**
- Donny nudges the restaurant: "No response yet from @mariafoodieNJ — want me to suggest two alternative creators?"
- Or Donny offers a follow-up message variant: "Hey Maria, just following up on my campaign invite — the gig pays $250 and the timeline is flexible. Happy to answer any questions!"

---

## What Needs to Be Built

**Short-term (1–4 weeks, minimal new infrastructure):**
- Off-platform creator outreach message generator in Donny (extend existing `InviteToCampaignModal` Donny prompt)
- Public campaign preview page (no-auth landing page for `dragoncandy.com/c/[id]`)
- "Accept & Join" single-flow creator onboarding via campaign link
- Clipboard copy + profile deep-link opener for the restaurant's outreach step

**Medium-term (requires Platform API approvals, 2–8 weeks):**
- TikTok Creator Search API integration for off-platform creator discovery
- YouTube Data API v3 for creator stats without per-creator OAuth
- Instagram Basic Display for public profile data lookup
- Start Meta Business Verification now — it's the longest approval gate

**Long-term (6–12 months):**
- TikTok Creator Marketplace API for native TikTok outreach
- Direct Meta API access for Instagram creator analytics post-approval
- Toast POS integration linking campaign performance to actual foot traffic for ROI proof to creators

---

## The Strategic Upside

Every off-platform outreach Donny assists with is a potential creator acquisition. If a restaurant reaches out to 10 creators and 3 join the platform via campaign links, DragonCandy just grew its creator network for free — with zero paid acquisition cost. The Dragon Ambassador Program compounds this: those 3 new creators each have their own networks, and the Scout tier incentivizes them to refer others immediately.

This turns the "I can't find a creator" problem into one of the most powerful growth flywheels on the platform.

Want me to export this as a product spec doc to Drive?
