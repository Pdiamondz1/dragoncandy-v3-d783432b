---
title: Two-Path Boost Payment
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-dragonshare-amplification-engine.md, docs/superpowers/specs/2026-05-29-stripe-restaurant-payments-design.md]
tags: [stripe, payments, dragonshare, escrow]
---

# Two-Path Boost Payment

How a restaurant/brand pays for a [[DragonShare]] boost through [[Stripe Connect]]. The
charge takes one of two paths depending on whether a default card is already on file.

## The Two Paths

1. **First boost — hosted checkout.** No card on file, so the restaurant goes through Stripe
   hosted checkout, which saves the card and sets it as the org's default payment method
   (`setup_future_usage: 'off_session'`). The org's `stripe_customer_id` is persisted on
   `organizations` and reused across escrow, sponsorship, and boost flows.
2. **Repeat boosts — off-session charge.** With a default card on file, the boost is a
   one-tap off-session `PaymentIntent` — no checkout UI.

## Fallback

If an off-session charge throws `authentication_required` or returns `requires_action` (3D
Secure / SCA), the flow falls back to hosted checkout so the user can complete authentication.

## Fulfillment (idempotent)

Both paths converge on a single shared `fulfillBoost` helper that performs the Stripe transfer,
inserts the payout, and updates post status. Transfers use idempotency keys
(`boost_tr_${boostId}`) so a webhook retry or double-fire never double-pays. The creator
receives **80%** of the boost (80/20 split, encoded separately from the campaign 5% platform fee).

## State Model

`dragonshare_boosts.status` (pending → transferred) pairs with `dragonshare_posts` status
(`available` → `boosted`). A post stays `available` while a boost is `pending` (checkout not yet
complete); a concurrent-pending guard prevents duplicate pending rows; an expired checkout
returns the post to `available`.

## See Also

- [[Stripe Connect]]
- [[DragonShare]]
- [[Payments Split by Surface]]
