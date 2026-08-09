// Removes provider-native id fields from an arbitrary JSON value before it
// reaches the model. Account ids never appear in a model-visible or
// user-facing string — see outstand-accounts.ts's describeAccount, and
// social-draft.ts's account_id comment.
//
// Deliberately a recursive BLOCKLIST walk, not a field allow-list.
// get_account_metrics' provider endpoint has never once returned
// successfully in this project (see outstand-mcp-paths.ts), so any allow-
// list of "the fields we keep" would be a guess that could silently empty
// the tool's real output the first time it does return. Blocking known id
// key names and keeping everything else is the only version of this that
// degrades safely.
//
// Pure and dependency-free on purpose, like social-signal.ts: Vitest imports
// it directly, and it must stay free of Deno/Node-only APIs.

const BLOCKED_KEYS = new Set(['id', 'account_id', 'social_account_id', 'socialaccountid']);

/**
 * Walks `value` (arbitrary JSON: objects, arrays, primitives) and returns a
 * NEW value with every object key whose name matches (case-insensitively)
 * `id` / `account_id` / `social_account_id` / `socialAccountId` removed at
 * every depth. Every other field is left byte-identical. Does not mutate
 * its input.
 */
export function stripAccountIds(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripAccountIds(item));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (BLOCKED_KEYS.has(key.toLowerCase())) continue;
      out[key] = stripAccountIds(val);
    }
    return out;
  }
  return value;
}
