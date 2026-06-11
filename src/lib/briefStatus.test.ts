import { describe, it, expect } from 'vitest';
import { deriveBriefStatus } from './briefStatus';

describe('deriveBriefStatus', () => {
  it('returns awaiting_post when not yet posted', () => {
    expect(deriveBriefStatus({ is_posted: false, post_count: 0 })).toBe('awaiting_post');
  });
  it('returns measuring when posted but no performance captured yet', () => {
    expect(deriveBriefStatus({ is_posted: true, post_count: 0 })).toBe('measuring');
  });
  it('returns has_performance when at least one post has performance', () => {
    expect(deriveBriefStatus({ is_posted: true, post_count: 3 })).toBe('has_performance');
  });
  it('prefers has_performance whenever data exists, even if is_posted is somehow false', () => {
    expect(deriveBriefStatus({ is_posted: false, post_count: 2 })).toBe('has_performance');
  });
});
