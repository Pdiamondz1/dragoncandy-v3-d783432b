# Google Workspace Wave 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up DragonCandy's Google Workspace as a real corporate workspace — two shared drives, nine Google Groups replacing personal aliases, a board member's account, brand assets, and four email signatures that install themselves on every current and future employee.

**Architecture:** The repo holds the *code* (a pure signature renderer with unit tests, an Apps Script driver, brand PNG exports); Google Workspace holds the *configuration*. A service account with domain-wide delegation lets a daily Apps Script read the directory and write each user's Gmail signature — so a new hire is signed within 24 hours with no onboarding step. Titles come from the Workspace directory, never from hardcoded lists, so there is exactly one place a title can be wrong.

**Tech Stack:** Google Apps Script (V8 runtime), Gmail API `settings.sendAs`, Admin SDK Directory API, `clasp` for deploying Apps Script from the repo, Vitest for the renderer tests, `sips` for PNG export.

**Spec:** `docs/superpowers/specs/2026-08-20-google-workspace-corporate-setup-design.md`

## Executor legend

This plan is **not all code**, and that matters for who can run each task.

| Marker | Meaning |
|---|---|
| **AGENT** | Repo work. A subagent can do this start to finish. |
| **FOUNDER** | Google admin console or GCP. Requires super-admin. **No agent, no connector, and no API available in this session can do these.** |
| **BOTH** | Agent prepares, founder executes and reports back. |

Do not let a subagent claim a **FOUNDER** task is complete. Its deliverable is a
verification report pasted back into the session, not a code change.

## Global Constraints

Copied verbatim from the spec. Every task's requirements implicitly include these.

