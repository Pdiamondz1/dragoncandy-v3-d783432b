import { describe, it, expect } from 'vitest';
import {
  SUPPORT_EMAIL,
  PRIVACY_EMAIL,
  SALES_EMAIL,
  mailtoHref,
} from './contactAddresses';

describe('mailtoHref', () => {
  it('percent-encodes a subject containing "&"', () => {
    // The live defect this helper was written for. `HelpArticlePage` used to
    // interpolate an article title straight into the query string, and this is
    // a REAL title on prod. Unencoded, the "&" ends the subject parameter and
    // the mail client opens with "Help: DC Points".
    const href = mailtoHref(SUPPORT_EMAIL, 'Help: DC Points & Creator Standing');

    expect(href).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=Help%3A%20DC%20Points%20%26%20Creator%20Standing`,
    );
    // The property that actually matters: exactly one "?" and no bare "&",
    // so nothing after the first parameter can be reparsed as another one.
    expect(href.split('?')).toHaveLength(2);
    expect(href.split('?')[1]).not.toContain('&');
  });

  it('encodes "#", which would otherwise truncate the subject entirely', () => {
    const href = mailtoHref(SUPPORT_EMAIL, 'Help: #DragonDashed');
    expect(href).not.toContain('#');
    expect(href).toContain('%23');
  });

  it('omits the query string entirely when there is no subject', () => {
    expect(mailtoHref(SALES_EMAIL)).toBe(`mailto:${SALES_EMAIL}`);
    expect(mailtoHref(SALES_EMAIL)).not.toContain('?');
  });

  it('encodes spaces, replacing the hand-written %20 the settings pages carried', () => {
    expect(mailtoHref(SUPPORT_EMAIL, 'GDPR Data Erasure Request')).toBe(
      `mailto:${SUPPORT_EMAIL}?subject=GDPR%20Data%20Erasure%20Request`,
    );
  });
});

describe('contact addresses', () => {
  const ALL = { SUPPORT_EMAIL, PRIVACY_EMAIL, SALES_EMAIL };

  it('all sit on ONE domain', () => {
    // This is the test that earns its keep. The .io -> .com migration's
    // characteristic failure is updating seven of eight scattered literals and
    // shipping a half-moved surface. Collapsing them into this file removed the
    // scattering; this assertion makes a partial flip fail CI rather than reach
    // a user who is told to email an address nobody reads.
    const domains = Object.values(ALL).map((a) => a.split('@')[1]);
    expect(new Set(domains).size).toBe(1);
  });

  it('are on dragoncandy.com', () => {
    // Pinned to `.com` now that Phase 5a's gate is met -- each address is a
    // verified alias on an active Workspace account (see contactAddresses.ts).
    // Pinning is what makes an accidental revert to `.io` fail CI. This test
    // deliberately accepted BOTH TLDs while the gate was open; it does not
    // anymore, because "either is fine" stopped being true.
    for (const [name, address] of Object.entries(ALL)) {
      expect(address, `${name} must be on dragoncandy.com`)
        .toMatch(/^[a-z]+@dragoncandy\.com$/);
    }
  });
});
