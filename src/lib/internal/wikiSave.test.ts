import { describe, it, expect } from 'vitest';
import { slugify, deriveWikiDefaults, validateSaveInput, saveErrorMessage } from './wikiSave';

describe('slugify', () => {
  it('lowercases, strips punctuation, collapses to hyphens', () => {
    expect(slugify('Hello, World! Q3 2026')).toBe('hello-world-q3-2026');
  });
  it('trims leading/trailing hyphens', () => {
    expect(slugify('  --Pricing--  ')).toBe('pricing');
  });
  it('falls back when nothing usable remains', () => {
    expect(slugify('!!!')).toBe('donny-answer');
  });
});

describe('deriveWikiDefaults', () => {
  it('uses the first markdown heading as the title', () => {
    const d = deriveWikiDefaults('# Take-rate ladder\n\nSome body text.');
    expect(d.title).toBe('Take-rate ladder');
    expect(d.folder).toBe('analyses');
    expect(d.filename).toBe('take-rate-ladder');
  });
  it('strips trailing punctuation from a heading title (matches the sentence path)', () => {
    const d = deriveWikiDefaults('# Pricing notes!\n\nbody');
    expect(d.title).toBe('Pricing notes');
    expect(d.filename).toBe('pricing-notes');
  });
  it('falls back to the first sentence when there is no heading', () => {
    const d = deriveWikiDefaults('Our CAC payback is 9 months. More detail follows.');
    expect(d.title).toBe('Our CAC payback is 9 months');
    expect(d.folder).toBe('analyses');
    expect(d.filename).toBe('our-cac-payback-is-9-months');
  });
  it('handles empty input without throwing', () => {
    const d = deriveWikiDefaults('');
    expect(d.title).toBe('Donny answer');
    expect(d.folder).toBe('analyses');
    expect(d.filename).toBe('donny-answer');
  });
});

describe('validateSaveInput', () => {
  it('accepts a valid input', () => {
    expect(validateSaveInput({ folder: 'analyses', filename: 'pricing-notes', title: 'Pricing notes' }).ok).toBe(true);
  });
  it('rejects an out-of-whitelist folder', () => {
    expect(validateSaveInput({ folder: 'entities', filename: 'x', title: 'X' }).ok).toBe(false);
  });
  it('rejects an empty title', () => {
    expect(validateSaveInput({ folder: 'concepts', filename: 'x', title: '   ' }).ok).toBe(false);
  });
  it('rejects bad filenames (uppercase, leading hyphen, slash, dotted)', () => {
    expect(validateSaveInput({ folder: 'concepts', filename: 'Bad', title: 'T' }).ok).toBe(false);
    expect(validateSaveInput({ folder: 'concepts', filename: '-bad', title: 'T' }).ok).toBe(false);
    expect(validateSaveInput({ folder: 'concepts', filename: 'a/b', title: 'T' }).ok).toBe(false);
    expect(validateSaveInput({ folder: 'concepts', filename: 'a.md', title: 'T' }).ok).toBe(false);
  });
});

describe('saveErrorMessage', () => {
  it('maps github_not_configured to a setup hint', () => {
    expect(saveErrorMessage('github_not_configured')).toMatch(/GITHUB_WIKI_TOKEN/);
  });
  it('maps file_exists to a rename hint', () => {
    expect(saveErrorMessage('file_exists')).toMatch(/already exists/i);
  });
  it('passes other messages through unchanged', () => {
    expect(saveErrorMessage('github put 502')).toBe('github put 502');
  });
});
