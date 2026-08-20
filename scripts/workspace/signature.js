/**
 * DragonCandy email signature renderer.
 *
 * PURE ON PURPOSE. No Google APIs, no I/O, no runtime dependencies — so the
 * risky part of this system (email HTML that has to survive Outlook, dark mode
 * and blocked images) is fully unit-testable, while the Apps Script driver that
 * cannot be tested stays thin.
 *
 * THE RULES THIS FILE ENFORCES, AND WHY (spec section 7.3):
 *   - Tables, not divs. Outlook for Windows renders mail with the Word engine
 *     and does not lay out with CSS.
 *   - Inline styles only. Every mail client strips <style> blocks.
 *   - Arial only. @font-face does not exist in email, so DragonCandy's real
 *     typefaces cannot appear as text here under any circumstances.
 *   - Nothing load-bearing inside the image. Many corporate inboxes block
 *     images by default; strip every image and this must still be a complete,
 *     legible signature.
 */

export const BRAND = Object.freeze({
  markUrl: 'https://dragoncandy.com/brand/dc-mark-104.png',
  markWidth: 52,
  markHeight: 61,
  site: 'dragoncandy.com',
  siteUrl: 'https://dragoncandy.com',
  company: 'DragonCandy',
  fontStack: 'Arial, Helvetica, sans-serif',
  nameColor: '#241332',
  softColor: '#6B5A7E',
  linkColor: '#C22760',
  lineColor: '#EFE8F5',
  // D&B form, WITH the floor. The IRS EIN letter omits it; Apple matches the
  // D-U-N-S record, so this is the correct one here. See src/lib/legalEntity.ts.
  address: '33-41 Newark St., 5th Floor, Hoboken, NJ 07030',
});

const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch]);
}

function textRow(content, { size, color, weight = 'normal', lineHeight }) {
  return (
    `<tr><td style="font-family:${BRAND.fontStack};font-size:${size}px;` +
    `font-weight:${weight};color:${color};line-height:${lineHeight}px;` +
    `padding:0;">${content}</td></tr>`
  );
}

/**
 * @param {object} person
 * @param {string} person.name   Display name, e.g. "Damon Williams".
 * @param {string} person.title  Title, e.g. "CTO".
 * @param {string} person.email  Address this signature signs off as.
 * @param {boolean} [person.includeAddress]  True for shared send-as identities
 *   (sales@, legal@, privacy@ ...). Personal signatures never carry it.
 * @returns {string} Signature HTML, safe to write to Gmail settings.sendAs.
 */
export function renderSignature({ name, title, email, includeAddress = false }) {
  const safeName = escapeHtml(name);
  const safeTitle = escapeHtml(title);
  const safeEmail = escapeHtml(email);

  const link = (href, label) =>
    `<a href="${escapeHtml(href)}" style="color:${BRAND.linkColor};` +
    `text-decoration:none;">${label}</a>`;

  const rows = [
    textRow(safeName, { size: 14, color: BRAND.nameColor, weight: 'bold', lineHeight: 19 }),
    textRow(`${safeTitle} &middot; ${BRAND.company}`, {
      size: 13,
      color: BRAND.softColor,
      lineHeight: 18,
    }),
    textRow(
      `${link(`mailto:${email}`, safeEmail)}` +
        `<span style="color:${BRAND.softColor};"> &middot; </span>` +
        `${link(BRAND.siteUrl, BRAND.site)}`,
      { size: 13, color: BRAND.softColor, lineHeight: 20 },
    ),
  ];

  if (includeAddress) {
    rows.push(
      textRow(escapeHtml(BRAND.address), {
        size: 12,
        color: BRAND.softColor,
        lineHeight: 17,
      }),
    );
  }

  return (
    `<table cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-collapse:collapse;font-family:${BRAND.fontStack};">` +
    `<tr>` +
    `<td style="padding:0 14px 0 0;vertical-align:middle;">` +
    `<img src="${BRAND.markUrl}" width="${BRAND.markWidth}" ` +
    `height="${BRAND.markHeight}" alt="DragonCandy" border="0" ` +
    `style="display:block;border:0;outline:none;text-decoration:none;"></td>` +
    `<td style="padding:0 0 0 14px;border-left:1px solid ${BRAND.lineColor};` +
    `vertical-align:middle;">` +
    `<table cellpadding="0" cellspacing="0" border="0" ` +
    `style="border-collapse:collapse;">${rows.join('')}</table>` +
    `</td></tr></table>`
  );
}
