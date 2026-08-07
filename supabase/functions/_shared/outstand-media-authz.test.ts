import { describe, expect, it } from 'vitest';
import {
  buildMediaListResponse,
  decideMediaAccess,
  extractConfirmedMedia,
  extractUploadedMediaId,
  parseMediaPaging,
  toMediaFiles,
} from './outstand-media-authz.ts';

const MINE = 'user-1';
const THEIRS = 'user-2';

describe('extractUploadedMediaId', () => {
  it('reads the SDK UploadUrlResponse shape at the root', () => {
    expect(extractUploadedMediaId({ id: 'med_1', upload_url: 'https://x', expires_in: 900 })).toBe('med_1');
  });

  it('reads it inside an ApiResponse envelope', () => {
    expect(extractUploadedMediaId({ success: true, data: { id: 'med_2' } })).toBe('med_2');
  });

  it('reads a nested data.media shape', () => {
    expect(extractUploadedMediaId({ data: { media: { id: 'med_3' } } })).toBe('med_3');
  });

  it('returns null for shapes it does not recognise, minting NO binding', () => {
    // Fails closed: no binding means the uploader cannot confirm/delete, which
    // is visible and fixable. Binding the wrong id would not be.
    expect(extractUploadedMediaId({ result: { mediaId: 'med_4' } })).toBeNull();
    expect(extractUploadedMediaId(null)).toBeNull();
    expect(extractUploadedMediaId('med_5')).toBeNull();
    expect(extractUploadedMediaId({ id: '' })).toBeNull();
    expect(extractUploadedMediaId({ id: 123 })).toBeNull();
  });
});

describe('decideMediaAccess', () => {
  it('allows the owner', () => {
    expect(decideMediaAccess(MINE, MINE)).toEqual({ allowed: true, grant: 'ownership_binding' });
  });

  it('refuses another tenant', () => {
    expect(decideMediaAccess(THEIRS, MINE)).toEqual({ allowed: false, reason: 'not_owner' });
  });

  it('refuses when there is NO binding — strict, because there is no legacy media', () => {
    expect(decideMediaAccess(null, MINE)).toEqual({ allowed: false, reason: 'no_binding' });
  });

  it('never grants on two absences', () => {
    expect(decideMediaAccess(null, '')).toEqual({ allowed: false, reason: 'no_binding' });
    expect(decideMediaAccess('', '')).toEqual({ allowed: false, reason: 'no_binding' });
  });
});

describe('extractConfirmedMedia', () => {
  const full = {
    id: 'm1', filename: 'clip.mp4', url: 'https://cdn/clip.mp4',
    content_type: 'video/mp4', size: 1234, status: 'active',
    created_at: '2026-08-07T00:00:00Z', expires_at: '2026-09-07T00:00:00Z',
  };

  it('reads the ConfirmUploadResponse at the root', () => {
    expect(extractConfirmedMedia(full)).toEqual({
      filename: 'clip.mp4', url: 'https://cdn/clip.mp4', contentType: 'video/mp4',
      size: 1234, status: 'active',
      mediaCreatedAt: '2026-08-07T00:00:00Z', expiresAt: '2026-09-07T00:00:00Z',
    });
  });

  it('reads it inside an ApiResponse envelope and a nested media object', () => {
    expect(extractConfirmedMedia({ success: true, data: full })?.url).toBe('https://cdn/clip.mp4');
    expect(extractConfirmedMedia({ data: { media: full } })?.url).toBe('https://cdn/clip.mp4');
  });

  it('renames the provider created_at so it cannot collide with our own', () => {
    // The row it lands in already has created_at meaning "when WE minted the
    // binding". Two different times under one name is how the wrong one gets
    // plotted.
    const out = extractConfirmedMedia(full)!;
    expect(out.mediaCreatedAt).toBe('2026-08-07T00:00:00Z');
    expect((out as Record<string, unknown>).created_at).toBeUndefined();
  });

  it('REFUSES a record with no url — an unrenderable row must not enter a gallery', () => {
    expect(extractConfirmedMedia({ ...full, url: '' })).toBeNull();
    expect(extractConfirmedMedia({ id: 'm1', filename: 'x.png' })).toBeNull();
  });

  it('keeps individual missing fields as null rather than failing the whole read', () => {
    const out = extractConfirmedMedia({ url: 'https://cdn/a.png' })!;
    expect(out.url).toBe('https://cdn/a.png');
    expect(out.filename).toBeNull();
    expect(out.size).toBeNull();
    expect(out.expiresAt).toBeNull();
  });

  it('accepts camelCase contentType as a fallback', () => {
    expect(extractConfirmedMedia({ url: 'https://x/a', contentType: 'image/png' })?.contentType)
      .toBe('image/png');
  });

  it('returns null for junk', () => {
    expect(extractConfirmedMedia(null)).toBeNull();
    expect(extractConfirmedMedia('str')).toBeNull();
  });
});

describe('toMediaFiles', () => {
  it('emits the PROVIDER field names the gallery reads, not our column names', () => {
    const [file] = toMediaFiles([{
      outstand_media_id: 'm1', filename: 'a.png', url: 'https://cdn/a.png',
      content_type: 'image/png', size: 10, status: 'active',
      media_created_at: '2026-08-07T00:00:00Z', expires_at: null,
    }]);
    expect(file).toEqual({
      id: 'm1', filename: 'a.png', url: 'https://cdn/a.png',
      content_type: 'image/png', size: 10, status: 'active',
      created_at: '2026-08-07T00:00:00Z', expires_at: null,
    });
    // Serving our own schema would parse fine and render blank.
    expect(file).not.toHaveProperty('media_created_at');
    expect(file).not.toHaveProperty('outstand_media_id');
  });

  it('defaults a missing status to active and never emits undefined', () => {
    const [file] = toMediaFiles([{ outstand_media_id: 'm2' }]);
    expect(file.status).toBe('active');
    expect(file.filename).toBe('');
    expect(Object.values(file).every((v) => v !== undefined)).toBe(true);
  });
});

describe('buildMediaListResponse', () => {
  it('emits BOTH the top-level fields and the pagination block the SDK reads', () => {
    const body = JSON.parse(buildMediaListResponse([{ id: 'a' }], 7, 20, 40));
    expect(body.data).toHaveLength(1);
    expect(body.count).toBe(1);
    expect(body.total).toBe(7);
    // useMediaList returns `pagination: data?.pagination ?? null`, and the
    // gallery derives totals and page controls from it. Omitting this reported
    // a populated gallery as 0 files.
    expect(body.pagination).toEqual({ limit: 20, offset: 40, total: 7, count: 1 });
  });

  it('is coherent when the caller owns nothing', () => {
    const body = JSON.parse(buildMediaListResponse([], 0, 50, 0));
    expect(body.data).toEqual([]);
    expect(body.pagination.total).toBe(0);
  });
});

describe('parseMediaPaging', () => {
  it('reads limit and offset', () => {
    expect(parseMediaPaging('?limit=20&offset=40')).toEqual({ limit: 20, offset: 40 });
  });

  it('defaults to the SDK default when absent', () => {
    expect(parseMediaPaging('')).toEqual({ limit: 50, offset: 0 });
  });

  it('clamps hostile values instead of trusting them', () => {
    expect(parseMediaPaging('?limit=100000&offset=-5')).toEqual({ limit: 100, offset: 0 });
    expect(parseMediaPaging('?limit=0')).toEqual({ limit: 1, offset: 0 });
    expect(parseMediaPaging('?limit=abc&offset=xyz')).toEqual({ limit: 50, offset: 0 });
  });
});
