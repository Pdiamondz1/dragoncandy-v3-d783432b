# Session — Stripe webhook revival + dual-secret verification (PRs #173, #174)

Date: 2026-06-24

## What prompted it

The `stripe_onboarding_complete` flag was going **stale-false** and wrongly blocking
payouts. Root-cause dig found the prod Stripe **webhook had never delivered a single
event** — `stripe_webhook_events` was completely empty — so the flag (a cache of Stripe's
`charges_enabled && payouts_enabled`) only ever self-healed reactively when a user loaded
their payments page. That made the `account.updated` real-time sync dead and left several
belt-and-suspenders paths (hosted-checkout fulfillment, subscription/refund/dispute
handling) silently inert.

## PR #173 — eliminate stale-flag payout blocks (trust-true / verify-false)

- New `_shared/payout-ready.ts` → `verifyPayoutReady(stripe, accountId, cachedComplete)`
  returns `{ready, corrected}`. **"Trust true, verify false":** trusts a cached `true`
  (Stripe never spontaneously un-enables an account), but re-verifies a cached `false`/`null`
  against `stripe.accounts.retrieve` before letting it block money. `corrected=true` tells
  the caller to write the flag back. Applied at every payout gate: `boost-payment`,
  `_shared/fulfill-boost.ts`, `release-creator-payout`, `release-sponsorship-payout`.
- `stripe-webhook` `account.updated` handler extended to sync **`org_units`** too
  (creator_profiles + business_profiles + org_units, idempotent `Promise.all` by
  `stripe_account_id`) — org_units (the real restaurant-location payout path) was never synced.
- Deployed `boost-payment` + `release-creator-payout`; **deferred** `release-sponsorship-payout`
  and `stripe-webhook` (the latter's changes only run via the webhook, which was dead).

## PR #174 — verify against platform + Connect signing secrets (dual-secret)

The handler processes **two scopes** of events:
- **Platform** ("Your account"): `checkout.session.completed`, subscriptions, invoices,
  charges, `transfer.updated`.
- **Connect** ("Connected accounts"): `account.updated` (a connected account's
  onboarding/capability change).

In Stripe these are **separate webhook endpoints, each with its own signing secret**, but
the function verified against a single `STRIPE_WEBHOOK_SECRET` — so events from the other
endpoint could never pass signature verification (they'd 400). Fix:
- New pure, vitest-tested `_shared/webhook-secrets.ts` → `webhookSigningSecrets()` collects
  `STRIPE_WEBHOOK_SECRET` + optional `STRIPE_CONNECT_WEBHOOK_SECRET` in priority order
  (trimmed, de-duped).
- The handler verifies each event against the configured secrets in turn — **first match
  wins** (platform first; `account.updated` matches the Connect secret on the second pass).
- **Backward compatible:** with only `STRIPE_WEBHOOK_SECRET` set, behaviour is identical.
- Codex second review clean. Merged; the deploy also carried the deferred #173
  `stripe-webhook` changes.

## Deploy + verification (MCP)

- Deployed `stripe-webhook` via the Supabase MCP `deploy_edge_function` (preserve
  `verify_jwt=false`), bundling the full transitive `_shared` closure (7 files).
- **Byte-diff verified** the deployed source against the worktree via `get_edge_function`
  (caught a 1-char box-drawing dash drift in a comment on a re-paste — cosmetic only).
- **Warm-isolate gotcha:** after the operator set the Supabase edge secret, the probe still
  returned `500 "Webhook secret not configured"` because a warm function isolate (booted
  before the secret existed, kept alive by repeated probes) held stale env. A **redeploy**
  forced fresh isolates that read current secrets → probe flipped to the correct
  `400 "No signatures found…"`. (Supabase normally injects edge secrets at runtime without a
  redeploy; a redeploy is the reliable forcing function when a warm isolate is stale.)

## Operational config (founder dashboard)

- The **Stripe MCP toolkit does NOT expose webhook-endpoint management** (`PostWebhookEndpoints`
  unavailable; searches for "webhook"/"event destination" empty) — endpoints must be created
  in the Stripe Dashboard.
- The new Stripe **Workbench removed the in-dashboard "Send test event"** button; it now
  routes to the Stripe CLI (`stripe login` + `stripe trigger <event>`).
- A **Connect endpoint is just an endpoint with "Events from: Connected accounts"** — there is
  no separate "connect secret" concept; each endpoint has its own signing secret.
- ⚠️ **Payload style must be Snapshot, not Thin.** This handler reads `event.data.object`
  (the full snapshot/classic event); **Thin** (v2 event-destination) events deliver only IDs
  and are incompatible. A mistakenly-created Thin Connect endpoint was flagged for deletion.
- ⚠️ **Supabase Vault ≠ Edge Function Secrets.** Only Edge Function Secrets are injected as
  `Deno.env`. Putting the signing secret in the Vault leaves the function blind to it (a
  persistent `500`).
- Final state: two snapshot endpoints — platform (`STRIPE_WEBHOOK_SECRET`) + Connect
  `account.updated` (`STRIPE_CONNECT_WEBHOOK_SECRET`) — both wired; the platform half is the
  high-value one (PR #173's reactive verify already covers stale flags, so the Connect
  real-time sync is a bonus).

## Verdict

"Option A — call it verified": the probe proves the secret is loaded and signature
verification is active (a bad signature returns the correct `400`, a misconfigured setup
returns `500`). A literal `200` on a synthetic event needs the CLI (`stripe trigger`); judged
optional given the probe + byte-verified code.

## Affected files / functions

- `supabase/functions/_shared/webhook-secrets.ts` (new) + `.test.ts`
- `supabase/functions/_shared/payout-ready.ts` (new, #173) + `.test.ts`
- `supabase/functions/stripe-webhook/index.ts` (dual-secret verify + org_units sync)
- `supabase/functions/_shared/fulfill-boost.ts`, `release-creator-payout`,
  `release-sponsorship-payout`, `boost-payment` (verifyPayoutReady)
- Deployed: `stripe-webhook` v156 (MCP). Still deferred: `release-sponsorship-payout` deploy
  (low-urgency, no live traffic pre-revenue).
