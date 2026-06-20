import { describe, it, expect } from 'vitest';
import {
  reconstructHistory,
  enforceToolPairing,
  type StoredMessage,
  type AnthropicMessage,
} from './history';

// The Anthropic invariant the production 400 violated:
//   every tool_result must have a matching tool_use in the previous message,
//   and every tool_use must be answered by a tool_result in the next message.
function assertToolPairingValid(messages: AnthropicMessage[]) {
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'user' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type !== 'tool_result') continue;
        const prev = messages[i - 1];
        const ids =
          prev?.role === 'assistant' && Array.isArray(prev.content)
            ? prev.content.filter((b: any) => b?.type === 'tool_use').map((b: any) => b.id)
            : [];
        expect(ids, `tool_result ${block.tool_use_id} at index ${i} has no matching tool_use`).toContain(
          block.tool_use_id,
        );
      }
    }
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block?.type !== 'tool_use') continue;
        const next = messages[i + 1];
        const ids =
          next?.role === 'user' && Array.isArray(next.content)
            ? next.content.filter((b: any) => b?.type === 'tool_result').map((b: any) => b.tool_use_id)
            : [];
        expect(ids, `tool_use ${block.id} at index ${i} is unanswered`).toContain(block.id);
      }
    }
  }
}

const assistantToolUse = (id: string, name = 'get_internal_doc'): StoredMessage => ({
  role: 'assistant',
  content: '',
  tool_calls: [{ type: 'tool_use', id, name, input: {} }],
});
const toolResult = (id: string): StoredMessage => ({
  role: 'tool',
  content: id,
  tool_result: { ok: true },
});
const userText = (t: string): StoredMessage => ({ role: 'user', content: t });
const assistantText = (t: string): StoredMessage => ({ role: 'assistant', content: t });

describe('enforceToolPairing', () => {
  it('drops a tool_result with no matching preceding tool_use (the production 400)', () => {
    // assistant(text) then a tool_result whose tool_use is gone — exactly the
    // "unexpected tool_use_id found in tool_result blocks" failure.
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'Let me build the doc now' },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_orphan', content: '{}' }] },
    ];
    const out = enforceToolPairing(messages);
    assertToolPairingValid(out);
    expect(JSON.stringify(out)).not.toContain('toolu_orphan');
  });

  it('keeps a valid tool_use/tool_result pair untouched', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'list docs' },
      { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'get_internal_doc', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '{}' }] },
      { role: 'assistant', content: 'here they are' },
    ];
    const out = enforceToolPairing(messages);
    assertToolPairingValid(out);
    expect(out).toHaveLength(4);
  });

  it('drops an unanswered tool_use (its result was cut off the window)', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'go' },
      { role: 'assistant', content: [{ type: 'text', text: 'working' }, { type: 'tool_use', id: 'toolu_x', name: 'f', input: {} }] },
    ];
    const out = enforceToolPairing(messages);
    assertToolPairingValid(out);
    // text survives, the unanswered tool_use is stripped
    expect(JSON.stringify(out)).not.toContain('toolu_x');
    expect(JSON.stringify(out)).toContain('working');
  });

  it('keeps the answered tool_use and drops only the unanswered one in a mixed turn', () => {
    const messages: AnthropicMessage[] = [
      { role: 'user', content: 'go' },
      {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_keep', name: 'f', input: {} },
          { type: 'tool_use', id: 'toolu_drop', name: 'g', input: {} },
        ],
      },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_keep', content: '{}' }] },
    ];
    const out = enforceToolPairing(messages);
    assertToolPairingValid(out);
    expect(JSON.stringify(out)).toContain('toolu_keep');
    expect(JSON.stringify(out)).not.toContain('toolu_drop');
  });
});

describe('reconstructHistory', () => {
  it('reconstructs a clean multi-round tool conversation', () => {
    const rows: StoredMessage[] = [
      userText('update the pricing doc'),
      assistantToolUse('toolu_a'),
      toolResult('toolu_a'),
      assistantToolUse('toolu_b'),
      toolResult('toolu_b'),
      assistantText('done, queued at /internal/corrections'),
    ];
    const out = reconstructHistory(rows);
    assertToolPairingValid(out);
    expect(out[0]).toEqual({ role: 'user', content: 'update the pricing doc' });
  });

  it('repairs a window that starts mid tool-sequence (orphaned leading tool_result)', () => {
    // 50-msg window cut off the assistant(tool_use) for toolu_a; its result row
    // is the first row in the window.
    const rows: StoredMessage[] = [
      toolResult('toolu_a'), // orphan — its tool_use was outside the window
      assistantText('partial answer'),
      userText('continue'),
      assistantToolUse('toolu_c'),
      toolResult('toolu_c'),
      assistantText('finished'),
    ];
    const out = reconstructHistory(rows);
    assertToolPairingValid(out);
    expect(out[0].role).toBe('user');
    expect(JSON.stringify(out)).not.toContain('toolu_a');
    expect(JSON.stringify(out)).toContain('toolu_c');
  });

  it('does not drop a tool_use turn that follows a text assistant turn (the merge-drop regression)', () => {
    // assistant(text) immediately followed by assistant(tool_use): the old merge
    // step dropped the second turn, orphaning its tool_result.
    const rows: StoredMessage[] = [
      userText('go'),
      assistantText('let me build the doc now'),
      assistantToolUse('toolu_m'),
      toolResult('toolu_m'),
      assistantText('done'),
    ];
    const out = reconstructHistory(rows);
    assertToolPairingValid(out);
    // the tool_use survived (was not dropped) and stays paired with its result
    expect(JSON.stringify(out)).toContain('toolu_m');
  });

  it('returns an empty array for empty history', () => {
    expect(reconstructHistory([])).toEqual([]);
  });
});
