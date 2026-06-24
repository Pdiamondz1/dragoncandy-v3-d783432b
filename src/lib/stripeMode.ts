// Stripe test-mode detection for the frontend.
//
// The Stripe *publishable* key is a PUBLIC value (safe to ship in client code).
// Lovable's build does not reliably inject custom `VITE_` env vars into the
// frontend bundle, so when `VITE_STRIPE_PUBLISHABLE_KEY` is absent we fall back
// to the known test publishable key — mirroring the `VITE_SUPABASE_URL` +
// fallback pattern already used in `integrations/supabase/client.ts`.
//
// ⚠️ GO-LIVE LEVER: this fallback is a `pk_test_` key, so a deployment with NO
// injected env var is treated as TEST mode (correct pre-launch). When switching
// to live payments you MUST flip this off, EITHER by injecting a real
// `pk_live_…` value as `VITE_STRIPE_PUBLISHABLE_KEY` (it overrides the fallback)
// OR by changing this constant — otherwise a live site would render test-mode
// helper UI. Going live is already a gated, approval-required step (see
// CLAUDE.md "Stripe test mode only"); add this to that checklist.
const FALLBACK_PUBLISHABLE_KEY =
  'pk_test_51SkFixJi7lqzzhdMKFYEBrKqmG0GhI1tBleC4Hw5x2doJL532AvXc3u1wPfFowtLUO8bPvmZme91hrMQthYkiEqQ00MxRx41yB';

export const STRIPE_PUBLISHABLE_KEY =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

/** True when the app is running against Stripe test mode (publishable key is `pk_test_`). */
export const isStripeTestMode = STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_');
