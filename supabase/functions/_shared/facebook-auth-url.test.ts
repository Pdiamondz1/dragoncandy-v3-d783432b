import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FACEBOOK_SCOPES, INSIGHTS_PERMISSIONS } from './facebook-pages.ts';

/**
 * The authorize URL must carry `config_id`, never `scope`.
 *
 * The DragonCandy Meta app uses **Facebook Login for Business**, where Meta says
 * plainly: "config_id has replaced scope (which should not be used)". The two
 * models are mutually exclusive, and sending `scope` to a for-Business app does
 * not request those permissions.
 *
 * The first version of this connector sent `scope`, inferred from the Instagram
 * and Google flows instead of checked against the login product this app has. It
 * would have opened a dialog requesting nothing and returned a token with no Page
 * permissions — which surfaces as "the user declined", the worst shape for it,
 * because it invites blaming the user for our bug.
 *
 * Asserted against the SOURCE rather than by calling `buildAuthUrl`, because the
 * function reads `Deno.env` and this suite runs under Node. A text assertion is
 * weaker than an execution one and is chosen deliberately over no assertion — the
 * same trade the viewport and overscroll tests make.
 */
const SRC = readFileSync(join(process.cwd(), 'supabase/functions/_shared/facebook-pages.ts'), 'utf8');

function buildAuthUrlBody(): string {
  const start = SRC.indexOf('export function buildAuthUrl');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\n}', start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe('buildAuthUrl', () => {
  it('sends config_id', () => {
    expect(buildAuthUrlBody()).toMatch(/config_id:/);
  });

  it('does NOT send scope', () => {
    // The defect, stated directly. Facebook Login for Business ignores it.
    const body = buildAuthUrlBody();
    expect(body).not.toMatch(/\bscope:/);
    expect(body).not.toMatch(/FACEBOOK_SCOPES\.join/);
  });

  it('overrides the configuration default so the code flow is guaranteed', () => {
    // response_type alone is NOT enough under Facebook Login for Business: the
    // saved configuration's own default wins without this. A config defaulting
    // to a token would redirect with a fragment while /facebook/callback waits
    // for a code — every connect dying right after consent, at the moment the
    // user believes it worked.
    expect(buildAuthUrlBody()).toMatch(/override_default_response_type:\s*'true'/);
    expect(buildAuthUrlBody()).toMatch(/response_type:\s*'code'/);
  });

  it('fails closed when the configuration id is missing', () => {
    // `env()` throws a 503 not_configured. A fallback to `scope` would produce a
    // consent screen that succeeds while granting nothing, and the connector
    // would store a token that cannot read insights and call it connected.
    expect(buildAuthUrlBody()).toMatch(/config_id:\s*env\(/);
  });
});

describe('the documented permission set', () => {
  it('still names exactly the three read permissions', () => {
    // These are no longer sent on the wire — they specify what the console
    // configuration must contain. Nothing in the code can verify that, so the
    // list is the only record of it and must not drift silently.
    expect([...FACEBOOK_SCOPES]).toEqual([
      'pages_show_list',
      'pages_read_engagement',
      'read_insights',
    ]);
  });

  it('keeps the insights subset inside the requested set', () => {
    // A permission required at read time that the configuration never requests
    // would fail every insights call while the connect flow looked perfect.
    for (const p of INSIGHTS_PERMISSIONS) {
      expect(FACEBOOK_SCOPES as readonly string[]).toContain(p);
    }
  });

  it('requests nothing that can publish', () => {
    for (const p of FACEBOOK_SCOPES) {
      expect(p).not.toMatch(/manage|publish/);
    }
  });
});