- **Domain:** `dragoncandy.com`. Legal entity: `Dragon Candy LLC`.
- **Registered address (D&B form, the one Apple matches):** `33-41 Newark St., 5th Floor, Hoboken, NJ 07030`. Do **not** substitute the IRS form, which omits the floor.
- **Signature colours:** name `#241332`, secondary text and separators `#6B5A7E`, links `#C22760`, hairline `#EFE8F5`. These are `landing-*` tokens from `tailwind.config.ts`. Introduce no new colours.
- **Signature font stack:** `Arial, Helvetica, sans-serif`. Webfonts are impossible in email — never emit `@font-face`, `<style>`, `class=`, or a font not on that stack.
- **Signature layout is `<table>` only.** No `<div>` layout. All CSS inline. `<img>` carries explicit `width`, `height`, `border="0"` and `alt`.
- **The image is never load-bearing.** No name, title, address or contact detail may exist only inside an image.
- **Personal signatures carry no postal address and no phone.** Shared send-as identities carry the registered address. No phone number anywhere.
- **Mark asset:** `https://dragoncandy.com/brand/dc-mark-104.png`, 104×122, displayed at 52×61, transparent background preserved.
- **Signature size:** under 10,000 characters (Gmail's field cap).
- **Roster and titles:** Damon Williams / `dame@` / CTO · Joe Castelo / `joe@` / CEO · Juwan Robinson / `jay@` / Co-founder · Adrian Vella / `adrian@` / Board Member. Public-facing form is "Juwan Robinson"; `jay` is a mailbox local-part, never a display name.

### Known local-environment hazard

This machine runs **Node v26.7.0**, and `CLAUDE.md` records that Node 26 shadows
jsdom's `localStorage`, breaking ~50 tests that pass in CI. The tests in this
plan use `environment: 'node'` and are pure functions, so they are unaffected —
but **run only your own test file** (`npx vitest run <path>`), never the full
suite, or you will see pre-existing failures and mistake them for your own.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `scripts/workspace/signature.js` | Pure signature renderer. No I/O, no Google APIs. The only place signature HTML is defined. |
| `scripts/workspace/signature.test.js` | Vitest unit tests for the renderer — escaping, email-safety rules, address policy, size cap. |
| `scripts/workspace/Code.gs.js` | Apps Script driver: service-account impersonation, directory listing, per-send-as update loop, run log. Not unit-tested (needs the GAS runtime). |
| `scripts/workspace/build-gs.mjs` | Strips ESM `export` keywords so `signature.js` is loadable by the Apps Script runtime; emits `scripts/workspace/dist/`. |
| `scripts/workspace/README.md` | The domain-wide-delegation setup runbook and the security note about what that service account can do. |
| `public/brand/dc-mark-104.png` | Signature image, 104×122, transparent. |
| `public/brand/dc-mark-512.png` | General-purpose mark, 440×512, transparent. |
| `public/brand/README.md` | Why these exist and the exact command to regenerate them. |

**Modified:**

| Path | Change |
|---|---|
| `package.json` | Add `build:workspace` script. |
| `src/pitch/slides/slides.tsx:483-498` | Three stale titles in the live investor deck. |
| `docs/PROJECT_CONTEXT.md:36-38` | Two stale co-founder titles. |
| `docs/dragoncandy-origin-story.md:19-24` | Two stale co-founder titles. |
| `src/lib/contactAddresses.ts` | Comment describing the alias arrangement, after Task 8 makes it untrue. |

**Why the renderer is a separate file from the driver:** the renderer is pure and
testable; the driver needs Google's runtime and cannot be unit-tested at all.
Keeping them apart means the risky, detail-heavy part (email HTML correctness)
is fully covered by tests, and the untestable part stays thin enough to review
by eye.

---

## Task 1: Verify the Workspace plan supports shared drives

**Executor: FOUNDER** — blocking gate for Tasks 6–9.

**Files:** none.

**Interfaces:**
- Consumes: nothing.
- Produces: a yes/no that Tasks 6–9 depend on entirely.

Shared drives require Google Workspace **Business Standard or above**. On
Business Starter they do not exist, and §4 of the spec has no valid
implementation — the fallback is a folder in `dame@`'s My Drive, which the spec
records as materially worse because every file would be owned by one person.

- [ ] **Step 1: Read the current plan**

Go to `admin.google.com` → **Billing** → **Subscriptions**. Read the plan name
on the Google Workspace line.

- [ ] **Step 2: Confirm shared drives are actually available**

Go to `drive.google.com` and look for **Shared drives** in the left sidebar.
Presence of that section is the real test — the billing page tells you the SKU,
the sidebar tells you whether the feature is switched on for your account.

- [ ] **Step 3: Report the result**

Paste back: the plan name, and whether "Shared drives" appears in the sidebar.

**STOP IF:** the plan is Business Starter, or the sidebar has no Shared drives
section. Do not proceed to Task 6. Bring it back to the session — the choice is
an upgrade (about $5/user/month more) versus falling back to a My Drive folder,
and that is a founder decision, not an implementation detail.

**Tasks 2–5 do not depend on this** and can run in parallel.

---

## Task 2: Export the brand PNGs

**Executor: AGENT**

**Files:**
- Create: `public/brand/dc-mark-104.png`
- Create: `public/brand/dc-mark-512.png`
- Create: `public/brand/README.md`

**Interfaces:**
- Consumes: `public/logo.webp` (280×326, alpha channel present — verified).
- Produces: `https://dragoncandy.com/brand/dc-mark-104.png` at 104×122, consumed by `signature.js` in Task 3.

Outlook for Windows renders mail with the Word engine and cannot display WebP,
so the existing `logo.webp` is unusable in a signature. The alpha channel must
survive, because a mark with an opaque white background becomes a glowing slab
in a dark-mode inbox.

- [ ] **Step 1: Generate both PNGs**

```bash
sips -s format png public/logo.webp --out /tmp/dc-mark-full.png
sips -z 122 104 /tmp/dc-mark-full.png --out public/brand/dc-mark-104.png
sips -z 512 440 /tmp/dc-mark-full.png --out public/brand/dc-mark-512.png
```

`sips -z` takes **height then width** and does not preserve aspect ratio, which
is what we want here: 104×122 is exactly 2× the 52×61 display size, and the
0.7% distortion from the true 280:326 ratio is invisible at this scale.

- [ ] **Step 2: Verify dimensions and alpha survived**

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha public/brand/dc-mark-104.png
sips -g pixelWidth -g pixelHeight -g hasAlpha public/brand/dc-mark-512.png
```

Expected: `104 × 122 hasAlpha: yes` and `440 × 512 hasAlpha: yes`.

**If `hasAlpha` is `no` on either file, stop.** The dark-mode behaviour depends
on it and there is no point continuing with an opaque mark.

- [ ] **Step 3: Write the regeneration note**

Create `public/brand/README.md`:

```markdown
# Brand assets

Public, stable URLs for brand marks used outside the app — chiefly email
signatures, which cannot reference anything in `src/`.

| File | Size | Used by |
|------|------|---------|
| `dc-mark-104.png` | 104×122 | Email signatures. Displayed at 52×61; this is the 2× retina asset. |
| `dc-mark-512.png` | 440×512 | Documents, decks, general use. |

Both are served at `https://dragoncandy.com/brand/<file>` because Vercel serves
`public/` from the site root.

## Why PNG and not the existing `logo.webp`

Outlook for Windows renders mail with the Word engine, which has no WebP
support — the mark would appear as a broken-image box in a large share of
business inboxes.

## Transparency is load-bearing

Both files keep an alpha channel. Apple Mail and Outlook auto-invert light
signatures in dark mode; a mark with an opaque white background becomes a
glowing white slab. Any regeneration MUST preserve alpha — check it.

## Regenerate

    sips -s format png public/logo.webp --out /tmp/dc-mark-full.png
    sips -z 122 104 /tmp/dc-mark-full.png --out public/brand/dc-mark-104.png
    sips -z 512 440 /tmp/dc-mark-full.png --out public/brand/dc-mark-512.png
    sips -g hasAlpha public/brand/dc-mark-104.png   # must print: hasAlpha: yes
```

- [ ] **Step 4: Commit**

```bash
git add public/brand/
git commit -m "feat(brand): PNG mark exports for email signatures

Outlook for Windows cannot render WebP, so logo.webp is unusable in a
signature. Both exports preserve the alpha channel -- an opaque mark
becomes a glowing slab when a client auto-inverts for dark mode."
```

---

## Task 3: Signature renderer (TDD)

**Executor: AGENT**

**Files:**
- Create: `scripts/workspace/signature.js`
- Test: `scripts/workspace/signature.test.js`

**Interfaces:**
- Consumes: the mark URL from Task 2.
- Produces:
  - `renderSignature({ name, title, email, includeAddress })` → `string` (HTML)
  - `escapeHtml(value)` → `string`
  - `BRAND` → frozen object of constants
  - Task 4's Apps Script driver calls `renderSignature` for every send-as identity.

- [ ] **Step 1: Write the failing tests**

Create `scripts/workspace/signature.test.js`:

```js
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
```

- [ ] **Step 2: Run the tests and watch them fail**

```bash
npx vitest run scripts/workspace/signature.test.js
```

Expected: FAIL — `Failed to resolve import "./signature.js"`.

- [ ] **Step 3: Write the renderer**

Create `scripts/workspace/signature.js`:

```js
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
```

- [ ] **Step 4: Run the tests and watch them pass**

```bash
npx vitest run scripts/workspace/signature.test.js
```

Expected: PASS, 15 tests (16 after Task 3's fix round adds the BRAND-frozen test).

- [ ] **Step 5: Eyeball the output once**

```bash
node -e "import('./scripts/workspace/signature.js').then(m => console.log(m.renderSignature({name:'Damon Williams',title:'CTO',email:'dame@dragoncandy.com'})))"
```

Read it. Confirm by eye: one outer table, one nested table, no `<div>`, every
`style=` inline, the `<img>` carrying `width`/`height`/`alt`/`border`.

- [ ] **Step 6: Commit**

```bash
git add scripts/workspace/signature.js scripts/workspace/signature.test.js
git commit -m "feat(workspace): pure email signature renderer with tests

Tables not divs, inline styles only, Arial only -- webfonts do not exist
in email, so DragonCandy's real typefaces cannot appear as text in a
signature at all. Nothing load-bearing lives inside the image, so a
recipient with images blocked still gets a complete signature.

15 tests cover escaping, the client-safety rules, the address policy
(personal signatures carry none) and the Gmail size cap."
```

---

## Task 4: Apps Script driver and build step

**Executor: AGENT**

**Files:**
- Create: `scripts/workspace/Code.gs.js`
- Create: `scripts/workspace/build-gs.mjs`
- Create: `scripts/workspace/README.md`
- Modify: `package.json` (add `build:workspace`)

**Interfaces:**
- Consumes: `renderSignature` and `BRAND` from Task 3.
- Produces:
  - `scripts/workspace/dist/Signature.gs` and `dist/Code.gs`, the two files `clasp push` uploads.
  - `installAllSignatures()` — the Apps Script entry point Task 10 puts on a daily trigger.

The renderer is written as an ES module so Vitest can import it. The Apps
Script V8 runtime does **not** support `export`, so the build step strips those
keywords. This is why `dist/` exists rather than pushing the source directly.

- [ ] **Step 1: Write the build step**

Create `scripts/workspace/build-gs.mjs`:

```js
#!/usr/bin/env node
/**
 * Prepares scripts/workspace/ for `clasp push`.
 *
 * signature.js is an ES module so Vitest can import and test it. The Apps
 * Script V8 runtime has no module system -- every .gs file shares one global
 * scope and `export` is a syntax error. So we strip the export keywords and
 * emit .gs files.
 *
 * Deliberately a dumb text transform, not a bundler: the input is one file of
 * plain functions with no imports, and a bundler here would be machinery
 * nobody wants to maintain for a 4-person company's email signatures.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, 'dist');
mkdirSync(dist, { recursive: true });

function stripExports(source) {
  return source
    .replace(/^export const /gm, 'const ')
    .replace(/^export function /gm, 'function ')
    .replace(/^export default /gm, '');
}

for (const [from, to] of [
  ['signature.js', 'Signature.gs'],
  ['Code.gs.js', 'Code.gs'],
]) {
  const source = readFileSync(join(here, from), 'utf8');
  const out = stripExports(source);
  if (/^\s*(export|import)\s/m.test(out)) {
    throw new Error(`${from}: module syntax survived the transform — Apps Script will reject it`);
  }
  writeFileSync(join(dist, to), out);
  console.log(`  ${from} -> dist/${to}`);
}

console.log('Ready for: cd scripts/workspace && clasp push');
```

- [ ] **Step 2: Write the Apps Script driver**

Create `scripts/workspace/Code.gs.js`:

```js
/**
 * DragonCandy signature installer — runs in Google Apps Script.
 *
 * Reads every active user in the domain from the Admin SDK, renders their
 * signature with renderSignature() (Signature.gs), and writes it to every
 * send-as identity on their account via the Gmail API.
 *
 * WHY A SERVICE ACCOUNT: Apps Script's own credentials are per-user. A script
 * running as an admin still cannot write another user's Gmail settings. Only a
 * service account with domain-wide delegation can impersonate each user. See
 * README.md for the one-time setup, and for what that grant actually permits.
 *
 * WHY TITLES COME FROM THE DIRECTORY: so there is exactly one place a title
 * can be wrong. This repo has three copies of two stale titles right now --
 * that is the failure mode this avoids.
 *
 * NOT TESTED BY VITEST: everything here needs the GAS runtime. Kept thin on
 * purpose; all the fiddly logic lives in the tested renderer.
 */

var DOMAIN = 'dragoncandy.com';

/**
 * Send-as identities that represent the company rather than a person, and
 * therefore carry the registered postal address (spec decision 7).
 */
var SHARED_IDENTITIES = [
  'support@dragoncandy.com',
  'sales@dragoncandy.com',
  'info@dragoncandy.com',
  'admin@dragoncandy.com',
  'privacy@dragoncandy.com',
  'legal@dragoncandy.com',
  'appstore@dragoncandy.com',
];

function isSharedIdentity_(email) {
  return SHARED_IDENTITIES.indexOf(String(email).toLowerCase()) !== -1;
}

/** Entry point. This is the function the daily trigger calls. */
function installAllSignatures() {
  var users = listDomainUsers_();
  var results = [];

  for (var i = 0; i < users.length; i++) {
    var user = users[i];
    try {
      var count = installForUser_(user);
      results.push([new Date(), user.primaryEmail, user.title || '(no title)', 'ok', count + ' identities']);
    } catch (err) {
      results.push([new Date(), user.primaryEmail, user.title || '(no title)', 'ERROR', String(err)]);
    }
  }

  appendRunLog_(results);
  return results;
}

/** Active, non-suspended users in the domain, with their directory title. */
function listDomainUsers_() {
  var users = [];
  var pageToken = null;

  do {
    var page = AdminDirectory.Users.list({
      domain: DOMAIN,
      maxResults: 200,
      orderBy: 'email',
      pageToken: pageToken,
      projection: 'full',
    });
    (page.users || []).forEach(function (u) {
      if (u.suspended) return;
      users.push({
        primaryEmail: u.primaryEmail,
        name: u.name && u.name.fullName ? u.name.fullName : u.primaryEmail,
        title: u.organizations && u.organizations.length ? u.organizations[0].title : '',
      });
    });
    pageToken = page.nextPageToken;
  } while (pageToken);

  return users;
}

/** Writes a signature to every send-as identity on one user's account. */
function installForUser_(user) {
  if (!user.title) {
    throw new Error('no title set in the directory — refusing to write a signature without one');
  }

  var token = getImpersonatedToken_(user.primaryEmail);
  var identities = gmailApi_(token, 'settings/sendAs', 'get').sendAs || [];
  var written = 0;

  for (var i = 0; i < identities.length; i++) {
    var identity = identities[i];
    if (identity.verificationStatus === 'pending') continue;

    var shared = isSharedIdentity_(identity.sendAsEmail);
    var html = renderSignature({
      name: shared ? 'DragonCandy' : user.name,
      title: shared ? titleForShared_(identity.sendAsEmail) : user.title,
      email: identity.sendAsEmail,
      includeAddress: shared,
    });

    gmailApi_(
      token,
      'settings/sendAs/' + encodeURIComponent(identity.sendAsEmail),
      'patch',
      { signature: html },
    );
    written++;
  }

  return written;
}

function titleForShared_(email) {
  var local = String(email).split('@')[0];
  var labels = {
    support: 'Support',
    sales: 'Sales',
    info: 'General enquiries',
    admin: 'Accounts',
    privacy: 'Privacy',
    legal: 'Legal',
    appstore: 'App Store',
  };
  return labels[local] || local;
}

/** Gmail REST call as the impersonated user. */
function gmailApi_(token, path, method, body) {
  var options = {
    method: method,
    headers: { Authorization: 'Bearer ' + token },
    contentType: 'application/json',
    muteHttpExceptions: true,
  };
  if (body) options.payload = JSON.stringify(body);

  var response = UrlFetchApp.fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/' + path,
    options,
  );
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Gmail API ' + code + ': ' + response.getContentText());
  }
  return JSON.parse(response.getContentText() || '{}');
}

