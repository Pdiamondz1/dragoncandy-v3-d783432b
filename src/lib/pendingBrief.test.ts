// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { briefToText, consumePendingBrief } from './pendingBrief';

const brief = {
  campaign_name: 'Shack Life',
  campaign_description: 'Behind the burger content.',
  target_audience: 'Local foodies',
  content_suggestions: ['BTS reel', 'Menu highlight', 'Staff pick'],
};

describe('briefToText', () => {
  it('summarizes all fields', () => {
    const t = briefToText(brief);
    expect(t).toContain('Shack Life');
    expect(t).toContain('Behind the burger');
    expect(t).toContain('Target audience: Local foodies');
    expect(t).toContain('Content ideas: BTS reel; Menu highlight; Staff pick');
  });
  it('tolerates missing fields', () => {
    expect(briefToText({ campaign_name: 'X' })).toBe('X');
    expect(briefToText({})).toBe('');
  });
});

describe('consumePendingBrief', () => {
  beforeEach(() => localStorage.clear());

  it('returns the business create route + clears storage', () => {
    localStorage.setItem('pendingBrief', JSON.stringify(brief));
    const r = consumePendingBrief('business_client');
    expect(r?.redirectTo).toMatch(/^\/dashboard\/business\/campaigns\/create\?brief=/);
    expect(decodeURIComponent(r!.redirectTo.split('brief=')[1])).toContain('Shack Life');
    expect(localStorage.getItem('pendingBrief')).toBeNull();
  });
  it('routes brand to the brand create route', () => {
    localStorage.setItem('pendingBrief', JSON.stringify(brief));
    expect(consumePendingBrief('brand')?.redirectTo).toMatch(/^\/dashboard\/brand\/campaigns\/create\?brief=/);
  });
  it('returns null for creator but still clears', () => {
    localStorage.setItem('pendingBrief', JSON.stringify(brief));
    expect(consumePendingBrief('content_creator')).toBeNull();
    expect(localStorage.getItem('pendingBrief')).toBeNull();
  });
  it('returns null when nothing stored', () => {
    expect(consumePendingBrief('business_client')).toBeNull();
  });
  it('returns null + clears on malformed JSON', () => {
    localStorage.setItem('pendingBrief', '{not json');
    expect(consumePendingBrief('business_client')).toBeNull();
    expect(localStorage.getItem('pendingBrief')).toBeNull();
  });
});
