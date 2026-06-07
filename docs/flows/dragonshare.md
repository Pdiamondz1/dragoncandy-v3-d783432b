---
title: DragonShare
type: flow
created: 2026-06-07
updated: 2026-06-07
related: [Stripe Payments, Creator Journey, Restaurant Journey]
---
# DragonShare

## Overview

DragonShare is the amplification engine: **creators** upload organic content
about a restaurant, and the **restaurant** can boost it with a payment to
cross-post it across its connected social channels (via
[Outstand](../wiki/entities/outstand.md)). Payments run on Stripe Connect with an
**80/20 creator/platform split**. The model is **trust-then-flag** — submitted
posts default to `verified` (no admin verification queue); inappropriate content
is reported after the fact via a flag.

Money mechanics are detailed in [Stripe Payments](./stripe-payments.md); this
page focuses on the content + decision + notification flow.

## User Journey

```mermaid
flowchart LR
    C1[Creator uploads content<br/>+ tags restaurant] --> C2[Post created<br/>status: verified]
    C2 --> N1[Restaurant notified]
    N1 --> R1[Restaurant views feed<br/>watermarked preview]
    R1 --> R2{Boost or pass?}
    R2 -->|pass / decline| D1[Creator notified<br/>not selected]
    R2 -->|boost: pick amount| PAY[Pay via Stripe]
    PAY --> F1[Fulfillment:<br/>80% to creator, 20% platform]
    F1 --> R3[Restaurant downloads<br/>un-watermarked content]
    F1 --> X[Cross-post via Outstand]
    F1 --> N2[Creator notified:<br/>payment received]
```

## Technical Flow

### Post status (`dragonshare_posts`)

The org-facing feed (`useOrgDragonSharePosts`) only shows posts where
`status = 'verified'` **and** `flagged_at IS NULL` **and** `declined_at IS NULL`.

```mermaid
stateDiagram-v2
    [*] --> verified: Creator submits<br/>(trust-then-flag default)
    verified --> boosted: boost_status = boosted<br/>(payment captured)
    verified --> declined: Restaurant passes<br/>(declined_at set)
    verified --> flagged: Reported<br/>(flagged_at set)
    verified --> expired: expires_at reached
    boosted --> [*]
    declined --> [*]
    flagged --> [*]
    expired --> [*]
```

`boost_status` on the post moves `available → boosted` (or `expired` / `withdrawn`).

### Boost payment — two paths

`boost-payment` validates the caller is an org owner/admin, creates a boost row,
then charges. **Path depends on whether the org has a saved card:**

```mermaid
flowchart TD
    A[boost-payment invoked] --> B{Org has<br/>saved card?}
    B -->|yes| C[Off-session PaymentIntent]
    C -->|succeeded| F[fulfillBoost:<br/>transfer 80% to creator Connect]
    C -->|SCA required / failed| H[Fall back to hosted checkout]
    B -->|no| H
    H -->|setup_future_usage: off_session| I[Card saved + charged]
    I -->|stripe-webhook| F
    F --> N[dragonshare-notify: boost_paid]
```

- Off-session success returns inline; checkout returns `{ checkout_url, boost_id }`
  and completes on the Stripe webhook.
- `fulfillBoost` (`_shared/fulfill-boost.ts`) performs the Connect transfer and
  records the payout.

### Notification fanout

`dragonshare-notify` is the single owner of DragonShare delivery (raw push
inserts were retired). Each event fans out to the **bell notification**, a
**Donny nudge**, and a **Donny chat message**:

| Event | Fired when | Recipient |
|-------|------------|-----------|
| `submission` | Creator submits a post | Restaurant (org owner) |
| `boost_paid` | Boost payment captured | Creator (paid) + restaurant (draft ready) |
| `declined` | Restaurant passes | Creator (not selected) |

## Reference

### Pages & Components

