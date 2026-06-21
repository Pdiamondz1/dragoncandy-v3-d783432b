import { describe, it, expect } from 'vitest';
import { parseNdjsonChunk } from './ndjson';

describe('parseNdjsonChunk', () => {
  it('parses multiple complete events in one chunk', () => {
    const { events, rest } = parseNdjsonChunk('', '{"type":"status","label":"a"}\n{"type":"text","delta":"hi"}\n');
    expect(events).toEqual([{ type: 'status', label: 'a' }, { type: 'text', delta: 'hi' }]);
    expect(rest).toBe('');
  });
  it('buffers a partial trailing line across chunks', () => {
    const a = parseNdjsonChunk('', '{"type":"te');
    expect(a.events).toEqual([]);
    const b = parseNdjsonChunk(a.rest, 'xt","delta":"x"}\n');
    expect(b.events).toEqual([{ type: 'text', delta: 'x' }]);
  });
  it('ignores blank lines', () => {
    const { events } = parseNdjsonChunk('', '\n{"type":"done","content":"c","rich_card":null}\n\n');
    expect(events).toEqual([{ type: 'done', content: 'c', rich_card: null }]);
  });
});
