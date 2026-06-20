// supabase/functions/_shared/drive-export.test.ts
import { describe, it, expect } from 'vitest';
import { pickExportMode, capText, EXPORT_CAP } from './drive-export';

describe('pickExportMode', () => {
  it('exports Google Docs as markdown', () => {
    expect(pickExportMode('application/vnd.google-apps.document'))
      .toEqual({ mode: 'export', exportMime: 'text/markdown' });
  });
  it('exports Google Sheets as CSV', () => {
    expect(pickExportMode('application/vnd.google-apps.spreadsheet'))
      .toEqual({ mode: 'export', exportMime: 'text/csv' });
  });
  it('reads plain text/markdown uploads via media', () => {
    expect(pickExportMode('text/markdown')).toEqual({ mode: 'media' });
    expect(pickExportMode('text/plain')).toEqual({ mode: 'media' });
  });
  it('marks Slides and binary as unsupported', () => {
    expect(pickExportMode('application/vnd.google-apps.presentation')).toEqual({ mode: 'unsupported' });
    expect(pickExportMode('image/png')).toEqual({ mode: 'unsupported' });
    expect(pickExportMode('application/pdf')).toEqual({ mode: 'unsupported' });
  });
});

describe('capText', () => {
  it('passes short text through untruncated', () => {
    expect(capText('hello')).toEqual({ text: 'hello', truncated: false });
  });
  it('truncates text over the cap and flags it', () => {
    const big = 'x'.repeat(EXPORT_CAP + 10);
    const out = capText(big);
    expect(out.truncated).toBe(true);
    expect(out.text.length).toBe(EXPORT_CAP);
  });
});
