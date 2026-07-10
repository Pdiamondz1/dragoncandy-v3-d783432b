// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ScheduleReviewScreen } from './ScheduleReviewScreen';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

const mockUse = vi.fn();
vi.mock('@/hooks/useScheduledPosts', () => ({
  useScheduledPosts: (...args: unknown[]) => mockUse(...args),
}));

const basePost: ScheduledPost = {
  id: 'p1', user_id: 'u1', campaign_id: 'c1', platform: 'instagram', content_type: 'photo',
  caption: 'Hello', media_urls: null, hashtags: null, scheduled_at: new Date(2026, 6, 10, 9).toISOString(),
  published_at: null, status: 'scheduled', ai_suggested_time: true, ai_reasoning: null, metadata: null,
  plan_group_id: null, plan_order: 1, deliverable_id: null, created_at: new Date(2026, 6, 1).toISOString(),
};

describe('ScheduleReviewScreen', () => {
  it('empty state explains and offers an action instead of a dead disabled button', () => {
    mockUse.mockReturnValue({ data: [], isLoading: false });
    render(
      <ScheduleReviewScreen open onOpenChange={() => {}} campaignId="c1" campaignTitle="Café Symphony" connectedPlatformCount={2} />,
    );
    expect(screen.getByText(/no posts scheduled yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm & schedule all posts/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back to campaign/i })).toBeInTheDocument();
    // The "Donny Optimized" badge is hidden when there is nothing scheduled.
    expect(screen.queryByText(/donny optimized/i)).not.toBeInTheDocument();
  });

  it('populated state shows posts, the confirm button, and no timeline overlap element', () => {
    mockUse.mockReturnValue({ data: [basePost], isLoading: false });
    render(
      <ScheduleReviewScreen open onOpenChange={() => {}} campaignId="c1" campaignTitle="Café Symphony" connectedPlatformCount={2} />,
    );
    expect(screen.getByText(/donny optimized/i)).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /confirm & schedule all posts/i })).toBeInTheDocument();
  });
});
