/**
 * DEMO_SCALE mode gate — the app-side switch for the "DragonCandy at 1M DAU" standup demo.
 *
 * Returns true ONLY when BOTH hold:
 *   1. the build flag VITE_DEMO_SCALE === '1', AND
 *   2. the configured Supabase project is NOT prod.
 *
 * The prod-ref check is a hard, independent off-switch: if the flag ever leaks onto a prod build,
 * or the Supabase URL is unset (which falls back to prod at runtime in client.ts), DEMO mode stays
 * inert. This is what makes the demo impossible to render against production — do not weaken it.
 */
const PROD_PROJECT_REF = 'zocahiffooqdybdhguqv';

export function isDemoScale(): boolean {
  if (import.meta.env.VITE_DEMO_SCALE !== '1') return false;
  const url = import.meta.env.VITE_SUPABASE_URL ?? '';
  if (url === '' || url.includes(PROD_PROJECT_REF)) return false;
  return true;
}
