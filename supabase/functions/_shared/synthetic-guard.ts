// Never settle REAL money to/from a synthetic user. Test mode is allowed
// (bots use test-mode Connect); live mode refuses.
export function shouldRefuseSettlement(p: { isTestMode: boolean; isSynthetic: boolean }): boolean {
  return !p.isTestMode && p.isSynthetic;
}
