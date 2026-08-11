# Donny Social Tools Repair — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Donny's social tools honest and functional — four working tools instead of seven broken ones, with the account resolved server-side and publishing gated behind an owner tap.

**Architecture:** `_shared/outstand-mcp.ts` stops being a broken RPC bridge. Two of the four surviving tools (`create_post`, `schedule_post`) make **no upstream call at all** — they return a draft card that the client publishes through the existing `useCrossPost` path on the owner's tap. `get_post_analytics` reads our own `content_performance` table. Only `get_account_metrics` still crosses `outstand-proxy`, over the caller's own JWT to a real path. Account ids never enter or leave the model.

**Tech Stack:** Deno edge functions (Supabase), TypeScript strict, Vitest for pure-logic tests, React 18 + React Query on the client.

---

## Spec deltas — READ BEFORE STARTING

The spec (`docs/superpowers/specs/2026-08-09-donny-social-tools-repair-design.md`) deferred two checks to planning. **Both came back against the spec's stated assumption.** This plan implements the corrected facts. Where this plan and the spec disagree, **this plan governs** and the reason is recorded here.

**Delta 1 — §8's role-gating claim is false.** The spec says the bridge is only built for users with `business_outstand_accounts` rows, "which a creator would not [have]". Creators *can*: `/dashboard/creator/social` is routed with a bare `<ProtectedRoute>` and no role wrapper (`src/App.tsx:275-276`), `CreatorSettingsSections.tsx:261` renders the connect UI, and none of the three insert sites checks a role (`outstand-proxy/index.ts:634`, `:709`; `social-proxy/index.ts:207`). Prod holds zero creator rows *today*, so the claim is empirically true and structurally wrong.

*Consequence for this plan:* **no role gate is added** (a creator posting to their own connected account is legitimate, and gating is a spec non-goal). But **never join account lookups through `business_id`** — it is `NULL` for creator rows (`outstand-proxy/index.ts:150-159`) and a join would silently drop them. All lookups key on `user_id`.

**Delta 2 — §8's per-tool route check partially fails, and the fix removes more surface than the spec expected.**

| tool | route check | resolution |
|---|---|---|
| `create_post` | n/a | **No upstream call.** Returns a draft; the client publishes via `useCrossPost`. |
| `schedule_post` | n/a | **No upstream call.** Same. |
| `get_account_metrics` | ✅ `GET /social-accounts/{id}` exists, ownership-enforced (`outstand-proxy/index.ts:425-431`) | Keep, via proxy. |
| `get_post_analytics` | ❌ **No matching route.** The only analytics route is `/posts/{id}/analytics` (per-post, `index.ts:463`); the tool has no post id. | Read our own `content_performance` table. |

The spec's §8 fallback for a missing route is "drop the tool." Reading `content_performance` is the better answer and stays inside the spec's actual constraint (*"this design does not add gateway surface"*): it adds none, it is the same source the Analytics page already uses (`src/hooks/outstand/usePostPerformance.ts:64-72`), and it makes §7's sample-size gate directly computable. The alternative — list posts, then fan out N `/posts/{id}/analytics` calls through one 10s timeout on an org-wide key whose response the proxy does **not** filter — is worse on every axis.

**Delta 3 — a hazard neither the spec nor the audit caught.** `donny-orchestrator` has **dual auth**: Supabase session first, Donny OAuth token as fallback (`index.ts:291-300`). §8.1 says "forward the caller's JWT," but on the OAuth branch `authHeader` is *not* a Supabase JWT, so forwarding it reproduces the exact 401 this work exists to fix. **The bridge is therefore built only on the session branch** (Task 4). On the OAuth branch no social tools are offered — which is the honest outcome under Goal §3.3, and strictly better than offering a tool that 401s.

**Verified prod facts this plan relies on** (queried 2026-08-09):
- `social_*` has **7 calls, 0 successes** in `donny_tool_executions`, ever. "It works" means a `status='success'` row that has never existed.
- 9 `business_outstand_accounts` rows; **2 `active`** (`LEnjV` instagram `areyouaman`, `I2pgX` youtube `@josephcastelo149`). All 9 belong to `business_client` users on `enterprise` tier.
- User `d6a28dd6` holds **both** an `active` and an `error` row for the same handle — so today's `.neq("status","revoked")` filter can hand back the dead one. This is the §5.1 defect, confirmed live.
- `content_performance` = 10 rows; `social_post_log` = 4 rows, **1** with `verified_at`. The sample-size gate will fire on real data from day one.
- Tier filter is **not** currently blocking anyone: every account holder is `enterprise`, so `create_post` is offered. Do not "fix" the tier filter beyond the list update in Task 3.

## Global Constraints

- **`MIN_POSTS_FOR_SIGNAL = 3`** — exact value, no third copy. Canonical home is `supabase/functions/_shared/social-signal.ts` after Task 1.
- **Account ids never appear in any tool schema, any model-visible string, or any user-facing copy.** Handles and platforms only (`@areyouaman · Instagram`).
- **The LLM cannot publish.** `create_post` and `schedule_post` make no upstream write. Publishing happens only from a client tap.
- **Account lookups key on `user_id`, never `business_id`** (NULL for creators — Delta 1).
- **"Active" means `status = 'active'`**, never `!= 'revoked'`.
- **No migration.** Nothing new is stored.
- Deno edge modules import siblings **with** the `.ts` extension; Vitest test files import **without** it. Match the existing files.
- `_shared/*.ts` must stay free of Deno-only and Node-only APIs where a test imports it, so Vitest can load it (`vite.config.ts` runs `supabase/functions/**/*.test.ts` with two named exclusions — do not add a third).
- Every touched edge function stays inside the CI edge-function typecheck gate.
- No `any`. No `console.log` (`console.error`/`console.warn` only — ESLint `no-console`).

---

### Task 1: One canonical sample-size constant

**Files:**
- Create: `supabase/functions/_shared/social-signal.ts`
- Create: `supabase/functions/_shared/social-signal.test.ts`
- Modify: `supabase/functions/content-strategy-recommend/brief.ts:4`
- Modify: `src/lib/postPerformance.ts:20` (comment only)

**Interfaces:**
- Consumes: nothing.
- Produces: `MIN_POSTS_FOR_SIGNAL: 3`, `interface SignalVerdict { hasSignal: boolean; n: number; caveat: string | null }`, `assessSignal(n: number): SignalVerdict`.

The constant exists twice today. Edge functions cannot import from `src/`, so the two edge-side copies converge here and the frontend copy stays put with a pointer. **Do not touch `src/lib/postPerformance.ts` beyond the comment** — it has its own consumers and its own tests.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/social-signal.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { MIN_POSTS_FOR_SIGNAL, assessSignal } from './social-signal';

describe('MIN_POSTS_FOR_SIGNAL', () => {
  it('is 3 — the value the rest of the product already uses', () => {
    expect(MIN_POSTS_FOR_SIGNAL).toBe(3);
  });
});

