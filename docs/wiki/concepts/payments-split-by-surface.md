---
title: Payments Split by Surface
type: concept
created: 2026-06-01
updated: 2026-06-01
sources: [raw/sessions/2026-06-01-apple-app-store-capacitor-phase1.md, docs/superpowers/specs/2026-06-01-apple-app-store-design.md]
tags: [payments, app-store, stripe, ios, strategy]
---

# Payments Split by Surface

The rule that decides which payment rail a transaction uses based on **where** it happens
(web vs the iOS app), designed to keep marketplace economics on [[Stripe Connect]] while
avoiding Apple's 30% In-App-Purchase cut.

## The Split

| Flow | Web | iOS app |
|------|-----|---------|
| Marketplace (campaign payments, DragonShare boosts, 80/20 payouts) | Stripe | **Stripe** |
| Subscriptions / Donny credits | Stripe | **Web-only** (app shows tier read-only) |

## Why It Works

- Apple's guideline **3.1.3(e)** exempts real-world person-to-person services from IAP, so
  marketplace flows (a restaurant paying a creator) can stay on Stripe inside the app.
- Selling subscriptions/credits *in-app* would trigger IAP and Apple's 30% — the most common
  rejection reason. So at launch the app never sells them; users subscribe on web and the app
  reflects their tier read-only.
- [[Capacitor Native Shell]] platform detection (`useNativePlatform`) is what lets the UI hide
  the subscription purchase surface when running natively.

## See Also

- [[Capacitor Native Shell]]
- [[Two-Path Boost Payment]]
- [[Stripe Connect]]
- [[Pricing Architecture]]
