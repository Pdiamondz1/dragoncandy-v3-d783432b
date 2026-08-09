import { describe, it, expect } from 'vitest';
import {
  resolveAccount,
  describeAccount,
  type ConnectedAccount,
} from './outstand-accounts';

const IG: ConnectedAccount = { id: 'LEnjV', platform: 'instagram', handle: 'areyouaman' };
const YT: ConnectedAccount = { id: 'I2pgX', platform: 'youtube', handle: '@josephcastelo149' };
const IG2: ConnectedAccount = { id: 'ZZZZZ', platform: 'instagram', handle: 'second_shop' };
// Same handle, different platform — the case a handle-only compare can't
// resolve; only the platform half of a full echoed label can.
const BRAND_IG: ConnectedAccount = { id: 'B1abc', platform: 'instagram', handle: 'brand' };
const BRAND_TT: ConnectedAccount = { id: 'B2xyz', platform: 'tiktok', handle: 'brand' };
// No handle at all — describeAccount shows this one as just "TikTok".
const NO_HANDLE_TT: ConnectedAccount = { id: 'N1none', platform: 'tiktok', handle: null };

describe('resolveAccount', () => {
  it('returns none for an empty list', () => {
    expect(resolveAccount([])).toEqual({ kind: 'none' });
  });

  it('uses the only account without asking', () => {
    expect(resolveAccount([IG])).toEqual({ kind: 'one', account: IG });
  });

  it('asks when there is more than one and no hint', () => {
    expect(resolveAccount([IG, YT])).toEqual({ kind: 'many', accounts: [IG, YT] });
  });

  it('narrows by an explicitly requested platform instead of asking', () => {
    expect(resolveAccount([IG, YT], 'instagram')).toEqual({ kind: 'one', account: IG });
  });

  it('matches the platform hint case-insensitively', () => {
    expect(resolveAccount([IG, YT], 'Instagram')).toEqual({ kind: 'one', account: IG });
  });

  it('still asks when the hint leaves more than one candidate', () => {
    expect(resolveAccount([IG, IG2, YT], 'instagram')).toEqual({
      kind: 'many',
      accounts: [IG, IG2],
    });
  });

  it('falls back to the full list when the hint matches nothing, rather than reporting none', () => {
    // "none" would make Donny say no account is connected, which is a lie the
    // product has already told a user three times. An unmatched hint is a
    // disambiguation problem, not an absence.
    expect(resolveAccount([IG, YT], 'threads')).toEqual({ kind: 'many', accounts: [IG, YT] });
  });

  it('uses the only account even when the hint matches nothing', () => {
    expect(resolveAccount([IG], 'tiktok')).toEqual({ kind: 'one', account: IG });
  });

  it('narrows two accounts on the SAME platform by handle — platform alone cannot solve this', () => {
    // The finding this fix closes: IG and IG2 are both Instagram, so a
    // platform hint of "instagram" would still return `many` for both. Only
    // a handle can tell them apart.
    expect(resolveAccount([IG, IG2], undefined, 'areyouaman')).toEqual({
      kind: 'one',
      account: IG,
    });
  });

  it('matches a handle hint case-insensitively', () => {
    expect(resolveAccount([IG, IG2], undefined, 'AreYouAman')).toEqual({
      kind: 'one',
      account: IG,
    });
  });

  it('matches when the hint carries a leading @ but the stored handle does not', () => {
    // IG.handle is 'areyouaman' (no @); the user is shown '@areyouaman'.
    expect(resolveAccount([IG, IG2], undefined, '@areyouaman')).toEqual({
      kind: 'one',
      account: IG,
    });
  });

  it('matches when the stored handle carries a leading @ but the hint does not', () => {
    // YT.handle is '@josephcastelo149' (with @); the hint arrives bare.
    expect(resolveAccount([IG, YT], undefined, 'josephcastelo149')).toEqual({
      kind: 'one',
      account: YT,
    });
  });

  it('falls back to the full list when the handle hint matches nothing, never none', () => {
    expect(resolveAccount([IG, YT], undefined, 'nobody_here')).toEqual({
      kind: 'many',
      accounts: [IG, YT],
    });
  });

  it('a matching handle hint wins over a platform hint that would otherwise stay ambiguous', () => {
    expect(resolveAccount([IG, IG2, YT], 'instagram', 'second_shop')).toEqual({
      kind: 'one',
      account: IG2,
    });
  });

  it('resolves by handle alone with no platform hint given', () => {
    expect(resolveAccount([IG, IG2, YT], undefined, 'second_shop')).toEqual({
      kind: 'one',
      account: IG2,
    });
  });

  it('resolves by platform alone with no handle hint given (existing behavior, unchanged)', () => {
    expect(resolveAccount([IG, YT], 'youtube', undefined)).toEqual({ kind: 'one', account: YT });
  });

  it('matches when the hint is the FULL disambiguation label, not just the handle', () => {
    // The disambiguation prompt tells the model to "refer to them exactly as
    // listed" — describeAccount's format is "@handle · Platform" — so a
    // model answering "their exact answer" may hand back the whole label
    // instead of extracting just the handle. Codex P2: this must still
    // resolve, not fall back to `many` a second time.
    expect(resolveAccount([IG, IG2], undefined, '@areyouaman · Instagram')).toEqual({
      kind: 'one',
      account: IG,
    });
  });

  it('uses the platform half of a full label to break a same-handle-different-platform tie', () => {
    // Codex round 2: the SAME handle can be connected on two platforms
    // (e.g. a brand's own handle on both Instagram and TikTok). Discarding
    // the platform half of the echoed label — the round-1 fix — collapses
    // them back into an unresolved `many`. The platform half must narrow.
    expect(resolveAccount([BRAND_IG, BRAND_TT], undefined, '@brand · Instagram')).toEqual({
      kind: 'one',
      account: BRAND_IG,
    });
    expect(resolveAccount([BRAND_IG, BRAND_TT], undefined, '@brand · TikTok')).toEqual({
      kind: 'one',
      account: BRAND_TT,
    });
  });

  it('still asks (never none) when a same-handle tie has no platform to break it', () => {
    expect(resolveAccount([BRAND_IG, BRAND_TT], undefined, 'brand')).toEqual({
      kind: 'many',
      accounts: [BRAND_IG, BRAND_TT],
    });
  });

  it('resolves an account with NO handle by its platform-only label — Codex round 3', () => {
    // describeAccount(NO_HANDLE_TT) is just "TikTok" (no handle to show), so
    // that IS "the exact answer" the model hands back for this account when
    // the user picks it. Before this fix, the filter only ever compared
    // against non-null handles, so this account could be shown as a choice
    // and never actually be selected.
    expect(resolveAccount([IG, NO_HANDLE_TT], undefined, 'TikTok')).toEqual({
      kind: 'one',
      account: NO_HANDLE_TT,
    });
  });

  it('matches a platform-only handle hint case-insensitively', () => {
    expect(resolveAccount([IG, NO_HANDLE_TT], undefined, 'tiktok')).toEqual({
      kind: 'one',
      account: NO_HANDLE_TT,
    });
  });

  it('does not let a platform-only hint accidentally match an account that DOES have a handle', () => {
    // IG2 has a real handle ('second_shop'), so its label is
    // "@second_shop · Instagram", never bare "Instagram" — a hint of just
    // "Instagram" must not match it via the null-handle fallback path.
    expect(resolveAccount([IG, IG2], undefined, 'Instagram')).toEqual({
      kind: 'many',
      accounts: [IG, IG2],
    });
  });
});

describe('describeAccount', () => {
  it('names an account by handle and platform, never by id', () => {
    const label = describeAccount(IG);
    expect(label).toBe('@areyouaman · Instagram');
    expect(label).not.toContain('LEnjV');
  });

  it('does not double the @ when the handle already carries one', () => {
    expect(describeAccount(YT)).toBe('@josephcastelo149 · YouTube');
  });

  it('falls back to the platform alone when there is no handle', () => {
    expect(describeAccount({ id: 'x', platform: 'facebook', handle: null })).toBe('Facebook');
  });
});
