// Pure SSE/streaming helpers for donny-chat. No Deno or network imports so this
// module is unit-testable with vitest (mirrors history.ts).

export function parseSseLines(
  buffer: string,
  chunk: string,
): { events: any[]; rest: string } {
  const text = buffer + chunk;
  const lines = text.split("\n");
  const rest = lines.pop() ?? ""; // last element is a (possibly partial) line
  const events: any[] = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue; // ignore event:/comment/blank lines
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    events.push(JSON.parse(payload));
  }
  return { events, rest };
}

export type Usage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type AssembledMessage = {
  content: any[];
  stop_reason: string | null;
  usage: Usage;
};

// Consumes parsed Anthropic stream events. push() returns { textDelta } when the
// event produced user-facing text, else {}. finalize() returns the assembled
// message in the same shape as a non-streaming Messages response.
export class StreamAccumulator {
  private blocks: any[] = [];
  private partialJson: Record<number, string> = {};
  private stopReason: string | null = null;
  private usage: Usage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  };

  push(ev: any): { textDelta?: string } {
    switch (ev?.type) {
      case "message_start": {
        const u = ev.message?.usage ?? {};
        this.usage.input_tokens = u.input_tokens ?? 0;
        this.usage.cache_read_input_tokens = u.cache_read_input_tokens ?? 0;
        this.usage.cache_creation_input_tokens = u.cache_creation_input_tokens ?? 0;
        return {};
      }
      case "content_block_start": {
        const cb = ev.content_block ?? {};
        if (cb.type === "tool_use") {
          this.blocks[ev.index] = { type: "tool_use", id: cb.id, name: cb.name, input: {} };
          this.partialJson[ev.index] = "";
        } else if (cb.type === "text") {
          this.blocks[ev.index] = { type: "text", text: cb.text ?? "" };
        } else {
          this.blocks[ev.index] = { type: cb.type, ...cb }; // thinking/other — kept, not forwarded
        }
        return {};
      }
      case "content_block_delta": {
        const d = ev.delta ?? {};
        if (d.type === "text_delta") {
          const b = this.blocks[ev.index];
          if (b?.type === "text") b.text += d.text ?? "";
          return { textDelta: d.text ?? "" };
        }
        if (d.type === "input_json_delta") {
          this.partialJson[ev.index] = (this.partialJson[ev.index] ?? "") + (d.partial_json ?? "");
        }
        return {};
      }
      case "content_block_stop": {
        const b = this.blocks[ev.index];
        if (b?.type === "tool_use") {
          const raw = (this.partialJson[ev.index] ?? "").trim();
          b.input = raw ? JSON.parse(raw) : {}; // throws on malformed → fatal stream error
        }
        return {};
      }
      case "message_delta": {
        if (ev.delta?.stop_reason) this.stopReason = ev.delta.stop_reason;
        if (ev.usage?.output_tokens != null) this.usage.output_tokens = ev.usage.output_tokens;
        return {};
      }
      default:
        return {}; // ping, message_stop, etc.
    }
  }

  finalize(): AssembledMessage {
    return { content: this.blocks.filter(Boolean), stop_reason: this.stopReason, usage: this.usage };
  }
}

const TOOL_STATUS_LABELS: Record<string, string> = {
  search_internal_knowledge: "Searching the strategy library…",
  get_internal_doc: "Reading the strategy library…",
  get_platform_stats: "Pulling platform stats…",
  get_revenue_stats: "Pulling revenue…",
  get_cost_stats: "Pulling AI spend…",
  get_platform_weight_trend: "Reading the scaling trend…",
  get_latest_briefing: "Reading the latest brief…",
  workspace_export_doc: "Exporting to a Google Doc…",
  workspace_list_files: "Listing your Drive folder…",
  workspace_read_file: "Reading the Drive file…",
  compose_email_link: "Drafting the email…",
  propose_correction: "Queuing the correction…",
};

export function toolStatusLabel(toolName: string): string {
  return TOOL_STATUS_LABELS[toolName] ?? `Working on ${toolName.replace(/_/g, " ")}…`;
}
