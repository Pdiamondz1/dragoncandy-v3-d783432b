// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PostCard } from './PostCard';
import type { ScheduledPost } from '@/hooks/useScheduledPosts';

const base: ScheduledPost = {
  id: 'p1', user_id: 'u1', campaign_id: 'c1', platform: 'instagram', content_type: 'reel',
  caption: 'hi', media_urls: null, hashtags: null, scheduled_at: '2026-06-07T12:00:00Z',
  published_at: null, status: 'scheduled', ai_suggested_time: false, ai_reasoning: null,
  metadata: null, plan_group_id: null, plan_order: 0, deliverable_id: null,
  created_at: '2026-06-07T00:00:00Z',
};
const noop = () => {};

describe('PostCard status badges', () => {
  it('shows the Published badge', () => {
    render(<PostCard post={{ ...base, status: 'published' }} index={0} total={1} onEditCaption={noop} onChangeDate={noop} />);
    expect(screen.queryByText(/Published/i)).toBeTruthy();
  });

  it('shows the Failed badge with the error', () => {
    render(<PostCard
      post={{ ...base, status: 'failed', metadata: { publish_result: [{ error: 'token expired' }] } }}
      index={0} total={1} onEditCaption={noop} onChangeDate={noop} />);
    expect(screen.queryByText(/Failed/i)).toBeTruthy();
    expect(screen.queryByText(/token expired/i)).toBeTruthy();
  });

  it('hides actions when failed', () => {
    render(<PostCard post={{ ...base, status: 'failed', metadata: null }} index={0} total={1} onEditCaption={noop} onChangeDate={noop} />);
    expect(screen.queryByText(/Edit Caption/i)).toBeNull();
  });
});