/**
 * Mints an access token for `userEmail` using the delegated service account.
 * Signed JWT -> Google token endpoint, the standard domain-wide-delegation flow.
 */
function getImpersonatedToken_(userEmail) {
  var props = PropertiesService.getScriptProperties();
  var clientEmail = props.getProperty('SA_CLIENT_EMAIL');
  var privateKey = props.getProperty('SA_PRIVATE_KEY');

  if (!clientEmail || !privateKey) {
    throw new Error('SA_CLIENT_EMAIL / SA_PRIVATE_KEY missing from script properties — see README.md');
  }
  privateKey = privateKey.replace(/\\n/g, '\n');

  var now = Math.floor(Date.now() / 1000);
  var encode = function (obj) {
    return Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  };

  var unsigned =
    encode({ alg: 'RS256', typ: 'JWT' }) +
    '.' +
    encode({
      iss: clientEmail,
      sub: userEmail,
      scope: 'https://www.googleapis.com/auth/gmail.settings.basic',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    });

  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(unsigned, privateKey),
  ).replace(/=+$/, '');

  var response = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: unsigned + '.' + signature,
    },
    muteHttpExceptions: true,
  });

  var body = JSON.parse(response.getContentText());
  if (!body.access_token) {
    throw new Error('token exchange failed for ' + userEmail + ': ' + response.getContentText());
  }
  return body.access_token;
}

