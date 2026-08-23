import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderSignature, escapeHtml, BRAND } from './signature.js';

const DAME = { name: 'Damon Williams', title: 'CTO', email: 'dame@dragoncandy.com' };

describe('BRAND', () => {
  it('is frozen so Object.freeze cannot be accidentally removed', () => {
    expect(Object.isFrozen(BRAND)).toBe(true);
    const originalValue = BRAND.nameColor;
    try {
      BRAND.nameColor = '#000000';
    } catch {
      // in strict mode, assignment throws; we just want to verify the value didn't change
    }
    expect(BRAND.nameColor).toBe(originalValue);
  });
});

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

  // --- showCompany option (shared-mailbox redundancy fix) ---

  it('appends " · DragonCandy" to the title by default', () => {
    const html = renderSignature(DAME);
    expect(html).toContain('CTO &middot; DragonCandy');
  });

  it('omits the " · DragonCandy" suffix when showCompany is false', () => {
    const html = renderSignature({
      name: 'DragonCandy Support',
      title: 'Shared mailbox',
      email: 'support@dragoncandy.com',
      includeAddress: true,
      showCompany: false,
    });
    expect(html).toContain('>Shared mailbox<');
    expect(html).not.toContain('&middot; DragonCandy');
  });

  it('keeps "DragonCandy" out of the rendered text more than once for a shared identity', () => {
    const html = renderSignature({
      name: 'DragonCandy Support',
      title: 'Shared mailbox',
      email: 'support@dragoncandy.com',
      includeAddress: true,
      showCompany: false,
    });
    // The image alt text also says "DragonCandy" -- strip the <img> tag before
    // counting, since alt text isn't rendered text a recipient reads.
    const textOnly = html.replace(/<img[^>]*>/, '');
    const occurrences = (textOnly.match(/DragonCandy/g) || []).length;
    expect(occurrences).toBe(1);
  });

  // --- size ---

  it('stays well under the Gmail signature field cap', () => {
    const html = renderSignature({ ...DAME, includeAddress: true });
    expect(html.length).toBeLessThan(10000);
  });
});

// --- Code.gs.js invariants -------------------------------------------------
//
// Code.gs.js is Apps Script, not a module: it declares `var`s and function
// declarations and calls nothing at load time, so it can be evaluated here and
// its values inspected. This block exists because the Codex review caught
// `founders@` being added to SHARED_IDENTITIES with no matching label in
// titleForShared_(), which would have rendered "DragonCandy founders" —
// lowercase — to customers. A reviewer caught it once; this makes it
// impossible to reintroduce silently.
//
// On the `new Function` below: the only thing interpolated is this repository's
// own committed source file, read from a path derived from import.meta.url. It
// is not user input, it never runs outside the test process, and it ships in no
// bundle — `scripts/` is outside the Vite build. The alternative, regex-parsing
// the array out of the file as text, is what actually would be fragile.

function loadAppsScript(scriptProperties = {}) {
  const src = readFileSync(
    fileURLToPath(new URL('./Code.gs.js', import.meta.url)),
    'utf8',
  );
  // Minimal stand-in for the one Apps Script global the pure functions touch.
  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k) => (k in scriptProperties ? scriptProperties[k] : null),
    }),
  };
  return new Function(
    'PropertiesService',
    `${src}\nreturn { SHARED_IDENTITIES, titleForShared_, isSharedIdentity_, DOMAIN, isMissingSharingScope_, requestedScopes_, SCOPE_BASIC, SCOPE_SHARING, sharedRegressions_, formatRegression_, nextSharedBaseline_, sharedExpectation_, readSharedBaseline_, runAlert_, alertRecipients_ };`,
  )(PropertiesService);
}

// The real 403 body Gmail returned on 2026-08-21, kept verbatim. Paraphrasing
// it would make the test pass against a string we invented rather than the one
// the API actually sends.
const REAL_403 = `Error: Gmail API 403: {
  "error": {
    "code": 403,
    "message": "Missing required scope \\"https://www.googleapis.com/auth/gmail.settings.sharing\\" for modifying non-primary SendAs",
    "errors": [
      {
        "message": "Missing required scope \\"https://www.googleapis.com/auth/gmail.settings.sharing\\" for modifying non-primary SendAs",
        "domain": "global",
        "reason": "forbidden"
      }
    ],
    "status": "PERMISSION_DENIED"
  }
}`;

