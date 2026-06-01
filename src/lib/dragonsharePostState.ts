interface MinimalPost {
  boost_status: string;
  declined_at: string | null;
  boosts?: { status: string; creator_payout_cents: number }[];
}
export type CreatorPostState =
  | { kind: 'paid'; payoutCents: number }
  | { kind: 'declined' }
  | { kind: 'pending' };

export function deriveCreatorPostState(post: MinimalPost): CreatorPostState {
  const transferred = post.boosts?.find((b) => b.status === 'transferred');
  if (post.boost_status === 'boosted' && transferred) {
    return { kind: 'paid', payoutCents: transferred.creator_payout_cents };
  }
  if (post.declined_at) return { kind: 'declined' };
  return { kind: 'pending' };
}