/** Appends this run to the log Sheet in 06 · Brand. */
function appendRunLog_(rows) {
  var id = PropertiesService.getScriptProperties().getProperty('LOG_SHEET_ID');
  if (!id) return;
  var sheet = SpreadsheetApp.openById(id).getSheets()[0];
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  }
}

/** Run this by hand first. Reports what WOULD change, writes nothing. */
function dryRun() {
  var users = listDomainUsers_();
  users.forEach(function (u) {
    Logger.log(
      '%s | %s | %s',
      u.primaryEmail,
      u.title || '*** NO TITLE — would fail ***',
      u.name,
    );
  });
  return users;
}
```

- [ ] **Step 3: Write the setup runbook**

Create `scripts/workspace/README.md`:

```markdown
# Workspace signature automation

Installs every DragonCandy employee's Gmail signature automatically, and keeps
them installed. A new hire is signed within 24 hours of appearing in the
directory, with no onboarding step.

## Why this exists at all

Google Workspace has **no built-in signature management**. There is no admin
setting that applies a signature to everyone. The Gmail API is the only
first-party mechanism, and it needs a service account to act on other people's
accounts.

(Admin -> Gmail -> Compliance -> *Append footer* is not this. It appends below
the entire quoted thread, so on any reply it lands detached at the bottom.)

## Security note — read before setting this up

The service account below can **change Gmail settings for every account in the
domain, indefinitely**. That is standard practice for this task and it is also
a real standing grant. Its private key lives in Apps Script *script properties*
and must never be committed to this repo.

If a new engineer asks "what can that service account do?" — this paragraph is
the answer.

## One-time setup

1. **GCP project** — create one (or reuse the existing DragonCandy project).
   Enable the **Gmail API** and the **Admin SDK API**.
2. **Service account** — create one, no project roles needed. Create a JSON key
   and download it. Note the **client email** and the numeric **client ID**.
3. **Domain-wide delegation** — `admin.google.com` -> Security -> Access and
   data control -> API controls -> Domain-wide delegation -> Add new. Enter the
   numeric client ID and exactly these two scopes:

       https://www.googleapis.com/auth/gmail.settings.basic
       https://www.googleapis.com/auth/admin.directory.user.readonly

4. **Apps Script project** — create one at script.google.com owned by an admin.
   Add the **Admin SDK Directory API** advanced service (identifier
   `AdminDirectory`). Then Project Settings -> Script Properties:

   | Property | Value |
   |---|---|
   | `SA_CLIENT_EMAIL` | the service account's client email |
   | `SA_PRIVATE_KEY` | `private_key` from the JSON key, newlines as `\n` |
   | `LOG_SHEET_ID` | id of the run-log Sheet in `06 · Brand` |

