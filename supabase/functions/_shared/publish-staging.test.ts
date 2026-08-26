import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  mediaStaging,
  parseMediaRefs,
  plannedDestinations,
  PUBLISH_BUCKET,
  StagingError,
} from './publish-staging.ts';

// ---------------------------------------------------------------------------
// Fakes that record WHICH client was used, because that is the whole security
// property: the probe must run as the USER (so Storage RLS decides ownership)
// and the copy as the SERVICE ROLE (so it can write a bucket clients cannot).
// A test that only checked "a signed url was requested" would pass with the two
// swapped, which is the exact bug worth catching.
// ---------------------------------------------------------------------------

interface Call {
  who: 'user' | 'admin';
  op: 'sign' | 'copy' | 'remove';
  bucket: string;
  arg: string;
}

function fakeClient(
  who: 'user' | 'admin',
  log: Call[],
  fails: { sign?: (path: string) => boolean; copy?: (path: string) => boolean } = {},
) {
  return {
    storage: {
      from(bucket: string) {
        return {
          createSignedUrl(path: string, _ttl: number) {
            log.push({ who, op: 'sign', bucket, arg: path });
            return Promise.resolve(
              fails.sign?.(path)
                ? { data: null, error: { message: 'not found' } }
                : { data: { signedUrl: `https://signed/${path}` }, error: null },
            );
          },
          copy(path: string, _dest: string, _opts: unknown) {
            log.push({ who, op: 'copy', bucket, arg: path });
            return Promise.resolve(
              fails.copy?.(path) ? { error: { message: 'copy blew up' } } : { error: null },
            );
          },
          remove(paths: string[]) {
            log.push({ who, op: 'remove', bucket, arg: paths.join(',') });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  };
}

const USER = '11111111-2222-3333-4444-555555555555';

function build(
  media: { bucket: string; path: string }[],
  fails: Parameters<typeof fakeClient>[2] = {},
) {
  const log: Call[] = [];
  const staging = mediaStaging({
    admin: fakeClient('admin', log, fails),
    asUser: fakeClient('user', log, fails),
    userId: USER,
    media,
    label: '[test]',
  });
  return { log, staging };
}

describe('parseMediaRefs', () => {
  it('CONTROL — a well-formed list survives', () => {
    expect(parseMediaRefs([{ bucket: 'uploads', path: 'a/b.jpg' }], { allowEmpty: false }))
      .toEqual([{ bucket: 'uploads', path: 'a/b.jpg' }]);
  });

  // A URL is the whole attack: both platforms fetch media from whatever we hand
  // them, so a caller-supplied URL would publish arbitrary remote content under
  // our app's credentials.
  it.each([
    'https://evil.example/x.jpg',
    'data://whatever',
    '//evil.example/x.jpg',
  ])('refuses a URL-shaped path: %s', (path) => {
    expect(() => parseMediaRefs([{ bucket: 'uploads', path }], { allowEmpty: false }))
      .toThrow(StagingError);
  });

  it('refuses a bucket carrying a path separator', () => {
    expect(() => parseMediaRefs([{ bucket: 'up/loads', path: 'a.jpg' }], { allowEmpty: false }))
      .toThrow(/not a URL/);
  });

  it.each([[[{ bucket: '', path: 'a.jpg' }]], [[{ bucket: 'u', path: '' }]], [['a.jpg']]])(
    'refuses an item that is not a bucket + path',
    (value) => {
      expect(() => parseMediaRefs(value, { allowEmpty: false })).toThrow(/bucket and a path/);
    },
  );

  // The platforms genuinely disagree about whether a post needs media, so this
  // is a parameter rather than a rule.
  it('an empty list is a parse error for Instagram and a real request for Facebook', () => {
    expect(() => parseMediaRefs([], { allowEmpty: false })).toThrow(/at least one file/);
    expect(parseMediaRefs([], { allowEmpty: true })).toEqual([]);
    expect(parseMediaRefs(undefined, { allowEmpty: true })).toEqual([]);
    expect(() => parseMediaRefs(undefined, { allowEmpty: false })).toThrow(/at least one file/);
  });

  it('bounds the count so a caller cannot make us copy ten thousand files', () => {
    const many = Array.from({ length: 33 }, (_, i) => ({ bucket: 'u', path: `${i}.jpg` }));
    expect(() => parseMediaRefs(many, { allowEmpty: false })).toThrow(/Too many files/);
  });
});

describe('extensionOf', () => {
  it('reads the extension from the FILENAME, not from anywhere in the path', () => {
    expect(extensionOf('a/b/clip.MP4')).toBe('mp4');
    // A dotted DIRECTORY must not be mistaken for an extension.
    expect(extensionOf('my.mp4folder/clip')).toBe('');
    // No extension at all is empty, never the whole path.
    expect(extensionOf('a/b/c')).toBe('');
    expect(extensionOf('.hidden')).toBe('');
  });
});

describe('plannedDestinations', () => {
  // `enqueue_publish_job` proves a path belongs to the caller by testing
  // exactly this prefix against auth.uid(), with nothing from the request in
  // the predicate. Change the layout and that SQL check silently stops matching.
  it('prefixes every destination with the user id', () => {
    const dests = plannedDestinations(USER, [
      { bucket: 'u', path: 'x.jpg' },
      { bucket: 'u', path: 'y.mp4' },
    ]);
    expect(dests.every((d) => d.startsWith(`${USER}/`))).toBe(true);
    expect(dests[0]).toMatch(/\/0\.jpg$/);
    expect(dests[1]).toMatch(/\/1\.mp4$/);
  });

  // Two approvals of the same file are two sets of frozen bytes: the second
  // must not overwrite the first while the first is still queued.
  it('gives each approval its own batch directory', () => {
    const media = [{ bucket: 'u', path: 'x.jpg' }];
    expect(plannedDestinations(USER, media)[0]).not.toBe(plannedDestinations(USER, media)[0]);
  });

  it('keeps a file with no extension rather than inventing one', () => {
    expect(plannedDestinations(USER, [{ bucket: 'u', path: 'x' }])[0]).toMatch(/\/0$/);
  });
});

describe('mediaStaging — which credential does what', () => {
  it('CONTROL — a clean run signs as the USER and copies as the SERVICE ROLE', async () => {
    const { log, staging } = build([{ bucket: 'uploads', path: 'a.jpg' }]);
    await staging.stage();

    expect(log).toHaveLength(2);
    // If these two ever swap, the ownership check is gone: the service role can
    // sign anything, and the user cannot write the publish bucket.
    expect(log[0]).toMatchObject({ who: 'user', op: 'sign', bucket: 'uploads' });
    expect(log[1]).toMatchObject({ who: 'admin', op: 'copy', bucket: 'uploads' });
  });

  it('the copy targets the private publish bucket', async () => {
    const { staging } = build([{ bucket: 'uploads', path: 'a.jpg' }]);
    expect(staging.destinations[0].startsWith(`${USER}/`)).toBe(true);
    expect(PUBLISH_BUCKET).toBe('publish-media');
  });

  // Signing requires read permission, so a failed probe means Storage RLS said
  // no. It must stop BEFORE the service role copies anything.
  it('a probe the user cannot satisfy stops before any copy happens', async () => {
    const { log, staging } = build([{ bucket: 'someone-else', path: 'secret.jpg' }], {
      sign: () => true,
    });

    await expect(staging.stage()).rejects.toThrow(StagingError);
    expect(log.some((c) => c.op === 'copy')).toBe(false);
  });

  it('says the same thing for "does not exist" and "not yours"', async () => {
    const { staging } = build([{ bucket: 'u', path: 'x.jpg' }], { sign: () => true });
    // The distinction is exactly what an enumeration probe is looking for.
    await expect(staging.stage()).rejects.toThrow(/does not exist or is not yours/);
  });

  // The failure that made this a shared module: a multi-file request whose
  // SECOND file is unreadable must not leave the first staged for ever.
  it('discards what it managed to copy when a later file fails', async () => {
    const { log, staging } = build(
      [
        { bucket: 'u', path: 'ok.jpg' },
        { bucket: 'u', path: 'nope.jpg' },
      ],
      { sign: (p) => p === 'nope.jpg' },
    );

    await expect(staging.stage()).rejects.toThrow(StagingError);
    await staging.discard();

    const removed = log.filter((c) => c.op === 'remove');
    expect(removed).toHaveLength(1);
    expect(removed[0].bucket).toBe(PUBLISH_BUCKET);
    // Exactly the one that was copied — not the one that never was.
    expect(removed[0].arg).toBe(staging.destinations[0]);
  });

  it('a failed copy is reported as a server problem, not the caller’s', async () => {
    const { staging } = build([{ bucket: 'u', path: 'a.jpg' }], { copy: () => true });
    await expect(staging.stage()).rejects.toMatchObject({ code: 'copy_failed', status: 502 });
  });

  it('discard is a no-op when nothing was copied', async () => {
    const { log, staging } = build([{ bucket: 'u', path: 'a.jpg' }], { sign: () => true });
    await expect(staging.stage()).rejects.toThrow();
    await staging.discard();
    expect(log.some((c) => c.op === 'remove')).toBe(false);
  });

  it('stages nothing at all for a post with no media', async () => {
    const { log, staging } = build([]);
    await staging.stage();
    expect(log).toHaveLength(0);
    expect(staging.destinations).toEqual([]);
  });
});
