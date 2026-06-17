import { describe, it, expect } from 'vitest';
import { normalizeForCompare } from './normalizeForCompare';

describe('normalizeForCompare', () => {
  it('treats trailing-whitespace-only differences as equal', () => {
    expect(normalizeForCompare('hello world  \n')).toBe(normalizeForCompare('hello world'));
  });
  it('keeps meaningful content differences distinct', () => {
    expect(normalizeForCompare('Small tier')).not.toBe(normalizeForCompare('Medium tier'));
  });
  it('handles null/undefined as empty', () => {
    expect(normalizeForCompare(null)).toBe('');
    expect(normalizeForCompare(undefined)).toBe('');
  });
});