5. **Push the code**

       npm run build:workspace
       cd scripts/workspace && clasp push

6. **Dry run before anything is written.** Run `dryRun()` in the Apps Script
   editor and read the log. Every user must show a title. A user with no title
   is refused rather than given a signature with a blank line -- set their title
   in the admin console first.

7. **Run `installAllSignatures()` once by hand.** Check the log Sheet, then
   check a real inbox.

8. **Add the trigger** — Triggers -> Add trigger -> `installAllSignatures`,
   time-driven, day timer, 2am-3am.

## Editing a signature

Edit `signature.js`, run its tests, `npm run build:workspace`, `clasp push`.
Never edit the `.gs` files in `dist/` -- they are generated and will be
overwritten.

## Changing someone's title

Change it in the Google admin console. The script reads titles from the
directory, so the signature follows within 24 hours. Do not hardcode titles
here.
```

- [ ] **Step 4: Add the build script to package.json**

In `package.json`, add to `"scripts"`, immediately after `"docs:scale"`:

```json
    "build:workspace": "node scripts/workspace/build-gs.mjs",
```

- [ ] **Step 5: Run the build and verify the transform**

```bash
npm run build:workspace
grep -c "^export " scripts/workspace/dist/Signature.gs
grep -c "^function renderSignature" scripts/workspace/dist/Signature.gs
```

Expected: `build:workspace` prints two `->` lines; the first grep prints `0`
(no module syntax survived); the second prints `1` (the function is present as
a plain global).

- [ ] **Step 6: Confirm the renderer tests still pass after the refactor**

```bash
npx vitest run scripts/workspace/signature.test.js
```

Expected: PASS, 16 tests. The build step must not have changed the source.

- [ ] **Step 7: Ignore the generated directory**

Append to `.gitignore`:

```
# Generated by npm run build:workspace for clasp push
scripts/workspace/dist/
```

- [ ] **Step 8: Commit**

```bash
git add scripts/workspace/ package.json .gitignore
git commit -m "feat(workspace): Apps Script signature installer

Google Workspace has no built-in signature management, so this is the
Gmail API via a service account with domain-wide delegation, on a daily
trigger. New hires are signed within 24h with no onboarding step.

Titles are read from the Workspace directory rather than hardcoded, so
there is exactly one place a title can be wrong -- this repo currently
has three copies of two stale titles, which is the failure this avoids.

A user with no directory title is refused, not given a blank line."
```

---

## Task 5: Fix the three stale titles

**Executor: AGENT**

**Files:**
- Modify: `src/pitch/slides/slides.tsx:483-498`
- Modify: `docs/PROJECT_CONTEXT.md:36-38`
- Modify: `docs/dragoncandy-origin-story.md:19-24`

**Interfaces:**
- Consumes: the roster in Global Constraints.
- Produces: nothing other tasks depend on. Independent — can run any time.

Confirmed by the founder on 2026-08-20: Dame is **CTO** (recorded as
Co-founder & CPO), Juwan is **Co-founder** (recorded as Shareholder &
Advisor), Joe is **CEO** (recorded in the deck as Co-founder · CRO).

`slides.tsx` is the live investor deck and is the urgent one — a signature block
that disagrees with the deck Joe is emailing is exactly what a diligence reader
notices.

- [ ] **Step 1: Fix the investor deck**

In `src/pitch/slides/slides.tsx`, in `SlideTeam`, replace the three `role`
values:

```ts
    {
      name: "Damon “Dame” Williams",
      role: "Co-founder · CTO",
      body: "Product and platform — architect of the DragonCandy experience and the Donny AI intelligence layer.",
    },
    {
      name: "Joe Castelo",
      role: "Co-founder · CEO",
      body: "Sales & partnerships. 70-year Hoboken hospitality family; award-winning operator and dealmaker.",
    },
    {
      name: "Juwan Robinson",
      role: "Co-founder",
      body: "Strategic guidance and capital network across the growth roadmap.",
    },
```

Change `role` only. Leave `name` and `body` exactly as they are.

- [ ] **Step 2: Fix PROJECT_CONTEXT.md**

Replace lines 36-38:

```markdown
- Damon "Dame" Williams — co-founder, CTO
- Joe Castelo — CEO, Sales & Partnerships
- Juwan Robinson — co-founder
```

- [ ] **Step 3: Fix the origin story**

In `docs/dragoncandy-origin-story.md`, in "Facts & roles (canonical)":

```markdown
- **Juwan Robinson** — Co-founder. Co-explored the original
  content-creator-agency idea with Joe.
- **Damon "Dame" Williams** — Co-founder & CTO. Senior software engineer,
```

Leave Joe's line unchanged — it already says CEO.

- [ ] **Step 4: Check nothing else still carries a stale title**

```bash
grep -rn "CPO\|Shareholder & Advisor\|CRO" src/ docs/ --include=*.ts --include=*.tsx --include=*.md | grep -v node_modules
```

Expected: no hits outside `docs/superpowers/` (specs and plans quote the old
titles deliberately, as the record of what was wrong) and `docs/archive/`.
Fix anything else you find.

- [ ] **Step 5: Verify the build still passes**

```bash
npm run typecheck && npm run build
```

Expected: both succeed. `slides.tsx` is application code.

- [ ] **Step 6: Commit**

```bash
git add src/pitch/slides/slides.tsx docs/PROJECT_CONTEXT.md docs/dragoncandy-origin-story.md
git commit -m "fix(docs): correct three stale founder titles

Dame is CTO (recorded as CPO), Juwan is Co-founder (recorded as
Shareholder & Advisor), Joe is CEO (recorded in the deck as CRO).
Confirmed by the founder 2026-08-20.

