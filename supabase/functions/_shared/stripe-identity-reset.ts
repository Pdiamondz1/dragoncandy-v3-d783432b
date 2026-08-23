/**
 * The column set that must be cleared whenever a Stripe account stops being attached to a
 * DragonCandy row — by an explicit user disconnect, or by us discovering the account no
 * longer exists at Stripe.
 *
 * Why this is shared rather than written out at each site: the identity columns have a
 * PRODUCER (stripe-webhook, the only writer of identity_verified_at) and they need an
 * ERASER at every detach path. Shipping the producer without a complete set of erasers is
 * how the same defect appeared five separate times on this branch — phone, address,
 * identity-on-disconnect, identity-on-revocation, and finally identity-on-auto-detach, the
 * last of which was found by the Codex second review precisely because the manual
 * disconnect path had been fixed in isolation and the automatic one had not.
 *
 * The rule underneath all five: a verification stamp must never outlive the fact it
 * attests to. A reconnected account can be a DIFFERENT LEGAL ENTITY, so a surviving stamp
 * does not merely go stale — it vouches for a party Stripe never verified, which is the
 * exact failure this whole slice exists to prevent.
 *
 * All four Stripe-derived signals are cleared together, never just identity_verified_at:
 * leaving tax_id_provided / stripe_requirements_due / stripe_disabled_reason behind would
 * describe an account that no longer exists.
 *
 * Spread this into the same `.update()` that nulls `stripe_account_id`, so the detach and
 * the reset are one statement and cannot half-apply.
 */
export const STRIPE_IDENTITY_RESET = {
  identity_verified_at: null,
  tax_id_provided: null,
  stripe_requirements_due: null,
  stripe_disabled_reason: null,
} as const;
