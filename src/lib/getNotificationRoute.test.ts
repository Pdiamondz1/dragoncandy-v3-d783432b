import { describe, it, expect } from 'vitest';
import { getNotificationRoute } from './getNotificationRoute';
import type { PushNotification } from '@/types/notifications';

function make(type: string, data: Record<string, unknown> | null, action_url: string | null = null): PushNotification {
  return {
    id: '1', user_id: 'u', title: 't', body: 'b',
    type: type as PushNotification['type'],
    category: 'dragonshare', action_url, actor_id: null, actor_name: null,
    icon: null, data, read_at: null, sent_at: null, created_at: '2026-06-01T00:00:00Z',
  };
}

describe('getNotificationRoute — DragonShare', () => {
  it('routes submission to business dragonshare with highlight', () => {
    expect(getNotificationRoute(make('dragonshare_submission', { post_id: 'p1' })))
      .toBe('/dashboard/business/dragonshare?highlight=p1');
  });
  it('routes boost receipt to business dragonshare', () => {
    expect(getNotificationRoute(make('dragonshare_boost_receipt', { post_id: 'p1' })))
      .toBe('/dashboard/business/dragonshare?highlight=p1');
  });
  it('routes boost payout to creator dragonshare with highlight', () => {
    expect(getNotificationRoute(make('dragonshare_boost', { post_id: 'p1' })))
      .toBe('/dashboard/creator/dragonshare?highlight=p1');
  });
  it('routes decline to creator dragonshare', () => {
    expect(getNotificationRoute(make('dragonshare_declined', { post_id: 'p1' })))
      .toBe('/dashboard/creator/dragonshare?highlight=p1');
  });
  it('falls back to base route when post_id missing', () => {
    expect(getNotificationRoute(make('dragonshare_boost', {})))
      .toBe('/dashboard/creator/dragonshare');
  });
  it('honors an explicit action_url first', () => {
    expect(getNotificationRoute(make('dragonshare_boost', { post_id: 'p1' }, '/x')))
      .toBe('/x');
  });
});

describe('getNotificationRoute — DC Points', () => {
  it('routes a points award to /rewards via the type fallback', () => {
    // Awards sent before /rewards existed carry no action_url.
    expect(getNotificationRoute(make('dragon_points_award', { points: 200 })))
      .toBe('/rewards');
  });

  it('prefers an explicit action_url when the engine set one', () => {
    const n = { ...make('dragon_points_award', { points: 200 }), action_url: '/rewards' };
    expect(getNotificationRoute(n)).toBe('/rewards');
  });
});
