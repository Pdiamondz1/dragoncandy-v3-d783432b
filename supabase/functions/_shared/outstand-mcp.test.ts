import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { createOutstandMcpBridge } from './outstand-mcp';

// A stand-in MCP server whose advertised tool list each test controls. The real
// one has never connected on prod (every logged failure carries the REST
// branch's error string), so this is the only way to exercise that path at all.
const remote = vi.hoisted(() => ({ tools: ['get_account_metrics'] }));

vi.mock('./mcp-client.ts', () => ({
  createMcpClient: async () => ({
    listTools: async () => remote.tools.map((name) => ({ name, description: '', inputSchema: {} })),
    callTool: async () => ({ content: [{ type: 'text', text: '{}' }] }),
    disconnect: () => {},
  }),
}));

/**
 * These tests pin ONE property: every read Donny makes of `content_performance`
 * asks the database for verified rows only.
 *
 * The filter itself is applied by PostgREST, not by this code, so the honest
 * thing to assert is the REQUEST — that the select carries the `!inner` join
 * and the `.not()` filter goes out with it. A fake client that "returned only
 * verified rows" would be testing the fake.
 *
 * Why it matters: `verified_at` is stamped only by server-side code from a
 * signed Outstand event. Prod holds 9 legacy `content_performance` rows for 3
 * posts, 6 of them fabricated all-zero measurements, none verified. Ungated,
 * Donny reports those as measured fact AND they clear his sample-size bar.
 */

interface RecordedQuery {
  table: string;
  select: string;
  filters: Array<{ op: string; args: unknown[] }>;
}

function fakeSupabase(rowsByTable: Record<string, unknown[]>) {
  const queries: RecordedQuery[] = [];

  function from(table: string) {
    const q: RecordedQuery = { table, select: '', filters: [] };
    queries.push(q);
    const builder = {
      select(cols: string) {
        q.select = cols;
        return builder;
      },
      eq(...args: unknown[]) {
        q.filters.push({ op: 'eq', args });
        return builder;
      },
      gte(...args: unknown[]) {
        q.filters.push({ op: 'gte', args });
        return builder;
      },
      not(...args: unknown[]) {
        q.filters.push({ op: 'not', args });
        return builder;
      },
      order(...args: unknown[]) {
        q.filters.push({ op: 'order', args });
        return builder;
      },
      // Thenable: `await supabase.from(x).select(y).eq(...)` resolves here.
      then(onFulfilled: (v: { data: unknown[]; error: null }) => unknown) {
        return Promise.resolve({ data: rowsByTable[table] ?? [], error: null }).then(onFulfilled);
      },
    };
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { supabase: { from } as any, queries };
}

const ACCOUNT_ROW = {
  outstand_social_account_id: 'LEnjV',
  platform: 'instagram',
  platform_handle: 'areyouaman',
};

const YT_ACCOUNT_ROW = {
  outstand_social_account_id: 'I2pgX',
  platform: 'youtube',
  platform_handle: '@josephcastelo149',
};

/** A second Instagram connection — the case platform-scoping cannot separate. */
const IG_SIBLING_ROW = {
  outstand_social_account_id: 'ZZZZZ',
  platform: 'instagram',
  platform_handle: 'second_shop',
};

/** One measured post, in the shape the gated select returns. */
function perfRow(id: string, milestone = '24h') {
  return {
    outstand_post_id: id,
    platform: 'instagram',
    views: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    engagement_rate: 0.13,
    milestone,
    social_post_log: { verified_at: '2026-08-06T00:00:00Z' },
  };
}

const ENV: Record<string, string> = {
  OUTSTAND_API_KEY: 'test-key',
  SUPABASE_URL: 'https://example.test',
  // OUTSTAND_MCP_URL deliberately unset — the REST branch, which is what runs
  // on prod (the MCP client has never connected there).
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const g = globalThis as any;
let priorDeno: unknown;

beforeAll(() => {
  priorDeno = g.Deno;
  g.Deno = { env: { get: (k: string) => ENV[k] } };
});

afterAll(() => {
  g.Deno = priorDeno;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function bridgeFor(rowsByTable: Record<string, unknown[]>) {
  const { supabase, queries } = fakeSupabase({
    business_outstand_accounts: [ACCOUNT_ROW],
    ...rowsByTable,
  });
  return build(supabase, queries);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function build(supabase: any, queries: RecordedQuery[], orgTier?: string) {
  const bridge = await createOutstandMcpBridge({
    userId: 'user-1',
    userRole: 'business_client',
    orgTier,
    supabase,
    authHeader: 'Bearer user-jwt',
  });
  if (!bridge) throw new Error('bridge was not built');
  return { bridge, queries };
}

const perfQuery = (queries: RecordedQuery[]) =>
  queries.filter((q) => q.table === 'content_performance');

describe('get_post_analytics', () => {
  it('reads only verified rows', async () => {
    const { bridge, queries } = await bridgeFor({
      content_performance: [perfRow('p1'), perfRow('p2'), perfRow('p3')],
    });

    await bridge.callTool('social_get_post_analytics', {});

    const [q] = perfQuery(queries);
    expect(q).toBeDefined();
    expect(q.select).toContain('social_post_log!inner(verified_at)');
    expect(q.filters).toContainEqual({
      op: 'not',
      args: ['social_post_log.verified_at', 'is', null],
    });
    // Still scoped to the caller: on a service-role client this filter IS the
    // tenant boundary, so the verified gate must not have displaced it.
    expect(q.filters).toContainEqual({ op: 'eq', args: ['user_id', 'user-1'] });
  });
});

describe('get_account_metrics', () => {
  function stubFetchOk() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ followers: 1200 }), { status: 200 })),
    );
  }

  it('counts only verified rows toward the sample-size gate', async () => {
    stubFetchOk();
    const { bridge, queries } = await bridgeFor({
      content_performance: [perfRow('p1'), perfRow('p2'), perfRow('p3')],
    });

    await bridge.callTool('social_get_account_metrics', {});

    const [q] = perfQuery(queries);
    expect(q).toBeDefined();
    expect(q.select).toContain('social_post_log!inner(verified_at)');
    expect(q.filters).toContainEqual({
      op: 'not',
      args: ['social_post_log.verified_at', 'is', null],
    });
    expect(q.filters).toContainEqual({ op: 'eq', args: ['user_id', 'user-1'] });
  });

  it('has_signal follows the DISTINCT post count from that gated read', async () => {
    stubFetchOk();
    // Three rows, two posts: the third is p2's second milestone. Counting rows
    // would clear the bar of 3; counting posts does not.
    const two = await bridgeFor({
      content_performance: [perfRow('p1'), perfRow('p2', '24h'), perfRow('p2', '72h')],
    });
    const belowBar = await two.bridge.callTool('social_get_account_metrics', {});
    expect(JSON.parse(belowBar.content[0].text as string).has_signal).toBe(false);

    stubFetchOk();
    const three = await bridgeFor({
      content_performance: [perfRow('p1'), perfRow('p2'), perfRow('p3')],
    });
    const atBar = await three.bridge.callTool('social_get_account_metrics', {});
    expect(JSON.parse(atBar.content[0].text as string).has_signal).toBe(true);
  });

  // This tool answers about ONE account and returns that account's engagement
  // rate, so a user-wide sample would let five measured Instagram posts certify
  // a YouTube rate — a gate about a different thing than the claim.
  // get_post_analytics is deliberately NOT scoped this way: it reports across
  // everything the user has.
  it('scopes the sample to the resolved account platform', async () => {
    stubFetchOk();
    const { supabase, queries } = fakeSupabase({
      business_outstand_accounts: [ACCOUNT_ROW, YT_ACCOUNT_ROW],
      content_performance: [perfRow('p1'), perfRow('p2'), perfRow('p3')],
    });
    const { bridge } = await build(supabase, queries);

    await bridge.callTool('social_get_account_metrics', { platform: 'youtube' });

    const [q] = perfQuery(queries);
    expect(q.filters).toContainEqual({ op: 'eq', args: ['platform', 'youtube'] });
  });

  it('refuses the signal when two accounts share the resolved platform', async () => {
    stubFetchOk();
    const { supabase, queries } = fakeSupabase({
      business_outstand_accounts: [ACCOUNT_ROW, IG_SIBLING_ROW],
      // Three measured posts — enough to clear the bar on count alone. They
      // cannot be attributed to either Instagram account, so the bar must not
      // clear: content_performance records a platform, never an account id.
      content_performance: [perfRow('p1'), perfRow('p2'), perfRow('p3')],
    });
    const { bridge } = await build(supabase, queries);

    const res = await bridge.callTool('social_get_account_metrics', { handle: '@areyouaman' });
    const payload = JSON.parse(res.content[0].text as string);

    expect(payload.has_signal).toBe(false);
    expect(payload.caveat).toMatch(/more than one connected account shares it/i);
    // The count is still reported honestly — it is the attribution that fails,
    // not the measurement.
    expect(payload.caveat).toMatch(/^3 measured posts/);
  });
});

