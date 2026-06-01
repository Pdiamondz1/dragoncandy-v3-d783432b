import { describe, it, expect } from 'vitest';
import {
  deriveCreatorActivity,
  deriveBusinessActivity,
  type DSPostRow,
} from './dragonshareActivity';

const base: DSPostRow = {
  id: 'p1', content_type: 'video', submitted_at: '2026-06-01T10:00:00Z',
  boost_status: 'available', declined_at: null, boosts: [],
};

describe('deriveCreatorActivity', () => {
  it('marks a boosted post as paid with payout', () => {
    const rows: DSPostRow[] = [{ ...base, boost_status: 'boosted',
      boosts: [{ status: 'transferred', creator_payout_cents: 2400, transferred_at: '2026-06-02T10:00:00Z' }] }];
    const out = deriveCreatorActivity(rows);
    expect(out[0]).toMatchObject({ kind: 'paid', payoutCents: 2400, postId: 'p1' });
  });
  it('marks a declined post as not_selected', () => {
    const out = deriveCreatorActivity([{ ...base, declined_at: '2026-06-02T10:00:00Z' }]);
    expect(out[0]).toMatchObject({ kind: 'not_selected', postId: 'p1' });
  });
  it('marks an available post as submitted', () => {
    const out = deriveCreatorActivity([base]);
    expect(out[0]).toMatchObject({ kind: 'submitted', postId: 'p1' });
  });
  it('sorts newest first by effective timestamp', () => {
    const out = deriveCreatorActivity([
      { ...base, id: 'old', submitted_at: '2026-05-01T00:00:00Z' },
      { ...base, id: 'new', submitted_at: '2026-06-01T00:00:00Z' },
    ]);
    expect(out.map(a => a.postId)).toEqual(['new', 'old']);
  });
});

describe('deriveBusinessActivity', () => {
  it('produces submitted + paid items sorted newest first', () => {
    const awaiting = [
      { id: 'a1', content_type: 'photo', submitted_at: '2026-06-01T00:00:00Z',
        boost_status: 'available', declined_at: null },
    ];
    const boostsMade = [
      { post_id: 'b1', amount_cents: 5000, transferred_at: '2026-06-03T00:00:00Z' },
    ];
    const out = deriveBusinessActivity(awaiting, boostsMade);
    expect(out.map(a => a.kind)).toEqual(['paid', 'submitted']);
    expect(out[0]).toMatchObject({ kind: 'paid', postId: 'b1', payoutCents: 5000 });
    expect(out[1]).toMatchObject({ kind: 'submitted', postId: 'a1' });
  });
});
