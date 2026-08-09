import { describe, it, expect } from 'vitest';
import { unwrapMcpPayload } from './mcp-payload';

const METRICS = { followers: 1234, engagement_rate: 0.031 };

describe('unwrapMcpPayload', () => {
  it('returns the object encoded in a single text block', () => {
    expect(
      unwrapMcpPayload({ content: [{ type: 'text', text: JSON.stringify(METRICS) }] }),
    ).toEqual(METRICS);
  });

  it('matches what the REST branch would hand the wrapper', () => {
    // The property that matters: both branches feed one wrapper, so
    // `data.followers` must be reachable the same way on either path.
    const viaMcp = unwrapMcpPayload({
      content: [{ type: 'text', text: JSON.stringify(METRICS) }],
    }) as Record<string, unknown>;
    const viaRest = JSON.parse(JSON.stringify(METRICS));
    expect(viaMcp).toEqual(viaRest);
    expect(viaMcp.followers).toBe(1234);
  });

  it('prefers a structured data block over its text sibling', () => {
    expect(
      unwrapMcpPayload({
        content: [{ type: 'resource', data: METRICS, text: 'Here are your metrics.' }],
      }),
    ).toEqual(METRICS);
  });

  it('keeps the envelope when a block is prose rather than a payload', () => {
    const envelope = { content: [{ type: 'text', text: 'No metrics available today.' }] };
    expect(unwrapMcpPayload(envelope)).toBe(envelope);
  });

  it('keeps the envelope when two blocks both look like payloads', () => {
    // Which one is "the" metrics object is a guess, and a wrong guess DROPS
    // the provider's response. Nesting is recoverable; dropping is not.
    const envelope = {
      content: [
        { type: 'text', text: JSON.stringify(METRICS) },
        { type: 'text', text: JSON.stringify({ followers: 9 }) },
      ],
    };
    expect(unwrapMcpPayload(envelope)).toBe(envelope);
  });

  it('keeps the envelope when there is no content at all', () => {
    const envelope = { content: [] };
    expect(unwrapMcpPayload(envelope)).toBe(envelope);
  });

  it('does not unwrap a JSON array or scalar into the data slot', () => {
    // The wrapper and stripAccountIds both expect a record; an array would
    // read as an object with numeric keys downstream.
    const arr = { content: [{ type: 'text', text: '[1,2,3]' }] };
    const num = { content: [{ type: 'text', text: '42' }] };
    const nul = { content: [{ type: 'text', text: 'null' }] };
    expect(unwrapMcpPayload(arr)).toBe(arr);
    expect(unwrapMcpPayload(num)).toBe(num);
    expect(unwrapMcpPayload(nul)).toBe(nul);
  });

  it('survives a malformed envelope without throwing', () => {
    // A provider is not a contract. `content` missing entirely must not take
    // the tool down — it degrades to "return what we got".
    const bad = { content: undefined } as unknown as { content: [] };
    expect(() => unwrapMcpPayload(bad)).not.toThrow();
    expect(unwrapMcpPayload(bad)).toBe(bad);
  });
});
