import { describe, it, expect } from 'vitest';
import { parseSseLines } from './stream-accumulator';

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
