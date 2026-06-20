// Pure conversation-history reconstruction for donny-chat.
//
// Stored donny_messages rows are replayed into the Anthropic Messages format.
// This is split out of index.ts (which pulls in Deno-only imports) so the logic
// can be unit-tested with vitest, matching the repo convention (capture.ts,
// brief.ts, reconcile.ts).
//
// The Anthropic API has a hard invariant: every `tool_result` block in a user
// message must correspond to a `tool_use` block in the IMMEDIATELY preceding
// assistant message, and every `tool_use` must be answered by a `tool_result`
// in the next message. Replaying a fixed window of stored rows can violate this
// (a window that cuts a tool pair, a tool-result row that failed to insert, or
// created_at ties that reorder rows), which surfaces as a 400 like
//   messages.N.content.0: unexpected `tool_use_id` found in `tool_result` blocks
// reconstructHistory therefore ends with enforceToolPairing, which drops any
// orphaned block so a malformed array never reaches the API.

export type StoredMessage = {
  role: string;
  content: string | null;
  tool_calls?: any;
  tool_result?: any;
};

export type AnthropicMessage = { role: "user" | "assistant"; content: any };

// Map stored rows into Anthropic messages, preserving the existing format
// handling (OpenAI-era tool_calls vs native Anthropic content arrays). Adjacent
// tool-result rows are folded into a single user message of tool_result blocks.
function mapStoredToAnthropic(history: StoredMessage[]): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  for (const msg of history) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content ?? "" });
    } else if (msg.role === "assistant") {
      if (msg.tool_calls && Array.isArray(msg.tool_calls)) {
        const isOpenAIFormat = msg.tool_calls.length > 0 && msg.tool_calls[0]?.function;
        if (isOpenAIFormat) {
          const contentBlocks: any[] = [];
          if (msg.content) contentBlocks.push({ type: "text", text: msg.content });
          for (const tc of msg.tool_calls) {
            contentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.function.name,
              input: JSON.parse(tc.function.arguments),
            });
          }
          messages.push({ role: "assistant", content: contentBlocks });
        } else {
          // Already Anthropic format — stored as a content array.
          messages.push({ role: "assistant", content: msg.tool_calls });
        }
      } else {
        messages.push({ role: "assistant", content: msg.content ?? "" });
      }
    } else if (msg.role === "tool" && msg.tool_result) {
      // Tool results become user messages with tool_result content blocks.
      // msg.content stores the tool_use_id (tool_call_id for OpenAI-era rows).
      const toolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.content ?? "unknown",
        content: JSON.stringify(msg.tool_result),
      };
      const prev = messages[messages.length - 1];
      if (prev?.role === "user" && Array.isArray(prev.content) && prev.content[0]?.type === "tool_result") {
        prev.content.push(toolResultBlock);
      } else {
        messages.push({ role: "user", content: [toolResultBlock] });
      }
    }
    // Skip 'system' rows — Anthropic uses the top-level system param.
  }

  return messages;
}

function asBlocks(content: any): any[] {
  if (Array.isArray(content)) return content;
  if (typeof content === "string" && content) return [{ type: "text", text: content }];
  return [];
}

// Merge consecutive same-role messages (Anthropic prefers alternating turns).
// Unlike the previous implementation, this NEVER drops a message that carries
// tool_use / tool_result blocks: when a text turn meets a tool-bearing turn it
// folds both into one content array instead of discarding the second. Dropping a
// tool_use turn here was a root cause of orphaned tool_result 400s.
function mergeConsecutive(messages: AnthropicMessage[]): AnthropicMessage[] {
  const out: AnthropicMessage[] = [];
  for (const msg of messages) {
    const prev = out[out.length - 1];
    if (!prev || prev.role !== msg.role) {
      out.push(msg);
      continue;
    }
    // Same role as previous — combine without losing any block.
    if (typeof prev.content === "string" && typeof msg.content === "string") {
      prev.content = prev.content ? `${prev.content}\n\n${msg.content}` : msg.content;
    } else {
      prev.content = [...asBlocks(prev.content), ...asBlocks(msg.content)];
    }
  }
  return out;
}

