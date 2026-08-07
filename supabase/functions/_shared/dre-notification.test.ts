import { describe, it, expect } from 'vitest';
import { buildAwardNotification } from './dre-notification';

describe('buildAwardNotification', () => {
  it('names the single action that earned the points', () => {
    const n = buildAwardNotification([{ eventType: 'business.profile_completed', points: 200 }], false);
    expect(n.title).toBe('You earned 200 DC Points');
    expect(n.body).toBe('Completed your business profile');
  });

  it('summarises several actions from one run', () => {
    const n = buildAwardNotification([
      { eventType: 'business.first_campaign_created', points: 500 },
      { eventType: 'business.campaign_launched', points: 150 },
    ], false);
    expect(n.title).toBe('You earned 650 DC Points');
    expect(n.body).toBe('Created your first campaign and Launched a campaign');
  });

  it('flags a tier-up without losing the reason', () => {
    const n = buildAwardNotification([{ eventType: 'creator.first_campaign', points: 1000 }], true);
    expect(n.title).toBe('You earned 1,000 DC Points');
    expect(n.body).toBe('Completed your first campaign — new standing unlocked');
  });

  it('falls back readably for an event type with no label', () => {
    const n = buildAwardNotification([{ eventType: 'business.future_thing', points: 25 }], false);
    expect(n.body).toBe('Future thing');
  });

  it('never produces an empty body', () => {
    const n = buildAwardNotification([], false);
    expect(n.title).toBe('You earned DC Points');
    expect(n.body.length).toBeGreaterThan(0);
  });
});
