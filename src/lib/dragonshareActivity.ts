export interface DSBoostRow {
  status: string;
  creator_payout_cents: number | null;
  transferred_at: string | null;
}

export interface DSPostRow {
  id: string;
  content_type: string;
  submitted_at: string;
  boost_status: string;
  declined_at: string | null;
  boosts: DSBoostRow[];
}

export interface DSActivityItem {
  kind: 'submitted' | 'paid' | 'not_selected';
  postId: string;
  contentType: string;
  timestamp: string;
  payoutCents?: number;
}

export interface DSBusinessPostRow {
  id: string;
  content_type: string;
  submitted_at: string;
  boost_status: string;
  declined_at: string | null;
}

export interface DSBoostMadeRow {
  post_id: string;
  amount_cents: number;
  transferred_at: string | null;
  created_at?: string;
}

function sortNewestFirst(items: DSActivityItem[]): DSActivityItem[] {
  return [...items].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

function toCreatorItem(row: DSPostRow): DSActivityItem {
  if (row.boost_status === 'boosted') {
    const boost = row.boosts.find((b) => b.status === 'transferred');
    return {
      kind: 'paid',
      postId: row.id,
      contentType: row.content_type,
      timestamp: boost?.transferred_at ?? row.submitted_at,
      payoutCents: boost?.creator_payout_cents ?? 0,
    };
  }
  if (row.declined_at) {
    return {
      kind: 'not_selected',
      postId: row.id,
      contentType: row.content_type,
      timestamp: row.declined_at,
    };
  }
  return {
    kind: 'submitted',
    postId: row.id,
    contentType: row.content_type,
    timestamp: row.submitted_at,
  };
}

export function deriveCreatorActivity(rows: DSPostRow[]): DSActivityItem[] {
  return sortNewestFirst(rows.map(toCreatorItem));
}

export function deriveBusinessActivity(
  awaiting: DSBusinessPostRow[],
  boostsMade: DSBoostMadeRow[],
): DSActivityItem[] {
  const submitted: DSActivityItem[] = awaiting
    .filter((p) => p.boost_status === 'available' && !p.declined_at)
    .map((p) => ({
      kind: 'submitted',
      postId: p.id,
      contentType: p.content_type,
      timestamp: p.submitted_at,
    }));
  const paid: DSActivityItem[] = boostsMade.map((b) => ({
    kind: 'paid',
    postId: b.post_id,
    contentType: '',
    timestamp: b.transferred_at ?? b.created_at ?? '',
    payoutCents: b.amount_cents,
  }));
  return sortNewestFirst([...submitted, ...paid]);
}
