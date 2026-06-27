---
title: What We Built
type: analysis
created: 2026-06-27
updated: 2026-06-27
sources: [donny-answer]
tags: []
---

# What We Built

> Captured from an internal Donny answer on 2026-06-27, in response to:
> "ideally there is different configurations that we can apply, we might also want to do boost dailys with hype of a lot of rewards, i dont think basing it on current data is good as its all test data but we should base it on real projected activity of suppliers and content creators, lets make this app fun , drive activity but most improtant this machanic should allow us to grow the app automatically"

Here's the full Dragon Rewards Engine spec, saved to your Drive:

📄 **[DragonCandy — Dragon Rewards Engine (DRE) Full System Spec](https://docs.google.com/document/d/1FCd_G1JsfbRkjqd_X7s8WLruVzUwrrSW0bryIrfV528/edit?usp=drivesdk)**

---

Here's the executive summary of what's in there:

## What We Built

**Grounded in real projected targets — not test data:**
- 50 active creators by Day 90, 200+ by Month 6
- 15 creator signups/week, 3 restaurant signups/week
- $400+/month avg creator earnings, $200 avg campaign value
- 30% of new signups from referrals by Month 2 — the DRE is what gets you there

---

## The Big Ideas

**Dragon Points (DP) Economy**
- 1 DP = $0.01 platform value, fully redeemable
- 5 tiers: Egg → Scout → Knight → Master → Legend
- Both DP AND activity milestones required to tier up — prevents farming

**The Configuration Engine (the key ask you had)**
- Every single value — point amounts, multipliers, boost schedules, redemption options — is configurable via an admin panel with zero code deploys
- Pre-built scenario templates: "Growth Sprint," "Creator Acquisition," "Referral Blitz," "Viral Event," "Steady State" — activate in one click

**Daily Boosts + Hype Events**
- Rotating daily boost (DragonShare Monday, Triple Tuesday, Referral Wednesday...)
- Hype Weeks: Dragon Drop Week, Speed Week, Referral Blitz, Monthly Dragon League
- Surprise Drops: Donny activates random 2-hour reward bursts — creates urgency, drives app opens, generates social posts about the surprise

**Social Sharing Engine**
- Every milestone auto-generates a shareable card (Donny writes the copy)
- UTM-tracked so every click and conversion attributes back to the user who shared
- Every share = free marketing with DragonCandy branding + referral link

**The Automatic Economy of Scale**
- 8-layer compounding flywheel documented — Action → Reward → Share → New User → Data → Smarter Donny → More Revenue → Repeat
- When viral coefficient K > 1.0, the platform grows itself
- Requires zero human intervention after initial configuration

**Database schema** is included and minimal — wires directly into your existing event ledger (`dragonshare_events`, `payment_events`, `donny_actions`). 6 new tables, Donny handles the rest via edge function.

**Build phases**: 6 phases across 16 weeks, starting with the engine core and ending with the full admin config panel.
