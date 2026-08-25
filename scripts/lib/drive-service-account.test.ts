/**
 * What can be proven without a Google credential, and what cannot.
 *
 * These tests cover the parts that are pure or that a fake `fetch` can stand in for: key
 * resolution, refusal to fall back, JWT shape, the shared-drive parameters,
 * replace-vs-create, and the post-upload read-back. **They still do not prove that Drive
 * accepts any of it** — a real upload has since run (2026-08-24), but that was a manual
 * run against production and nothing here re-checks it.
 *
 * That gap is stated in the uploader's header too, because the dangerous version of this
 * file is one that reads like coverage. A signature that a fake `fetch` accepts tells you
 * nothing about whether Google will.
 */
import { describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, createVerify } from 'node:crypto';

import {
  DEFAULT_KEY_PATH,
  buildJwtClaims,
  describeSetup,
  parseServiceAccountKey,
  resolveKeySource,
  signJwt,
  uploadToDrive,
  type FetchLike,
  type ServiceAccountKey,
} from './drive-service-account';

/** A real RSA key, generated per-run. Never a fixture — a committed private key is a leak. */
function testKey(): ServiceAccountKey & { publicKey: string } {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { client_email: 'deck-uploader@dc.iam.gserviceaccount.com', private_key: privateKey, publicKey };
}

describe('key resolution', () => {
  const never = () => false;

  it('prefers inline JSON, because CI has a secret store and no filesystem', () => {
    const src = resolveKeySource(
      { GOOGLE_DRIVE_SA_KEY_JSON: '{"a":1}', GOOGLE_DRIVE_SA_KEY: '/some/path' },
      () => true,
    );
    expect(src).toEqual({ kind: 'json', raw: '{"a":1}', from: 'GOOGLE_DRIVE_SA_KEY_JSON' });
  });

  it('falls to the explicit path, then to the conventional one', () => {
    expect(resolveKeySource({ GOOGLE_DRIVE_SA_KEY: '/k.json' }, never)).toEqual({
      kind: 'path',
      path: '/k.json',
      from: 'GOOGLE_DRIVE_SA_KEY',
    });
    expect(resolveKeySource({}, (p) => p === DEFAULT_KEY_PATH)).toEqual({
      kind: 'path',
      path: DEFAULT_KEY_PATH,
      from: DEFAULT_KEY_PATH,
    });
  });

  /**
   * The one that keeps the transport dormant. An empty string is what an unset CI secret
   * expands to, and treating it as configured would send every local run down a path with
   * no credential — failing in a way that looks like Drive's fault.
   */
  it('treats absent and empty-string alike as unconfigured', () => {
    expect(resolveKeySource({}, never)).toEqual({ kind: 'none' });
    expect(
      resolveKeySource({ GOOGLE_DRIVE_SA_KEY_JSON: '   ', GOOGLE_DRIVE_SA_KEY: '' }, never),
    ).toEqual({ kind: 'none' });
  });
});

describe('key parsing refuses rather than degrades', () => {
  it('names the source in every failure, since three places can supply it', () => {
    expect(() => parseServiceAccountKey('not json', 'GOOGLE_DRIVE_SA_KEY_JSON')).toThrow(
      /GOOGLE_DRIVE_SA_KEY_JSON is not valid JSON/,
    );
    expect(() => parseServiceAccountKey('{"client_email":"a@b"}', '.k.json')).toThrow(
      /\.k\.json is missing client_email or private_key/,
    );
  });

  /**
   * The failure a CI secret actually produces. Pasting a key into an environment variable
   * commonly leaves `\n` as two literal characters, and the resulting error from `crypto`
   * is about ASN.1 decoding — true, and useless to the person who has to fix it.
   */
  it('catches a private_key whose newlines were never un-escaped', () => {
    const raw = JSON.stringify({ client_email: 'a@b', private_key: 'not-a-pem' });
    expect(() => parseServiceAccountKey(raw, 'env')).toThrow(/literal \\n sequences/);
  });

  it('accepts a real key', () => {
    const key = testKey();
    const raw = JSON.stringify({ client_email: key.client_email, private_key: key.private_key });
    expect(parseServiceAccountKey(raw, 'env').client_email).toBe(key.client_email);
  });
});

describe('the JWT', () => {
  it('is signed with the key, and verifies against its public half', () => {
    const key = testKey();
    const claims = buildJwtClaims(key.client_email, 1_700_000_000_000);
    const [header, payload, signature] = signJwt(key, claims).split('.');

    const ok = createVerify('RSA-SHA256')
      .update(`${header}.${payload}`)
      .verify(key.publicKey, Buffer.from(signature, 'base64url'));
    expect(ok).toBe(true);

    // Control: the same verification must FAIL on tampered input, or it proves nothing.
    const tampered = createVerify('RSA-SHA256')
      .update(`${header}.${payload}x`)
      .verify(key.publicKey, Buffer.from(signature, 'base64url'));
    expect(tampered).toBe(false);
  });

  /**
   * A PEM header is not a key. `parseServiceAccountKey` checks only for the wrapper, so a
   * truncated body reaches the signer — and OpenSSL answers `DECODER routines::unsupported`
   * over an ASN.1 stack, which tells the reader nothing. Found by running the control, not
   * by reading the code.
   */
  it('explains a PEM-shaped but unusable key instead of leaking the OpenSSL stack', () => {
    const broken = {
      client_email: 'a@b',
      private_key: '-----BEGIN PRIVATE KEY-----\nnope\n-----END PRIVATE KEY-----',
    };
    expect(() => signJwt(broken, buildJwtClaims('a@b', 0))).toThrow(/truncated paste/);
  });

  it('claims the drive scope and the documented one-hour maximum', () => {
    const claims = buildJwtClaims('a@b', 1_700_000_000_000);
    expect(claims.scope).toBe('https://www.googleapis.com/auth/drive');
    expect(claims.aud).toBe('https://oauth2.googleapis.com/token');
    expect(claims.exp - claims.iat).toBe(3600);
  });
});