// Drop leading messages until the history starts with a plain user message.
// A leading assistant turn or a user turn headed by tool_result blocks is not a
// valid start (the API rejects tool_result blocks with no matching tool_use in
// the previous message).
function stripLeadingOrphans(messages: AnthropicMessage[]): AnthropicMessage[] {
  const out = messages.slice();
  while (
    out.length > 0 &&
    (out[0].role !== "user" ||
      (Array.isArray(out[0].content) && out[0].content[0]?.type === "tool_result"))
  ) {
    out.shift();
  }
  return out;
}

function isEmptyContent(content: any): boolean {
  if (Array.isArray(content)) return content.length === 0;
  return !content || (typeof content === "string" && content.trim() === "");
}

// Final integrity pass — guarantees the tool_use/tool_result pairing invariant
// regardless of how the replayed window was cut or which rows failed to persist:
//   pass 1: drop tool_result blocks whose tool_use_id has no matching tool_use
//           in the immediately preceding assistant message;
//   pass 2: drop tool_use blocks not answered by a tool_result in the next
//           message;
// then drop any message left empty by those edits. This is the guard that
// directly prevents the "unexpected tool_use_id" 400.
export function enforceToolPairing(messages: AnthropicMessage[]): AnthropicMessage[] {
  // Pass 1 — strip orphaned tool_result blocks.
  const afterResults: AnthropicMessage[] = [];
  for (const msg of messages) {
    if (
      msg.role === "user" &&
      Array.isArray(msg.content) &&
      msg.content.some((b: any) => b?.type === "tool_result")
    ) {
      const prev = afterResults[afterResults.length - 1];
      const prevToolUseIds = new Set<string>(
        prev?.role === "assistant" && Array.isArray(prev.content)
          ? prev.content.filter((b: any) => b?.type === "tool_use").map((b: any) => b.id)
          : [],
      );
      const kept = msg.content.filter(
        (b: any) => b?.type !== "tool_result" || prevToolUseIds.has(b.tool_use_id),
      );
      if (kept.length === 0) continue; // every block was orphaned — drop the message
      afterResults.push({ ...msg, content: kept });
    } else {
      afterResults.push(msg);
    }
  }

  // Pass 2 — strip unanswered tool_use blocks (their result was cut off / lost).
  const afterUses: AnthropicMessage[] = [];
  for (let i = 0; i < afterResults.length; i++) {
    const msg = afterResults[i];
    if (
      msg.role === "assistant" &&
      Array.isArray(msg.content) &&
      msg.content.some((b: any) => b?.type === "tool_use")
    ) {
      const next = afterResults[i + 1];
      const answeredIds = new Set<string>(
        next?.role === "user" && Array.isArray(next.content)
          ? next.content.filter((b: any) => b?.type === "tool_result").map((b: any) => b.tool_use_id)
          : [],
      );
      const kept = msg.content.filter(
        (b: any) => b?.type !== "tool_use" || answeredIds.has(b.id),
      );
      if (kept.length === 0) continue; // nothing but unanswered tool_use — drop the message
      afterUses.push({ ...msg, content: kept });
    } else {
      afterUses.push(msg);
    }
  }

  // Drop any message left genuinely empty, then re-merge so dropping a turn in
  // the middle never leaves two same-role turns adjacent.
  const nonEmpty = afterUses.filter((m) => !isEmptyContent(m.content));
  return mergeConsecutive(nonEmpty);
}

// Replay stored rows into a valid Anthropic message array.
export function reconstructHistory(history: StoredMessage[]): AnthropicMessage[] {
  if (!history || history.length === 0) return [];
  const mapped = mapStoredToAnthropic(history);
  const merged = mergeConsecutive(mapped);
  const stripped = stripLeadingOrphans(merged);
  return enforceToolPairing(stripped);
}
