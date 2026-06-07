---
title: Restaurant Journey
type: flow
created: 2026-06-07
updated: 2026-06-07
related: [Onboarding, Campaign Lifecycle, DragonShare, Promotions / CGC, Stripe Payments]
---
# Restaurant Journey

## Overview

This is the **restaurant's** (business client) path across the whole product — the
connective map that stitches the feature flows together, linking out rather than
restating their diagrams. A restaurant has three ways to get content: **campaigns**
(hire creators), **DragonShare** (boost organic creator posts), and **promotions**
(collect customer-generated content for a discount).

## Journey Map

```mermaid
flowchart TD
    A[Sign up → role: business_client] --> B[Onboarding wizard:<br/>identity → industry]
    B --> M{First-run missions}
    M --> M1[browse_inspiration]
    M --> M2[create_campaign]
    M --> M3[launch_campaign]
    M --> M4[setup_payments → Stripe]

    M2 --> CAMP[Campaign path]
    subgraph CAMP[Campaign path]
        C1[Create campaign w/ Donny] --> C2[Pay escrow]
        C2 --> C3[Review applications → hire]
        C3 --> C4[Review content → approve]
        C4 --> C5[Download + auto-post]
    end

    A --> DS[DragonShare path]
    subgraph DS[DragonShare path]
        D1[Browse tagged content] --> D2[Boost → pay]
        D2 --> D3[Download + cross-post]
    end

    A --> PR[Promotions path]
    subgraph PR[Promotions path]
        P1[Create promotion] --> P2[Customers submit CGC]
        P2 --> P3[Approve → discount code]
    end

    click B "./onboarding.md"
    click CAMP "./campaign-lifecycle.md"
    click DS "./dragonshare.md"
    click PR "./promotions-cgc.md"
```

## Stages

| Stage | Where | Detail |
|-------|-------|--------|
| Onboarding | `/auth` → `/profile/onboarding` → `/dashboard/business` | [Onboarding](./onboarding.md) (restaurant missions: `browse_inspiration`, `create_campaign`, `launch_campaign`, `setup_payments`) |
| Run a campaign | `/dashboard/business/campaigns` | [Campaign Lifecycle](./campaign-lifecycle.md) |
| Pay & release | escrow → payout | [Stripe Payments](./stripe-payments.md) |
| Download & auto-post | Campaign content gallery | [Campaign Lifecycle → download / auto-posting](./campaign-lifecycle.md) |
| Boost organic content | `/dashboard/business` (BusinessDragonShare) | [DragonShare](./dragonshare.md) |
| Collect CGC | `/dashboard/business` (BusinessPromotionalTools) | [Promotions / CGC](./promotions-cgc.md) |

## Key Surfaces

| Page | Path |
|------|------|
| Business dashboard | `src/pages/BusinessDashboard.tsx` |
| Campaign creator | `src/pages/CampaignCreator.tsx` |
| Campaign details (workspace) | `src/pages/CampaignDetailsPage.tsx` |
| DragonShare | `src/pages/BusinessDragonShare.tsx` |
| Promotional tools | `src/pages/BusinessPromotionalTools.tsx` |
| Settings (Connect, Outstand, profile) | `src/pages/BusinessSettings.tsx` |

## See Also

- [Onboarding](./onboarding.md) · [Campaign Lifecycle](./campaign-lifecycle.md) · [DragonShare](./dragonshare.md) · [Promotions / CGC](./promotions-cgc.md) · [Stripe Payments](./stripe-payments.md)
- [Creator Journey](./creator-journey.md) — the counterpart role
