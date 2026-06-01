import { describe, it, expect } from 'vitest';
import { deriveCreatorPostState } from './dragonsharePostState';

describe('deriveCreatorPostState', () => {
  it('paid when a transferred boost exists', () => {
    expect(deriveCreatorPostState({ boost_status: 'boosted', declined_at: null,
      boosts: [{ status: 'transferred', creator_payout_cents: 4000 }] }).kind).toBe('paid');
  });
  it('declined (soft) when declined_at set and not boosted', () => {
    expect(deriveCreatorPostState({ boost_status: 'available', declined_at: '2026-06-01', boosts: [] }).kind).toBe('declined');
  });
  it('pending otherwise', () => {
    expect(deriveCreatorPostState({ boost_status: 'available', declined_at: null, boosts: [] }).kind).toBe('pending');
  });
});