src/pitch/slides is the live investor deck, so all three were wrong in
the document Joe emails to investors."
```

---

## Task 6: Create the two shared drives and eleven folders

**Executor: FOUNDER** — depends on Task 1 passing.

**Files:** none in the repo.

**Interfaces:**
- Consumes: Task 1's confirmation that shared drives exist.
- Produces: the folder IDs Task 7 grants access to and Waves 2–3 write into.

Shared drives cannot be created through any API available to this session, and
`13 · Board` needs a folder-level share that must be set by hand.

- [ ] **Step 1: Create both drives**

`drive.google.com` → Shared drives → New. Create exactly:

- `DragonCandy`
- `DragonCandy — Confidential` (em dash, matching the spec)

- [ ] **Step 2: Create the folders**

In `DragonCandy`:

```
00 · Company
01 · Product
02 · Engineering
03 · Strategy & GTM
04 · Sales
05 · People
06 · Brand
```

In `DragonCandy — Confidential`:

```
10 · Legal
11 · Finance
12 · People (private)
13 · Board
```

The numeric prefixes are functional — Google sorts folders alphabetically and
this is the only way to control order. The `·` is a middle dot (U+00B7).

- [ ] **Step 3: Verify the count and the ordering**

Open each drive. Expected: 7 folders in `DragonCandy`, 4 in
`DragonCandy — Confidential`, each listing in numeric order.

- [ ] **Step 4: Create the signature run-log Sheet**

Inside `06 · Brand`, create a Google Sheet named `Signature install log`. Put
these headers in row 1:

```
Timestamp | User | Title | Status | Detail
```

Copy its file ID from the URL (`docs.google.com/spreadsheets/d/<ID>/edit`).
This is the `LOG_SHEET_ID` script property in Task 10. Without it the script
still runs, but silently — `appendRunLog_` returns early when the property is
unset, so a failing nightly run would leave no trace anywhere.

- [ ] **Step 5: Reconnect the Claude Drive connector to `dame@dragoncandy.com`**

The connector is currently authenticated as `dwilliams@harbormill.net` —
verified at the start of this design session, where recent files came back owned
by harbormill. Reconnect it to the DragonCandy account.

Nothing in Wave 1 needs this: every Drive step here is admin-console work. It is
done now because **Wave 2 creates roughly twenty documents**, and creating them
under the wrong account would put the company's document set in a personal Drive
that the organisation does not own.

- [ ] **Step 6: Report back**

Paste the two shared drive URLs and the log Sheet ID into the session, and
confirm the connector now shows a `dragoncandy.com` account.

---

## Task 7: Create Adrian's account and grant board access

**Executor: FOUNDER** — depends on Task 6.

**Interfaces:**
- Consumes: the `13 · Board` folder from Task 6.
- Produces: a fourth directory user, which Task 10 will sign automatically.

- [ ] **Step 1: Create the account**

`admin.google.com` → Directory → Users → Add new user.

- Name: `Adrian Vella`
- Primary email: `adrian@dragoncandy.com`

- [ ] **Step 2: Set the job title — this is required, not optional**

Edit the user → **Job title: `Board Member`**.

The signature script reads titles from the directory and **refuses to write a
signature for a user with no title** rather than producing one with a blank
line. Skipping this makes Task 10 fail for Adrian.

- [ ] **Step 3: Grant board folder access only**

Open `13 · Board` in `DragonCandy — Confidential` → Share → add
`adrian@dragoncandy.com` as **Content manager**.

Do **not** add him as a member of either shared drive. Folder-level sharing
grants access to that subtree only; drive membership would expose Legal,
Finance and the private People folder.

- [ ] **Step 4: Verify the boundary**

Have Adrian (or an incognito session as him) open `drive.google.com`:

- `13 · Board` — reachable
- `10 · Legal`, `11 · Finance`, `12 · People (private)` — **not** visible
- Neither shared drive appears in his sidebar

**If either shared drive appears in his sidebar, stop and fix it.** He was added
as a drive member rather than a folder collaborator, and he can see the cap
table.

- [ ] **Step 5: Report back**

Confirm the title is set and the four checks in Step 4.

---

## Task 8: Convert the nine aliases to Google Groups

**Executor: FOUNDER** — the highest-risk task in this plan. Order is not optional.

**Interfaces:**
- Consumes: nothing.
- Produces: `staff@` and `founders@`, which Task 9 uses for drive access; and the working shared mailboxes Task 10's signatures sign off as.

As of 2026-08-10 these were **aliases on `dame@` with zero groups in the org**
(`src/lib/contactAddresses.ts` records this). `privacy@` and `legal@` carry legal
response obligations, and `admin@` receives live Stripe dispute alerts from
`supabase/functions/stripe-webhook`. Dropping mail here is not cosmetic.

**The rule: create, verify, and only then retire the alias.** Removing an alias
before its group works drops mail on the floor with no bounce.

- [ ] **Step 1: Create the nine groups**

`admin.google.com` → Directory → Groups → Create group. For each:

| Group | Members |
|---|---|
| `founders@dragoncandy.com` | dame, joe, jay |
| `staff@dragoncandy.com` | dame, joe, jay (hires added as they start) |
| `support@dragoncandy.com` | dame |
| `sales@dragoncandy.com` | joe |
| `info@dragoncandy.com` | joe, dame |
| `admin@dragoncandy.com` | dame |
| `privacy@dragoncandy.com` | dame, joe |
| `legal@dragoncandy.com` | dame, joe |
| `appstore@dragoncandy.com` | dame |

`legal@` is new — it has no alias to retire.

**Name collision:** a group cannot be created while an alias of the same address
exists on `dame@`. For each of the eight that collide, the sequence within this
step is: remove the alias, immediately create the group, add members, then run
Step 2 for that address before moving to the next. Do one address at a time.
Doing all eight removals first opens a window where the whole shared surface is
dark.

- [ ] **Step 2: Verify delivery, one address at a time**

From an **outside** address (a personal Gmail, not a `dragoncandy.com` one),
send a test message to the address you just created. Confirm it arrives for
**every** listed member, not just Dame.

Sending from inside the domain can take a different path and is not a valid
test of external delivery.

- [ ] **Step 3: Set who may post**

For each group → Settings → *Who can post*: **Anyone on the web**, for the seven
externally-reachable addresses (`support`, `sales`, `info`, `admin`, `privacy`,
`legal`, `appstore`). Customers and lawyers are outside the org, and the default
often is not this.

For `founders@` and `staff@` → **Organization members** only. These are internal
lists and should not be an inbound spam surface.

- [ ] **Step 4: Verify the Stripe dispute path specifically**

`admin@` receives live dispute alerts. Confirm from outside that a message to
`admin@dragoncandy.com` reaches Dame's inbox after the conversion.

This is checked explicitly rather than assumed because the sender is an edge
function nobody will notice failing.

- [ ] **Step 5: Confirm no aliases remain**

`admin.google.com` → Directory → Users → `dame@` → User information → Email
aliases. Expected: **empty**, or only aliases deliberately kept.

- [ ] **Step 6: Re-add each shared address as a send-as identity — Task 10 silently does nothing without this**

**A Google Group is not a send-as identity.** While `support@`, `sales@` and the
rest were *aliases on `dame@`*, they appeared automatically in Gmail's send-as
list, which is how the signature script finds them. Converting them to Groups in
Step 1 **removes them from every user's send-as list.**

The consequence is specific and easy to miss: Task 10's installer will run,
report success, and install **zero** shared-mailbox signatures — so the
registered postal address that spec decision 7 puts on shared identities never
appears anywhere. The script now logs a warning when this happens, but the
warning is a smoke alarm, not a fix.

For each person who should be able to send as a shared address, on **their own
account**: Gmail → Settings → Accounts and Import → *Send mail as* → **Add
another email address**. Enter the shared address, uncheck "Treat as an alias"
only if they want replies to go to the Group, and complete the verification.

Minimum set, matching the group memberships in Step 1:

| Person | Should be able to send as |
|---|---|
| Dame | `support@`, `admin@`, `appstore@`, `privacy@`, `legal@`, `info@` |
| Joe | `sales@`, `info@`, `privacy@`, `legal@` |

**Nobody but the account holder can do this step** — Gmail requires the owner to
complete verification, and no API and no admin can do it for them. That is why
it is a founder task and not something the script can absorb.

- [ ] **Step 7: Report back**

Paste: the nine groups with their member counts, confirmation that all nine
received an external test, the `admin@` result from Step 4, and which shared
addresses each person successfully added as a send-as identity in Step 6.

---

## Task 9: Grant shared drive access by group

**Executor: FOUNDER** — depends on Tasks 6 and 8.

**Interfaces:**
- Consumes: the drives from Task 6, the groups from Task 8.
- Produces: the access model the whole structure rests on.

- [ ] **Step 1: Grant access**

| Drive | Principal | Role |
|---|---|---|
| `DragonCandy` | `staff@dragoncandy.com` | **Contributor** |
| `DragonCandy` | `founders@dragoncandy.com` | **Manager** |
| `DragonCandy — Confidential` | `founders@dragoncandy.com` | **Manager** |

Add **no individuals** — access is by group, so a new hire joining `staff@`
gets everything at once and losing it is one removal.

`DragonCandy — Confidential` gets `founders@` and nothing else. `staff@` must
not appear on it in any role.

- [ ] **Step 2: Understand why Contributor, not Content manager**

Contributors create and edit but cannot permanently delete or move files out of
the drive. With four new hires arriving into an unfamiliar structure, that is
the right default.

- [ ] **Step 3: Verify with a real non-founder account**

There is no employee yet, so this cannot be fully verified until the first hire
starts. Record it as a Wave 2 first-day check: the new hire opens
`drive.google.com` and confirms they see `DragonCandy` and **not**
`DragonCandy — Confidential`.

- [ ] **Step 4: Report back**

Paste the membership list of both drives.

---

## Task 10: Deploy and verify the signature automation

**Executor: BOTH** — agent has already produced the code in Tasks 3 and 4.

**Interfaces:**
- Consumes: `dist/Signature.gs` and `dist/Code.gs` (Task 4), the mark URL (Task 2), Adrian's account (Task 7), the shared identities (Task 8).
- Produces: signatures on every account, and a daily trigger that keeps them there.

- [ ] **Step 1: Confirm the mark is actually reachable**

The signature references `https://dragoncandy.com/brand/dc-mark-104.png`. That
URL only exists once Task 2 is merged and Vercel has deployed.

