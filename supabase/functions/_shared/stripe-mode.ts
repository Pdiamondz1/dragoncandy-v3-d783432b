// Pure Stripe-mode detection. NO imports (must stay vitest-importable).
export function isTestKey(stripeKey: string): boolean {
  return typeof stripeKey === 'string' && stripeKey.startsWith('sk_test_');
}