describe('assessSignal', () => {
  it('has no signal below the threshold', () => {
    for (const n of [0, 1, 2]) {
      const v = assessSignal(n);
      expect(v.hasSignal).toBe(false);
      expect(v.n).toBe(n);
    }
  });

  it('has signal at and above the threshold', () => {
    for (const n of [3, 4, 50]) {
      const v = assessSignal(n);
      expect(v.hasSignal).toBe(true);
      expect(v.n).toBe(n);
      expect(v.caveat).toBeNull();
    }
  });

  it('states the actual count in the caveat, so Donny cannot round it away', () => {
    expect(assessSignal(0).caveat).toBe(
      'Based on 0 measured posts — too few to name a trend, a best anything, or a rate. Report only the raw figures that exist.',
    );
    expect(assessSignal(1).caveat).toContain('1 measured post');
    expect(assessSignal(2).caveat).toContain('2 measured posts');
  });

  it('treats a negative or non-finite count as no signal rather than throwing', () => {
    expect(assessSignal(-1).hasSignal).toBe(false);
    expect(assessSignal(Number.NaN).hasSignal).toBe(false);
    expect(assessSignal(Number.NaN).n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/social-signal.test.ts`
Expected: FAIL — `Failed to resolve import "./social-signal"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/social-signal.ts`:

```ts
// The sample-size bar for any comparative claim about social performance.
//
// Canonical home. It used to exist twice — src/lib/postPerformance.ts and
// content-strategy-recommend/brief.ts — because edge functions cannot import
// from src/. The two EDGE copies converge here. The frontend keeps its own copy
// (src/ cannot reach supabase/functions/_shared/) and carries a pointer comment.
//
// Pure and dependency-free on purpose: Vitest imports it directly.
export const MIN_POSTS_FOR_SIGNAL = 3;

export interface SignalVerdict {
  /** True when there are enough measured posts to make a comparative claim. */
  hasSignal: boolean;
  /** The count actually used, floored at 0. Always stated to the user. */
  n: number;
  /** Model-facing instruction when hasSignal is false; null when it is true. */
  caveat: string | null;
}

export function assessSignal(n: number): SignalVerdict {
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  if (count >= MIN_POSTS_FOR_SIGNAL) {
    return { hasSignal: true, n: count, caveat: null };
  }
  const noun = count === 1 ? 'post' : 'posts';
  return {
    hasSignal: false,
    n: count,
    caveat:
      `Based on ${count} measured ${noun} — too few to name a trend, a best anything, ` +
      `or a rate. Report only the raw figures that exist.`,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/social-signal.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Converge the content-strategy-recommend copy**

In `supabase/functions/content-strategy-recommend/brief.ts`, replace line 4:

```ts
export const MIN_POSTS_FOR_SIGNAL = 3;
```

with a re-export from the canonical module:

```ts
import { MIN_POSTS_FOR_SIGNAL } from '../_shared/social-signal.ts';

// Re-exported so this module's existing importers and tests keep their import
// path. The VALUE now has exactly one definition, in _shared/social-signal.ts.
export { MIN_POSTS_FOR_SIGNAL };
```

- [ ] **Step 6: Verify the existing brief tests still pin the value at 3**

Run: `npx vitest run supabase/functions/content-strategy-recommend/`
Expected: PASS — no assertion changes. If any test fails, the re-export shape is wrong; fix it here rather than editing the test.

- [ ] **Step 7: Add the pointer comment to the frontend copy**

In `src/lib/postPerformance.ts`, immediately above line 20 (`export const MIN_POSTS_FOR_SIGNAL = 3;`), add:

```ts
// Deliberate duplicate of supabase/functions/_shared/social-signal.ts.
// src/ cannot import from supabase/functions/, so this value is mirrored, not
// shared. If you change it, change it there too — the edge side is canonical.
```

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add supabase/functions/_shared/social-signal.ts supabase/functions/_shared/social-signal.test.ts supabase/functions/content-strategy-recommend/brief.ts src/lib/postPerformance.ts
git commit -m "refactor(social): one canonical MIN_POSTS_FOR_SIGNAL for edge functions"
```

---

### Task 2: Server-side account resolution

**Files:**
- Create: `supabase/functions/_shared/outstand-accounts.ts`
- Create: `supabase/functions/_shared/outstand-accounts.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `interface ConnectedAccount { id: string; platform: string; handle: string | null }`
  - `type AccountResolution = { kind: 'one'; account: ConnectedAccount } | { kind: 'many'; accounts: ConnectedAccount[] } | { kind: 'none' }`
  - `resolveAccount(accounts: ConnectedAccount[], platformHint?: string | null): AccountResolution`
  - `describeAccount(a: ConnectedAccount): string` → `"@areyouaman · Instagram"`
  - `fetchActiveAccounts(supabase: SupabaseClient, userId: string): Promise<ConnectedAccount[]>`

`resolveAccount` is pure so it can be tested without a database. `fetchActiveAccounts` is the thin I/O wrapper and is not unit-tested.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/outstand-accounts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveAccount,
  describeAccount,
  type ConnectedAccount,
} from './outstand-accounts';

const IG: ConnectedAccount = { id: 'LEnjV', platform: 'instagram', handle: 'areyouaman' };
const YT: ConnectedAccount = { id: 'I2pgX', platform: 'youtube', handle: '@josephcastelo149' };
const IG2: ConnectedAccount = { id: 'ZZZZZ', platform: 'instagram', handle: 'second_shop' };

describe('resolveAccount', () => {
  it('returns none for an empty list', () => {
    expect(resolveAccount([])).toEqual({ kind: 'none' });
  });

  it('uses the only account without asking', () => {
    expect(resolveAccount([IG])).toEqual({ kind: 'one', account: IG });
  });

  it('asks when there is more than one and no hint', () => {
    expect(resolveAccount([IG, YT])).toEqual({ kind: 'many', accounts: [IG, YT] });
  });

  it('narrows by an explicitly requested platform instead of asking', () => {
    expect(resolveAccount([IG, YT], 'instagram')).toEqual({ kind: 'one', account: IG });
  });

  it('matches the platform hint case-insensitively', () => {
    expect(resolveAccount([IG, YT], 'Instagram')).toEqual({ kind: 'one', account: IG });
  });

  it('still asks when the hint leaves more than one candidate', () => {
    expect(resolveAccount([IG, IG2, YT], 'instagram')).toEqual({
      kind: 'many',
      accounts: [IG, IG2],
    });
  });

  it('falls back to the full list when the hint matches nothing, rather than reporting none', () => {
    // "none" would make Donny say no account is connected, which is a lie the
    // product has already told a user three times. An unmatched hint is a
    // disambiguation problem, not an absence.
    expect(resolveAccount([IG, YT], 'threads')).toEqual({ kind: 'many', accounts: [IG, YT] });
  });

  it('uses the only account even when the hint matches nothing', () => {
    expect(resolveAccount([IG], 'tiktok')).toEqual({ kind: 'one', account: IG });
  });
});

describe('describeAccount', () => {
  it('names an account by handle and platform, never by id', () => {
    const label = describeAccount(IG);
    expect(label).toBe('@areyouaman · Instagram');
    expect(label).not.toContain('LEnjV');
  });

  it('does not double the @ when the handle already carries one', () => {
    expect(describeAccount(YT)).toBe('@josephcastelo149 · YouTube');
  });

  it('falls back to the platform alone when there is no handle', () => {
    expect(describeAccount({ id: 'x', platform: 'facebook', handle: null })).toBe('Facebook');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/outstand-accounts.test.ts`
Expected: FAIL — `Failed to resolve import "./outstand-accounts"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/outstand-accounts.ts`:

```ts
// Which social account is "the caller's account", decided SERVER-SIDE.
//
// The model never sends an account id and never sees one. This exists because
// it used to: every social_* tool declared a required `account_id` with no way
// to learn a real value, so the model invented one ("harmbormill" — the org
// name) and the bridge's `args.account_id ?? default` could not catch it, since
// ?? only fires on null/undefined.
//
// Keyed on user_id, NEVER business_id: creators can hold rows here and their
// business_id is NULL, so a join through it silently drops them.
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.57.2';

export interface ConnectedAccount {
  id: string;
  platform: string;
  handle: string | null;
}

export type AccountResolution =
  | { kind: 'one'; account: ConnectedAccount }
  | { kind: 'many'; accounts: ConnectedAccount[] }
  | { kind: 'none' };

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  threads: 'Threads',
  x: 'X',
  twitter: 'X',
};

/** "@areyouaman · Instagram". Never an id — this string reaches the user. */
export function describeAccount(a: ConnectedAccount): string {
  const platform = PLATFORM_LABELS[a.platform?.toLowerCase()] ?? a.platform;
  if (!a.handle) return platform;
  const handle = a.handle.startsWith('@') ? a.handle : `@${a.handle}`;
  return `${handle} · ${platform}`;
}

/**
 * One account → use it. Several → ask, by handle. None → say so honestly.
 *
 * A platform hint (the user said "post to Instagram") narrows first, because
 * asking "which account?" when the user already named the platform is exactly
 * the typing this product exists to delete. An unmatched hint falls back to the
 * full list rather than to `none`: "no account connected" is a claim, and it
 * would be false.
 */
export function resolveAccount(
  accounts: ConnectedAccount[],
  platformHint?: string | null,
): AccountResolution {
  if (accounts.length === 0) return { kind: 'none' };
  if (accounts.length === 1) return { kind: 'one', account: accounts[0] };

  const hint = platformHint?.trim().toLowerCase();
  if (hint) {
    const matched = accounts.filter((a) => a.platform?.toLowerCase() === hint);
    if (matched.length === 1) return { kind: 'one', account: matched[0] };
    if (matched.length > 1) return { kind: 'many', accounts: matched };
  }
  return { kind: 'many', accounts };
}

/**
 * The caller's LIVE accounts.
 *
 * `status = 'active'`, not `!= 'revoked'` — prod holds `error` rows alongside
 * `active` ones for the same handle (user d6a28dd6 has both for @areyouaman),
 * and the old filter could hand back the dead one as the default.
 */
export async function fetchActiveAccounts(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConnectedAccount[]> {
  const { data, error } = await supabase
    .from('business_outstand_accounts')
    .select('outstand_social_account_id, platform, platform_handle')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('connected_at', { ascending: true });

  if (error) {
    console.error('[outstand-accounts] account lookup failed:', error.message);
    return [];
  }
  const rows = (data ?? []) as Array<{
    outstand_social_account_id: string;
    platform: string;
    platform_handle: string | null;
  }>;
  return rows.map((r) => ({
    id: r.outstand_social_account_id,
    platform: r.platform,
    handle: r.platform_handle,
  }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/outstand-accounts.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/outstand-accounts.ts supabase/functions/_shared/outstand-accounts.test.ts
git commit -m "feat(social): resolve the caller's account server-side, active-only"
```

---

### Task 3: Cut the tool surface from 7 to 4 and delete `account_id`

**Files:**
- Modify: `supabase/functions/_shared/outstand-mcp.ts:11-37`
- Create: `supabase/functions/_shared/outstand-mcp-tools.ts`
- Create: `supabase/functions/_shared/outstand-mcp-tools.test.ts`

**Interfaces:**
- Consumes: `McpToolDefinition` from `./mcp-client.ts`.
- Produces: `SOCIAL_TOOLS: McpToolDefinition[]`, `ANALYTICS_ONLY_TOOLS: ReadonlySet<string>`, `filterToolsByTier(tools: McpToolDefinition[], tier?: string): McpToolDefinition[]`, `namespaceTools(tools: McpToolDefinition[]): McpToolDefinition[]`.

The tool list moves into its own module so it is importable by a Vitest test. `outstand-mcp.ts` calls `serve()`-adjacent Deno APIs and network code; the definitions must not be trapped behind that.

Three tools go because they have no backing operation — `get_optimal_times`, `get_audience_insights`, `list_scheduled`. `get_audience_insights` is currently in the free-tier allow-list, so that list must be updated in the same change or free-tier orgs lose a tool and gain nothing.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/outstand-mcp-tools.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  SOCIAL_TOOLS,
  ANALYTICS_ONLY_TOOLS,
  filterToolsByTier,
  namespaceTools,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/outstand-mcp-tools.test.ts`
Expected: FAIL — `Failed to resolve import "./outstand-mcp-tools"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/outstand-mcp-tools.ts`:

```ts
// The social tools Donny is allowed to be offered, and the tier filter over them.
//
// Extracted from outstand-mcp.ts so it can be unit-tested: that module opens
// network connections at call time, and the ONE property most worth pinning
// here is negative — that a tool with no implementation is never offered under
// any tier branch. A tool the model cannot call cannot be promised to a user.
//
// Was seven tools. get_optimal_times / get_audience_insights / list_scheduled
// have no backing gateway operation and never did; they were offered anyway.
// account_id is gone from every schema — the account is resolved server-side
// from the authenticated user (see outstand-accounts.ts).
import type { McpToolDefinition } from './mcp-client.ts';

export const SOCIAL_TOOLS: McpToolDefinition[] = [
  {
    name: 'create_post',
    description:
      'Draft a social media post for the owner to review. Does NOT publish — it returns ' +
      'a draft the owner confirms with one tap. The connected account is resolved ' +
      'automatically; never ask the user for one.',
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The post caption, exactly as it should appear.' },
        platform: {
          type: 'string',
          description:
            'Optional. Only when the user named a platform, e.g. "instagram". Omit otherwise.',
        },
        media_urls: { type: 'array', items: { type: 'string' } },
      },
      required: ['caption'],
    },
  },
  {
    name: 'schedule_post',
    description:
      'Draft a social media post scheduled for a future time. Does NOT publish or schedule — ' +
      'it returns a draft the owner confirms with one tap. The connected account is resolved ' +
      'automatically; never ask the user for one.',
    inputSchema: {
      type: 'object',
      properties: {
        caption: { type: 'string', description: 'The post caption, exactly as it should appear.' },
        scheduled_at: { type: 'string', description: 'ISO 8601 timestamp, in the future.' },
        platform: {
          type: 'string',
          description:
            'Optional. Only when the user named a platform, e.g. "instagram". Omit otherwise.',
        },
        media_urls: { type: 'array', items: { type: 'string' } },
      },
      required: ['caption', 'scheduled_at'],
    },
  },
  {
    name: 'get_post_analytics',
    description:
      'Performance of the owner\'s recently measured posts. Always states how many posts ' +
      'the answer is based on.',
    inputSchema: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Look-back window in days. Defaults to 30.' },
      },
      required: [],
    },
  },
  {
    name: 'get_account_metrics',
    description: 'Account-level metrics (followers, engagement rate) for a connected account.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description:
            'Optional. Only when the user named a platform, e.g. "instagram". Omit otherwise.',
        },
      },
      required: [],
    },
  },
];

// Free-tier orgs get read-only tools. get_audience_insights used to be in this
// list; it was dropped for having no implementation, so the list shrank with it
// rather than being left naming a tool that no longer exists.
export const ANALYTICS_ONLY_TOOLS: ReadonlySet<string> = new Set([
  'get_post_analytics',
  'get_account_metrics',
]);

export function filterToolsByTier(
  tools: McpToolDefinition[],
  tier?: string,
): McpToolDefinition[] {
  if (!tier || tier === 'free') {
    return tools.filter((t) => ANALYTICS_ONLY_TOOLS.has(t.name));
  }
  return tools;
}

/** Claude sees `social_create_post`; the bridge strips the prefix to dispatch. */
export function namespaceTools(tools: McpToolDefinition[]): McpToolDefinition[] {
  return tools.map((t) => ({ ...t, name: `social_${t.name}` }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/outstand-mcp-tools.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Point `outstand-mcp.ts` at the new module**

In `supabase/functions/_shared/outstand-mcp.ts`, delete the `REST_FALLBACK_TOOLS` array (lines 11-19), the `ANALYTICS_ONLY_TOOLS` set (line 21) and the `filterToolsByTier` function (lines 32-37), and add to the imports at the top:

```ts
import {
  SOCIAL_TOOLS,
  filterToolsByTier,
  namespaceTools,
} from './outstand-mcp-tools.ts';
```

Then replace the tool-selection block (currently lines 54-74) with:

```ts
  let client: McpClient | null = null;
  let rawTools: McpToolDefinition[];

  if (mcpUrl) {
    try {
      client = await createMcpClient(mcpUrl, apiKey);
      rawTools = await client.listTools();
    } catch {
      console.warn('[outstand-mcp] MCP server unavailable, using REST fallback');
      rawTools = SOCIAL_TOOLS;
    }
  } else {
    rawTools = SOCIAL_TOOLS;
  }

  const namespacedTools = namespaceTools(filterToolsByTier(rawTools, config.orgTier));
```

Note the `console.log` on the old line 61 becomes `console.warn` — `no-console` allows only `error`/`warn`.

- [ ] **Step 6: Verify nothing else referenced the removed symbols**

Run: `grep -rn "REST_FALLBACK_TOOLS\|ANALYTICS_ONLY_TOOLS" supabase/ src/`
Expected: matches only in `_shared/outstand-mcp-tools.ts` and its test. If `outstand-mcp.ts` still appears, the deletion in Step 5 was incomplete.

- [ ] **Step 7: Typecheck and commit**

```bash
npm run typecheck
git add supabase/functions/_shared/outstand-mcp-tools.ts supabase/functions/_shared/outstand-mcp-tools.test.ts supabase/functions/_shared/outstand-mcp.ts
git commit -m "feat(social): cut the tool surface 7 to 4 and delete account_id from every schema"
```

---

### Task 4: Fix the transport — session JWT, a real path, no dead header

**Files:**
- Modify: `supabase/functions/_shared/outstand-mcp.ts` (config interface, `callTool` transport)
- Create: `supabase/functions/_shared/outstand-mcp-paths.ts`
- Create: `supabase/functions/_shared/outstand-mcp-paths.test.ts`
- Modify: `supabase/functions/donny-orchestrator/index.ts:270-300, 392-402, 504-505`

**Interfaces:**
- Consumes: `SOCIAL_TOOLS` (Task 3), `describeAccount` / `ConnectedAccount` (Task 2).
- Produces: `interface ProxyRequest { method: string; path: string }`, `proxyRequestFor(tool: string, accountId: string): ProxyRequest | null`. `OutstandMcpConfig` gains `authHeader: string`.

Three breakages sit in one request today: a service-role key where a user JWT is required (the observed 401), an `{action}` body where the proxy routes by URL path (a latent `403 path_not_allowed`), and a header nothing reads.

**Only `get_account_metrics` crosses the proxy.** `create_post`/`schedule_post` make no upstream call after Task 5, and `get_post_analytics` reads our own table after Task 6. So the path table has one row — and a test that pins it, so breakage (2) cannot silently return.

**Delta 3 applies here:** the bridge must be built only when the caller authenticated via the Supabase session. On the OAuth-token branch there is no forwardable JWT.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/outstand-mcp-paths.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { proxyRequestFor } from './outstand-mcp-paths';
import { SOCIAL_TOOLS } from './outstand-mcp-tools';

const ACCOUNT = 'LEnjV';

describe('proxyRequestFor', () => {
  it('maps get_account_metrics to the single-account read the proxy allows', () => {
    expect(proxyRequestFor('get_account_metrics', ACCOUNT)).toEqual({
      method: 'GET',
      path: `/social-accounts/${ACCOUNT}`,
    });
  });

  it('returns null for tools that make no upstream call', () => {
    expect(proxyRequestFor('create_post', ACCOUNT)).toBeNull();
    expect(proxyRequestFor('schedule_post', ACCOUNT)).toBeNull();
    expect(proxyRequestFor('get_post_analytics', ACCOUNT)).toBeNull();
  });

  it('returns null for an unknown tool rather than guessing a path', () => {
    expect(proxyRequestFor('get_optimal_times', ACCOUNT)).toBeNull();
    expect(proxyRequestFor('', ACCOUNT)).toBeNull();
  });

  it('percent-encodes the account id so it cannot escape its path segment', () => {
    const req = proxyRequestFor('get_account_metrics', 'a/../../posts');
    expect(req?.path).toBe('/social-accounts/a%2F..%2F..%2Fposts');
  });

  it('produces a path that outstand-proxy actually routes', () => {
    // enforceScope matches /^\/social-accounts\/[^/]+$/ — one segment, no query.
    const req = proxyRequestFor('get_account_metrics', ACCOUNT);
    expect(req?.path).toMatch(/^\/social-accounts\/[^/?]+$/);
  });

  it('covers every offered tool — each is either mapped or explicitly unmapped', () => {
    // A new tool added without a decision here would silently fall through to
    // "no upstream call" and return an empty result forever.
    const decided = new Set(['create_post', 'schedule_post', 'get_post_analytics', 'get_account_metrics']);
    for (const t of SOCIAL_TOOLS) {
      expect(decided.has(t.name)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/outstand-mcp-paths.test.ts`
Expected: FAIL — `Failed to resolve import "./outstand-mcp-paths"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/outstand-mcp-paths.ts`:

```ts
// Tool -> the request outstand-proxy actually routes.
//
// The bridge used to POST {action: "get_account_metrics", ...} to the bare
// function URL. outstand-proxy routes by URL PATH (extractOutstandPath), so
// that resolved to "/" and hit the default deny: 403 path_not_allowed. It was
// invisible only because the request died at 401 first.
//
// Exactly one tool crosses the proxy. create_post/schedule_post return a draft
// and publish from the client; get_post_analytics reads content_performance.
// Returning null means "no upstream call", which is a decision, not a gap.

export interface ProxyRequest {
  method: string;
  path: string;
}

export function proxyRequestFor(tool: string, accountId: string): ProxyRequest | null {
  switch (tool) {
    case 'get_account_metrics':
      // enforceScope: /^\/social-accounts\/[^/]+$/ then `ownedIds.has(id)`.
      // Encode so an id can never introduce a second segment and address a
      // different branch of the proxy's router.
      return { method: 'GET', path: `/social-accounts/${encodeURIComponent(accountId)}` };
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/outstand-mcp-paths.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Rewrite the transport in `outstand-mcp.ts`**

Change the config interface (currently lines 4-9) to require the caller's own credential:

```ts
interface OutstandMcpConfig {
  userId: string;
  userRole: string;
  orgTier?: string;
  supabase: SupabaseClient;
  /**
   * The caller's OWN Supabase session Authorization header, forwarded verbatim.
   *
   * outstand-proxy authenticates with auth.getUser() on an anon client, so it
   * needs a user JWT. This used to send SUPABASE_SERVICE_ROLE_KEY, which
   * resolves to no user — every social_* call in this function's history died
   * at 401 before any account logic ran.
   *
   * donny-orchestrator only supplies this on its Supabase-session branch. On
   * the OAuth-token branch there is no forwardable JWT, so no bridge is built
   * and no social tool is offered.
   */
  authHeader: string;
}
```

Replace the `fetch` block in `callTool` (currently lines 92-113) with a path-addressed request carrying the caller's own credential:

```ts
      const req = proxyRequestFor(rawName, accountId);
      if (!req) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ error: 'unsupported_tool' }) }],
          isError: true,
        };
      }

      // Path-addressed, on the CALLER's credential. The old request sent
      // {action} in the body over the service-role key and also carried an
      // x-outstand-user-id header that nothing in supabase/functions/ ever read.
      const res = await fetch(`${proxyUrl}${req.path}`, {
        method: req.method,
        headers: {
          Authorization: config.authHeader,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        return { content: [{ type: 'text', text: JSON.stringify(safeReason(res.status)) }], isError: true };
      }

      const data = await res.json();
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
```

Add `proxyRequestFor` to the imports and add this helper above `createOutstandMcpBridge`:

```ts
// A caller-safe reason derived from what actually happened. Donny has told a
// user their accounts "may not be connected" while an active row sat in the
// table — three times. He relays this instead of inventing a cause. No raw
// provider text, no ids.
function safeReason(status: number): { error: string; reason: string } {
  if (status === 401 || status === 403) {
    return {
      error: 'not_authorized',
      reason: 'That account could not be read with this session. Say so plainly; do not guess why.',
    };
  }
  if (status === 404) {
    return {
      error: 'not_found',
      reason: 'The connected account was not found upstream. Say so plainly; do not guess why.',
    };
  }
  return {
    error: 'upstream_error',
    reason: `The social service returned an error (${status}). Say so plainly; do not guess why.`,
  };
}
```

Note `accountId` is introduced by Task 5's resolution block; until then, use `defaultAccountId`. The two tasks touch the same function — Task 5 replaces `defaultAccountId` wholesale.

- [ ] **Step 6: Thread the auth header through `donny-orchestrator`**

In `supabase/functions/donny-orchestrator/index.ts`, add a session flag next to the dual-auth branch (currently lines 291-300):

```ts
    let isSessionAuth = false;
    if (user && !authError) {
      userId = user.id;
      isSessionAuth = true;
    } else {
      const oauthResult = await validateDonnyToken(req);
      if (!oauthResult) throw new Error("Unauthorized");
      if (!requireScope(oauthResult.scopes, "donny:chat")) {
        throw new Error("Insufficient scope: donny:chat required");
      }
      userId = oauthResult.user_id;
    }
```

Then gate and extend the bridge construction (currently lines 392-402):

```ts
    // --- MCP bridge ---
    // Session branch only. outstand-proxy authenticates the forwarded header
    // with auth.getUser(); a Donny OAuth token is not a Supabase JWT, so
    // forwarding it would reproduce the 401 this fix exists to remove. No
    // bridge means no social tools offered — honest, and better than offering
    // a tool that cannot work over this connection.
    if (isSessionAuth) {
      try {
        mcpBridge = await createOutstandMcpBridge({
          userId,
          userRole: userContext.user_role,
          orgTier: userContext.org_tier,
          supabase,
          authHeader,
        });
      } catch (mcpErr) {
        console.warn("[donny-orchestrator] MCP bridge init failed:", mcpErr);
      }
    }
```

- [ ] **Step 7: Log the zero-accounts branch**

The no-accounts path returns a canned string and writes nothing, so it has never been counted. Replace the `else if (isSocialTool(toolName))` branch (currently lines 504-505):

```ts
        } else if (isSocialTool(toolName)) {
          const noAccounts = {
            error: "no_social_account",
            reason:
              "No social account is connected to this account yet. Point the user at " +
              "Social Media settings to connect one.",
          };
          agentResult = JSON.stringify(noAccounts);

          // This branch wrote nothing for its entire life, so "how often does
          // Donny get asked to post by someone with no connected account" has
          // never been answerable. It is the same insert as the success path.
          try {
            const { error: logErr } = await supabase.from("donny_tool_executions").insert({
              user_id: userId,
              message_id: null,
              tool_name: toolName,
              input: toolInput,
              output: noAccounts,
              status: "error",
            });
            if (logErr) console.error("[donny-orchestrator] no-account log failed:", logErr);
          } catch (err) {
            console.error("[donny-orchestrator] no-account log threw:", err);
          }
        } else {
```

- [ ] **Step 8: Verify the dead header is gone**

Run: `grep -rn "x-outstand-user-id" supabase/ src/`
Expected: **no matches.** It appeared in exactly one file — the sender — and nothing read it.

- [ ] **Step 9: Typecheck, test, commit**

```bash
npm run typecheck
npx vitest run supabase/functions/_shared/
git add supabase/functions/_shared/outstand-mcp-paths.ts supabase/functions/_shared/outstand-mcp-paths.test.ts supabase/functions/_shared/outstand-mcp.ts supabase/functions/donny-orchestrator/index.ts
git commit -m "fix(social): forward the caller's JWT to real proxy paths, log the no-account branch"
```

---

### Task 5: `create_post` and `schedule_post` return a draft, never a publish

**Files:**
- Modify: `supabase/functions/_shared/outstand-mcp.ts` (`callTool` dispatch)
- Create: `supabase/functions/_shared/social-draft.ts`
- Create: `supabase/functions/_shared/social-draft.test.ts`

**Interfaces:**
- Consumes: `ConnectedAccount`, `AccountResolution`, `describeAccount`, `resolveAccount` (Task 2).
- Produces:
  - `interface SocialDraftCard { type: 'social_post_draft'; data: { account_label: string; account_id: string; platform: string; caption: string; media_urls: string[]; scheduled_at: string | null } }`
  - `buildDraftCard(input: { account: ConnectedAccount; caption: string; mediaUrls: string[]; scheduledAt: string | null }): SocialDraftCard`
  - `draftToolResult(card: SocialDraftCard): { text: string; card: SocialDraftCard }`
  - `disambiguationResult(accounts: ConnectedAccount[]): string`
  - `noAccountResult(): string`

`account_id` rides in the card **data** because the client needs it to call `useCrossPost`. It is never in `account_label` and never in the text the model reads — the model reads only `text`.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/social-draft.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  buildDraftCard,
  draftToolResult,
  disambiguationResult,
  noAccountResult,
} from './social-draft';
import type { ConnectedAccount } from './outstand-accounts';

const IG: ConnectedAccount = { id: 'LEnjV', platform: 'instagram', handle: 'areyouaman' };
const YT: ConnectedAccount = { id: 'I2pgX', platform: 'youtube', handle: '@josephcastelo149' };

describe('buildDraftCard', () => {
  it('names the account by handle and platform', () => {
    const card = buildDraftCard({ account: IG, caption: 'Taco Tuesday', mediaUrls: [], scheduledAt: null });
    expect(card.type).toBe('social_post_draft');
    expect(card.data.account_label).toBe('@areyouaman · Instagram');
  });

  it('carries the account id in data for the client, never in the label', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(card.data.account_id).toBe('LEnjV');
    expect(card.data.account_label).not.toContain('LEnjV');
  });

  it('preserves the caption verbatim — what is shown is what posts', () => {
    const caption = 'Line one\nLine two  #tacos';
    const card = buildDraftCard({ account: IG, caption, mediaUrls: [], scheduledAt: null });
    expect(card.data.caption).toBe(caption);
  });

  it('carries media urls through unchanged', () => {
    const urls = ['https://example.com/a.jpg', 'https://example.com/b.jpg'];
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: urls, scheduledAt: null });
    expect(card.data.media_urls).toEqual(urls);
  });

  it('is unscheduled by default', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(card.data.scheduled_at).toBeNull();
  });

  it('carries a scheduled time when given one', () => {
    const when = '2026-08-20T15:00:00.000Z';
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: when });
    expect(card.data.scheduled_at).toBe(when);
  });
});

describe('draftToolResult', () => {
  it('tells the model a draft is READY, not that it posted', () => {
    const card = buildDraftCard({ account: IG, caption: 'Taco Tuesday', mediaUrls: [], scheduledAt: null });
    const { text } = draftToolResult(card);
    expect(text).toContain('draft');
    expect(text).not.toMatch(/\bposted\b/i);
    expect(text).not.toMatch(/\bpublished\b/i);
  });

  it('never leaks the account id into the model-facing text', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(draftToolResult(card).text).not.toContain('LEnjV');
  });

  it('returns the card unchanged alongside the text', () => {
    const card = buildDraftCard({ account: IG, caption: 'x', mediaUrls: [], scheduledAt: null });
    expect(draftToolResult(card).card).toBe(card);
  });
});

describe('disambiguationResult', () => {
  it('lists handles and platforms, never ids', () => {
    const text = disambiguationResult([IG, YT]);
    expect(text).toContain('@areyouaman · Instagram');
    expect(text).toContain('@josephcastelo149 · YouTube');
    expect(text).not.toContain('LEnjV');
    expect(text).not.toContain('I2pgX');
  });

  it('asks the user to choose', () => {
    expect(disambiguationResult([IG, YT]).toLowerCase()).toContain('which');
  });
});

describe('noAccountResult', () => {
  it('states the fact without guessing a cause', () => {
    const text = noAccountResult();
    expect(text.toLowerCase()).toContain('no social account');
    expect(text.toLowerCase()).not.toContain('may not');
    expect(text.toLowerCase()).not.toContain('account id');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/social-draft.test.ts`
Expected: FAIL — `Failed to resolve import "./social-draft"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/social-draft.ts`:

```ts
// A proposed post, for the owner to confirm. NOT a publish.
//
// Publishing is irreversible and public: a misread request lands on a real
// business's feed before the owner sees it, and deleting a post does not
// un-see it. So create_post/schedule_post return one of these and the actual
// publish happens on the owner's tap, through the client's normal posting path.
// The LLM cannot publish — enforced by where the code lives, not by a prompt
// instruction a model may ignore.
import { describeAccount, type ConnectedAccount } from './outstand-accounts.ts';

export interface SocialDraftCard {
  type: 'social_post_draft';
  data: {
    /** "@areyouaman · Instagram" — what the user reads. */
    account_label: string;
    /** For the client's publish call only. Never rendered, never model-visible. */
    account_id: string;
    platform: string;
    caption: string;
    media_urls: string[];
    scheduled_at: string | null;
  };
}

export function buildDraftCard(input: {
  account: ConnectedAccount;
  caption: string;
  mediaUrls: string[];
  scheduledAt: string | null;
}): SocialDraftCard {
  return {
    type: 'social_post_draft',
    data: {
      account_label: describeAccount(input.account),
      account_id: input.account.id,
      platform: input.account.platform,
      caption: input.caption,
      media_urls: input.mediaUrls,
      scheduled_at: input.scheduledAt,
    },
  };
}

/**
 * What the MODEL is told. Deliberately never says "posted" or "published" —
 * the tool did neither, and a model that reads either word will tell the user
 * their post is live when it is sitting in a card waiting for a tap.
 */
export function draftToolResult(card: SocialDraftCard): { text: string; card: SocialDraftCard } {
  const when = card.data.scheduled_at
    ? ` scheduled for ${card.data.scheduled_at}`
    : '';
  return {
    text: JSON.stringify({
      status: 'draft_ready',
      account: card.data.account_label,
      scheduled_at: card.data.scheduled_at,
      instruction:
        `A draft${when} is now shown to the user as a card with a confirm button. ` +
        `Tell them it is ready to review and that it posts when they tap it. ` +
        `Do NOT say it has been posted, published, or scheduled.`,
    }),
    card,
  };
}

export function disambiguationResult(accounts: ConnectedAccount[]): string {
  return JSON.stringify({
    status: 'which_account',
    accounts: accounts.map(describeAccount),
    instruction:
      'Ask the user which of these accounts to use. Refer to them exactly as listed.',
  });
}

export function noAccountResult(): string {
  return JSON.stringify({
    status: 'no_social_account',
    instruction:
      'State that no social account is connected yet, and point the user at ' +
      'Social Media settings to connect one. Do not speculate about why.',
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/social-draft.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Wire the dispatch in `outstand-mcp.ts`**

Replace the bridge body so accounts are resolved per call and the two publishing tools short-circuit. The `OutstandMcpBridge` interface gains an optional card on the result. In `supabase/functions/_shared/outstand-mcp.ts`:

```ts
import { fetchActiveAccounts, resolveAccount } from './outstand-accounts.ts';
import {
  buildDraftCard,
  draftToolResult,
  disambiguationResult,
  noAccountResult,
  type SocialDraftCard,
} from './social-draft.ts';
```

Extend the exported interface:

```ts
export interface OutstandMcpBridge {
  tools: McpToolDefinition[];
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  /** Cards produced by the last callTool, for the orchestrator to collect. */
  takeCards(): SocialDraftCard[];
  disconnect(): void;
}
```

Replace `const defaultAccountId = accountIds[0];` and the `callTool` head with:

```ts
  let pendingCards: SocialDraftCard[] = [];

  return {
    tools: namespacedTools,

    takeCards() {
      const out = pendingCards;
      pendingCards = [];
      return out;
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const rawName = name.replace(/^social_/, '');

      // Resolved fresh per call, from the authenticated user. The model never
      // sends an id, so there is nothing to validate and nothing to forge.
      const accounts = await fetchActiveAccounts(config.supabase, config.userId);
      const platformHint = typeof args.platform === 'string' ? args.platform : null;
      const resolution = resolveAccount(accounts, platformHint);

      if (resolution.kind === 'none') {
        return { content: [{ type: 'text', text: noAccountResult() }], isError: true };
      }
      if (resolution.kind === 'many') {
        // Not an error: the tool did its job and needs one more fact.
        return { content: [{ type: 'text', text: disambiguationResult(resolution.accounts) }] };
      }
      const account = resolution.account;
      const accountId = account.id;

      if (rawName === 'create_post' || rawName === 'schedule_post') {
        const caption = typeof args.caption === 'string' ? args.caption : '';
        if (!caption.trim()) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ status: 'missing_caption', instruction: 'Ask the user what the post should say.' }) }],
            isError: true,
          };
        }
        const mediaUrls = Array.isArray(args.media_urls)
          ? args.media_urls.filter((u): u is string => typeof u === 'string')
          : [];
        const scheduledAt =
          rawName === 'schedule_post' && typeof args.scheduled_at === 'string'
            ? args.scheduled_at
            : null;

        const card = buildDraftCard({ account, caption, mediaUrls, scheduledAt });
        const result = draftToolResult(card);
        pendingCards.push(result.card);
        return { content: [{ type: 'text', text: result.text }] };
      }

      if (client) {
        return client.callTool(rawName, { ...args, account_id: accountId });
      }
```

The `proxyRequestFor` block from Task 4 follows unchanged, now using this `accountId`.

- [ ] **Step 6: Collect the cards in the orchestrator**

In `supabase/functions/donny-orchestrator/index.ts`, inside the `if (isSocialTool(toolName) && mcpBridge)` branch, immediately after `agentResult = JSON.stringify(mcpResult);`, add:

```ts
          // Draft cards ride the same rich_cards side-channel as creator cards.
          // Appended, not assigned: find_creators owns "last wins" for its own
          // cards, and a draft must not be wiped by a later creator lookup.
          const draftCards = mcpBridge.takeCards();
          if (draftCards.length > 0) collectedCards = [...collectedCards, ...draftCards];
```

Widen the `collectedCards` declaration's type to accept both card shapes. Find its declaration (search `let collectedCards`) and, if it is typed to the creator-card type, change that annotation to the union used by `rich_cards` — the persisted column is `jsonb` and `index.ts:578` already writes it untyped.

- [ ] **Step 7: Verify the model is never handed a publish confirmation**

Run: `npx vitest run supabase/functions/_shared/`
Expected: PASS. The `draftToolResult` tests are what stop a future edit from putting "posted" in the model-facing string.

- [ ] **Step 8: Typecheck and commit**

```bash
npm run typecheck
git add supabase/functions/_shared/social-draft.ts supabase/functions/_shared/social-draft.test.ts supabase/functions/_shared/outstand-mcp.ts supabase/functions/donny-orchestrator/index.ts
git commit -m "feat(social): create_post and schedule_post propose a draft instead of publishing"
```

---

### Task 6: `get_post_analytics` reads our own measurements, sample-size gated

**Files:**
- Modify: `supabase/functions/_shared/outstand-mcp.ts` (`callTool`)
- Create: `supabase/functions/_shared/social-analytics.ts`
- Create: `supabase/functions/_shared/social-analytics.test.ts`

**Interfaces:**
- Consumes: `assessSignal`, `MIN_POSTS_FOR_SIGNAL` (Task 1).
- Produces:
  - `interface PerfRow { outstand_post_id: string | null; platform: string | null; views: number | null; likes: number | null; comments: number | null; shares: number | null; engagement_rate: number | null }`
  - `summarizePerformance(rows: PerfRow[]): string`

Per Delta 2, there is no proxy route matching this tool's signature. `content_performance` is the same source the Analytics page reads, is already populated by the `content-performance-capture` cron, and makes the sample-size gate directly computable. **Distinct posts**, not rows — a post yields several milestone rows (`24h`, `7d`, …) and counting rows would clear the bar of 3 with a single post.

- [ ] **Step 1: Write the failing test**

Create `supabase/functions/_shared/social-analytics.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { summarizePerformance, type PerfRow } from './social-analytics';

function row(over: Partial<PerfRow> = {}): PerfRow {
  return {
    outstand_post_id: 'p1',
    platform: 'instagram',
    views: 100,
    likes: 10,
    comments: 2,
    shares: 1,
    engagement_rate: 0.13,
    ...over,
  };
}

describe('summarizePerformance', () => {
  it('reports zero measured posts honestly', () => {
    const out = JSON.parse(summarizePerformance([]));
    expect(out.post_count).toBe(0);
    expect(out.has_signal).toBe(false);
    expect(out.caveat).toContain('0 measured posts');
  });

  it('counts DISTINCT posts, not milestone rows', () => {
    // One post measured at 24h and 7d is ONE post. Counting rows would clear a
    // bar of 3 with a single post and make every claim it gates a lie.
    const rows = [row({ outstand_post_id: 'p1' }), row({ outstand_post_id: 'p1' }), row({ outstand_post_id: 'p1' })];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(1);
    expect(out.has_signal).toBe(false);
  });

  it('withholds the comparative claim below the threshold', () => {
    const rows = [row({ outstand_post_id: 'p1' }), row({ outstand_post_id: 'p2' })];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(2);
    expect(out.has_signal).toBe(false);
    expect(out.best_platform).toBeUndefined();
  });

  it('makes the claim at the threshold and still states N', () => {
    const rows = [
      row({ outstand_post_id: 'p1', platform: 'instagram', engagement_rate: 0.2 }),
      row({ outstand_post_id: 'p2', platform: 'instagram', engagement_rate: 0.3 }),
      row({ outstand_post_id: 'p3', platform: 'youtube', engagement_rate: 0.01 }),
    ];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.post_count).toBe(3);
    expect(out.has_signal).toBe(true);
    expect(out.caveat).toBeNull();
    expect(out.best_platform).toBe('instagram');
  });

  it('always reports raw totals, signal or not', () => {
    const out = JSON.parse(summarizePerformance([row({ views: 50, likes: 5 })]));
    expect(out.totals.views).toBe(50);
    expect(out.totals.likes).toBe(5);
  });

  it('treats null metrics as absent rather than as zero', () => {
    // An unmeasured post stored as a real zero is how "Honest Analytics"
    // got its name. Absent must not average in as 0.
    const rows = [row({ views: null }), row({ outstand_post_id: 'p2', views: 100 })];
    const out = JSON.parse(summarizePerformance(rows));
    expect(out.totals.views).toBe(100);
  });

  it('ignores rows with no post id rather than counting them as a post', () => {
    const rows = [row({ outstand_post_id: null }), row({ outstand_post_id: 'p2' })];
    expect(JSON.parse(summarizePerformance(rows)).post_count).toBe(1);
  });

  it('instructs the model not to name a trend when there is no signal', () => {
    const out = JSON.parse(summarizePerformance([row()]));
    expect(out.instruction.toLowerCase()).toContain('do not');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run supabase/functions/_shared/social-analytics.test.ts`
Expected: FAIL — `Failed to resolve import "./social-analytics"`.

- [ ] **Step 3: Write the implementation**

Create `supabase/functions/_shared/social-analytics.ts`:

```ts
// Donny's read of the owner's own measured post performance.
//
// Reads content_performance — the table content-performance-capture fills and
// the Analytics page already renders — rather than the provider. There is no
// proxy route matching this tool's shape (the only analytics route is per-post,
// /posts/{id}/analytics, and this tool has no post id), and fanning out N
// provider calls on an org-wide key inside one 10s timeout would be worse on
// every axis.
//
// Sample-size gated on DISTINCT posts. A post yields one row per milestone, so
// counting rows would clear a bar of 3 with a single post.
import { assessSignal } from './social-signal.ts';

export interface PerfRow {
  outstand_post_id: string | null;
  platform: string | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  engagement_rate: number | null;
}

function sum(rows: PerfRow[], key: 'views' | 'likes' | 'comments' | 'shares'): number {
  // null means NOT MEASURED, not zero — averaging it in as 0 is the exact
  // dishonesty the analytics pass was built to remove.
  return rows.reduce((acc, r) => acc + (typeof r[key] === 'number' ? (r[key] as number) : 0), 0);
}

export function summarizePerformance(rows: PerfRow[]): string {
  const withId = rows.filter((r) => typeof r.outstand_post_id === 'string' && r.outstand_post_id);
  const postCount = new Set(withId.map((r) => r.outstand_post_id)).size;
  const verdict = assessSignal(postCount);

  const out: Record<string, unknown> = {
    post_count: postCount,
    has_signal: verdict.hasSignal,
    caveat: verdict.caveat,
    totals: {
      views: sum(withId, 'views'),
      likes: sum(withId, 'likes'),
      comments: sum(withId, 'comments'),
      shares: sum(withId, 'shares'),
    },
    instruction: verdict.hasSignal
      ? `State that this is based on ${postCount} measured posts, then answer normally.`
      : `${verdict.caveat} Do not name a best platform, a trend, or a rate.`,
  };

  if (verdict.hasSignal) {
    const byPlatform = new Map<string, { total: number; n: number }>();
    for (const r of withId) {
      if (!r.platform || typeof r.engagement_rate !== 'number') continue;
      const cur = byPlatform.get(r.platform) ?? { total: 0, n: 0 };
      cur.total += r.engagement_rate;
      cur.n += 1;
      byPlatform.set(r.platform, cur);
    }
    let best: string | undefined;
    let bestAvg = -1;
    for (const [platform, agg] of byPlatform) {
      const avg = agg.total / agg.n;
      if (avg > bestAvg) {
        bestAvg = avg;
        best = platform;
      }
    }
    if (best) out.best_platform = best;
  }

  return JSON.stringify(out);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run supabase/functions/_shared/social-analytics.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Wire the tool in `outstand-mcp.ts`**

Add the import:

```ts
import { summarizePerformance, type PerfRow } from './social-analytics.ts';
```

In `callTool`, immediately after the `create_post`/`schedule_post` block from Task 5, add:

```ts
      if (rawName === 'get_post_analytics') {
        const days = typeof args.days === 'number' && args.days > 0 ? Math.floor(args.days) : 30;
        const since = new Date(Date.now() - days * 86_400_000).toISOString();

        // Own rows only. config.supabase is service-role in the orchestrator,
        // so the user_id filter IS the tenant boundary here — it is not
        // enforced by RLS on this client.
        const { data, error } = await config.supabase
          .from('content_performance')
          .select('outstand_post_id, platform, views, likes, comments, shares, engagement_rate')
          .eq('user_id', config.userId)
          .gte('captured_at', since);

        if (error) {
          console.error('[outstand-mcp] performance read failed:', error.message);
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: 'performance_unavailable', reason: 'Performance data could not be read. Say so plainly; do not guess why.' }) }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: summarizePerformance((data ?? []) as PerfRow[]) }],
        };
      }
```

- [ ] **Step 6: Confirm the tenant filter is real, not assumed**

Run:

```bash
grep -n "createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)" supabase/functions/donny-orchestrator/index.ts
```

Expected: a match at roughly line 302 — the client passed to the bridge as `config.supabase` **is** service-role, which bypasses RLS. The `.eq('user_id', config.userId)` above is therefore load-bearing, not belt-and-braces. If this grep finds nothing, stop and re-read how the client is built before continuing.

- [ ] **Step 7: Typecheck, test, commit**

```bash
npm run typecheck
npx vitest run supabase/functions/_shared/
git add supabase/functions/_shared/social-analytics.ts supabase/functions/_shared/social-analytics.test.ts supabase/functions/_shared/outstand-mcp.ts
git commit -m "feat(social): answer post analytics from our own measurements, sample-size gated"
```

---

### Task 7: The confirm card on the client

**Files:**
- Modify: `src/types/donny.ts:8-13, 75-80`
- Modify: `src/components/donny/DonnyRichCard.tsx`
- Create: `src/components/donny/SocialDraftCard.tsx`
- Create: `src/components/donny/SocialDraftCard.test.tsx`

**Interfaces:**
- Consumes: the `social_post_draft` card shape emitted by `buildDraftCard` (Task 5) — `{ type: 'social_post_draft', data: { account_label, account_id, platform, caption, media_urls, scheduled_at } }`.
- Produces: `DonnyRichCardSocialPostDraft` type; `SocialDraftCard` component.

The existing rich cards only `navigate()` or `sendMessage()`. This is the first one that runs a **mutation** — `useCrossPost`, the same hook `SocialPostPrompt` and `PostingPlanReview` already publish through. Reuse must not regress the creator cards: the switch gains a case, nothing existing changes.

- [ ] **Step 1: Write the failing test**

Create `src/components/donny/SocialDraftCard.test.tsx`:

```tsx
// @vitest-environment jsdom
import '@testing-library/jest-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SocialDraftCard } from './SocialDraftCard';

const mutate = vi.fn();
vi.mock('@/hooks/outstand/useCrossPost', () => ({
  useCrossPost: () => ({ mutate, isPending: false }),
}));

const DATA = {
  account_label: '@areyouaman · Instagram',
  account_id: 'LEnjV',
  platform: 'instagram',
  caption: 'Taco Tuesday is back',
  media_urls: [] as string[],
  scheduled_at: null as string | null,
};

beforeEach(() => mutate.mockClear());

describe('SocialDraftCard', () => {
  it('shows the account by handle and platform', () => {
    render(<SocialDraftCard data={DATA} />);
    expect(screen.getByText('@areyouaman · Instagram')).toBeInTheDocument();
  });

  it('never renders the account id', () => {
    const { container } = render(<SocialDraftCard data={DATA} />);
    expect(container.textContent).not.toContain('LEnjV');
  });

  it('shows the caption exactly as it will post', () => {
    render(<SocialDraftCard data={DATA} />);
    expect(screen.getByText('Taco Tuesday is back')).toBeInTheDocument();
  });

  it('publishes on the tap, with the resolved account', () => {
    render(<SocialDraftCard data={DATA} />);
    fireEvent.click(screen.getByRole('button', { name: /post it/i }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toMatchObject({
      caption: 'Taco Tuesday is back',
      accountIds: ['LEnjV'],
      mediaUrls: [],
    });
  });

  it('does not publish until the tap', () => {
    render(<SocialDraftCard data={DATA} />);
    expect(mutate).not.toHaveBeenCalled();
  });

  it('forwards the scheduled time when the draft carries one', () => {
    const when = '2026-08-20T15:00:00.000Z';
    render(<SocialDraftCard data={{ ...DATA, scheduled_at: when }} />);
    fireEvent.click(screen.getByRole('button', { name: /schedule it/i }));
    expect(mutate.mock.calls[0][0]).toMatchObject({ scheduledAt: when });
  });

  it('labels the action for scheduling when scheduled', () => {
    render(<SocialDraftCard data={{ ...DATA, scheduled_at: '2026-08-20T15:00:00.000Z' }} />);
    expect(screen.getByRole('button', { name: /schedule it/i })).toBeInTheDocument();
  });

  it('cannot be double-submitted', () => {
    render(<SocialDraftCard data={DATA} />);
    const btn = screen.getByRole('button', { name: /post it/i });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(mutate).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/donny/SocialDraftCard.test.tsx`
Expected: FAIL — cannot resolve `./SocialDraftCard`.

- [ ] **Step 3: Add the card type**

In `src/types/donny.ts`, add `'social_post_draft'` to the `DonnyRichCardType` union (line 8-13), then add the interface and the union member:

```ts
export interface DonnyRichCardSocialPostDraft {
  type: 'social_post_draft';
  data: {
    /** "@areyouaman · Instagram". The only account text a user ever sees. */
    account_label: string;
    /** For the publish call only — never rendered. */
    account_id: string;
    platform: string;
    caption: string;
    media_urls: string[];
    scheduled_at: string | null;
  };
}
```

and extend `DonnyRichCard`:

```ts
export type DonnyRichCard =
  | DonnyRichCardCreatorProfile
  | DonnyRichCardCampaignSummary
  | DonnyRichCardPaymentConfirmation
  | DonnyRichCardApplicationSummary
  | DonnyRichCardOnboardingStep
  | DonnyRichCardSocialPostDraft;
```

- [ ] **Step 4: Write the component**

Create `src/components/donny/SocialDraftCard.tsx`:

```tsx
// The confirm gate. Donny proposes a post; this is where a human publishes it.
//
// The only rich card that runs a mutation rather than navigating. It goes
// through useCrossPost — the same hook SocialPostPrompt and PostingPlanReview
// publish through — so there is one posting path, not a second one that drifts.
import React from 'react';
import { Send, CalendarClock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AppCard } from '@/components/app/AppCard';
import { AppStatusBadge } from '@/components/app/AppStatusBadge';
import { useCrossPost } from '@/hooks/outstand/useCrossPost';
import type { DonnyRichCardSocialPostDraft } from '@/types/donny';

interface SocialDraftCardProps {
  data: DonnyRichCardSocialPostDraft['data'];
}

export function SocialDraftCard({ data }: SocialDraftCardProps) {
  const { mutate, isPending } = useCrossPost();
  const [submitted, setSubmitted] = React.useState(false);
  const isScheduled = Boolean(data.scheduled_at);

  const handlePublish = () => {
    if (submitted || isPending) return;
    setSubmitted(true);
    mutate({
      caption: data.caption,
      mediaUrls: data.media_urls,
      accountIds: [data.account_id],
      scheduledAt: data.scheduled_at ?? undefined,
    });
  };

  return (
    <AppCard pad="5" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-dc-text">{data.account_label}</span>
        <AppStatusBadge tone={isScheduled ? 'amber' : 'teal'}>
          {isScheduled ? 'Scheduled draft' : 'Draft'}
        </AppStatusBadge>
      </div>

      <p className="whitespace-pre-wrap text-sm text-dc-text">{data.caption}</p>

      {data.media_urls.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.media_urls.map((url) => (
            <img
              key={url}
              src={url}
              alt=""
              className="h-20 w-20 rounded-xl object-cover"
              loading="lazy"
            />
          ))}
        </div>
      )}

      {data.scheduled_at && (
        <p className="text-xs text-dc-text-muted">
          Goes out {new Date(data.scheduled_at).toLocaleString()}
        </p>
      )}

      <Button
        variant="dc-primary"
        className="w-full rounded-full"
        disabled={submitted || isPending}
        onClick={handlePublish}
      >
        {isScheduled ? (
          <CalendarClock className="mr-2 h-4 w-4" />
        ) : (
          <Send className="mr-2 h-4 w-4" />
        )}
        {submitted ? 'Sending…' : isScheduled ? 'Schedule it' : 'Post it'}
      </Button>
    </AppCard>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/components/donny/SocialDraftCard.test.tsx`
Expected: PASS, 8 tests.

- [ ] **Step 6: Add the case to the rich-card switch**

In `src/components/donny/DonnyRichCard.tsx`, add the import and a case inside the existing `switch (card.type)` — do not modify any existing case:

```tsx
import { SocialDraftCard } from './SocialDraftCard';
```

```tsx
    case 'social_post_draft':
      return <SocialDraftCard data={card.data} />;
```

- [ ] **Step 7: Verify the existing cards still render**

Run: `npx vitest run src/components/donny/`
Expected: PASS — every pre-existing donny component test unchanged and green. A failure here means the switch edit touched a sibling case.

- [ ] **Step 8: Build and commit**

```bash
npm run typecheck
npm run lint
npm run build
git add src/types/donny.ts src/components/donny/SocialDraftCard.tsx src/components/donny/SocialDraftCard.test.tsx src/components/donny/DonnyRichCard.tsx
git commit -m "feat(social): render Donny's post draft with an owner confirm tap"
```

---

## Before the PR

- [ ] **Full suite:** `npm run test` — trust the `N passed, 0 failed` line, not the exit code (~103 pre-existing file failures are known; see project memory).
- [ ] **Build:** `npm run build`.
- [ ] **`data-exposure-reviewer` subagent** — required: this branch touches `supabase/functions/`. The specific question to put to it: `content_performance` is read on a **service-role** client filtered only by `.eq('user_id', …)`, and `outstand-mcp.ts` now forwards a caller JWT to `outstand-proxy`.
- [ ] **`edge-function-reviewer` subagent** — required before any deploy. `outstand-mcp.ts` is a `_shared` module and bundles into every importer.
- [ ] **Codex second review:** `codex review --base main --title "Donny social tools repair"`, re-run until clean, relay the verdict.
- [ ] **`knowledge-sync`** — wiki page + `SHIPPED_LOG.md` + `PROJECT_CONTEXT.md` §5, in this PR.

## Deploy and acceptance

Merging ships the frontend only. **`donny-orchestrator` must be deployed separately** — it is the whole backend half of this change.

Acceptance is on prod, not local tests. `social_*` has **7 calls and 0 successes** in its entire history, so:

```sql
select tool_name, status, created_at
from donny_tool_executions
where tool_name like 'social_%'
order by created_at desc limit 10;
```

**"It works" means a `status='success'` row exists that never has before**, produced by proposing a real post on `@areyouaman` and confirming it. Then the both-viewport `verify-prod` pass on the card.

## Self-review

**Spec coverage.** §5 tool surface → Task 3. §5.1 `account_id` deletion + `status='active'` → Tasks 2, 3, 5. §6 confirm gate → Tasks 5, 7. §7 sample-size gate → Tasks 1, 6. §8.1 JWT → Task 4. §8.2 real paths → Task 4. §8.3 dead header → Task 4 Step 8. §8's two deferred checks → Deltas 1 and 2. §10 error handling → `safeReason` (Task 4), `noAccountResult` (Task 5), zero-account logging (Task 4 Step 7). §11 no migration → nothing in this plan applies one. §12 testing → every task is test-first; the prod bar is above. §13 risks → the multi-account branch is covered by unit tests in Task 2 and is stated unprovable on prod data.

**Gap found and closed:** §2.4 names `list_scheduled`, but `REST_FALLBACK_TOOLS` declares it as `list_scheduled` while the spec's §5 table writes `social_list_scheduled`. Task 3's `DROPPED` array uses the raw name and asserts **both** the raw and namespaced forms are absent, so the naming discrepancy cannot hide a survivor.

**Deliberate spec departure:** §12 asks for "path-mapping tests asserting each surviving tool produces the exact method + path". After Deltas 2 and 3 only one tool has a path; Task 4's test asserts that one mapping *and* that the other three return `null` by decision rather than by omission, plus a coverage test that a newly added tool cannot silently fall through.