```bash
curl -sI https://dragoncandy.com/brand/dc-mark-104.png | head -3
```

Expected: `HTTP/2 200` and `content-type: image/png`.

**If this 404s, stop.** Every signature would ship with a broken image.

- [ ] **Step 2: FOUNDER — complete the one-time setup**

Follow `scripts/workspace/README.md` "One-time setup", steps 1–4: GCP project,
service account, domain-wide delegation with exactly the two listed scopes, Apps
Script project with the `AdminDirectory` advanced service and the three script
properties.

- [ ] **Step 3: Push the code**

```bash
npm run build:workspace
cd scripts/workspace && clasp push
```

- [ ] **Step 4: Dry run — writes nothing**

Run `dryRun()` in the Apps Script editor. Read the execution log.

Expected: four rows — dame/CTO, joe/CEO, jay/Co-founder, adrian/Board Member.

**Every row must show a title.** A row reading `*** NO TITLE — would fail ***`
means that user's job title is unset in the admin console. Fix it there and
re-run; do not work around it in code.

- [ ] **Step 5: Install for real, once, by hand**

Run `installAllSignatures()`. Check the log Sheet: four rows, all `ok`.

- [ ] **Step 6: Verify in a real inbox — the check that actually matters**

Nothing above proves the HTML renders. From `dame@`, send a test message to an
outside address and confirm, in each of these:

