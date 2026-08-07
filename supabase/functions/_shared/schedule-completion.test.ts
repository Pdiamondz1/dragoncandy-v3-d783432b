import { describe, expect, it } from 'vitest';
import { decideScheduleCompletion } from './schedule-completion.ts';

const rows = (...statuses: string[]) => statuses.map((status) => ({ status }));

describe('decideScheduleCompletion', () => {
  it('completes when every post published', () => {
    expect(decideScheduleCompletion(rows('published', 'published'), 'scheduled')).toEqual({ complete: true });
    expect(decideScheduleCompletion(rows('published'), 'in_progress')).toEqual({ complete: true });
  });

  it('does NOT complete while any post is still pending', () => {
    expect(decideScheduleCompletion(rows('published', 'scheduled'), 'scheduled')).toEqual({
      complete: false,
      reason: 'still_pending',
    });
  });

  it('treats a FAILED post as pending — "All Posts Published" is false if one failed', () => {
    expect(decideScheduleCompletion(rows('published', 'failed'), 'in_progress')).toEqual({
      complete: false,
      reason: 'still_pending',
    });
  });

  it('ignores cancelled posts, which must not hold a schedule open forever', () => {
    expect(decideScheduleCompletion(rows('published', 'cancelled'), 'scheduled')).toEqual({ complete: true });
  });

  it('refuses a schedule with no posts — unscheduled is not "all published"', () => {
    expect(decideScheduleCompletion([], 'scheduled')).toEqual({ complete: false, reason: 'no_posts' });
    expect(decideScheduleCompletion(rows('cancelled'), 'scheduled')).toEqual({
      complete: false,
      reason: 'no_posts',
    });
  });

  it('never moves a campaign backwards out of failed', () => {
    expect(decideScheduleCompletion(rows('published'), 'failed')).toEqual({
      complete: false,
      reason: 'status_not_eligible',
    });
  });

  it('never skips earlier lifecycle states', () => {
    for (const status of ['not_configured', 'configured', 'pending_review', null]) {
      expect(decideScheduleCompletion(rows('published'), status)).toEqual({
        complete: false,
        reason: 'status_not_eligible',
      });
    }
  });

  it('is idempotent — an already-completed campaign is not eligible again', () => {
    expect(decideScheduleCompletion(rows('published'), 'completed')).toEqual({
      complete: false,
      reason: 'status_not_eligible',
    });
  });

  it('tolerates a null status on a row without crashing', () => {
    expect(decideScheduleCompletion([{ status: null }], 'scheduled')).toEqual({
      complete: false,
      reason: 'still_pending',
    });
  });
});
