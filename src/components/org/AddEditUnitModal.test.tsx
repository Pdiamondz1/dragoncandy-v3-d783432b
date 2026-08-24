import { describe, it, expect } from 'vitest';
import { describeSaveOutcome } from './AddEditUnitModal';

describe('describeSaveOutcome', () => {
  it('confirms only when the server stamped the row', () => {
    const out = describeSaveOutcome('Downtown', true, '1 Main St', '2026-08-24T00:00:00Z');
    expect(out.title).toBe('Address confirmed');
  });

  /**
   * The failure this exists to prevent: reporting a plain "updated" for a save whose
   * address never verified, which is what the `address` requirement actually keys on.
   */
  it('does not claim confirmation when the stamp is absent', () => {
    const out = describeSaveOutcome('Downtown', true, '1 Main St', null);
    expect(out.title).not.toBe('Address confirmed');
    expect(`${out.title} ${out.description}`).toMatch(/could not confirm/i);
  });

  it('says what an empty address costs rather than reporting success', () => {
    const out = describeSaveOutcome('Downtown', true, null, null);
    expect(out.description).toMatch(/no address/i);
  });

  it('treats whitespace as no address', () => {
    expect(describeSaveOutcome('Downtown', true, '   ', null).description).toMatch(/no address/i);
  });

  it('leaves products alone — they have no address dimension', () => {
    const out = describeSaveOutcome('Sauce', false, null, null);
    expect(out.title).toBe('Product updated');
    expect(out.description).not.toMatch(/address/i);
  });

  it('never tells the owner their address is wrong', () => {
    const cases = [
      describeSaveOutcome('X', true, '1 Main St', null),
      describeSaveOutcome('X', true, null, null),
      describeSaveOutcome('X', true, '1 Main St', '2026-08-24T00:00:00Z'),
    ];
    for (const c of cases) {
      expect(`${c.title} ${c.description}`.toLowerCase()).not.toMatch(/invalid|wrong|incorrect/);
    }
  });

  it('names the location it is talking about, except where the copy is generic', () => {
    expect(describeSaveOutcome('Hoboken', true, '1 Main St', '2026-08-24T00:00:00Z').description)
      .toContain('Hoboken');
    expect(describeSaveOutcome('Hoboken', true, null, null).description).toContain('Hoboken');
  });
});
