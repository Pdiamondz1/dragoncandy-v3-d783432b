import { describe, it, expect } from 'vitest';
import { extractOutstandPostId } from './outstandPostId';

describe('extractOutstandPostId', () => {
  it('reads data.post.id — the shape every caller actually sees through outstand-proxy', () => {
    // All three publish paths go through OUTSTAND_PROXY_BASE_URL, whose
    // normalizer copies the raw `{success, post}` into `data.post`. This is THE
    // production case.
    expect(
      extractOutstandPostId({ success: true, post: { id: 'XDb8e' }, data: { post: { id: 'XDb8e' } } }),
    ).toBe('XDb8e');
  });

  it('reads post.id — the raw upstream shape, if the normalizer ever no-ops', () => {
    expect(extractOutstandPostId({ success: true, post: { id: 'mJuDd' } })).toBe('mJuDd');
  });

  it('reads a bare top-level id as the last resort (retained client-side only)', () => {
    // Kept because useCrossPost — the proven reader — carries it. Safe here and
    // NOT safe server-side; see this module's header and
    // supabase/functions/_shared/outstand-post-ownership.ts.
    expect(extractOutstandPostId({ id: 'XDbxe' })).toBe('XDbxe');
  });

  // THE REGRESSION THIS MODULE EXISTS FOR.
  //
  // useSponsorshipAmplification read `data.id ?? data.data.id`, which against
  // the real normalized response resolves to undefined at BOTH links: there is
  // no top-level `id`, and `data` is `{post: {...}}` whose own `.id` does not
  // exist. It returned null on every call, and the null-guard then skipped the
  // schedule-row insert AND the social_post_log write — making Task 1 inert.
  it('resolves the exact payload the old amplification union returned null for', () => {
    const realProxyResponse = {
      success: true,
      post: { id: 'XDb8e', socialAccounts: [{ network: 'instagram', status: 'pending' }] },
      data: { post: { id: 'XDb8e', socialAccounts: [{ network: 'instagram', status: 'pending' }] } },
    };

    // What the old amplification code computed, spelled out so the regression is
    // legible rather than asserted in the abstract:
    const oldAmplificationUnion =
      ((realProxyResponse as Record<string, unknown>).id ??
        ((realProxyResponse as Record<string, unknown>).data as Record<string, unknown>)?.id ??
        null) as string | null;
    expect(oldAmplificationUnion).toBeNull();

    expect(extractOutstandPostId(realProxyResponse)).toBe('XDb8e');
  });

  it('prefers data.post.id over the shallower links', () => {
    expect(
      extractOutstandPostId({ data: { post: { id: 'wrapped' } }, post: { id: 'raw' }, id: 'bare' }),
    ).toBe('wrapped');
  });

  it('falls through a data object that carries no post', () => {
    // `data.data.id` was the old union's second link; it must not accidentally
    // become a match now.
    expect(extractOutstandPostId({ data: { id: 'not-a-post-id' } })).toBeNull();
  });

  it('returns null when no id is present anywhere', () => {
    expect(extractOutstandPostId({ success: true, data: { post: {} } })).toBeNull();
    expect(extractOutstandPostId({ success: true })).toBeNull();
  });

  it('returns null for a non-string id rather than coercing it', () => {
    // outstand_post_id is text with a UNIQUE (outstand_post_id, platform) key; a
    // numeric id stringifying differently from the provider's own value would
    // key the row wrong and be undetectable afterwards.
    expect(extractOutstandPostId({ data: { post: { id: 12345 } } })).toBeNull();
    expect(extractOutstandPostId({ post: { id: { nested: 'x' } } })).toBeNull();
  });

  it('returns null for an empty-string id', () => {
    expect(extractOutstandPostId({ data: { post: { id: '' } } })).toBeNull();
  });

  it('survives every non-object body without throwing', () => {
    for (const body of [null, undefined, 'a string', 42, true, []]) {
      expect(extractOutstandPostId(body)).toBeNull();
    }
  });

  it('does not mistake an array-valued data/post for an object', () => {
    expect(extractOutstandPostId({ data: [{ post: { id: 'x' } }] })).toBeNull();
    expect(extractOutstandPostId({ post: [{ id: 'x' }] })).toBeNull();
  });
});
