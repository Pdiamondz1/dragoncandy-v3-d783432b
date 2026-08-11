// Turning an MCP envelope back into the payload it carries.
//
// The two branches of get_account_metrics have to produce the SAME shape,
// because one wrapper consumes both: `{ data, has_signal, caveat }`. The REST
// branch assigns `await res.json()` — the provider's metrics object. The MCP
// branch used to assign the McpToolResult envelope itself, so `data` came out
// as `{ content: [{ type: 'text', text: '{"followers":…}' }] }` and the
// follower count the wrapper is talking about sat one JSON-decode away, inside
// a string. `has_signal` and `caveat` would then be commentary on a shape that
// does not carry the numbers they describe.
//
// Latent today — the MCP client has never connected on prod (every logged
// failure carries the REST branch's error string) — and fixed anyway, for the
// same reason the tool-name intersection is enforced: this branch is one
// `OUTSTAND_MCP_URL` away from being live, and a config flip is not a code
// review.
import { McpToolResult } from './mcp-client.ts';

type McpContent = McpToolResult['content'];

/**
 * The payload an MCP result carries, or the envelope unchanged when there
 * isn't exactly one to find.
 *
 * Deliberately narrow: it unwraps only the unambiguous case — a single
 * content block whose payload is a JSON **object** (`data`, or `text` that
 * parses to one). Anything else (no blocks, several blocks, prose that isn't
 * JSON, a bare string or number) returns the envelope untouched, because the
 * alternative is guessing which block is "the" payload, and a wrong guess
 * silently drops the provider's response instead of merely nesting it. Nesting
 * is recoverable by a reader; dropping is not.
 */
export function unwrapMcpPayload(result: McpToolResult): unknown {
  const blocks: McpContent = Array.isArray(result?.content) ? result.content : [];
  const payloads = blocks.map(toObjectPayload).filter((p): p is Record<string, unknown> => p !== null);
  return payloads.length === 1 ? payloads[0] : result;
}

function toObjectPayload(block: McpContent[number]): Record<string, unknown> | null {
  // A structured block needs no decode. Checked before `text` because a block
  // carrying both is telling us which half is the data.
  if (isPlainObject(block?.data)) return block.data;
  if (typeof block?.text !== 'string') return null;
  try {
    const parsed = JSON.parse(block.text);
    return isPlainObject(parsed) ? parsed : null;
  } catch {
    // Prose, not a payload. Not an error — MCP servers legitimately return
    // human-readable text — so it simply doesn't count as an unwrap candidate.
    return null;
  }
}

/** Arrays and null are not payload objects: `stripAccountIds` and the wrapper both expect a record. */
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
