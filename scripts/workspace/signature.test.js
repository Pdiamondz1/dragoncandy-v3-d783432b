import { describe, it, expect } from 'vitest';
import { renderSignature, escapeHtml, BRAND } from './signature.js';

const DAME = { name: 'Damon Williams', title: 'CTO', email: 'dame@dragoncandy.com' };

describe('escapeHtml', () => {
  it('escapes the five characters that break HTML attributes and text', () => {
    expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
  });

  it('leaves ordinary text alone', () => {
    expect(escapeHtml('Damon Williams')).toBe('Damon Williams');
  });
});

describe('renderSignature', () => {
  it('includes the name, title and email', () => {
    const html = renderSignature(DAME);
    expect(html).toContain('Damon Williams');
    expect(html).toContain('CTO');
    expect(html).toContain('dame@dragoncandy.com');
  });

  it('escapes a name containing HTML metacharacters', () => {
    const html = renderSignature({ ...DAME, name: 'Ben & Co <script>' });
    expect(html).toContain('Ben &amp; Co &lt;script&gt;');
    expect(html).not.toContain('<script>');
  });

  it('escapes the title too', () => {
    const html = renderSignature({ ...DAME, title: 'Head of R&D' });
    expect(html).toContain('Head of R&amp;D');
  });

  // --- email-client safety rules (spec section 7.3) ---

  it('lays out with tables and never with divs', () => {
    const html = renderSignature(DAME);
    expect(html).toContain('<table');
    expect(html).not.toContain('<div');
  });

  it('emits no stylesheet, no webfont and no classes', () => {
    const html = renderSignature(DAME);
    expect(html).not.toContain('<style');
    expect(html).not.toContain('@font-face');
    expect(html).not.toContain('class=');
  });

  it('uses only the web-safe font stack', () => {
    const html = renderSignature(DAME);
    expect(html).toContain('Arial, Helvetica, sans-serif');
    expect(html).not.toMatch(/Bricolage|Instrument|Silkscreen|Outfit/);
  });

  it('gives the image explicit dimensions, alt text and no border', () => {
    const html = renderSignature(DAME);
    expect(html).toContain(`width="${BRAND.markWidth}"`);
    expect(html).toContain(`height="${BRAND.markHeight}"`);
    expect(html).toContain('alt="DragonCandy"');
    expect(html).toContain('border="0"');
  });

  it('points the image at the stable public URL', () => {
    expect(renderSignature(DAME)).toContain(
      'https://dragoncandy.com/brand/dc-mark-104.png',
    );
  });

  it('keeps every contact detail outside the image', () => {
    const html = renderSignature(DAME);
    const imgTag = html.match(/<img[^>]*>/)[0];
    expect(imgTag).not.toContain('dame@dragoncandy.com');
    expect(imgTag).not.toContain('Damon Williams');
    expect(imgTag).not.toContain('CTO');
  });

  // --- address policy (spec decision 7) ---

  it('omits the postal address from a personal signature', () => {
    const html = renderSignature(DAME);
    expect(html).not.toContain('Newark St');
  });

  it('includes the registered address when asked, in the D&B form', () => {
    const html = renderSignature({
      name: 'DragonCandy Sales',
      title: 'Sales',
      email: 'sales@dragoncandy.com',
      includeAddress: true,
    });
    expect(html).toContain('33-41 Newark St., 5th Floor, Hoboken, NJ 07030');
  });

  it('never includes a phone number', () => {
    const html = renderSignature({ ...DAME, includeAddress: true });
    expect(html).not.toMatch(/\+?\d[\d\s().-]{8,}\d/);
  });

  // --- size ---

  it('stays well under the Gmail signature field cap', () => {
    const html = renderSignature({ ...DAME, includeAddress: true });
    expect(html.length).toBeLessThan(10000);
  });
});
