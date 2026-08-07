import { describe, expect, it } from 'vitest';
import {
  collectOwnedWindow,
  decideMediaAccess,
  extractMediaRows,
  extractUploadedMediaId,
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

describe('extractMediaRows', () => {
  it('reads the arrayed envelope', () => {
    const raw = JSON.stringify({ success: true, data: [{ id: 'a' }, { id: 'b' }] });
    expect(extractMediaRows(raw).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('reads a bare top-level array', () => {
    expect(extractMediaRows(JSON.stringify([{ id: 'a' }])).map((r) => r.id)).toEqual(['a']);
  });

  it('finds a row array nested below the top level', () => {
    const raw = JSON.stringify({ result: { items: [{ id: 'a' }] } });
    expect(extractMediaRows(raw).map((r) => r.id)).toEqual(['a']);
  });

  it('returns [] for empty, non-JSON and rowless bodies', () => {
    expect(extractMediaRows('')).toEqual([]);
    expect(extractMediaRows('not json')).toEqual([]);
    expect(extractMediaRows(JSON.stringify({ success: true, data: [] }))).toEqual([]);
  });
});

describe('collectOwnedWindow', () => {
  const page = (...ids: string[]) => ids.map((id) => ({ id }));

  it('THE BUG THIS FIXES: an all-foreign first page no longer yields an empty gallery', () => {
    // Org ordering puts three other tenants' uploads first. Single-page
    // filtering returned nothing and the user saw an empty gallery; paging over
    // the OWNED sequence finds their media on page 2.
    const pages = [page('x1', 'x2', 'x3'), page('mine1', 'x4', 'mine2')];
    const owned = [new Set<string>(), new Set(['mine1', 'mine2'])];
    const out = collectOwnedWindow(pages, owned, 0, 10);
    expect(out.rows.map((r) => r.id)).toEqual(['mine1', 'mine2']);
  });

  it("offset means an offset into the CALLER's media, not the org's", () => {
    const pages = [page('x1', 'a', 'x2', 'b'), page('c', 'x3', 'd')];
    const owned = [new Set(['a', 'b']), new Set(['c', 'd'])];
    expect(collectOwnedWindow(pages, owned, 1, 2).rows.map((r) => r.id)).toEqual(['b', 'c']);
    expect(collectOwnedWindow(pages, owned, 3, 2).rows.map((r) => r.id)).toEqual(['d']);
  });

  it('stops early once the window is filled rather than scanning every page', () => {
    const pages = [page('a', 'b'), page('c')];
    const owned = [new Set(['a', 'b']), new Set(['c'])];
    const out = collectOwnedWindow(pages, owned, 0, 2);
    expect(out.rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(out.exhausted).toBe(false); // did not need the second page
  });

  it('reports exhaustion when the provider ran out before the window filled', () => {
    const pages = [page('a')];
    const owned = [new Set(['a'])];
    const out = collectOwnedWindow(pages, owned, 0, 10);
    expect(out.rows.map((r) => r.id)).toEqual(['a']);
    expect(out.exhausted).toBe(true);
  });

  it("never returns another tenant's row, even when it owns nothing", () => {
    const pages = [page('x1', 'x2')];
    const owned = [new Set<string>()];
    expect(collectOwnedWindow(pages, owned, 0, 10).rows).toEqual([]);
  });

  it('ignores rows whose id is missing or not a string', () => {
    const pages = [[{ id: 'a' }, { filename: 'no-id.jpg' }, { id: 123 }]];
    const owned = [new Set(['a'])];
    expect(collectOwnedWindow(pages, owned, 0, 10).rows.map((r) => r.id)).toEqual(['a']);
  });

  it('handles an offset past the end without throwing', () => {
    const pages = [page('a')];
    const owned = [new Set(['a'])];
    expect(collectOwnedWindow(pages, owned, 99, 10).rows).toEqual([]);
  });

  it('tolerates zero and negative paging inputs', () => {
    const pages = [page('a', 'b')];
    const owned = [new Set(['a', 'b'])];
    expect(collectOwnedWindow(pages, owned, 0, 0).rows).toEqual([]);
    expect(collectOwnedWindow(pages, owned, -5, 2).rows.map((r) => r.id)).toEqual(['a', 'b']);
  });
});
