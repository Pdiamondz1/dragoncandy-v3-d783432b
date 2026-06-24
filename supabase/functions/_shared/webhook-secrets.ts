// Pure Stripe webhook signing-secret resolution. NO imports (must stay vitest-importable).
//
// DragonCandy points TWO Stripe webhook endpoints at the single stripe-webhook function:
//   - a platform ("Your account") endpoint        → STRIPE_WEBHOOK_SECRET
//     (checkout.session.completed, subscriptions, invoices, charges, transfers, …)
//   - a Connect ("Connected accounts") endpoint    → STRIPE_CONNECT_WEBHOOK_SECRET
//     (account.updated — the connected account's onboarding/capability changes)
// Each Stripe endpoint signs with its OWN secret, so an incoming event must be verified
// against whichever secret matches. The handler tries these in order; the first that
// verifies wins (platform first, since it carries the vast majority of events).
//
// Backward compatible: with only STRIPE_WEBHOOK_SECRET set, this returns a single-element
// list and behaviour is identical to the original single-secret verification.
export function webhookSigningSecrets(env: {
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_CONNECT_WEBHOOK_SECRET?: string;
}): string[] {
  const ordered = [env.STRIPE_WEBHOOK_SECRET, env.STRIPE_CONNECT_WEBHOOK_SECRET]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length > 0);
  // De-duplicate: the same secret configured for both endpoints should be tried once.
  return [...new Set(ordered)];
}
