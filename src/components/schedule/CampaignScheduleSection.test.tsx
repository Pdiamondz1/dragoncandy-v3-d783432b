// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CampaignScheduleSection } from './CampaignScheduleSection';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

const mockUse = vi.fn();
vi.mock('@/hooks/useScheduledPosts', () => ({
  useScheduledPosts: (...args: unknown[]) => mockUse(...args),
}));

const FAR_FUTURE = new Date(Date.now() + 7 * 86400000).toISOString();

function post(overrides: Partial<ScheduledPost>): ScheduledPost {
  return {
    id: 'p1', user_id: 'u1', campaign_id: 'c1', platform: 'instagram', content_type: 'photo',
    caption: null, media_urls: null, hashtags: null, scheduled_at: FAR_FUTURE,
    published_at: null, status: 'scheduled', ai_suggested_time: false, ai_reasoning: null,
    metadata: null, plan_group_id: null, plan_order: 1, deliverable_id: null,
    created_at: new Date(2026, 7, 1).toISOString(),
    ...overrides,
  };
}

const amplification = (overrides: Partial<ScheduledPost> = {}) =>
  post({ metadata: { source: 'sponsorship_amplification', outstand_post_id: 'XDb8e' }, ...overrides });

function renderSection() {
  return render(
    <CampaignScheduleSection
      campaignId="c1"
      campaignTitle="Café Symphony"
      postingScheduleStatus="scheduled"
      onOpenScheduleReview={() => {}}
    />,
  );
}

describe('CampaignScheduleSection — deliverable progress', () => {
  beforeEach(() => mockUse.mockReset());

  it('counts only deliverables, not amplification posts', () => {
    // The reported bug: a 5-deliverable campaign (4 published) plus one
    // amplification read "4 of 6".
    mockUse.mockReturnValue({
      data: [
        ...Array.from({ length: 4 }, (_, i) => post({ id: `d${i}`, status: 'published' })),
        post({ id: 'd4', status: 'scheduled' }),
        amplification({ id: 'a1', status: 'published' }),
      ],
    });
    renderSection();
    expect(screen.getByText(/4 of 5 posted/)).toBeInTheDocument();
    expect(screen.queryByText(/of 6/)).not.toBeInTheDocument();
  });

  it('excludes amplification from the TOTAL as well as the numerator', () => {
    // Excluding it from only one side would be worse than not filtering at all:
    // a published amplification would otherwise read "2 of 2" (over-reporting)
    // or "1 of 2" (under-reporting) instead of the true "1 of 1".
    mockUse.mockReturnValue({
      data: [post({ id: 'd0', status: 'published' }), amplification({ id: 'a1', status: 'published' })],
    });
    renderSection();
    expect(screen.getByText(/1 of 1 posted/)).toBeInTheDocument();
  });

  it('never surfaces an amplification as the "next post"', () => {
    // nextPost renders inside the same sentence as the count, so an
    // amplification appearing there would claim a deliverable is coming when
    // none is. The amplification here is sooner than the real deliverable.
    const soon = new Date(Date.now() + 3600_000).toISOString();
    const later = new Date(Date.now() + 5 * 86400000).toISOString();
    mockUse.mockReturnValue({
      data: [
        amplification({ id: 'a1', status: 'scheduled', scheduled_at: soon }),
        post({ id: 'd0', status: 'scheduled', scheduled_at: later }),
      ],
    });
    renderSection();
    const expected = new Date(later).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
    });
    expect(screen.getByText(new RegExp(`next post ${expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`))).toBeInTheDocument();
  });

  it('leaves an ordinary campaign unchanged when no amplification exists', () => {
    mockUse.mockReturnValue({
      data: [post({ id: 'd0', status: 'published' }), post({ id: 'd1', status: 'scheduled' })],
    });
    renderSection();
    expect(screen.getByText(/1 of 2 posted/)).toBeInTheDocument();
  });

  it('still queries by campaign only — the fix must not narrow what is FETCHED', () => {
    // The rows must remain available to the list surfaces that share this hook.
    // Filtering belongs at the progress calculation, never in the query.
    mockUse.mockReturnValue({ data: [] });
    renderSection();
    expect(mockUse).toHaveBeenCalledWith('c1');
  });
});
