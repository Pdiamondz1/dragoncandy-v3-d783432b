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

/**
 * A minimal structural shape for one MCP `content[]` entry — deliberately
 * NOT imported from mcp-client.ts's McpToolResult, to keep this module free
 * of any dependency (type-only or otherwise) per the file-level "pure and
 * dependency-free" contract above. Callers pass their own McpToolResult
 * content array; TypeScript structurally accepts it.
 */
interface McpContentEntry {
  type: string;
  text?: string;
  data?: unknown;
}

/**
 * Strips account ids serialized INSIDE an MCP content[] envelope's `text`
 * field — not just object keys.
 *
 * stripAccountIds only removes object KEYS. The standard MCP result shape
 * (see mcp-client.ts's callTool, and the raw-upstream-body error path there
 * too) puts the actual tool payload as a JSON-encoded STRING inside
 * content[].text, so calling stripAccountIds on the outer envelope walks
 * past that string without ever parsing it — an `account_id` serialized
 * inside survives byte-for-byte. This walks each content entry and, where
 * `text` parses as JSON, strips it and re-serializes. An entry whose `text`
 * does NOT parse as JSON is returned untouched — that is plain prose (or a
 * synthetic non-JSON string), not a payload, and must never be mangled.
 *
 * Does not mutate its input; entries with no `text` field pass through
 * unchanged (same object reference).
 */
export function stripAccountIdsFromMcpContent<T extends McpContentEntry>(
  content: readonly T[],
): T[] {
  return content.map((entry) => {
    if (typeof entry.text !== 'string') return entry;
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.text);
    } catch {
      return entry;
    }
    return { ...entry, text: JSON.stringify(stripAccountIds(parsed)) };
  });
}
