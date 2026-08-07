import { describe, expect, it } from 'vitest';
import {
  decideMediaAccess,
  extractUploadedMediaId,
  collectMediaIds,
  filterMediaList,
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

describe('filterMediaList', () => {
  const envelope = (ids: string[], extra: Record<string, unknown> = {}) =>
    JSON.stringify({
      success: true,
      data: ids.map((id) => ({ id, filename: `${id}.jpg`, url: `https://cdn/${id}` })),
      total: ids.length,
      count: ids.length,
      ...extra,
    });

  const owned = new Set(['a', 'b']);

  it('keeps only the caller\'s own media', () => {
    const out = JSON.parse(filterMediaList(envelope(['a', 'x', 'b', 'y']), owned).body);
    expect(out.data.map((m: { id: string }) => m.id)).toEqual(['a', 'b']);
  });

  it('never leaks another tenant\'s filename or url', () => {
    const res = filterMediaList(envelope(['a', 'secret']), owned);
    expect(res.body).not.toContain('secret.jpg');
    expect(res.body).not.toContain('cdn/secret');
    expect(res.dropped).toBe(1);
  });

  it('rewrites counters so the org-wide total is not disclosed', () => {
    const out = JSON.parse(filterMediaList(envelope(['a', 'x', 'y', 'z']), owned).body);
    expect(out.total).toBe(1);
    expect(out.count).toBe(1);
  });

  it('drops a row with no readable id — unattributable is not owned', () => {
    const raw = JSON.stringify({ data: [{ filename: 'orphan.jpg' }, { id: 'a' }] });
    const out = JSON.parse(filterMediaList(raw, owned).body);
    expect(out.data.map((m: { id?: string }) => m.id)).toEqual(['a']);
  });

  it('filters an array key the provider might add later, without being told its name', () => {
    const raw = JSON.stringify({ media: [{ id: 'a' }, { id: 'x' }], data: [{ id: 'b' }] });
    const out = JSON.parse(filterMediaList(raw, owned).body);
    expect(out.media.map((m: { id: string }) => m.id)).toEqual(['a']);
    expect(out.data.map((m: { id: string }) => m.id)).toEqual(['b']);
  });

  it('filters a row array nested below the top level', () => {
    const raw = JSON.stringify({ result: { items: [{ id: 'a' }, { id: 'x' }] } });
    const out = JSON.parse(filterMediaList(raw, owned).body);
    expect(out.result.items.map((m: { id: string }) => m.id)).toEqual(['a']);
  });

  it('keeps nothing when the caller owns nothing — the fail-closed path', () => {
    // listOwnedMediaIds returns an empty set on a read error, so this is also
    // what a DB blip produces: an empty list, never the org's media.
    const out = JSON.parse(filterMediaList(envelope(['a', 'b']), new Set()).body);
    expect(out.data).toEqual([]);
    expect(out.total).toBe(0);
  });

  it('filters a bare top-level array', () => {
    const raw = JSON.stringify([{ id: 'a' }, { id: 'x' }]);
    expect(JSON.parse(filterMediaList(raw, owned).body).map((m: { id: string }) => m.id)).toEqual(['a']);
  });

  it('passes empty, non-JSON and non-object bodies through unchanged', () => {
    expect(filterMediaList('', owned).body).toBe('');
    expect(filterMediaList('not json', owned).body).toBe('not json');
    expect(filterMediaList('"a string"', owned).body).toBe('"a string"');
  });
});

describe('filterMediaList — shapes that are not arrays', () => {
  const owned = new Set(['a', 'b']);

  it('filters a collection keyed BY ID rather than arrayed', () => {
    // An array-only filter walks into this and forwards every row — the same
    // shape of miss as filtering `data` while `posts` rode alongside.
    const raw = JSON.stringify({
      media: { abc: { id: 'a', filename: 'mine.jpg' }, xyz: { id: 'x', filename: 'theirs.jpg' } },
    });
    const res = filterMediaList(raw, owned);
    const out = JSON.parse(res.body);
    expect(Object.keys(out.media)).toEqual(['abc']);
    expect(res.body).not.toContain('theirs.jpg');
    expect(res.dropped).toBe(1);
  });

  it('does not mistake a pagination block for a row map', () => {
    const raw = JSON.stringify({ data: [{ id: 'a' }], pagination: { limit: 10, offset: 0, total: 42 } });
    const out = JSON.parse(filterMediaList(raw, owned).body);
    expect(out.pagination.limit).toBe(10);
    expect(out.pagination.offset).toBe(0);
    expect(out.pagination.total).toBe(1); // counter rewritten, block intact
  });

  it('rewrites page counters too, not just count/total', () => {
    const raw = JSON.stringify({ data: [{ id: 'a' }, { id: 'x' }], totalPages: 9, pages: 9, total_count: 99 });
    const out = JSON.parse(filterMediaList(raw, owned).body);
    expect(out.totalPages).toBe(1);
    expect(out.pages).toBe(1);
    expect(out.total_count).toBe(1);
  });

  it('zeroes page counters when the caller owns nothing', () => {
    const raw = JSON.stringify({ data: [{ id: 'x' }], totalPages: 4 });
    const out = JSON.parse(filterMediaList(raw, new Set()).body);
    expect(out.data).toEqual([]);
    expect(out.totalPages).toBe(0);
  });

  it('leaves a single embedded row object alone rather than treating it as a map', () => {
    const raw = JSON.stringify({ success: true, data: { id: 'a', filename: 'mine.jpg' } });
    const out = JSON.parse(filterMediaList(raw, owned).body);
    expect(out.data.id).toBe('a');
  });
});

describe('collectMediaIds', () => {
  it('collects ids from a normal envelope', () => {
    const raw = JSON.stringify({ success: true, data: [{ id: 'a' }, { id: 'b' }] });
    expect(collectMediaIds(raw).sort()).toEqual(['a', 'b']);
  });

  it('collects from nested containers and id-keyed maps', () => {
    const raw = JSON.stringify({ result: { items: [{ id: 'a' }] }, media: { k: { id: 'b' } } });
    expect(collectMediaIds(raw).sort()).toEqual(['a', 'b']);
  });

  it('collects from a bare top-level array', () => {
    expect(collectMediaIds(JSON.stringify([{ id: 'a' }]))).toEqual(['a']);
  });

  it('dedupes and ignores non-string or empty ids', () => {
    const raw = JSON.stringify({ data: [{ id: 'a' }, { id: 'a' }, { id: 123 }, { id: '' }, {}] });
    expect(collectMediaIds(raw)).toEqual(['a']);
  });

  it('returns [] for empty and non-JSON bodies', () => {
    expect(collectMediaIds('')).toEqual([]);
    expect(collectMediaIds('not json')).toEqual([]);
  });
});
