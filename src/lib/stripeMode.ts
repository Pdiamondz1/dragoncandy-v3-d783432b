// Stripe test-mode detection for the frontend.
//
// The Stripe *publishable* key is a PUBLIC value (safe to ship in client code).
// Lovable's build does not reliably inject custom `VITE_` env vars into the
// frontend bundle, so when `VITE_STRIPE_PUBLISHABLE_KEY` is absent we fall back
// to the known test publishable key — mirroring the `VITE_SUPABASE_URL` +
// fallback pattern already used in `integrations/supabase/client.ts`. A real
// `pk_live_…` env var (set at go-live) overrides the fallback, so this flips to
// false automatically in production-live.
const FALLBACK_PUBLISHABLE_KEY =
  'pk_test_51SkFixJi7lqzzhdMKFYEBrKqmG0GhI1tBleC4Hw5x2doJL532AvXc3u1wPfFowtLUO8bPvmZme91hrMQthYkiEqQ00MxRx41yB';

export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

/** True when the app is running against Stripe test mode (publishable key is `pk_test_`). */
export const isStripeTestMode = STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_');