// The remote list decides which UPSTREAM-backed tools are real. It must not get
// a vote on the three that are implemented here, or pointing OUTSTAND_MCP_URL at
// a server with a different vocabulary silently hides working tools.
describe('offered tools vs. a remote MCP server', () => {
  async function toolsWithRemote(advertised: string[]) {
    remote.tools = advertised;
    // The MCP client is only built when this is set; without it the bridge
    // takes the REST fallback and never consults a remote list at all.
    ENV.OUTSTAND_MCP_URL = 'https://mcp.test';
    try {
      const { supabase, queries } = fakeSupabase({ business_outstand_accounts: [ACCOUNT_ROW] });
      // A paid tier — filterToolsByTier restricts a free/absent tier to the two
      // analytics tools, which would mask what this test is about.
      const { bridge } = await build(supabase, queries, 'growth');
      return bridge.tools.map((t) => t.name).sort();
    } finally {
      delete ENV.OUTSTAND_MCP_URL;
    }
  }

  it('keeps every locally-implemented tool when the remote advertises none of them', async () => {
    expect(await toolsWithRemote([])).toEqual([
      'social_create_post',
      'social_get_post_analytics',
      'social_schedule_post',
    ]);
  });

  it('adds the upstream-backed tool only when the remote advertises it', async () => {
    expect(await toolsWithRemote(['get_account_metrics'])).toEqual([
      'social_create_post',
      'social_get_account_metrics',
      'social_get_post_analytics',
      'social_schedule_post',
    ]);
  });

  it('never offers a tool the remote invents', async () => {
    const names = await toolsWithRemote(['get_account_metrics', 'delete_everything']);
    expect(names).not.toContain('social_delete_everything');
    expect(names).not.toContain('delete_everything');
  });
});
