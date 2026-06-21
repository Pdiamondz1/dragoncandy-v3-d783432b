// Pure newline-delimited-JSON chunk parser for streaming responses.
export function parseNdjsonChunk(
  buffer: string,
  chunk: string,
): { events: any[]; rest: string } {
  const text = buffer + chunk;
  const lines = text.split("\n");
  const rest = lines.pop() ?? "";
  const events: any[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    events.push(JSON.parse(trimmed));
  }
  return { events, rest };
}
