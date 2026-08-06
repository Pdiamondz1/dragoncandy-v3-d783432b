// Cross-module equivalence test: verifies that src/lib/postType.ts and this sibling
// produce identical results. DonnyProvider (src/) and the webhook both insert on
// (outstand_post_id, platform); if they disagree on post_type, whichever inserts last
// silently overwrites the first in the column that content-strategy-recommend groups by.
//
// This test must import from BOTH paths at runtime. Because tsconfig.app.json only
// includes src/, we cannot typecheck this file at compile time, but Vitest handles
// the cross-path imports at runtime.

import { describe, it, expect } from 'vitest';
import { resolvePostType as resolvePostTypeSrc, POST_TYPES as POST_TYPES_SRC } from '../../../src/lib/postType';
import { resolvePostType as resolvePostTypeEdge, POST_TYPES as POST_TYPES_EDGE } from './post-type';

describe('postType src/edge sibling equivalence', () => {
  it('POST_TYPES is identical in both modules', () => {
    expect(POST_TYPES_SRC).toEqual(POST_TYPES_EDGE);
  });

  it('resolvePostType produces identical results across all inputs', () => {
    // Test matrix: all known sources, unknown strings, empty/null/undefined,
    // each with and without a campaign id, plus prototype-collision keys
    const sources = [
      'campaign_social_hook',
      'promotion_social_hook',
      'dragonshare_social_hook',
      'unknown_source',
      'nonsense',
      '',
      null,
      undefined,
      // Prototype-collision keys that would expose a lookup vulnerability
      '__proto__',
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
    ];

    const campaignIds = [
      null,
      undefined,
      'c0ffee00-0000-0000-0000-000000000000',
      '12345678-1234-1234-1234-123456789012',
    ];

    for (const source of sources) {
      for (const campaignId of campaignIds) {
        const resultSrc = resolvePostTypeSrc(source as string | null, campaignId);
        const resultEdge = resolvePostTypeEdge(source as string | null, campaignId);

        expect(resultSrc).toBe(
          resultEdge,
          `Mismatch for source=${JSON.stringify(source)}, campaignId=${campaignId}: src=${resultSrc}, edge=${resultEdge}`,
        );
      }
    }
  });

  it('both modules reject prototype-pollution attempts', () => {
    // Prototype-collision keys must fall through to the campaign/standalone fallbacks,
    // never resolving to a non-PostType value from Object.prototype
    for (const protoKey of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
      const resultSrc = resolvePostTypeSrc(protoKey, null);
      const resultEdge = resolvePostTypeEdge(protoKey, null);

      // Both should return 'standalone', not a function or object
      expect(typeof resultSrc).toBe('string');
      expect(typeof resultEdge).toBe('string');
      expect(POST_TYPES_SRC).toContain(resultSrc);
      expect(POST_TYPES_EDGE).toContain(resultEdge);
      expect(resultSrc).toBe(resultEdge);
    }
  });
});
