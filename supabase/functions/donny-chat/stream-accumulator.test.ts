import { describe, it, expect } from 'vitest';
import { parseSseLines, StreamAccumulator } from './stream-accumulator';

describe('parseSseLines', () => {
  it('parses a complete data line and ignores event/blank lines', () => {
    const input = 'event: message_start\ndata: {"type":"message_start"}\n\n';
    const { events, rest } = parseSseLines('', input);
    expect(events).toEqual([{ type: 'message_start' }]);
    expect(rest).toBe('');
  });

  it('buffers a partial trailing line across chunks', () => {
    const a = parseSseLines('', 'data: {"type":"co');
    expect(a.events).toEqual([]);
    const b = parseSseLines(a.rest, 'ntent_block_stop","index":0}\n');
    expect(b.events).toEqual([{ type: 'content_block_stop', index: 0 }]);
  });

  it('ignores [DONE] and non-data lines, skips blank data', () => {
    const { events } = parseSseLines('', 'data: [DONE]\n: ping comment\ndata:\n');
    expect(events).toEqual([]);
  });
});

describe('StreamAccumulator', () => {
  it('assembles a text-only message and surfaces text deltas', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'message_start', message: { usage: { input_tokens: 10, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 } } });
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    expect(acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hel' } })).toEqual({ textDelta: 'Hel' });
    expect(acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'lo' } })).toEqual({ textDelta: 'lo' });
    acc.push({ type: 'content_block_stop', index: 0 });
    acc.push({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } });
    const msg = acc.finalize();
    expect(msg.content).toEqual([{ type: 'text', text: 'Hello' }]);
    expect(msg.stop_reason).toBe('end_turn');
    expect(msg.usage).toEqual({ input_tokens: 10, output_tokens: 7, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 });
  });

  it('reconstructs a tool_use input from input_json_delta fragments', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'message_start', message: { usage: {} } });
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 'toolu_1', name: 'get_internal_doc' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"path":' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '"a.md"}' } });
    acc.push({ type: 'content_block_stop', index: 0 });
    acc.push({ type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } });
    const msg = acc.finalize();
    expect(msg.content).toEqual([{ type: 'tool_use', id: 'toolu_1', name: 'get_internal_doc', input: { path: 'a.md' } }]);
    expect(msg.stop_reason).toBe('tool_use');
  });

  it('handles interleaved text + tool_use and empty tool input', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'message_start', message: { usage: {} } });
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'working' } });
    acc.push({ type: 'content_block_stop', index: 0 });
    acc.push({ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 't2', name: 'get_platform_stats' } });
    acc.push({ type: 'content_block_stop', index: 1 }); // no input_json_delta → {}
    const msg = acc.finalize();
    expect(msg.content).toEqual([
      { type: 'text', text: 'working' },
      { type: 'tool_use', id: 't2', name: 'get_platform_stats', input: {} },
    ]);
  });

  it('throws on malformed tool input json (caller maps to error event)', () => {
    const acc = new StreamAccumulator();
    acc.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: 't', name: 'x' } });
    acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{"bad":' } });
    expect(() => acc.push({ type: 'content_block_stop', index: 0 })).toThrow();
  });

  it('returns {} (no textDelta) for non-text events', () => {
    const acc = new StreamAccumulator();
    expect(acc.push({ type: 'ping' })).toEqual({});
    expect(acc.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } })).toEqual({});
  });
});
