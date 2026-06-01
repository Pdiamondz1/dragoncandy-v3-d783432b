export const BOOST_MIN_CENTS = 500;
export const BOOST_MAX_CENTS = 50000;

export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export function validateCustomBoost(dollars: number):
  | { ok: true; cents: number }
  | { ok: false; reason: string } {
  if (!Number.isFinite(dollars)) return { ok: false, reason: 'Enter an amount' };
  const cents = dollarsToCents(dollars);
  if (cents < BOOST_MIN_CENTS) return { ok: false, reason: 'Minimum is $5' };
  if (cents > BOOST_MAX_CENTS) return { ok: false, reason: 'Maximum is $500' };
  return { ok: true, cents };
}
