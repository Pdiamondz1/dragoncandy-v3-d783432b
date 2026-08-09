import { describe, it, expect } from 'vitest';
import {
  buildDraftCard,
  draftToolResult,
  disambiguationResult,
  noAccountResult,
  missingScheduledAtResult,
} from './social-draft';
import type { ConnectedAccount } from './outstand-accounts';

const IG: ConnectedAccount = { id: 'LEnjV', platform: 'instagram', handle: 'areyouaman' };
const YT: ConnectedAccount = { id: 'I2pgX', platform: 'youtube', handle: '@josephcastelo149' };

describe('buildDraftCard', () => {
  it('names the account by handle and platform', () => {
    const card = buildDraftCard({ account: IG, caption: 'Taco Tuesday', mediaUrls: [], scheduledAt: null });
    expect(card.type).toBe('social_post_draft');
    expect(card.data.account_label).toBe('@areyouaman · Instagram');
  });

  it('carries the account id in data for the client, never in the label', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(card.data.account_id).toBe('LEnjV');
    expect(card.data.account_label).not.toContain('LEnjV');
  });

  it('preserves the caption verbatim — what is shown is what posts', () => {
    const caption = 'Line one\nLine two  #tacos';
    const card = buildDraftCard({ account: IG, caption, mediaUrls: [], scheduledAt: null });
    expect(card.data.caption).toBe(caption);
  });

  it('carries media urls through unchanged', () => {
    const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: urls, scheduledAt: null });
    expect(card.data.media_urls).toEqual(urls);
  });

  it('is unscheduled by default', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(card.data.scheduled_at).toBeNull();
  });

  it('carries a scheduled time when given one', () => {
    const when = '2026-08-20T15:00:00.000Z';
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: when });
    expect(card.data.scheduled_at).toBe(when);
  });
});

describe('draftToolResult', () => {
  it('tells the model a draft is READY, not that it posted', () => {
    const card = buildDraftCard({ account: IG, caption: 'Taco Tuesday', mediaUrls: [], scheduledAt: null });
    const { text } = draftToolResult(card);
    expect(text).toContain('draft');
    expect(text).not.toMatch(/\bposted\b/i);
    expect(text).not.toMatch(/\bpublished\b/i);
  });

  it('never leaks the account id into the model-facing text', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(draftToolResult(card).text).not.toContain('LEnjV');
  });

  it('returns the card unchanged alongside the text', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(draftToolResult(card).card).toBe(card);
  });
});

describe('disambiguationResult', () => {
  it('lists handles and platforms, never ids', () => {
    const text = disambiguationResult([IG, YT]);
    expect(text).toContain('@areyouaman · Instagram');
    expect(text).toContain('@josephcastelo149 · YouTube');
    expect(text).not.toContain('LEnjV');
    expect(text).not.toContain('I2pgX');
  });

  it('asks the user to choose', () => {
    expect(disambiguationResult([IG, YT]).toLowerCase()).toContain('which');
  });
});

describe('noAccountResult', () => {
  it('states the fact without guessing a cause', () => {
    const text = noAccountResult();
    expect(text.toLowerCase()).toContain('no social account');
    expect(text.toLowerCase()).not.toContain('may not');
    expect(text.toLowerCase()).not.toContain('account id');
  });
});

describe('missingScheduledAtResult', () => {
  it('tells the model to ask for a time rather than proceed unscheduled', () => {
    const text = missingScheduledAtResult();
    expect(text.toLowerCase()).toContain('when');
    expect(text.toLowerCase()).toContain('schedule_post');
  });

  it('never claims the post is scheduled or ready', () => {
    const text = missingScheduledAtResult();
    expect(text).not.toMatch(/\bposted\b/i);
    expect(text).not.toMatch(/\bpublished\b/i);
    expect(text).not.toContain('draft_ready');
  });
});