describe('Code.gs.js missing-scope detection', () => {
  const { isMissingSharingScope_ } = loadAppsScript();

  it('recognises the actual 403 Gmail returned for a non-primary sendAs', () => {
    expect(isMissingSharingScope_(REAL_403)).toBe(true);
    expect(isMissingSharingScope_(new Error(REAL_403))).toBe(true);
  });

  it('does not swallow unrelated failures', () => {
    // These must stay visible as real failures rather than being filed as the
    // known, expected permissions gap.
    expect(isMissingSharingScope_('Error: Gmail API 500: backend error')).toBe(false);
    expect(isMissingSharingScope_('Error: Gmail API 404: not found')).toBe(false);
    expect(isMissingSharingScope_(new Error('network timeout'))).toBe(false);
    expect(isMissingSharingScope_('Error: Gmail API 403: quotaExceeded')).toBe(false);
  });
});

// Granting a scope in the admin console does nothing unless the impersonation
// JWT also asks for it — Codex P1, 2026-08-22. And asking for one the
// delegation lacks fails the whole token exchange with unauthorized_client, so
// the default has to stay narrow.
describe('Code.gs.js requested JWT scopes', () => {
  it('requests only the basic scope by default', () => {
    const { requestedScopes_, SCOPE_BASIC, SCOPE_SHARING } = loadAppsScript();
    expect(requestedScopes_()).toBe(SCOPE_BASIC);
    expect(requestedScopes_()).not.toContain(SCOPE_SHARING);
  });

  it('requests the sharing scope only when explicitly switched on', () => {
    const on = loadAppsScript({ SHARING_SCOPE_ENABLED: 'true' });
    expect(on.requestedScopes_()).toContain(on.SCOPE_BASIC);
    expect(on.requestedScopes_()).toContain(on.SCOPE_SHARING);
    // Space-separated, per the OAuth JWT assertion format.
    expect(on.requestedScopes_()).toBe(on.SCOPE_BASIC + ' ' + on.SCOPE_SHARING);
  });

  it('stays narrow for every value that is not exactly true', () => {
    // A typo in a script property must fail SAFE — toward the working state,
    // not toward unauthorized_client and zero signatures domain-wide.
    for (const v of ['false', 'TRUE ', 'yes', '1', '', 'True!', 'null']) {
      const { requestedScopes_, SCOPE_BASIC } = loadAppsScript({ SHARING_SCOPE_ENABLED: v });
      expect(requestedScopes_(), `SHARING_SCOPE_ENABLED=${JSON.stringify(v)}`).toBe(SCOPE_BASIC);
    }
  });

  it('accepts case variations of true, since an admin types this by hand', () => {
    for (const v of ['true', 'TRUE', 'True']) {
      const { requestedScopes_, SCOPE_SHARING } = loadAppsScript({ SHARING_SCOPE_ENABLED: v });
      expect(requestedScopes_(), `SHARING_SCOPE_ENABLED=${v}`).toContain(SCOPE_SHARING);
    }
  });
});

