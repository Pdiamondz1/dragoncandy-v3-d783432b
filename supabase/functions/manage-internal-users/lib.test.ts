import { describe, it, expect } from 'vitest';
import {
  isValidEmail,
  normalizeEmail,
  normalizeTier,
  highestTier,
  deriveStatus,
  tierLabel,
  buildInviteEmailHtml,
  buildGrantedEmailHtml,
  INTERNAL_HOST_URL,
} from './lib';

describe('isValidEmail', () => {
  it('accepts normal addresses', () => {
    expect(isValidEmail('Adrian.Vella.jobs@gmail.com')).toBe(true);
    expect(isValidEmail('a@b.co')).toBe(true);
  });
  it('rejects garbage and non-strings', () => {
    expect(isValidEmail('not-an-email')).toBe(false);
    expect(isValidEmail('missing@domain')).toBe(false);
    expect(isValidEmail('a b@c.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(42)).toBe(false);
  });
});

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Adrian.Vella.JOBS@Gmail.com ')).toBe('adrian.vella.jobs@gmail.com');
  });
});

describe('normalizeTier', () => {
  it('accepts the two valid tiers', () => {
    expect(normalizeTier('admin')).toBe('admin');
    expect(normalizeTier('stakeholder')).toBe('stakeholder');
  });
  it('returns null for anything else (no silent escalation)', () => {
    expect(normalizeTier('moderator')).toBeNull();
    expect(normalizeTier('Admin')).toBeNull();
    expect(normalizeTier(undefined)).toBeNull();
    expect(normalizeTier('')).toBeNull();
    expect(normalizeTier(1)).toBeNull();
  });
});

describe('highestTier', () => {
  it('admin wins when both roles present', () => {
    expect(highestTier(['stakeholder', 'admin'])).toBe('admin');
    expect(highestTier(['admin'])).toBe('admin');
  });
  it('falls back to stakeholder', () => {
    expect(highestTier(['stakeholder'])).toBe('stakeholder');
    expect(highestTier([])).toBe('stakeholder');
  });
});

describe('deriveStatus', () => {
  it('active once signed in', () => {
    expect(deriveStatus({ last_sign_in_at: '2026-06-26T00:00:00Z' })).toBe('active');
  });
  it('invited when never signed in', () => {
    expect(deriveStatus({ last_sign_in_at: null })).toBe('invited');
    expect(deriveStatus({})).toBe('invited');
    expect(deriveStatus(null)).toBe('invited');
    expect(deriveStatus(undefined)).toBe('invited');
  });
});

describe('tierLabel', () => {
  it('describes each tier', () => {
    expect(tierLabel('admin')).toContain('admin');
    expect(tierLabel('stakeholder')).toContain('read-only');
  });
});

describe('buildInviteEmailHtml', () => {
  it('embeds the action link and escapes the name', () => {
    const html = buildInviteEmailHtml({
      name: 'Adrian <b>Vella</b>',
      actionLink: 'https://x.supabase.co/auth/v1/verify?token=abc&type=invite',
      tier: 'admin',
    });
    // ampersand in the href is HTML-escaped, angle brackets in name are escaped
    expect(html).toContain('token=abc&amp;type=invite');
    expect(html).toContain('Adrian &lt;b&gt;Vella&lt;/b&gt;');
    expect(html).not.toContain('Adrian <b>Vella</b>');
    expect(html).toContain('Set your password');
    expect(html).toContain('full admin');
  });
  it('greets generically when no name', () => {
    const html = buildInviteEmailHtml({ name: '', actionLink: 'https://x', tier: 'stakeholder' });
    expect(html).toContain('Hi,');
    expect(html).toContain('read-only');
  });
});

describe('buildGrantedEmailHtml', () => {
  it('points to the internal host with no set-password link', () => {
    const html = buildGrantedEmailHtml({ name: 'Joe', tier: 'admin' });
    expect(html).toContain(INTERNAL_HOST_URL);
    expect(html).toContain('Open the AIOS');
    expect(html).toContain('existing DragonCandy password');
  });
});