describe('setup guidance', () => {
  /**
   * Drive reports a non-member service account as a bare 404 on the folder, which reads
   * like a wrong ID and sends you checking the ID. The message has to name the account.
   */
  it('names the account to add and rules out domain-wide delegation', () => {
    const msg = describeSetup('deck-uploader@dc.iam.gserviceaccount.com', 'DragonCandy — Confidential');
    expect(msg).toContain('deck-uploader@dc.iam.gserviceaccount.com');
    expect(msg).toContain('DragonCandy — Confidential');
    expect(msg).toMatch(/no domain-wide delegation/i);
  });
});

/** A fake Drive. Records what was asked of it; returns what Google's shapes look like. */
function fakeDrive(opts: { existingId?: string; md5?: string; size?: number }) {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: FetchLike = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    calls.push({ url, method });

    if (url.startsWith('https://oauth2.googleapis.com/token')) {
      return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    }
    if (url.includes('/drive/v3/files?q=')) {
      const files = opts.existingId ? [{ id: opts.existingId }] : [];
      return new Response(JSON.stringify({ files }), { status: 200 });
    }
    if (url.includes('uploadType=resumable')) {
      return new Response('', { status: 200, headers: { location: 'https://upload.test/session' } });
    }
    if (url === 'https://upload.test/session') {
      return new Response(JSON.stringify({ id: 'file-1' }), { status: 200 });
    }
    return new Response(
      JSON.stringify({ id: 'file-1', size: String(opts.size ?? 4), md5Checksum: opts.md5 ?? 'abc' }),
      { status: 200 },
    );
  }) as FetchLike;
  return { fetchImpl, calls };
}

describe('upload', () => {
  const key = testKey();
  const base = {
    key,
    driveId: 'drive-1',
    folderId: 'folder-1',
    name: 'Deck.pdf',
    bytes: Buffer.from('pdf!'),
    mimeType: 'application/pdf',
    nowMs: 1_700_000_000_000,
  };

  it('creates when absent and REPLACES when a file of that name exists', async () => {
    const created = fakeDrive({});
    await uploadToDrive({ ...base, fetchImpl: created.fetchImpl });
    const createInit = created.calls.find((c) => c.url.includes('uploadType=resumable'));
    expect(createInit?.method).toBe('POST');

    const replaced = fakeDrive({ existingId: 'old-file' });
    await uploadToDrive({ ...base, fetchImpl: replaced.fetchImpl });
    const patchInit = replaced.calls.find((c) => c.url.includes('uploadType=resumable'));
    expect(patchInit?.method).toBe('PATCH');
    // Replacing, not creating a namesake — Drive allows two files with one name in a
    // folder, and the reader would have no way to tell which is current.
    expect(patchInit?.url).toContain('old-file');
  });

  /**
   * Every shared-drive call needs these. Omitting them does not error — Drive simply
   * behaves as though the shared drive is not there, which surfaces as an empty listing
   * and then a create where a replace was intended.
   */
  it('carries the shared-drive parameters on every request that touches Drive', async () => {
    const { fetchImpl, calls } = fakeDrive({});
    await uploadToDrive({ ...base, fetchImpl });
    const driveCalls = calls.filter((c) => c.url.includes('googleapis.com/'));
    expect(driveCalls.length).toBeGreaterThan(2);
    for (const c of driveCalls) {
      if (c.url.includes('oauth2.googleapis.com')) continue;
      expect(c.url).toContain('supportsAllDrives=true');
    }
  });

  it('reports the md5 Drive holds, read back after the write', async () => {
    const { fetchImpl } = fakeDrive({ md5: 'deadbeef', size: 4 });
    const result = await uploadToDrive({ ...base, fetchImpl });
    expect(result).toEqual({ id: 'file-1', md5: 'deadbeef', size: 4 });
  });

  it('refuses to claim success when Drive reports no checksum', async () => {
    const fetchImpl: FetchLike = async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      if (url.includes('/drive/v3/files?q=')) return new Response(JSON.stringify({ files: [] }), { status: 200 });
      if (url.includes('uploadType=resumable'))
        return new Response('', { status: 200, headers: { location: 'https://upload.test/session' } });
      if (url === 'https://upload.test/session')
        return new Response(JSON.stringify({ id: 'file-1' }), { status: 200 });
      return new Response(JSON.stringify({ id: 'file-1', size: '4' }), { status: 200 });
    };
    await expect(uploadToDrive({ ...base, fetchImpl })).rejects.toThrow(/cannot be verified/);
  });

  it('turns a 404 into the membership instruction rather than passing it through', async () => {
    const fetchImpl: FetchLike = async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com/token'))
        return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      return new Response('{"error":{"code":404}}', { status: 404 });
    };
    await expect(uploadToDrive({ ...base, fetchImpl })).rejects.toThrow(
      /not a member of[\s\S]*Manage members/,
    );
  });
});