| Client | What to check |
|---|---|
| Gmail web | mark visible, hairline present, links pink, no gaps |
| Gmail iOS or Android | nothing wraps or overflows at phone width |
| **Outlook for Windows** | **the mark renders at all** — this is the WebP failure mode Task 2 exists to prevent |
| Any client in dark mode | the mark does not become a white slab |
| Images disabled | the signature is still complete and legible |

The last two rows are the whole reason Option B was chosen over Option C. If
either fails, stop and bring it back — do not enable the trigger.

- [ ] **Step 7: Verify a shared identity carries the address**

**Precondition — Task 8 Step 6 must be done first.** If the shared addresses were
converted to Groups and nobody re-added them as send-as identities, there is
nothing here to test: the installer will have found zero shared identities and
logged a warning saying so. Check the run log for that warning before assuming
this step failed for some other reason.

Send from `sales@` on Joe's account and confirm the signature carries
`33-41 Newark St., 5th Floor, Hoboken, NJ 07030`.

Personal signatures must **not** show the address. Confirm Dame's does not.

- [ ] **Step 8: Enable the daily trigger**

Apps Script → Triggers → Add trigger → `installAllSignatures`, time-driven, day
timer, 2am–3am.

- [ ] **Step 9: Confirm it self-heals**

Change Dame's signature by hand in Gmail settings to anything. Run
`installAllSignatures()` manually. Confirm it reverts.

This is the property that makes new hires work without an onboarding step.

- [ ] **Step 10: Report back**

Paste the log Sheet contents and the results of the five client checks in
Step 6.

---

## Task 11: Update the contactAddresses.ts comment

**Executor: AGENT** — depends on Task 8 being verified complete.

**Files:**
- Modify: `src/lib/contactAddresses.ts` (the `DOMAIN MIGRATION STATUS` docblock)

**Interfaces:**
- Consumes: Task 8's confirmation that the groups are live.
- Produces: nothing.

That file currently documents the alias arrangement as present-tense fact and
flags the consequence: *"All five deliver to ONE person's inbox today. That is
fine at three employees and will not stay fine."* Task 8 resolves it. Leaving
the comment is how a true statement becomes a false one.

- [ ] **Step 1: Replace the closing paragraph**

Find:

```
 * All five deliver to ONE person's inbox today. That is fine at three
 * employees and will not stay fine. `privacy@` and `support@` in particular
 * want a shared mailbox someone else can cover. Flagged, not fixed.
```

Replace with:

```
 * RESOLVED 2026-08-20: these are now Google Groups, not aliases. `privacy@`
 * and `legal@` reach Dame and Joe; `support@`, `admin@` and `appstore@` reach
 * Dame; `sales@` reaches Joe; `info@` reaches both. Membership is managed in
 * the admin console, so this comment describes the shape and not the roster --
 * read the console for who is actually on a list.
 *
 * The lesson above still stands and is why the change was made: a shared
 * address that resolves to one person is a single point of failure with a
 * plural name on it.
```

Keep the paragraphs above it — the `RCPT TO` probe story is still true and
still the most useful thing in the file.

- [ ] **Step 2: Verify the docblock is still valid**

```bash
npm run typecheck
```

Expected: passes. Comment-only change.

- [ ] **Step 3: Commit**

```bash
git add src/lib/contactAddresses.ts
git commit -m "docs(contact): shared addresses are Groups now, not aliases

The file documented the alias arrangement in the present tense and
flagged that it would not stay fine at three employees. It did not --
Task 8 converted all nine to Google Groups. Recording the resolution
rather than leaving a comment that has quietly become false."
```

---

## Wave 1 done when

- [ ] Both shared drives exist with all eleven folders, access granted only by group
- [ ] Adrian can reach `13 · Board` and cannot see either drive
- [ ] All nine group addresses receive external mail for every member, and `dame@` has no leftover aliases
- [ ] `admin@` still receives Stripe dispute alerts
- [ ] `https://dragoncandy.com/brand/dc-mark-104.png` returns 200
- [ ] All four accounts have signatures, verified in Gmail web, mobile, Outlook for Windows, dark mode, and with images disabled
- [ ] Shared send-as identities carry the registered address; personal ones do not
- [ ] The daily trigger is enabled and a manual run demonstrably reverts a hand-edited signature
- [ ] No stale titles remain in `src/` or `docs/` outside the deliberate historical record
- [ ] `npm run build` and `npm run typecheck` pass

## Then, before the PR

Per `CLAUDE.md`: run the `codex-review` skill for the mandatory independent
second pass, then `knowledge-sync` to write the wiki session source, refresh
`PROJECT_CONTEXT.md` §4/§5 and `SHIPPED_LOG.md`, and sync Donny's RAG after
merge.

## Deliberately deferred, not dropped

**Option C as Joe's second signature.** Spec §7.3 records it as optional: Gmail
supports multiple signatures, so Joe could use the full lockup for a cold first
contact and the badge for everything after. It is left out of Wave 1 because
the badge has to be proven in real inboxes first (Task 10, Step 6), and adding
a second, heavier variant before the first one is verified doubles the surface
being debugged. Revisit once Joe has used the badge for a fortnight.

## Deferred to Wave 2

Everything in spec §5 — the twelve written documents, the six structured-empty
templates, the handbook skeleton, and the Docs/Slides templates. Wave 1 builds
the container and the identity; Wave 2 fills it.
