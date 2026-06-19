import { describe, it, expect } from 'vitest';
import { deriveBriefStatus } from './briefStatus';

describe('deriveBriefStatus', () => {
  it('returns awaiting_post when not yet posted', () => {
    expect(deriveBriefStatus({ is_posted: false, post_count: 0, measurable_post_count: 0 })).toBe('awaiting_post');
  });
  it('returns measuring when posted but no engagement snapshot captured yet', () => {
    expect(deriveBriefStatus({ is_posted: true, post_count: 0, measurable_post_count: 0 })).toBe('measuring');
  });
  it('returns unmeasured when posts exist but none have measurable metrics', () => {
    expect(deriveBriefStatus({ is_posted: true, post_count: 2, measurable_post_count: 0 })).toBe('unmeasured');
  });
  it('returns has_performance when at least one post has measurable performance', () => {
    expect(deriveBriefStatus({ is_posted: true, post_count: 2, measurable_post_count: 1 })).toBe('has_performance');
  });
  it('prefers has_performance whenever measurable data exists, even if is_posted is somehow false', () => {
    expect(deriveBriefStatus({ is_posted: false, post_count: 2, measurable_post_count: 2 })).toBe('has_performance');
  });
});
