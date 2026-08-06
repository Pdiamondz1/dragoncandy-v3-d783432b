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

// Amplification rows reach this screen because `planGroupId` is optional and
// neither real call site passes one, so useScheduledPosts skips its
// plan_group_id filter and the query is campaign-only. They must still RENDER
// (standing decision) but must not enter any of this screen's arithmetic.
describe('ScheduleReviewScreen — amplification rows', () => {
  const amplification: ScheduledPost = {
    ...basePost,
    id: 'amp1',
    caption: 'Amplified!',
    metadata: { source: 'sponsorship_amplification', outstand_post_id: 'XDb8e' },
  };
  const publishedDeliverable: ScheduledPost = { ...basePost, id: 'd1', status: 'published' };

  const renderScreen = () =>
    render(
      <ScheduleReviewScreen open onOpenChange={() => {}} campaignId="c1" campaignTitle="Café Symphony" connectedPlatformCount={2} />,
    );

  it('still RENDERS an amplification row in the list', () => {
    mockUse.mockReturnValue({ data: [basePost, amplification], isLoading: false });
    renderScreen();
    expect(screen.getByText('Amplified!')).toBeInTheDocument();
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('excludes it from the header count', () => {
    mockUse.mockReturnValue({ data: [basePost, amplification], isLoading: false });
    renderScreen();
    expect(screen.getByText('1 post')).toBeInTheDocument();
    expect(screen.queryByText('2 posts')).not.toBeInTheDocument();
  });

  // THE ONE WITH TEETH. All deliverables published + one SCHEDULED
  // amplification: `every(p => p.status === 'published')` used to be false
  // because of the amplification, so allScheduled was false and Confirm stayed
  // ENABLED — offering to re-confirm an already-finished schedule.
  it('DISABLES confirm when every deliverable is published and a scheduled amplification remains', () => {
    mockUse.mockReturnValue({ data: [publishedDeliverable, amplification], isLoading: false });
    renderScreen();
    expect(screen.getByRole('button', { name: /confirm & schedule all posts/i })).toBeDisabled();
  });

  // Same campaign, but the amplification is already published. This case was
  // accidentally correct before (every(...) was true either way); the fix must
  // not change it.
  it('still disables confirm when the amplification is itself published', () => {
    mockUse.mockReturnValue({
      data: [publishedDeliverable, { ...amplification, status: 'published' }],
      isLoading: false,
    });
    renderScreen();
    expect(screen.getByRole('button', { name: /confirm & schedule all posts/i })).toBeDisabled();
  });

  it('leaves confirm ENABLED when a real deliverable is still scheduled', () => {
    mockUse.mockReturnValue({ data: [publishedDeliverable, basePost, amplification], isLoading: false });
    renderScreen();
    expect(screen.getByRole('button', { name: /confirm & schedule all posts/i })).toBeEnabled();
  });

  it('shows the rows but no confirm footer when ONLY amplification rows exist', () => {
    // Nothing to confirm, so no dead disabled button — matching the empty-state
    // principle this suite already establishes.
    mockUse.mockReturnValue({ data: [amplification], isLoading: false });
    renderScreen();
    expect(screen.getByText('Amplified!')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirm & schedule all posts/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/donny optimized/i)).not.toBeInTheDocument();
  });
});
