export interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface McpToolResult {
  content: Array<{ type: string; text?: string; data?: unknown }>;
  isError?: boolean;
}

export interface McpClient {
  listTools(): Promise<McpToolDefinition[]>;
  callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult>;
  disconnect(): void;
}

const TOOL_CALL_TIMEOUT = 10_000;

export async function createMcpClient(
  serverUrl: string,
  authToken: string,
): Promise<McpClient> {
  const headers = {
    "Authorization": `Bearer ${authToken}`,
    "Content-Type": "application/json",
  };

  // Verify connectivity
  const ping = await fetch(`${serverUrl}/health`, { headers, signal: AbortSignal.timeout(5000) })
    .catch(() => null);

  if (!ping || !ping.ok) {
    throw new Error(`MCP server unreachable at ${serverUrl}`);
  }

  return {
    async listTools(): Promise<McpToolDefinition[]> {
      const res = await fetch(`${serverUrl}/tools/list`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT),
      });
      if (!res.ok) throw new Error(`listTools failed: ${res.status}`);
      const body = await res.json();
      return (body.tools ?? []) as McpToolDefinition[];
    },

    async callTool(name: string, args: Record<string, unknown>): Promise<McpToolResult> {
      const res = await fetch(`${serverUrl}/tools/call`, {
        method: "POST",
        headers,
        body: JSON.stringify({ name, arguments: args }),
        signal: AbortSignal.timeout(TOOL_CALL_TIMEOUT),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "unknown");
        return { content: [{ type: "text", text: `Tool call failed (${res.status}): ${errText}` }], isError: true };
      }
      return await res.json() as McpToolResult;
    },

    disconnect() {
      // HTTP transport — no persistent connection to close
    },
  };
}
