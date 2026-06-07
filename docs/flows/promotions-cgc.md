---
title: Promotions / CGC
type: flow
created: 2026-06-07
updated: 2026-06-07
related: [Restaurant Journey]
---
# Promotions / Customer-Generated Content (CGC)

## Overview

Promotions let a **restaurant** collect content directly from its **customers**
in exchange for a discount. The restaurant creates a promotion; a customer visits
a public link and submits a video/photo **anonymously** (no login); the restaurant
reviews and approves; an approved submission generates a **discount code** sent to
the customer, and can optionally be cross-posted to social via
[Outstand](../wiki/entities/outstand.md).

The defining constraint: **customer submission is anonymous** — storage and RLS
allow inserts with `auth.uid() IS NULL`, so the schema must match the public form
exactly (a missing column silently breaks submission in prod, not just the build).

## User Journey

```mermaid
flowchart LR
    R1[Restaurant creates<br/>promotion] --> L[Public link<br/>/promo/:id]
    L --> C1[Customer uploads<br/>video/photo]
    C1 --> C2[Customer info<br/>+ marketing consent]
    C2 --> S[Submission created<br/>status: pending]
    S --> R2{Restaurant reviews}
    R2 -->|reject + reason| N1[Customer notified:<br/>rejected]
    R2 -->|approve| CODE[Generate discount code]
    CODE --> N2[Customer notified:<br/>code via email + SMS]
    CODE -.->|optional| X[Cross-post to social]
    N2 --> RD{Redeem code}
    RD -->|manual| RM[Restaurant verifies<br/>in VerifyCodesTab]
    RD -->|automatic| RT[Toast POS webhook<br/>ORDER_PAID / DISCOUNT_APPLIED]
```

## Technical Flow

### Submission status (`promotion_submissions`)

```mermaid
stateDiagram-v2
    [*] --> pending: Customer submits (anonymous)
    pending --> approved: Restaurant approves<br/>→ discount code generated
    pending --> rejected: Restaurant rejects<br/>(rejection_reason stored)
    approved --> [*]
    rejected --> [*]
```

A unique index on `(promotion_id, customer_email)` blocks duplicate submissions
per customer per promotion. If the DB insert fails after the file upload, the
orphaned upload is explicitly cleaned up.

### Approval → code → notify

```mermaid
sequenceDiagram
    autonumber
    participant Cust as Customer (anon)
    participant Page as PromotionSubmissionPage
    participant DB as Supabase
    participant R as Restaurant
    participant EF as send-promotion-notification

    Cust->>Page: Upload media + info
    Page->>DB: Insert promotion_submissions (pending)<br/>+ upload to promotion-videos bucket
    R->>DB: Review (CGCReviewSheet)
    alt Approve
        R->>DB: status = approved<br/>insert discount_codes (collision-retry)
        R->>EF: type = video_approved
        EF-->>Cust: Email + SMS with code
        opt Social
            R->>DB: insert donny_scheduled_posts (source: promotion)
        end
    else Reject
        R->>DB: status = rejected (+ reason)
        R->>EF: type = video_rejected
        EF-->>Cust: Email notification
    end
```

`send-promotion-notification` sends email via **Resend** and SMS via **Twilio**
(SMS fires only on approval, carrying the discount code).

### Redemption (manual + Toast POS)

A discount code can be redeemed two ways:

- **Manual** — the restaurant verifies the code in `VerifyCodesTab`
  (`usePromotions.redeemCode`), which sets `is_redeemed = true` and increments
  `promotions.current_redemptions`.
- **Automatic via Toast** — for restaurants that connected Toast (OAuth via
  `toast-oauth-start` / `toast-oauth-callback`, discounts pushed by
  `toast-discount-push`), the `toast-redemption-webhook` marks the code redeemed
  when Toast emits `ORDER_PAID` / `DISCOUNT_APPLIED`. It is HMAC-verified and
  idempotent via `toast_sync_events`.

## Reference

### Pages & Components

| Name | Path | Role |
|------|------|------|
| `BusinessPromotionalTools` | `src/pages/BusinessPromotionalTools.tsx` | Restaurant (manage promotions + library) |
| `PromotionSubmissionPage` | `src/pages/PromotionSubmissionPage.tsx` | Customer (public, `/promo/:promotionId`) |
| `CreatePromotionModal` / `EditPromotionModal` | `src/components/promotions/` | Restaurant |
| `CGCReviewSheet` | `src/components/promotions/CGCReviewSheet.tsx` | Restaurant (approve / reject) |
| `CGCContentLibrary` | `src/components/promotions/CGCContentLibrary.tsx` | Restaurant (filter submissions) |
| `VerifyCodesTab` | `src/components/promotions/VerifyCodesTab.tsx` | Restaurant (redeem codes) |
| `VideoUploader` / `CustomerInfoForm` / `SocialHandleFields` | `src/components/…` | Customer form steps |

### Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `usePromotions` | `src/hooks/usePromotions.ts` | Create/update promotions, review submissions, redeem codes |
| `usePromotionSubmission` | `src/hooks/usePromotionSubmission.ts` | Anonymous customer submit + duplicate check |

### Edge Functions

| Function | Path | Trigger |
|----------|------|---------|
| `send-promotion-notification` | `supabase/functions/send-promotion-notification/` | On approve / reject — email (Resend) + SMS (Twilio) |
| `fire-promotion-social-hook` | `supabase/functions/fire-promotion-social-hook/` | Cross-post an approved submission |
| `toast-redemption-webhook` | `supabase/functions/toast-redemption-webhook/` | Toast `ORDER_PAID` / `DISCOUNT_APPLIED` → auto-redeem code |
| `toast-oauth-start` / `toast-oauth-callback` | `supabase/functions/toast-oauth-*/` | Connect a restaurant's Toast account |
| `toast-discount-push` | `supabase/functions/toast-discount-push/` | Push a discount to Toast |

### Tables & Status

| Table | Key status field | Transitions |
|-------|------------------|-------------|
| `promotions` | `status` | `active ↔ paused` (implicit `expired` past `end_date`) |
| `promotion_submissions` | `status` | `pending → approved / rejected` (anonymous insert RLS) |
| `discount_codes` | `is_redeemed` | `false → true` (manual or Toast webhook; increments `current_redemptions`) |
| `donny_scheduled_posts` | `status` | `scheduled → published` (metadata `source: 'promotion'`) |
| `toast_sync_events` | — | Idempotency log for Toast redemption webhooks |

## Known Gaps / TODOs

- **One shot per customer** — once a submission is `approved` or `rejected` its
  status is terminal (`status IN ('pending','approved','rejected')`) and a
  `(promotion_id, customer_email)` unique index blocks re-submission, so a
  customer effectively gets a single attempt per promotion (no reopen path).
- **Toast is opt-in** — automatic redemption only applies to restaurants that
  connected Toast; everyone else relies on manual verification in `VerifyCodesTab`.

## See Also

- [Restaurant Journey](./restaurant-journey.md)
- [DragonShare](./dragonshare.md) — the other creator/customer content path
- Wiki: [[DragonCandy Platform]] · [[Outstand]]
