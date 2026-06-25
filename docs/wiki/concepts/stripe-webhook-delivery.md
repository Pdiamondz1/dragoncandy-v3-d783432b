---
title: Stripe Webhook Delivery
type: concept
created: 2026-06-24
updated: 2026-06-24
sources: [raw/sessions/2026-06-24-stripe-webhook-revival-dual-secret.md]
tags: [stripe, payments, webhooks, edge-functions, supabase]
---
# Stripe Webhook Delivery

How the single `stripe-webhook` edge function receives and verifies events — and the
operational rules that keep it actually delivering. Context: the prod webhook was silently
**dead** (empty `stripe_webhook_events`), which is what let `stripe_onboarding_complete`
flags go stale and block payouts (PRs #173, #174). See [[Stripe Connect]].

## Two endpoint scopes, two signing secrets

Stripe webhook endpoints are scoped to **"Your account"** (platform) **or** **"Connected
accounts"** (Connect), and **each endpoint has its own signing secret**. A Connect endpoint
is simply one created with *Events from: Connected accounts* — there is no separate "connect
secret" concept.

`stripe-webhook` processes both scopes:
- **Platform** → `checkout.session.completed`, `payment_intent.payment_failed`,
  `checkout.session.expired`, `charge.refunded`, `charge.dispute.created`, `transfer.updated`,
  `customer.subscription.*`, `invoice.payment_*`.
- **Connect** → `account.updated` (a connected account's onboarding/capability change → syncs
  `stripe_onboarding_complete` across `creator_profiles` / `business_profiles` / `org_units`).

## Dual-secret verification (PR #174)

Because the two scopes are separate endpoints with separate secrets, the function must verify
an incoming event against **whichever secret signed it**. `_shared/webhook-secrets.ts` →
`webhookSigningSecrets()` (pure, vitest-tested) collects `STRIPE_WEBHOOK_SECRET` + optional
`STRIPE_CONNECT_WEBHOOK_SECRET` (trimmed, de-duped, priority order). The handler tries
`constructEventAsync` against each in turn — **first match wins** (platform first; the Connect
secret matches `account.updated` on the second pass). **Backward compatible:** with only the
platform secret set, behaviour is identical to single-secret verification.

## Why it had never delivered

1. **`STRIPE_WEBHOOK_SECRET` was unset in prod.** The function returns
   `500 "Webhook secret not configured"` before doing anything, so every event 500'd and
   `stripe_webhook_events` stayed empty.
2. No Connect endpoint existed, so `account.updated` for connected accounts was never sent.

The reactive backstop ([[Stripe Connect]]'s payout-ready *trust-true/verify-false*, PR #173)
means a dead webhook degrades gracefully — flags self-heal on page load and at payout gates —
but real-time sync + hosted-checkout fulfillment depend on live delivery.

## Operational rules (learned the hard way)

- **`verify_jwt = false`** — webhooks carry no JWT (`config.toml` pins this; preserve it on
  every MCP deploy). See [[Supabase]].
- **Payload style must be Snapshot, not Thin.** The handler reads `event.data.object` (full
  snapshot/classic event). **Thin** (v2 event-destination) events carry only IDs and are
  incompatible — a Thin endpoint just accumulates failed deliveries. Delete it.
- **Supabase Vault ≠ Edge Function Secrets.** Only *Edge Function Secrets* are injected as
  `Deno.env`. A signing secret placed in the Vault leaves the function blind to it → a
  persistent `500`.
- **A warm isolate can hold stale env.** After setting the secret, if the probe still `500`s,
  a warm function isolate (booted before the secret existed) may be serving stale env. A
  **redeploy** forces fresh isolates that read current secrets. (Supabase normally injects
  secrets at runtime without a redeploy; the redeploy is the reliable forcing function.)
- **The Stripe MCP can't manage webhook endpoints** (`PostWebhookEndpoints` not in the
  toolkit) — create them in the Dashboard. The new **Workbench removed the in-dashboard
  "Send test event"**; it routes to the CLI (`stripe login` + `stripe trigger <event>`).

## Probe-based verification

Without firing a real event you can verify the chain with a dummy-signature `POST`:
- `500 "Webhook secret not configured"` → no secret visible (unset / wrong store / stale isolate).
- `400 "No signatures found matching…"` → **secret loaded + signature verification active**
  (the correct, healthy response — only a genuinely-signed event would pass).
- `400 "Missing stripe-signature header"` (no header) / `405` (GET) → reachable, `verify_jwt=false`.

## See Also

- [[Stripe Connect]] — escrow, boosts, payout-ready stale-flag fix, table inventory
- [[Stripe Payments Flow]] — money-movement diagrams
- [[Two-Path Boost Payment]] — hosted-checkout fulfillment depends on `checkout.session.completed`
- [[Supabase]] — edge functions, secrets, `verify_jwt`
- [[Test-Mode Stripe UX]] — the sibling test-mode payout/checkout work
