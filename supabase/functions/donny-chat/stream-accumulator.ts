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
