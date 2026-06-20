import { describe, it, expect } from 'vitest';
import { buildImportedPage } from './wiki-import-page';

describe('buildImportedPage', () => {
  const page = buildImportedPage({
    title: 'Q3 GTM Notes',
    folder: 'analyses',
    tags: ['gtm', 'sales'],
    markdown: '## Plan\n\nDo the thing.',
    fileId: '1AbcDEF_ghIJKlmnop',
    today: '2026-06-20',
  });
  it('writes frontmatter with type, sources=workspace, and tags', () => {
    expect(page).toContain('title: Q3 GTM Notes');
    expect(page).toContain('type: analysis');
    expect(page).toContain('sources: [workspace]');
    expect(page).toContain('tags: [gtm, sales]');
  });
  it('records provenance (Doc id + import date) and the body', () => {
    expect(page).toContain('1AbcDEF_ghIJKlmnop');
    expect(page).toContain('2026-06-20');
    expect(page).toContain('Do the thing.');
  });
  it('starts with an H1 of the title', () => {
    expect(page).toContain('\n# Q3 GTM Notes\n');
  });
});