describe('Code.gs.js shared identities', () => {
  const { SHARED_IDENTITIES, titleForShared_, isSharedIdentity_, DOMAIN } =
    loadAppsScript();

  it('gives every shared identity a title-cased display label', () => {
    for (const email of SHARED_IDENTITIES) {
      const local = email.split('@')[0];
      const label = titleForShared_(email);
      expect(
        label,
        `${email} has no entry in titleForShared_, so it renders as "DragonCandy ${local}"`,
      ).not.toBe(local);
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  it('lists only lowercase addresses on the company domain', () => {
    for (const email of SHARED_IDENTITIES) {
      expect(email.endsWith(`@${DOMAIN}`)).toBe(true);
      expect(email).toBe(email.toLowerCase());
    }
  });

  it('has no duplicates', () => {
    expect(new Set(SHARED_IDENTITIES).size).toBe(SHARED_IDENTITIES.length);
  });

  it('matches shared identities case-insensitively, and rejects personal ones', () => {
    expect(isSharedIdentity_('SUPPORT@dragoncandy.com')).toBe(true);
    expect(isSharedIdentity_('dame@dragoncandy.com')).toBe(false);
  });

  // SHARED_IDENTITIES is a classifier, not an inventory of existing aliases.
  // An address missing from it is treated as personal — it would go out with an
  // individual's name and title and no registered postal address. That is the
  // expensive direction, so planned-but-not-yet-created addresses are listed in
  // advance and must stay listed. Codex caught a revision that removed legal@
  // on the grounds that the alias does not exist yet.
  it('classifies planned company addresses before they exist', () => {
    for (const email of ['legal@dragoncandy.com', 'founders@dragoncandy.com']) {
      expect(
        isSharedIdentity_(email),
        `${email} must stay classified as shared, or it will be signed as personal mail the day it is created`,
      ).toBe(true);
    }
  });
});

// The zero-shared warning used to fire on the DOMAIN AGGREGATE. That is
// equivalent to a per-user check only while exactly one account holds shared
// identities — which was true on 2026-08-23 and is why it went unnoticed.
// These tests pin the scoping, because both bugs here were scoping errors
// rather than computation errors, and the aggregate version passed every test
// that existed at the time.
describe('sharedRegressions_', () => {
  const { sharedRegressions_, formatRegression_ } = loadAppsScript();
  const fmt = (rs) => rs.map(formatRegression_);

  it('reports nothing when every shared identity was written', () => {
    expect(
      sharedRegressions_(
        [
          { email: 'dame@dragoncandy.com', sharedWritten: 3, sharedSeen: 3, denied: 0 },
          { email: 'joe@dragoncandy.com', sharedWritten: 0, sharedSeen: 0, denied: 0 },
        ],
        {},
      ),
    ).toEqual([]);
  });

  it('does not report a user who simply has no shared identities', () => {
    expect(
      sharedRegressions_([{ email: 'joe@dragoncandy.com', sharedWritten: 0, sharedSeen: 0, denied: 0 }], {}),
    ).toEqual([]);
  });

  it('reports a user who lost all of theirs', () => {
    expect(
      fmt(sharedRegressions_([{ email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 3, denied: 3 }], {})),
    ).toEqual(['dame@dragoncandy.com (0/3)']);
  });

  it('reports a partial loss, not just a total one', () => {
    expect(
      fmt(sharedRegressions_([{ email: 'dame@dragoncandy.com', sharedWritten: 2, sharedSeen: 3, denied: 1 }], {})),
    ).toEqual(['dame@dragoncandy.com (2/3)']);
  });

  // Under the old aggregate check the domain total here is 1, which is
  // non-zero, so nothing warned at all — dame@ losing every shared signature
  // was invisible because someone else still had one.
  it('reports a degraded user even when another user installed shared signatures', () => {
    const degraded = sharedRegressions_(
      [
        { email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 3, denied: 3 },
        { email: 'joe@dragoncandy.com', sharedWritten: 1, sharedSeen: 1, denied: 0 },
      ],
      {},
    );
    expect(fmt(degraded)).toEqual(['dame@dragoncandy.com (0/3)']);
    expect(
      0 + 1,
      'the domain aggregate is non-zero here, which is exactly why the aggregate check missed this',
    ).toBeGreaterThan(0);
  });

  it('reports every degraded user, not just the first', () => {
    expect(
      fmt(
        sharedRegressions_(
          [
            { email: 'a@dragoncandy.com', sharedWritten: 0, sharedSeen: 2, denied: 2 },
            { email: 'b@dragoncandy.com', sharedWritten: 1, sharedSeen: 1, denied: 0 },
            { email: 'c@dragoncandy.com', sharedWritten: 1, sharedSeen: 4, denied: 3 },
          ],
          {},
        ),
      ),
    ).toEqual(['a@dragoncandy.com (0/2)', 'c@dragoncandy.com (1/4)']);
  });

  it('handles an empty run without throwing', () => {
    expect(sharedRegressions_([], {})).toEqual([]);
  });

  // Codex P1. Deriving the denominator only from identities still present
  // makes the check blind to the worst case: DELETE a user's shared
  // identities and sharedSeen falls to 0 alongside sharedWritten, so the run
  // looks clean. The baseline is what remembers they existed.
  it('reports identities that were REMOVED, not merely unwritable', () => {
    const perUser = [{ email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 0, denied: 0 }];
    expect(
      sharedRegressions_(perUser, {}),
      'without a baseline there is nothing to notice — this is the hole',
    ).toEqual([]);
    expect(
      fmt(sharedRegressions_(perUser, { 'dame@dragoncandy.com': 3 })),
      'with a baseline the removal is caught',
    ).toEqual(['dame@dragoncandy.com (0/3)']);
  });

  it('catches a removal even while another user is still fine', () => {
    expect(
      fmt(
        sharedRegressions_(
          [
            { email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 0, denied: 0 },
            { email: 'joe@dragoncandy.com', sharedWritten: 1, sharedSeen: 1, denied: 0 },
          ],
          { 'dame@dragoncandy.com': 3, 'joe@dragoncandy.com': 1 },
        ),
      ),
    ).toEqual(['dame@dragoncandy.com (0/3)']);
  });

  it('takes the larger of live count and baseline as the expectation', () => {
    // Baseline stale-low: a user legitimately gained an identity this run.
    expect(
      fmt(sharedRegressions_([{ email: 'a@dragoncandy.com', sharedWritten: 1, sharedSeen: 3, denied: 2 }], { 'a@dragoncandy.com': 1 })),
    ).toEqual(['a@dragoncandy.com (1/3)']);
  });

  it('carries the per-user denied count so the caller can pick the right remedy', () => {
    const [scoped, other] = sharedRegressions_(
      [
        { email: 'a@dragoncandy.com', sharedWritten: 0, sharedSeen: 2, denied: 2 },
        { email: 'b@dragoncandy.com', sharedWritten: 0, sharedSeen: 1, denied: 0 },
      ],
      {},
    );
    expect(scoped.denied).toBe(2);
    expect(other.denied, 'b@ failed for some other reason and must not be told to fix the scope').toBe(0);
  });
});

describe('nextSharedBaseline_', () => {
  const { nextSharedBaseline_ } = loadAppsScript();

  it('records the count from a clean run', () => {
    expect(
      nextSharedBaseline_([{ email: 'dame@dragoncandy.com', sharedWritten: 3, sharedSeen: 3 }], {}),
    ).toEqual({ 'dame@dragoncandy.com': 3 });
  });

  it('never decreases — a drop is the signal, so it must not be erased', () => {
    expect(
      nextSharedBaseline_(
        [{ email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 0 }],
        { 'dame@dragoncandy.com': 3 },
      ),
    ).toEqual({ 'dame@dragoncandy.com': 3 });
  });

  it('rises when a user gains an identity', () => {
    expect(
      nextSharedBaseline_(
        [{ email: 'dame@dragoncandy.com', sharedWritten: 4, sharedSeen: 4 }],
        { 'dame@dragoncandy.com': 3 },
      ),
    ).toEqual({ 'dame@dragoncandy.com': 4 });
  });

  it('keeps users who were absent from this run, so an outage cannot reset expectations', () => {
    expect(
      nextSharedBaseline_(
        [{ email: 'joe@dragoncandy.com', sharedWritten: 1, sharedSeen: 1 }],
        { 'dame@dragoncandy.com': 3 },
      ),
    ).toEqual({ 'dame@dragoncandy.com': 3, 'joe@dragoncandy.com': 1 });
  });

  it('does not mutate the baseline it was given', () => {
    const baseline = { 'dame@dragoncandy.com': 3 };
    nextSharedBaseline_([{ email: 'dame@dragoncandy.com', sharedWritten: 5, sharedSeen: 5 }], baseline);
    expect(baseline).toEqual({ 'dame@dragoncandy.com': 3 });
  });
});

// The warning and the run-log column must never disagree about what "expected"
// means. They did: the warning used the baseline and the Sheet used only the
// live count, so a removed identity warned as 0/3 while the durable record said
// plain "0 shared" — indistinguishable from a user who never had any, and the
// Sheet is what survives after the warning scrolls away. Codex, 2026-08-23.
describe('sharedExpectation_', () => {
  const { sharedExpectation_, sharedRegressions_ } = loadAppsScript();

  it('is the live count when there is no baseline', () => {
    expect(sharedExpectation_({ email: 'a@x.com', sharedSeen: 3 }, {})).toBe(3);
  });

  it('is the baseline when the identities are gone', () => {
    expect(sharedExpectation_({ email: 'a@x.com', sharedSeen: 0 }, { 'a@x.com': 3 })).toBe(3);
  });

  it('is the larger of the two when they disagree', () => {
    expect(sharedExpectation_({ email: 'a@x.com', sharedSeen: 4 }, { 'a@x.com': 3 })).toBe(4);
    expect(sharedExpectation_({ email: 'a@x.com', sharedSeen: 1 }, { 'a@x.com': 3 })).toBe(3);
  });

  it('is zero for a user who has never had one', () => {
    expect(sharedExpectation_({ email: 'joe@x.com', sharedSeen: 0 }, {})).toBe(0);
  });

  it('tolerates a missing baseline argument', () => {
    expect(sharedExpectation_({ email: 'a@x.com', sharedSeen: 2 })).toBe(2);
  });

  // The property that actually matters: whatever the Sheet prints as the
  // denominator is the same number the warning judged against.
  it('agrees with the denominator sharedRegressions_ reports', () => {
    const baseline = { 'a@x.com': 3 };
    const record = { email: 'a@x.com', sharedWritten: 0, sharedSeen: 0, denied: 0 };
    const [reported] = sharedRegressions_([record], baseline);
    expect(reported.expected).toBe(sharedExpectation_(record, baseline));
    expect(reported.expected).toBe(3);
  });
});

// A corrupt baseline must not be overwritten. Returning {} and then writing the
// new one would discard every high-water mark; if identities were already
// missing, their expectations would be erased permanently and the run after
// next would go quiet and look healthy. Failing to READ costs one run of
// detection. Failing to PRESERVE costs it forever. Codex, 2026-08-23.
describe('readSharedBaseline_', () => {
  it('reads a valid object and marks it usable', () => {
    const { readSharedBaseline_ } = loadAppsScript({
      SHARED_BASELINE: '{"dame@dragoncandy.com":3}',
    });
    expect(readSharedBaseline_()).toEqual({
      values: { 'dame@dragoncandy.com': 3 },
      usable: true,
    });
  });

  it('treats an unset property as an empty but usable baseline', () => {
    const { readSharedBaseline_ } = loadAppsScript();
    expect(readSharedBaseline_()).toEqual({ values: {}, usable: true });
  });

  it('marks malformed JSON UNUSABLE so the caller will not overwrite it', () => {
    const { readSharedBaseline_ } = loadAppsScript({ SHARED_BASELINE: '{not json' });
    const result = readSharedBaseline_();
    expect(result.values).toEqual({});
    expect(
      result.usable,
      'usable must be false, or installAllSignatures overwrites the only copy of the high-water marks',
    ).toBe(false);
  });

  it('rejects valid JSON that is not an object', () => {
    for (const raw of ['[1,2,3]', '"three"', '42', 'null']) {
      const { readSharedBaseline_ } = loadAppsScript({ SHARED_BASELINE: raw });
      expect(readSharedBaseline_().usable, `${raw} must not be accepted as a baseline`).toBe(false);
    }
  });
});

// counts.denied includes ANY non-primary sendAs. A user can hold a non-primary
// address that is not a company one, so classifying the whole regression off
// that number would announce "REFUSED FOR LACK OF SCOPE" about shared
// signatures that were in fact deleted. Codex, 2026-08-23.
describe('shared-only denial classification', () => {
  const { sharedRegressions_ } = loadAppsScript();

  it('reports denied 0 when the shared identities were removed, not refused', () => {
    const [r] = sharedRegressions_(
      // denied here is already the SHARED-only count that installForUser_ now
      // returns; an unrelated non-primary 403 does not reach this field.
      [{ email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 0, denied: 0 }],
      { 'dame@dragoncandy.com': 3 },
    );
    expect(r.expected).toBe(3);
    expect(
      r.denied,
      'a removal must not be classified as a scope refusal, or the operator is sent to the wrong fix',
    ).toBe(0);
  });

  it('reports the denial when the shared identities really were refused', () => {
    const [r] = sharedRegressions_(
      [{ email: 'dame@dragoncandy.com', sharedWritten: 0, sharedSeen: 3, denied: 3 }],
      {},
    );
    expect(r.denied).toBe(3);
  });
});

// A user can be degraded by BOTH causes at once — one identity 403s while
// another was deleted. Reporting only the scope would have an operator grant a
// domain-wide permission, watch the count improve, and stop looking while
// signatures were still missing. Codex, 2026-08-23.
describe('sharedRegressions_ cause classification', () => {
  const { sharedRegressions_ } = loadAppsScript();
  const one = (record, baseline) => sharedRegressions_([record], baseline || {})[0];

  it("calls it 'scope' when denials account for every missing signature", () => {
    const r = one({ email: 'a@x.com', sharedWritten: 0, sharedSeen: 3, denied: 3 });
    expect(r.cause).toBe('scope');
    expect(r.unexplained).toBe(0);
  });

  it("calls it 'other' when nothing was denied", () => {
    const r = one({ email: 'a@x.com', sharedWritten: 0, sharedSeen: 0, denied: 0 }, { 'a@x.com': 3 });
    expect(r.cause).toBe('other');
    expect(r.unexplained).toBe(3);
  });

  it("calls it 'mixed' when denials explain only part of the gap", () => {
    // 3 expected, 0 written, 2 refused for scope — the third is something else.
    const r = one({ email: 'a@x.com', sharedWritten: 0, sharedSeen: 2, denied: 2 }, { 'a@x.com': 3 });
    expect(r.cause).toBe('mixed');
    expect(
      r.unexplained,
      'the scope explains 2 of the 3; the remaining 1 needs a different fix',
    ).toBe(1);
  });

  it('still counts a partial write correctly', () => {
    // 4 expected, 1 written, 3 refused — scope explains all of the rest.
    const r = one({ email: 'a@x.com', sharedWritten: 1, sharedSeen: 4, denied: 3 });
    expect(r.cause).toBe('scope');
    expect(r.unexplained).toBe(0);
  });

  it('never reports a negative unexplained count', () => {
    // denied larger than the gap (an identity was denied AND later written on
    // a retry, say) must not produce a nonsense negative.
    const r = one({ email: 'a@x.com', sharedWritten: 2, sharedSeen: 3, denied: 5 });
    expect(r.unexplained).toBe(0);
    expect(r.cause).toBe('scope');
  });
});

// A warning is only read by someone who goes looking. runAlert_ is the
// decision half of the delivery fix and is kept pure so the question "when do
// we wake somebody up" is testable; MailApp and script properties are not.
describe('runAlert_', () => {
  const { runAlert_ } = loadAppsScript();
  const degraded = (over) => ({
    email: 'dame@dragoncandy.com',
    written: 0,
    expected: 3,
    denied: 3,
    cause: 'scope',
    unexplained: 0,
    ...over,
  });

  it('is silent on a clean run', () => {
    expect(
      runAlert_([], [], 4),
      'a nightly all-fine mail trains its recipient to filter it, and then the real one is filtered too',
    ).toBeNull();
  });

  it('tolerates missing arguments', () => {
    expect(runAlert_(undefined, undefined, 0)).toBeNull();
  });

  it('fires when a user is degraded', () => {
    const a = runAlert_([degraded()], [], 4);
    expect(a).not.toBeNull();
    expect(a.subject).toContain('1 degraded');
    expect(a.body).toContain('dame@dragoncandy.com (0/3)');
  });

  it('fires when a user failed outright, even with nothing degraded', () => {
    const a = runAlert_([], ['joe@dragoncandy.com'], 4);
    expect(a.subject).toContain('1 failed');
    expect(a.body).toContain('NO SIGNATURE WRITTEN AT ALL');
    expect(a.body).toContain('joe@dragoncandy.com');
  });

  it('reports both counts when both happen', () => {
    const a = runAlert_([degraded()], ['joe@dragoncandy.com'], 4);
    expect(a.subject).toContain('1 failed');
    expect(a.subject).toContain('1 degraded');
  });

  it('names the cause so the reader is not sent to the wrong fix', () => {
    expect(runAlert_([degraded({ cause: 'scope' })], [], 4).body).toContain('gmail.settings.sharing');
    expect(runAlert_([degraded({ cause: 'other', denied: 0 })], [], 4).body).toContain('deleted');
    const mixed = runAlert_([degraded({ cause: 'mixed', denied: 2, unexplained: 1 })], [], 4).body;
    expect(mixed).toContain('will not finish the job');
  });

  it('says what "expected" means, since a deleted identity is the confusing case', () => {
    expect(runAlert_([degraded()], [], 4).body).toContain('SHARED_BASELINE');
  });
});

describe('alertRecipients_', () => {
  it('is empty when unset — the caller must warn rather than silently skip', () => {
    const { alertRecipients_ } = loadAppsScript();
    expect(alertRecipients_()).toEqual([]);
  });

  it('splits a comma-separated list and trims', () => {
    const { alertRecipients_ } = loadAppsScript({
      ALERT_EMAIL: ' dame@dragoncandy.com , joe@dragoncandy.com ',
    });
    expect(alertRecipients_()).toEqual(['dame@dragoncandy.com', 'joe@dragoncandy.com']);
  });

  it('drops blanks and junk without an @, so MailApp is never handed an empty address', () => {
    const { alertRecipients_ } = loadAppsScript({
      ALERT_EMAIL: 'dame@dragoncandy.com,,   ,notanemail',
    });
    expect(alertRecipients_()).toEqual(['dame@dragoncandy.com']);
  });

  it('returns empty for a property that is only separators', () => {
    const { alertRecipients_ } = loadAppsScript({ ALERT_EMAIL: ' , , ' });
    expect(alertRecipients_()).toEqual([]);
  });
});
