import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildPrivacyStatic, PRIVACY_STATIC_PATH } from '../../../scripts/build-legal-static';
import { PRIVACY_LAST_UPDATED } from './PrivacyPolicyBody';

/**
 * `public/privacy.html` is a COMMITTED artifact generated from `PrivacyPolicyBody`.
 * A committed generated file rots — that is the whole risk of this design, and it is
 * a legal document, so it rots in the direction of publishing something untrue to
 * four platform reviewers and every visitor who cannot reach the gated app.
 *
 * This is the control on that. Edit the policy without running `npm run legal:static`
 * and this fails.
 *
 * It compares the WHOLE file rather than sampling a few phrases, because sampling
 * cannot see a section that was deleted — and a privacy policy missing a section is
 * exactly the failure a sampled check would wave through.
 */
describe('public/privacy.html is in step with the app', () => {
  it('exists at all', () => {
    // The control. Every assertion below reads this file; without this, a rename or
    // a deleted artifact makes them fail for a reason nobody would diagnose quickly.
    expect(existsSync(PRIVACY_STATIC_PATH)).toBe(true);
  });

  it('is byte-identical to a fresh render', () => {
    const committed = readFileSync(PRIVACY_STATIC_PATH, 'utf8');
    expect(committed.length).toBeGreaterThan(3000);
    expect(committed).toBe(buildPrivacyStatic());
  });

  it('carries the current Last-updated date', () => {
    // Named separately from the byte comparison because this is the field a reader
    // uses to decide whether to trust the page, and the one guaranteed to change.
    // A failure here should say "the date is stale", not "some bytes differ".
    expect(readFileSync(PRIVACY_STATIC_PATH, 'utf8')).toContain(PRIVACY_LAST_UPDATED);
  });

  /**
   * When the gate is on, EVERYTHING not on its allowlist answers 401 — the CSS
   * bundle, the fonts, `/logo.webp`. A page that references any of them renders
   * unstyled or broken for the one audience it exists to serve.
   */
  it('is self-contained, so it survives the gate it was built for', () => {
    const html = readFileSync(PRIVACY_STATIC_PATH, 'utf8');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('rel="stylesheet"');
    expect(html).not.toContain('src=');
    expect(html).not.toContain('/assets/');

    // Styling must therefore be inline, and present — an unstyled wall of text is
    // the failure this is guarding against, so assert the <style> block is real
    // rather than merely that no <link> exists.
    expect(html).toContain('<style>');
    expect(html.slice(html.indexOf('<style>'), html.indexOf('</style>')).length).toBeGreaterThan(400);

    // `/favicon.ico` is the single permitted external reference, and only because
    // it is itself on the gate's allowlist. If that ever changes, this changes.
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const sameOrigin = hrefs.filter((h) => h.startsWith('/'));
    expect(sameOrigin).toEqual(['/favicon.ico']);
  });

  it('renders every numbered section', () => {
    const html = readFileSync(PRIVACY_STATIC_PATH, 'utf8');
    const sections = [...html.matchAll(/<h2>(\d+)\./g)].map((m) => Number(m[1]));
    // Contiguous from 1, so a dropped middle section fails rather than shortening
    // a count nobody has memorised.
    expect(sections).toEqual(Array.from({ length: sections.length }, (_, i) => i + 1));
    expect(sections.length).toBeGreaterThanOrEqual(11);
  });
});