| Name | Path | Role |
|------|------|------|
| `CreatorDragonShare` | `src/pages/CreatorDragonShare.tsx` | Creator hub (submitted / boosted / expired) |
| `BusinessDragonShare` | `src/pages/BusinessDragonShare.tsx` | Restaurant / Brand boost feed |
| `DragonShareInlineForm` / `DragonShareSubmitSheet` | `src/components/dragonshare/` | Submit (desktop / mobile) |
| `DragonShareUploadArea` | `src/components/dragonshare/DragonShareUploadArea.tsx` | File upload |
| `RestaurantTypeahead` | `src/components/dragonshare/RestaurantTypeahead.tsx` | Target restaurant search |
| `WatermarkedMedia` | `src/components/dragonshare/WatermarkedMedia.tsx` | Pre-payment preview |
| `DragonSharePostCard` | `src/components/dragonshare/DragonSharePostCard.tsx` | Boost decision card |
| `BoostConfirmationSheet` | `src/components/dragonshare/BoostConfirmationSheet.tsx` | Amount + split confirm |
| `DragonShareActivityCard` | `src/components/dragonshare/DragonShareActivityCard.tsx` | Dashboard activity feed |

### Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useCreatorDragonSharePosts` / `useOrgDragonSharePosts` | `src/hooks/useDragonShare.ts` | Read posts (creator / org feed) |
| `useSubmitDragonSharePost` | `src/hooks/useDragonShare.ts` | Submit post + fire notify |
| `useOrgBoostStats` / `useCreatorDragonShareEarnings` | `src/hooks/useDragonShare.ts` | Spend / earnings stats |
| `useDragonShareUpload` | `src/hooks/useDragonShareUpload.ts` | Upload to storage |
| `useFlagDragonSharePost` / `useDeclineDragonSharePost` | `src/hooks/…` | Flag / pass |
| `useAmplificationPreview` | `src/hooks/useAmplificationPreview.ts` | Connected platforms preview |

### Edge Functions

| Function | Path | Trigger |
|----------|------|---------|
| `boost-payment` | `supabase/functions/boost-payment/` | Restaurant boosts a post |
| `dragonshare-notify` | `supabase/functions/dragonshare-notify/` | submit / boost / decline events |
| `get-watermarked-preview` | `supabase/functions/get-watermarked-preview/` | Pre-payment watermarked media |
| `fire-dragonshare-social-hook` | `supabase/functions/fire-dragonshare-social-hook/` | Cross-post after boost |

### Tables & Status

| Table | Key status field | Transitions |
|-------|------------------|-------------|
| `dragonshare_posts` | `status` | default `verified` → `declined` / `flagged` / `expired` |
| `dragonshare_posts` | `boost_status` | `available → boosted` (or `expired` / `withdrawn`) |
| `dragonshare_boosts` | `status` | `pending → captured → transferred` (or `refunded` / `failed`) |
| `dragonshare_payouts` | `status` | `pending → succeeded` (or `failed` / `reversed`) |

> `content_file_path` on a post is a **public URL** — use it directly as an
> `img`/`video` src; do not wrap it in `useSignedUrl`.

## Known Gaps / TODOs

- **Watermark generation timing** — `get-watermarked-preview` produces the
  pre-payment preview; whether watermarking is synchronous or pre-baked at upload
  wasn't fully traced.
- **Creator Connect prerequisite** — a creator needs a Stripe Connect account
  (`create-creator-connect-account`) to receive payouts; the UI doesn't appear to
  hard-block submission on this. Confirm the failure mode.
- **`dragonshare_engagement`** is schema-only (not populated) — engagement
  metrics are not yet wired.

## See Also

- [Stripe Payments](./stripe-payments.md) — boost charge, split, Connect transfer
- [Creator Journey](./creator-journey.md) · [Restaurant Journey](./restaurant-journey.md)
- Wiki: [[DragonShare]] · [[Trust-Then-Flag Model]] · [[Two-Path Boost Payment]] · [[Outstand]]
