import { describe, it, expect } from 'vitest';
import {
  SOCIAL_TOOLS,
  ANALYTICS_ONLY_TOOLS,
  filterToolsByTier,
  namespaceTools,
  buildForwardedArgs,
} from './outstand-mcp-tools';

const DROPPED = ['get_optimal_times', 'get_audience_insights', 'list_scheduled'];
const TIERS = [undefined, 'free', 'starter', 'growth', 'pro', 'enterprise'];

describe('the offered tool surface', () => {
  it('offers exactly the four tools that have an implementation', () => {
    expect(SOCIAL_TOOLS.map((t) => t.name).sort()).toEqual([
      'create_post',
      'get_account_metrics',
      'get_post_analytics',
      'schedule_post',
    ]);
  });

  it('never offers a dropped tool under ANY tier branch', () => {
    for (const tier of TIERS) {
      const offered = namespaceTools(filterToolsByTier(SOCIAL_TOOLS, tier)).map((t) => t.name);
      for (const gone of DROPPED) {
        expect(offered).not.toContain(gone);
        expect(offered).not.toContain(`social_${gone}`);
      }
    }
  });

  it('leaves every tier with at least one tool', () => {
    for (const tier of TIERS) {
      expect(filterToolsByTier(SOCIAL_TOOLS, tier).length).toBeGreaterThan(0);
    }
  });

  it('gives free tier the two analytics tools and no publishing tool', () => {
    const free = filterToolsByTier(SOCIAL_TOOLS, 'free').map((t) => t.name).sort();
    expect(free).toEqual(['get_account_metrics', 'get_post_analytics']);
  });

  it('does not reference a dropped tool in the analytics-only list', () => {
    for (const gone of DROPPED) {
      expect(ANALYTICS_ONLY_TOOLS.has(gone)).toBe(false);
    }
  });

  it('gives a paid tier every tool', () => {
    expect(filterToolsByTier(SOCIAL_TOOLS, 'enterprise')).toHaveLength(SOCIAL_TOOLS.length);
  });
});

describe('account_id is gone from the model-facing contract', () => {
  it('declares no account_id property on any tool', () => {
    for (const tool of SOCIAL_TOOLS) {
      const props = (tool.inputSchema as { properties?: Record<string, unknown> }).properties ?? {};
      expect(Object.keys(props)).not.toContain('account_id');
    }
  });

  it('requires no account_id on any tool', () => {
    for (const tool of SOCIAL_TOOLS) {
      const required = (tool.inputSchema as { required?: string[] }).required ?? [];
      expect(required).not.toContain('account_id');
    }
  });

  it('never mentions an account id in a description the model reads', () => {
    for (const tool of SOCIAL_TOOLS) {
      expect(tool.description.toLowerCase()).not.toContain('account_id');
      expect(tool.description.toLowerCase()).not.toContain('account id');
    }
  });
});

describe('the publishing tools say they do not publish', () => {
  it('tells the model create_post only drafts', () => {
    const t = SOCIAL_TOOLS.find((x) => x.name === 'create_post');
    expect(t?.description).toContain('Does NOT publish');
  });

  it('tells the model schedule_post only drafts', () => {
    const t = SOCIAL_TOOLS.find((x) => x.name === 'schedule_post');
    expect(t?.description).toContain('Does NOT publish');
  });
});

describe('namespaceTools', () => {
  it('prefixes every tool with social_', () => {
    for (const t of namespaceTools(SOCIAL_TOOLS)) {
      expect(t.name.startsWith('social_')).toBe(true);
    }
  });

  it('leaves the schema untouched', () => {
    expect(namespaceTools(SOCIAL_TOOLS)[0].inputSchema).toBe(SOCIAL_TOOLS[0].inputSchema);
  });
});

describe('buildForwardedArgs', () => {
  it('forwards a schema-declared field (platform) for get_account_metrics', () => {
    const forwarded = buildForwardedArgs('get_account_metrics', { platform: 'instagram' }, 'real-id');
    expect(forwarded.platform).toBe('instagram');
  });

  it('always sets account_id to the server-resolved id, never the caller-supplied one', () => {
    const forwarded = buildForwardedArgs(
      'get_account_metrics',
      { platform: 'instagram', account_id: 'attacker-supplied' },
      'real-id',
    );
    expect(forwarded.account_id).toBe('real-id');
  });

  it('drops a model-supplied alternate account selector — social_account_id', () => {
    const forwarded = buildForwardedArgs(
      'get_account_metrics',
      { platform: 'instagram', social_account_id: 'guessed-5char' },
      'real-id',
    );
    expect(forwarded).toEqual({ platform: 'instagram', account_id: 'real-id' });
  });

  it('drops every alternate selector name the provider ecosystem recognizes', () => {
    const alternates = {
      socialAccountId: 'a',
      accounts: ['b'],
      social_account_ids: ['c'],
    };
    const forwarded = buildForwardedArgs('get_account_metrics', alternates, 'real-id');
    expect(forwarded).toEqual({ account_id: 'real-id' });
  });

  it('accepts the namespaced tool name (social_get_account_metrics) identically to the raw name', () => {
    const namespaced = buildForwardedArgs('social_get_account_metrics', { platform: 'tiktok' }, 'real-id');
    const raw = buildForwardedArgs('get_account_metrics', { platform: 'tiktok' }, 'real-id');
    expect(namespaced).toEqual(raw);
  });

  it('forwards nothing from args for an unknown tool name, only account_id', () => {
    const forwarded = buildForwardedArgs('not_a_real_tool', { platform: 'instagram', anything: 1 }, 'real-id');
    expect(forwarded).toEqual({ account_id: 'real-id' });
  });

  it('does not forward a field the tool schema does not declare (create_post has no platform-adjacent decoy)', () => {
    // create_post's schema declares caption/platform/media_urls — a field
    // outside that set must not pass through even though it's present in args.
    const forwarded = buildForwardedArgs(
      'create_post',
      { caption: 'hello', platform: 'instagram', media_urls: ['x'], extra_field: 'nope' },
      'real-id',
    );
    expect(forwarded).toEqual({ caption: 'hello', platform: 'instagram', media_urls: ['x'], account_id: 'real-id' });
  });
});
