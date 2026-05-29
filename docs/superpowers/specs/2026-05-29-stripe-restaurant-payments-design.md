# Reliable Restaurant → Creator Payments — Design Spec

> Date: 2026-05-29
> Status: Draft for review
> Author: Claude Code (brainstorming session with Dame)

## 1. Problem

A restaurant test user (`joe-coalition@gmail.com`) reported "trouble paying
creators in campaigns and DragonShare." The presenting symptom was that when
he reaches the Stripe payment screen and chooses **Link**, his linked test
payment accounts do not appear — only his personal credit card.

Investigation of the screenshot and the payment code revealed two **distinct**
issues, only one of which matches the user's mental model:

### 1a. DragonShare boosts cannot charge anything (functional bug)

`supabase/functions/boost-payment/index.ts` creates a PaymentIntent with
`automatic_payment_methods: { enabled: true, allow_redirects: "never" }` and
`confirm: true`, but supplies **no payment method**. It charges
`customer: org?.stripe_customer_id ?? undefined`.

- Only the subscription flow (`create-checkout-session`) ever persists
  `organizations.stripe_customer_id`. Campaign escrow and sponsorship checkout
  look the customer up by email and do **not** store it on the org.
- A restaurant that has only set up payouts (Stripe Connect) — like Joe — has
  no `stripe_customer_id` on the org and no saved card. The PaymentIntent
  therefore has no payment method to confirm and **fails**.

There is no Stripe payment UI in the boost flow at all — it is a one-tap
"Confirm Boost" sheet (`BoostConfirmationSheet.tsx`) that calls the edge
function directly. So the boost failure is silent from the user's perspective
("Boost failed") and unrelated to Link.

### 1b. Link confusion on hosted checkout (cosmetic, test-mode only)

Campaign escrow (`create-campaign-escrow`) and sponsorship
(`create-sponsorship-checkout`) use **Stripe hosted Checkout** (`mode: payment`)
opened in a new tab. That page shows Link + card. The user's linked "test
payment accounts" shown in the screenshot are **Stripe Connect external/payout
accounts** — where the restaurant *receives* money. They are on the receiving
side of Stripe and will **never** appear as payment methods when the restaurant
*pays*. Link correctly shows the payer's own saved card.

**This cannot be "fixed" by adding accounts to Link.** Link is the payer's
consumer wallet, owned and controlled by Stripe and tied to the payer's
email/phone. There is no platform API to inject payment methods into a user's
Link wallet, and payout accounts would never belong there regardless.

## 2. Goals

1. A restaurant can reliably pay a creator via campaign escrow, sponsorship,
   and DragonShare boost — without the "no payment method" failure.
2. Repeat boosts stay one-tap (serves the North Star: less typing = more
   margin).
3. The test-mode Link confusion is eliminated through expectation-setting,
   not by removing Link.

## 3. Non-Goals (YAGNI)

- **Removing Link** from hosted checkout. Link benefits production (returning
  payers skip retyping). The confusion is test-mode only.
- **ACH / pay-by-bank** as a payment method. ACH settlement delays would break
  instant creator payouts; nobody is blocked on this.
- **Inline Stripe Elements** in the boost sheet. The pre-opened-tab hosted
  checkout pattern is already proven in `useEscrowCheckout` /
  `useSponsorshipPayment`; reuse it.

## 4. Design

### 4.1 One Stripe customer per org, with a saved default card

New shared helper: `supabase/functions/_shared/stripe-customer.ts`

```
getOrCreateOrgCustomer(stripe, supabase, orgId, email) -> customerId
```

- Reads `organizations.stripe_customer_id`. **If present, returns it** (this is
  the single canonical anchor).
- If null: list customers by `email` and reuse the first match if found;
  otherwise `stripe.customers.create({ email, metadata: { org_id } })`. Either
  way, **persist** the id to `organizations.stripe_customer_id` so all flows
  converge.

> **Reconciliation note.** Today only `create-checkout-session` (subscription)
> persists `stripe_customer_id`, and it does so without email dedup; escrow and
> sponsorship look up by email and never persist. The result is that a single
> org can already hold two Stripe customers. After this change, the persisted
> `organizations.stripe_customer_id` is authoritative for all new payments. We
> do **not** attempt to merge pre-existing duplicate customers (test mode,
> pre-revenue — not worth it); we just stop creating divergence going forward.

**Org resolution is concrete (no longer "to verify"):**
- `campaigns` already has an auto-populated `org_id` column (trigger
  `trg_campaigns_auto_org_fn`, security definer). `create-campaign-escrow`
  selects `campaign.org_id` and anchors the customer there.
- The boost flow already resolves the restaurant's org as
  `membership.org_id` on `post.target_org_id`. For a restaurant, the campaign
  it owns (`campaign.org_id`) and the org it boosts from (`target_org_id`) are
  the **same** org, so the card saved during a campaign payment is found during
  a boost. This is the load-bearing guarantee and it holds.
