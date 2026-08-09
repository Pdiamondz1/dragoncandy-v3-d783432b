// 24-hour localStorage dismissal, keyed on the PROPOSAL id.
//
// Deliberately not the old `pendingBannerDismissed_${campaignId}` key: that one
// was campaign-scoped, so dismissing an "applied" prompt also hid the
// "submitted content" prompt for the same campaign and Donny went quiet about
// delivered work. The separate prefix also means dismissing here does not
// silence the banner on /dashboard/business/overview, which is still live.
import { dismissalKey } from './buildDonnyProposals';

const TTL_MS = 24 * 60 * 60 * 1000;

/** Ids dismissed within the TTL. Returns [] if localStorage is unavailable. */
export function readDismissedProposalIds(candidateIds: string[]): string[] {
  const out: string[] = [];
  for (const id of candidateIds) {
    try {
      const raw = localStorage.getItem(dismissalKey(id));
      if (!raw) continue;
      if (Date.now() - new Date(raw).getTime() < TTL_MS) out.push(id);
    } catch {
      return [];
    }
  }
  return out;
}

export function writeDismissedProposalId(id: string): void {
  try {
    localStorage.setItem(dismissalKey(id), new Date().toISOString());
  } catch {
    /* localStorage unavailable — dismissal is session-only, which is fine */
  }
}
