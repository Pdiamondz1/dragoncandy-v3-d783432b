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

### 4.1 One Stripe customer per org, with a saved card

New shared helper: `supabase/functions/_shared/stripe-customer.ts`

```
getOrCreateOrgCustomer(stripe, supabase, orgId, email) -> customerId
```

- Reads `organizations.stripe_customer_id`. If present, returns it.
- Otherwise lists customers by email (reuse if found) or creates a new
  customer with `metadata: { org_id }`, then **persists** the id to
  `organizations.stripe_customer_id`.

`create-campaign-escrow` and `create-sponsorship-checkout`:
- Resolve the paying org for the authenticated user and use the helper so all
  three flows converge on the **same** Stripe customer.
- Add `payment_intent_data.setup_future_usage: 'off_session'` so the card used
  to pay a campaign/sponsorship is **saved** to the customer for reuse.

> Open implementation detail to verify: the mapping from the campaign/
> sponsorship-owning user to their org. The boost flow already resolves
> `membership.org_id` via `org_members`. Escrow uses `campaign.user_id`. The
> implementation must resolve the same org for the same business so the saved
> card is shared. If a clean user→org resolution does not exist for the escrow
> path, anchor on the org that owns the campaign.

### 4.2 Boost becomes two-path

`boost-payment/index.ts`:

1. Resolve the org customer via `getOrCreateOrgCustomer`.
2. Determine whether a reusable card exists (customer
   `invoice_settings.default_payment_method`, or a listed card payment method).
3. **Card on file →** confirm a PaymentIntent `off_session` against the saved
   card (today's one-tap behavior). On success, fulfill (see 4.4).
   - If the off-session charge returns `requires_action` /
     `authentication_required`, fall back to path 4 (hosted checkout).
4. **No card on file →** create a Stripe hosted Checkout session
   (`mode: 'payment'`, `setup_future_usage: 'off_session'`, customer set,
   metadata `{ type: 'dragonshare_boost', boost_id, post_id, creator_id,
   boosting_org_id }`) and return `{ checkout_url }`. The boost row is left in
   `pending`; fulfillment happens in the webhook on completion.

`BoostConfirmationSheet.tsx`:
- On `boost-payment` response, if a `checkout_url` is returned, open it in a
  pre-opened blank tab (same anti-popup-blocker pattern as
  `useSponsorshipPayment`). Otherwise keep the existing success toast.
- Preserve the existing `CREATOR_PAYOUT_NOT_READY` (202) handling.

### 4.3 Webhook finishes a boost paid via checkout

`stripe-webhook/index.ts`, in `checkout.session.completed` (only when
`payment_status === 'paid'`): add a branch for
`metadata.type === 'dragonshare_boost'` that runs boost fulfillment (4.4).
Optionally set the customer's `invoice_settings.default_payment_method` from
the session's payment method so the next boost is one-tap.

Existing boost failure handling (`payment_intent.payment_failed`,
`transfer.updated` reversed) is unchanged.

### 4.4 Shared boost fulfillment

Extract the post-charge logic currently inline in `boost-payment`
(transfer to creator, insert `dragonshare_payouts`, update
`dragonshare_boosts` to `transferred`, set post `boost_status = 'boosted'`,
fire the social hook) into `supabase/functions/_shared/fulfill-boost.ts`.
Used by **both** the off-session path (4.2 step 3) and the webhook (4.3) so
there is exactly one fulfillment code path. Keep transfer idempotency keys
(`boost_tr_${boostId}`).

### 4.5 Test-mode clarity note (frontend)

A small informational note on the payment-trigger and boost surfaces:

> Test mode — pay with card `4242 4242 4242 4242` (any future expiry, any CVC).
> Your linked test bank accounts are payout accounts and won't appear here.

- Shown only in test mode (gate on the publishable key prefix `pk_test_` or an
  existing env/flag).
- Built for **both** desktop (`lg:` classes) and mobile (base classes) per the
  design system. Use teal (`dc-teal`) styling — **never gray**.

## 5. Data Flow

- **First boost ever:** Confirm Boost → no card → hosted checkout tab →
  pay + save card → webhook transfers payout to creator → post `boosted`.
- **Every boost after:** Confirm Boost → off-session charge on saved card →
  instant fulfillment.
- **Campaign / sponsorship:** unchanged hosted checkout, now also saves the
  card so a subsequent boost is one-tap with zero extra setup.

## 6. Error Handling & Idempotency

- Boost row creation via `create_boost` RPC; transfers use idempotency keys.
- Webhook idempotent via `stripe_webhook_events` PK claim (existing).
- Off-session `authentication_required` → graceful fallback to hosted checkout.
- Hosted-checkout abandonment / failure handled by existing
  `checkout.session.expired` and `payment_intent.payment_failed` branches
  (extend the boost branch to reset the boost row to `failed`/`pending` as
  appropriate).

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