- `create-sponsorship-checkout` is a brand flow (brand role currently hidden
  behind a flag). It resolves the brand's org via the same helper when an org
  is resolvable; if none, it falls back to the current email-based customer
  (no regression). Cross-flow card reuse is only *required* restaurant-side.

Both `create-campaign-escrow` and `create-sponsorship-checkout`:
- Use `getOrCreateOrgCustomer`.
- Add `payment_intent_data.setup_future_usage: 'off_session'` so the card is
  **attached** to the customer for reuse.
- Note: `setup_future_usage` attaches the card but does **not** make it the
  default. Setting the default payment method happens in the webhook on
  `checkout.session.completed` (see §4.3) so the off-session boost path has a
  deterministic card to charge.

### 4.2 Boost becomes two-path

`boost-payment/index.ts`:

1. Resolve the org customer via `getOrCreateOrgCustomer`.
2. **Concurrent-pending guard — runs BEFORE the `create_boost` RPC.** Check for
   an existing `dragonshare_boosts` row for this `post_id` + `boosting_org_id`
   with `status = 'pending'`. (`post.boost_status` stays `'available'` while a
   checkout is pending, so the `create_boost` guard alone would let a double-tap
   insert a second pending row — this explicit check, ordered first, is what
   prevents it.)
   - **If a pending row exists →** do **not** call `create_boost` or mint a
     second boost. Instead **regenerate** a fresh hosted Checkout session for
     that same boost row and return its `checkout_url`. This avoids the
     trap where an abandoned checkout (Stripe's `checkout.session.expired`
     can take up to ~24h to fire) would otherwise block the user from
     retrying. The user always gets a working URL; fulfillment is still keyed
     to the single pending boost row.
   - **If none exists →** call `create_boost` (status `pending`) and continue.
3. Resolve the reusable card: read `customer.invoice_settings.
   default_payment_method`; if absent, `customer.listPaymentMethods({ type:
   'card' })` and take the first. Capture the concrete `pm_...` id. (The
   `listPaymentMethods` fallback also covers the race where a user completes a
   card-saving checkout and immediately re-boosts before the webhook has set
   the default — the freshly attached card is still found.)
4. **Card on file →** create + confirm a PaymentIntent with an **explicit**
   `payment_method: pm_id`, `off_session: true`, `confirm: true`, `customer`.
   Do **not** pass `automatic_payment_methods` when pinning a payment method.
   On success, fulfill (see §4.4). One tap, no UI.
   - If Stripe throws `authentication_required` (or the PI comes back
     `requires_action`), fall back to path 5.
5. **No card on file (or off-session needs auth) →** create a Stripe hosted
   Checkout session (`mode: 'payment'`, `customer`,
   `payment_intent_data.setup_future_usage: 'off_session'`, metadata
   `{ type: 'dragonshare_boost', boost_id, post_id, creator_id,
   boosting_org_id }`) and return `{ checkout_url }`. The boost row stays
   `pending`; `post.boost_status` stays `available`; fulfillment happens in the
   webhook on completion (§4.3).

> Why no off-session "today" behavior: the current code passes `customer` +
> `confirm` with **no `payment_method`**, which is exactly why it fails. The
> fix is the explicit `payment_method` + `off_session` in step 4 — there is no
> working one-tap path to preserve.

`BoostConfirmationSheet.tsx`:
- On `boost-payment` response:
  - If `checkout_url` is returned → open it in a pre-opened blank tab (same
    anti-popup-blocker pattern as `useSponsorshipPayment`) and show a
    **"Complete payment in the new tab"** toast — **not** the success toast
    (money has not moved yet).
  - If a success payload is returned (off-session charge already settled) →
    keep the existing "Boost confirmed! $X is on its way" toast.
- Preserve the existing `CREATOR_PAYOUT_NOT_READY` (202) handling.

### 4.3 Webhook finishes a boost + sets the default card

`stripe-webhook/index.ts`, in `checkout.session.completed` (only when
`payment_status === 'paid'`):

