import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildAllLegalStatic } from '../../../scripts/build-legal-static';
import { PRIVACY_LAST_UPDATED } from './PrivacyPolicyBody';
import { TERMS_LAST_UPDATED } from './TermsOfServiceBody';

/**
 * `public/privacy.html` and `public/terms.html` are COMMITTED artifacts generated from
 * the same React sources the app renders.
 *
 * A committed generated file rots — that is the whole risk of this design, and these
 * are legal documents, so they rot in the direction of publishing something untrue to
 * four platform reviewers and every visitor who cannot reach the gated app.
 *
 * This is the control on that. Edit either document without running
 * `npm run legal:static` and this fails.
 *
 * **It walks the generator's own page table** (`buildAllLegalStatic`) rather than a
 * list of files repeated here. A third legal page is therefore covered by the act of
 * being registered — which is the failure mode a hand-maintained list invites, and the
 * same reason `gate/decide.test.ts` walks the real `ALLOWED_EXACT` set.
 */
describe('the static legal pages are in step with the app', () => {
  const pages = buildAllLegalStatic();

  it('covers every page the generator owns, and there is more than one', () => {
    // The control. Without it, a generator that returned [] would make every
    // `it.each` below vacuous and the suite would report green over nothing.
    expect(pages.length).toBeGreaterThanOrEqual(2);
    expect(pages.map((p) => p.file).sort()).toEqual(['privacy.html', 'terms.html']);
  });

  it.each(pages.map((p) => p.file))('%s exists on disk', (file) => {
    const page = pages.find((p) => p.file === file)!;
    expect(existsSync(page.path)).toBe(true);
  });

  it.each(pages.map((p) => p.file))('%s is byte-identical to a fresh render', (file) => {
    const page = pages.find((p) => p.file === file)!;
    // Whole file, not a sample: sampling cannot see a section that was DELETED, and a
    // legal document missing a section is exactly what a sampled check waves through.
    expect(readFileSync(page.path, 'utf8').length).toBeGreaterThan(3000);
    expect(readFileSync(page.path, 'utf8')).toBe(page.html);
  });

  it('each page carries its own Last-updated date', () => {
    // Named separately from the byte comparison because this is the field a reader uses
    // to decide whether to trust the page, and the one guaranteed to change. A failure
    // here should say "the date is stale", not "some bytes differ".
    const read = (f: string) => readFileSync(pages.find((p) => p.file === f)!.path, 'utf8');
    expect(read('privacy.html')).toContain(PRIVACY_LAST_UPDATED);
    expect(read('terms.html')).toContain(TERMS_LAST_UPDATED);
  });

  /**
   * When the gate is on, EVERYTHING not on its allowlist answers 401 — the CSS bundle,
   * the fonts, `/logo.webp`. A page that references any of them renders unstyled or
   * broken for the one audience it exists to serve.
   */
  it.each(pages.map((p) => p.file))('%s is self-contained, so it survives the gate', (file) => {
    const html = readFileSync(pages.find((p) => p.file === file)!.path, 'utf8');

    expect(html).not.toContain('<script');
    expect(html).not.toContain('rel="stylesheet"');
    expect(html).not.toContain('src=');
    expect(html).not.toContain('/assets/');

    // Styling must therefore be inline, and present — an unstyled wall of text is the
    // failure this guards against, so assert the <style> block is real rather than
    // merely that no <link> exists.
    expect(html).toContain('<style>');
    expect(html.slice(html.indexOf('<style>'), html.indexOf('</style>')).length).toBeGreaterThan(400);

    // `/favicon.ico` is the single permitted external reference, and only because it is
    // itself on the gate's allowlist. If that ever changes, this changes.
    const sameOrigin = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((h) => h.startsWith('/'));
    expect(sameOrigin).toEqual(['/favicon.ico']);
  });

  it.each(pages.map((p) => p.file))('%s renders contiguous numbered sections', (file) => {
    const html = readFileSync(pages.find((p) => p.file === file)!.path, 'utf8');
    const sections = [...html.matchAll(/<h2>(\d+)\./g)].map((m) => Number(m[1]));
    // Contiguous from 1, so a dropped MIDDLE section fails rather than shortening a
    // count nobody has memorised.
    expect(sections).toEqual(Array.from({ length: sections.length }, (_, i) => i + 1));
    expect(sections.length).toBeGreaterThanOrEqual(11);
  });

  it('each page canonicalises to its own SPA route, not to the other one', () => {
    // A copy-paste of the privacy page's canonical into terms would point every crawler
    // at the wrong document while every other assertion here still passed.
    const read = (f: string) => readFileSync(pages.find((p) => p.file === f)!.path, 'utf8');
    expect(read('privacy.html')).toContain('<link rel="canonical" href="https://dragoncandy.com/privacy">');
    expect(read('terms.html')).toContain('<link rel="canonical" href="https://dragoncandy.com/terms">');
    expect(read('terms.html')).not.toContain('href="https://dragoncandy.com/privacy"');
  });
});
