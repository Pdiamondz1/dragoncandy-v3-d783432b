/**
 * Number formatting for the deck.
 *
 * Separate from `components.tsx` because a file that exports both components and plain
 * functions breaks React Fast Refresh — and because the bundle-verification script
 * imports `money()` to build its needles, and should not have to pull a React module
 * into a Node process to do it.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

export function money(n: number): string {
  return usd.format(Math.round(n));
}

/** $27.8K / $2.4M — for figures too wide to print in full on a slide. */
export function moneyShort(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(abs >= 100_000 ? 0 : 1)}K`;
  return money(n);
}

export function count(n: number): string {
  return new Intl.NumberFormat('en-US').format(Math.round(n));
}

export function pct(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}