- **Set the default payment method (all checkout types).** Whenever a session
  saved a card (escrow, sponsorship, or boost — all now use
  `setup_future_usage: 'off_session'`), read the resulting payment method
  (retrieve the session's PaymentIntent → `payment_method`) and set it as the
  customer's `invoice_settings.default_payment_method` **if the customer has no
  default yet**. This is what makes the *next* boost deterministically one-tap.
  This is **required**, not optional.
- **New boost branch.** For `metadata.type === 'dragonshare_boost'` with
  `metadata.boost_id`, run boost fulfillment (§4.4), guarded for idempotency
  (skip if the boost row is already `transferred`).

Add a boost branch to `checkout.session.expired` (currently has none): set the
`dragonshare_boosts` row `status = 'failed'` where it is still `pending`, and
write a `dragonshare_events` `boost_failed` record. `post.boost_status` is
already `available`, so nothing to revert there.

Existing boost failure handling (`payment_intent.payment_failed`,
`transfer.updated` reversed) is unchanged.

### 4.4 Shared boost fulfillment

Extract the post-charge logic currently inline in `boost-payment`
(transfer to creator, insert `dragonshare_payouts`, update
`dragonshare_boosts` to `transferred`, set post `boost_status = 'boosted'`,
fire the social hook) into `supabase/functions/_shared/fulfill-boost.ts`.
Used by **both** the off-session path (4.2 step 4) and the webhook (4.3) so
there is exactly one fulfillment code path. Keep transfer idempotency keys
(`boost_tr_${boostId}`).

### 4.5 Test-mode clarity note (frontend)

A small informational note shown **only in test mode** (gate on publishable key
prefix `pk_test_`), placed on surfaces where the user is **about to enter card
details** — i.e. the campaign/sponsorship pay triggers and the **first-boost
(no-card) confirmation** before the hosted-checkout redirect:

> Test mode — you'll pay with card `4242 4242 4242 4242` (any future expiry,
> any CVC). Your linked test bank accounts are payout accounts and won't appear
> here.

- **Do not** show the "use 4242" instruction on the one-tap (card-on-file)
  boost path — there is no card field there, so it would confuse. The note is
  conditional on the no-card / checkout-bound path.
- Built for **both** desktop (`lg:` classes) and mobile (base classes) per the
  design system. Use teal (`dc-teal`) styling — **never gray**.
- The hosted Stripe checkout already shows Stripe's own test-mode banner, so
  the in-app note is purely to pre-empt the payout-account confusion.

## 5. Data Flow

- **First boost ever:** Confirm Boost → no card → hosted checkout tab →
  pay + save card → webhook transfers payout to creator → post `boosted`.
- **Every boost after:** Confirm Boost → off-session charge on the customer's
  default card → instant fulfillment.
- **Campaign / sponsorship:** unchanged hosted checkout, now saves the card and
  the webhook sets it as the customer default — so a subsequent boost on the
  same org is one-tap with zero extra setup.

## 6. Boost State Machine & Idempotency

Boost row (`dragonshare_boosts.status`) and post (`dragonshare_posts.
boost_status`, enum `available|boosted|expired|withdrawn`) transitions:

| Event | boost.status | post.boost_status |
|-------|-------------|-------------------|
| `create_boost` RPC (requires post `available`) | `pending` | `available` |
| Off-session charge succeeds | `transferred` | `boosted` |
| Hosted checkout opened | `pending` | `available` (unchanged) |
| Re-tap while `pending` (retry) | `pending` (same row; new checkout session) | `available` (unchanged) |
| `checkout.session.completed` (fulfill) | `transferred` | `boosted` |
| `checkout.session.expired` (slow, ~24h) | `failed` | `available` (unchanged) |
| `payment_intent.payment_failed` | `failed` | `available` |
| `transfer.updated` reversed | `failed` | `available` |

- **No new enum value needed.** `post.boost_status` stays `available` during a
  pending checkout; the concurrent-pending guard (§4.2 step 2) — not the
  `create_boost` check — is what prevents duplicate pending boosts.
- Transfers use idempotency keys (`boost_tr_${boostId}`, existing).
- Webhook idempotent via `stripe_webhook_events` PK claim (existing); boost
  fulfillment additionally skips if the boost row is already `transferred`.
- Off-session `authentication_required` → graceful fallback to hosted checkout
  (§4.2 step 4 → 5).

## 7. Testing & Verification

- `npm run build` and `npm run typecheck` pass before push.
- Deploy edge functions; configure webhook to receive
  `checkout.session.completed` for boosts (already subscribed to the event).
- On dragoncandy.io after Lovable deploy, using the provided test logins:
  - Restaurant pays a campaign escrow via hosted checkout (test card 4242) —
    verify escrow held, card saved.
  - Restaurant boosts a DragonShare post with **no** prior card → hosted
    checkout tab → verify creator payout transfer and post `boosted`.
  - Restaurant boosts again → verify one-tap off-session charge.
  - Screenshot each; open Chrome DevTools and confirm no console errors.
  - Test both **desktop and mobile** viewports for the test-mode note and
    boost sheet.
- Do not move to the next step until each passes (95% confidence gate).

## 8. Affected Files

- `supabase/functions/_shared/stripe-customer.ts` (new)
- `supabase/functions/_shared/fulfill-boost.ts` (new)
- `supabase/functions/boost-payment/index.ts`
- `supabase/functions/create-campaign-escrow/index.ts`
- `supabase/functions/create-sponsorship-checkout/index.ts`
- `supabase/functions/stripe-webhook/index.ts`
- `src/components/dragonshare/BoostConfirmationSheet.tsx`
- A frontend test-mode note component (new) + its placements
