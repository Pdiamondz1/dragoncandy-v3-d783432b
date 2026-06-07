---
title: Creator Journey
type: flow
created: 2026-06-07
updated: 2026-06-07
related: [Onboarding, Campaign Lifecycle, DragonShare, Stripe Payments]
---
# Creator Journey

## Overview

This is the **content creator's** path across the whole product — the connective
map that stitches the feature flows together. It links out to the detailed pages
rather than restating their diagrams. A creator's two earning paths are
**campaigns** (apply → deliver → get paid) and **DragonShare** (post organically →
get boosted).

## Journey Map

```mermaid
flowchart TD
    A[Sign up → role: content_creator] --> B[Onboarding wizard:<br/>identity → skills → bio]
    B --> M{First-run missions}
    M --> M1[view_campaigns]
    M --> M2[add_portfolio]
    M --> M3[apply_campaign]
    M --> M4[setup_payouts → Stripe Connect]

    M1 --> CAMP[Campaign path]
    subgraph CAMP[Campaign path]
        C1[Browse marketplace] --> C2[One-Tap apply w/ Donny]
        C2 --> C3[Hired → deliver content]
        C3 --> C4[Approved → payout]
    end

    M2 --> DS[DragonShare path]
    subgraph DS[DragonShare path]
        D1[Upload organic content<br/>tag a restaurant] --> D2[Restaurant boosts]
        D2 --> D3[80% payout + cross-post]
    end

    C4 --> E[Earnings dashboard]
    D3 --> E

    click B "./onboarding.md"
    click CAMP "./campaign-lifecycle.md"
    click DS "./dragonshare.md"
    click E "./stripe-payments.md"
```

## Stages

| Stage | Where | Detail |
|-------|-------|--------|
| Onboarding | `/auth` → `/profile/onboarding` → `/dashboard/creator` | [Onboarding](./onboarding.md) (creator missions: `view_campaigns`, `add_portfolio`, `apply_campaign`, `setup_payouts`) |
| Discover & apply | `/dashboard/creator/campaigns` | [Campaign Lifecycle → apply](./campaign-lifecycle.md) |
| Deliver content | `/dashboard/creator/my-campaigns/:id` | [Campaign Lifecycle → content delivery](./campaign-lifecycle.md) |
| DragonShare | `/dashboard/creator` (CreatorDragonShare) | [DragonShare](./dragonshare.md) |
| Get paid | `/dashboard/creator/earnings` | [Stripe Payments → payout](./stripe-payments.md) |

## Key Surfaces

| Page | Path |
|------|------|
| Creator dashboard | `src/pages/CreatorDashboard.tsx` |
| Campaign marketplace | `src/pages/CreatorCampaignMarketplace.tsx` |
| My campaigns | `src/pages/MyCampaignsPage.tsx` / `MyCampaignDetailPage.tsx` |
| DragonShare | `src/pages/CreatorDragonShare.tsx` |
| Earnings | `src/pages/CreatorEarnings.tsx` |
| Settings (Connect, profile) | `src/pages/CreatorSettings.tsx` |

## See Also

- [Onboarding](./onboarding.md) · [Campaign Lifecycle](./campaign-lifecycle.md) · [DragonShare](./dragonshare.md) · [Stripe Payments](./stripe-payments.md)
- [Restaurant Journey](./restaurant-journey.md) — the counterpart role
