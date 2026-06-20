import { describe, it, expect } from 'vitest';
import { deriveImportDefaults, validateImportInput, isImportable } from './wikiImport';

describe('deriveImportDefaults', () => {
  it('kebab-cases the filename and defaults the folder to analyses', () => {
    const d = deriveImportDefaults('Q3 GTM Notes.docx');
    expect(d.filename).toBe('q3-gtm-notes');
    expect(d.folder).toBe('analyses');
    expect(d.title).toBe('Q3 GTM Notes.docx');
  });
});

describe('validateImportInput', () => {
  it('requires a non-empty kebab filename and a title', () => {
    expect(validateImportInput({ folder: 'analyses', filename: 'a-b', title: 'T' }).ok).toBe(true);
    expect(validateImportInput({ folder: 'analyses', filename: '', title: 'T' }).ok).toBe(false);
    expect(validateImportInput({ folder: 'analyses', filename: 'a', title: '' }).ok).toBe(false);
  });
});

describe('isImportable', () => {
  it('allows Google Docs, Sheets, and text; rejects slides + binary', () => {
    expect(isImportable('application/vnd.google-apps.document')).toBe(true);
    expect(isImportable('application/vnd.google-apps.spreadsheet')).toBe(true);
    expect(isImportable('text/markdown')).toBe(true);
    expect(isImportable('application/vnd.google-apps.presentation')).toBe(false);
    expect(isImportable('image/png')).toBe(false);
  });
});
