import { describe, it, expect } from 'vitest';
import { composeCaption, parseHashtagInput } from './composeCaption';

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

describe('parseHashtagInput', () => {
  it('parses a plain space-separated list', () => {
    expect(parseHashtagInput('#one #two #three')).toEqual(['#one', '#two', '#three']);
  });

  it('adds the leading # to bare words, because that is what the DB stores', () => {
    expect(parseHashtagInput('one two')).toEqual(['#one', '#two']);
  });

  it('collapses repeated leading #', () => {
    expect(parseHashtagInput('##one ###two')).toEqual(['#one', '#two']);
  });

  it('splits on commas as well as whitespace', () => {
    expect(parseHashtagInput('#one,#two,  #three')).toEqual(['#one', '#two', '#three']);
  });

  it('preserves non-ASCII tags — #CaféLife is a real stored value', () => {
    expect(parseHashtagInput('#CaféLife #Ñoño')).toEqual(['#CaféLife', '#Ñoño']);
  });

  it('drops duplicates case-insensitively, keeping the first spelling', () => {
    expect(parseHashtagInput('#Food #food #FOOD')).toEqual(['#Food']);
  });

  it('returns [] for empty, whitespace, null and undefined', () => {
    expect(parseHashtagInput('')).toEqual([]);
    expect(parseHashtagInput('   \n  ')).toEqual([]);
    expect(parseHashtagInput(null)).toEqual([]);
    expect(parseHashtagInput(undefined)).toEqual([]);
  });

  it('ignores a bare # with nothing after it', () => {
    expect(parseHashtagInput('# #real #')).toEqual(['#real']);
  });

  it('round-trips with composeCaption without mangling the tags', () => {
    const tags = ['#DragonDashed', '#CaféLife', '#HobokenEats'];
    const rendered = composeCaption('', tags);
    expect(parseHashtagInput(rendered)).toEqual(tags);
  });
});
