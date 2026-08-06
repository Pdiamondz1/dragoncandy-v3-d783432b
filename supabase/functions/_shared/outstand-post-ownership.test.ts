import { describe, it, expect } from 'vitest';
import { extractCreatedPostId, applyOwnershipBinding } from './outstand-post-ownership';

describe('extractCreatedPostId', () => {
  // The shape outstand-proxy's normalizer PRODUCES (and the shape the SDK's own
  // ApiResponse<{post: Post}> type declares): { success, data: { post: { id } } }.
  it('reads data.post.id — the post-normalization shape every client already parses', () => {
    expect(
      extractCreatedPostId({ success: true, data: { post: { id: 'XDb8e', socialAccounts: [] } } }),
    ).toBe('XDb8e');
  });

  // The RAW upstream shape, per the proxy normalizer's own comment: Outstand
  // returns top-level resource keys. Reading the body BEFORE normalization must
  // yield the same id, so the write site's position relative to the normalizer
  // cannot silently change behavior.
  it('reads post.id — the raw upstream shape, before the proxy normalizes it', () => {
    expect(extractCreatedPostId({ success: true, post: { id: 'mJuDd' } })).toBe('mJuDd');
  });

  it('reads a top-level id as the last resort (the third link every existing reader accepts)', () => {
    expect(extractCreatedPostId({ id: 'XDbxe' })).toBe('XDbxe');
  });

  it('prefers data.post.id over post.id when the normalizer has produced both', () => {
    // The proxy sets parsed.data = { post: parsed.post }, so both are the SAME
    // object in production. This pins the priority order anyway, so a future
    // divergence resolves the way every other reader in the codebase resolves it.
    expect(
      extractCreatedPostId({ success: true, post: { id: 'raw' }, data: { post: { id: 'wrapped' } } }),
    ).toBe('wrapped');
  });

  it('returns null when the id is missing — a binding is never written on a guess', () => {
    expect(extractCreatedPostId({ success: true, data: { post: {} } })).toBeNull();
    expect(extractCreatedPostId({ success: true })).toBeNull();
  });

  it('returns null for a non-string id rather than coercing it', () => {
    // Postgres would accept 12345::text; a numeric id that stringifies
    // differently than the provider's own value would bind the wrong key and be
    // undetectable afterwards.
    expect(extractCreatedPostId({ data: { post: { id: 12345 } } })).toBeNull();
    expect(extractCreatedPostId({ id: { nested: 'x' } })).toBeNull();
  });

  it('returns null for an empty-string id', () => {
    expect(extractCreatedPostId({ data: { post: { id: '' } } })).toBeNull();
  });

  it('survives every non-object body without throwing', () => {
    // A 2xx with a non-JSON or unexpected body must degrade to "no binding",
    // never take down the user's publish response.
    for (const body of [null, undefined, 'a string', 42, true, []]) {
      expect(extractCreatedPostId(body)).toBeNull();
    }
  });

  it('does not mistake an array-valued data/post for an object', () => {
    expect(extractCreatedPostId({ data: [{ post: { id: 'x' } }] })).toBeNull();
    expect(extractCreatedPostId({ post: [{ id: 'x' }] })).toBeNull();
  });
});

describe('applyOwnershipBinding', () => {
  const row = (user_id: string, tag: string) => ({ user_id, tag });

  it('keeps a candidate the binding vouches for', () => {
    const mine = row('user-1', 'mine');
    expect(applyOwnershipBinding('user-1', [mine])).toEqual({
      kind: 'binding',
      bindingUserId: 'user-1',
      candidates: [mine],
      rejected: 0,
    });
  });

  it('discards ONLY the disagreeing row and counts it — a plant must not deny the victim', () => {
    // The scenario: an attacker plants a schedule row naming a guessed post id
    // (it sorts first, being older); the real creator publishes that post and
    // their own row lands second. The binding names the creator. Rejecting the
    // whole POST here would let cheap id-guessing stop the platform measuring
    // anything; rejecting the ROW neutralises the plant and still measures the
    // real post.
    const planted = row('attacker', 'planted');
    const real = row('victim', 'real');
    expect(applyOwnershipBinding('victim', [planted, real])).toEqual({
      kind: 'binding',
      bindingUserId: 'victim',
      candidates: [real],
      rejected: 1,
    });
  });

  it('preserves input order among survivors so the caller\'s created_at asc still holds', () => {
    const older = row('user-1', 'older');
    const planted = row('attacker', 'planted');
    const newer = row('user-1', 'newer');
    const res = applyOwnershipBinding('user-1', [older, planted, newer]);
    expect(res.candidates).toEqual([older, newer]);
    expect(res.rejected).toBe(1);
  });

  it('conflicts when NOT ONE candidate agrees — nothing the server can vouch for', () => {
    expect(applyOwnershipBinding('victim', [row('attacker', 'planted')])).toEqual({
      kind: 'conflict',
      bindingUserId: 'victim',
      candidates: [],
      rejected: 1,
    });
  });

  it('is unbound (input untouched) when no binding exists — null, undefined, or blank', () => {
    const rows = [row('user-1', 'a')];
    for (const binding of [null, undefined, '']) {
      expect(applyOwnershipBinding(binding, rows)).toEqual({
        kind: 'unbound',
        bindingUserId: null,
        candidates: rows,
        rejected: 0,
      });
    }
  });

  it('never lets a blank binding agree with a blank user_id', () => {
    // Two missing values must not "agree" and authorize a write.
    const blank = row('', 'blank');
    expect(applyOwnershipBinding('', [blank])).toEqual({
      kind: 'unbound',
      bindingUserId: null,
      candidates: [blank],
      rejected: 0,
    });
  });

  it('rejects a candidate with a missing or non-string user_id under a binding', () => {
    const rows = [{ user_id: null }, { user_id: 42 }, {}] as Array<{ user_id?: unknown }>;
    expect(applyOwnershipBinding('user-1', rows)).toEqual({
      kind: 'conflict',
      bindingUserId: 'user-1',
      candidates: [],
      rejected: 3,
    });
  });

  it('conflicts on an empty candidate list when a binding exists', () => {
    // Reachable only if a caller applies the binding before checking that the
    // schedule lookup returned anything; must not report `binding` with nothing
    // behind it.
    expect(applyOwnershipBinding('user-1', [])).toEqual({
      kind: 'conflict',
      bindingUserId: 'user-1',
      candidates: [],
      rejected: 0,
    });
  });
});
