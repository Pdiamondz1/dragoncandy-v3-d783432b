/**
 * AI-cost cap status for the /internal Overview "AI spend" card (Slice C of the
 * spend source-of-truth work). Computes the live cap from MTD revenue + the
 * pre-revenue floor and classifies month-to-date RUNTIME spend against it.
 *
 * Scope: `mtdSpendUsd` must be the runtime serving cost (donny_cost_ledger via
 * aios_cost_stats) — NOT the founder's dev/Claude-Code AI usage, which is opex.
 * Mirrors the ai-cost-vs-cap playbook: cap = max($250 floor, 15% of revenue),
 * watch at ≥80% of cap, breach above 100%.
 */
export const AI_COST_FLOOR_USD = 250;
export const AI_COST_CAP_PCT = 0.15;

export type AiCapStatus = 'green' | 'watch' | 'breach';

export interface AiCapResult {
  capUsd: number;
  basis: 'floor' | 'revenue';
  /** spend / cap (0 when cap is 0). */
  ratio: number;
  status: AiCapStatus;
  headroomUsd: number;
}

export function aiCapStatus(mtdSpendUsd: number, mtdRevenueUsd: number): AiCapResult {
  const revenueCap = AI_COST_CAP_PCT * Math.max(0, mtdRevenueUsd);
  const capUsd = Math.max(AI_COST_FLOOR_USD, revenueCap);
  const basis: AiCapResult['basis'] = revenueCap > AI_COST_FLOOR_USD ? 'revenue' : 'floor';
  const ratio = capUsd > 0 ? mtdSpendUsd / capUsd : 0;
  const status: AiCapStatus = ratio > 1 ? 'breach' : ratio >= 0.8 ? 'watch' : 'green';
  return { capUsd, basis, ratio, status, headroomUsd: capUsd - mtdSpendUsd };
}
