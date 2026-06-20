// Shared time formatting for Donny chat bubbles and date dividers.
// All helpers guard against missing/invalid timestamps by falling back to now,
// mirroring the `new Date(msg.created_at ?? Date.now())` idiom used elsewhere.

function toDate(iso?: string | null): Date {
  const d = iso ? new Date(iso) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/** e.g. "2:34 PM" */
export function formatBubbleTime(iso?: string | null): string {
  return toDate(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "Today" / "Yesterday", else e.g. "Jun 20, 2026" */
export function formatDateDivider(iso?: string | null): string {
  const d = toDate(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

/** True when both timestamps fall on the same calendar day. */
export function isSameDay(aIso?: string | null, bIso?: string | null): boolean {
  return toDate(aIso).toDateString() === toDate(bIso).toDateString();
}

/**
 * True when the message at `index` opens a new day group. Compares against the
 * previous VISIBLE message — `tool` rows are hidden (DonnyMessage renders null),
 * so they must not anchor the comparison or a real day boundary gets skipped
 * when a tool row sits just before the first message of a new day.
 */
export function startsNewDayGroup(
  messages: { role: string; created_at?: string | null }[],
  index: number,
): boolean {
  const curr = messages[index];
  if (!curr || curr.role === 'tool') return false;
  for (let j = index - 1; j >= 0; j--) {
    if (messages[j].role !== 'tool') {
      return !isSameDay(messages[j].created_at, curr.created_at);
    }
  }
  return true; // no prior visible message → first group
}
