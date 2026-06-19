import { describe, it, expect } from 'vitest';
import { composeCaption } from './composeCaption';

describe('composeCaption', () => {
  it('returns caption only when there are no hashtags', () => {
    expect(composeCaption('Behind the counter at Rocco\'s', [])).toBe("Behind the counter at Rocco's");
  });

  it('joins caption and hashtags on a blank line', () => {
    expect(composeCaption('Pizza night', ['#hoboken', '#pizza'])).toBe('Pizza night\n\n#hoboken #pizza');
  });

  it('normalizes hashtags missing the leading #', () => {
    expect(composeCaption('Yum', ['hoboken', 'pizza'])).toBe('Yum\n\n#hoboken #pizza');
  });

  it('returns hashtags only when caption is empty', () => {
    expect(composeCaption('', ['#a', '#b'])).toBe('#a #b');
  });

  it('returns hashtags only when caption is whitespace', () => {
    expect(composeCaption('   ', ['#a'])).toBe('#a');
  });

  it('returns empty string when both are empty or missing', () => {
    expect(composeCaption('', [])).toBe('');
    expect(composeCaption(null, null)).toBe('');
    expect(composeCaption(undefined, undefined)).toBe('');
  });

  it('drops blank hashtags', () => {
    expect(composeCaption('Hi', ['#a', '  ', ''])).toBe('Hi\n\n#a');
  });
});
