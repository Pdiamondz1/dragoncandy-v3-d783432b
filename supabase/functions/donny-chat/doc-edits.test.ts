import { describe, it, expect } from 'vitest';
import { applyEdits, type DocEdit } from './doc-edits';

const DOC = `---
title: GTM Playbook
---
# GTM Playbook

Kill-switches:
- Churn > 6% monthly
- CAC payback > 9 months
- LTV:CAC < 2:1

## Targets
- Y1: $200K ARR
- Y2: $2M ARR

Repeated phrase. Repeated phrase.
`;

const ok = (r: ReturnType<typeof applyEdits>) => {
  if ('error' in r) throw new Error(`expected success, got error: ${r.error}`);
  return r.content;
};

describe('applyEdits', () => {
  it('applies a single unique find/replace', () => {
    const content = ok(applyEdits(DOC, [
      { old_string: 'CAC payback > 9 months', new_string: 'CAC payback > 12 months' },
    ]));
    expect(content).toContain('CAC payback > 12 months');
    expect(content).not.toContain('CAC payback > 9 months');
    // Everything else untouched.
    expect(content).toContain('Churn > 6% monthly');
    expect(content).toContain('title: GTM Playbook');
  });

  it('applies multiple edits sequentially', () => {
    const content = ok(applyEdits(DOC, [
      { old_string: 'Y1: $200K ARR', new_string: 'Y1: $300-600K ARR' },
      { old_string: 'Y2: $2M ARR', new_string: 'Y2: $2-4.5M ARR' },
    ]));
    expect(content).toContain('Y1: $300-600K ARR');
    expect(content).toContain('Y2: $2-4.5M ARR');
  });

  it('errors (and reports the index) when old_string is not found', () => {
    const r = applyEdits(DOC, [
      { old_string: 'CAC payback > 9 months', new_string: 'CAC payback > 12 months' },
      { old_string: 'nonexistent text', new_string: 'whatever' },
    ]);
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error).toMatch(/edit #2/);
      expect(r.error).toMatch(/not found/i);
    }
  });

  it('errors when old_string is not unique (without replace_all)', () => {
    const r = applyEdits(DOC, [{ old_string: 'Repeated phrase.', new_string: 'Changed.' }]);
    expect('error' in r).toBe(true);
    if ('error' in r) {
      expect(r.error).toMatch(/not unique/i);
      expect(r.error).toMatch(/2/); // match count surfaced
    }
  });

  it('replaces every occurrence with replace_all', () => {
    const content = ok(applyEdits(DOC, [
      { old_string: 'Repeated phrase.', new_string: 'Changed.', replace_all: true },
    ]));
    expect(content).toContain('Changed. Changed.');
    expect(content).not.toContain('Repeated phrase.');
  });

  it('errors when replace_all finds zero occurrences', () => {
    const r = applyEdits(DOC, [
      { old_string: 'missing', new_string: 'x', replace_all: true },
    ]);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/not found/i);
  });

  it('rejects an identical old_string/new_string (no-op)', () => {
    const r = applyEdits(DOC, [{ old_string: 'Targets', new_string: 'Targets' }]);
    expect('error' in r).toBe(true);
    if ('error' in r) expect(r.error).toMatch(/identical|same|no.?op/i);
  });

  it('errors on an empty old_string', () => {
    const r = applyEdits(DOC, [{ old_string: '', new_string: 'x' }]);
    expect('error' in r).toBe(true);
  });

  it('errors when given no edits', () => {
    const r = applyEdits(DOC, []);
    expect('error' in r).toBe(true);
  });

  it('handles an edit whose new_string introduces text a later edit targets (order matters)', () => {
    const content = ok(applyEdits(DOC, [
      { old_string: 'LTV:CAC < 2:1', new_string: 'LTV:CAC < 3:1 (revised marker)' },
      { old_string: 'revised marker', new_string: 'final' },
    ]));
    expect(content).toContain('LTV:CAC < 3:1 (final)');
  });

  it('does not mutate the input on a later-edit failure (first edit not partially applied to output)', () => {
    const r = applyEdits(DOC, [
      { old_string: 'Y1: $200K ARR', new_string: 'Y1: $999 ARR' },
      { old_string: 'totally missing', new_string: 'x' },
    ]);
    // The whole batch fails atomically; caller keeps the original.
    expect('error' in r).toBe(true);
  });
});
