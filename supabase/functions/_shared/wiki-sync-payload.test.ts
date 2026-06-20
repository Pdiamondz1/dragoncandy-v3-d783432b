// supabase/functions/_shared/wiki-sync-payload.test.ts
import { describe, it, expect } from 'vitest';
import { parseFrontmatter, buildSyncPage } from './wiki-sync-payload';

const RAW = `---
title: Pricing Ladder
type: analysis
tags: [pricing, strategy]
---
# Pricing Ladder

Body line one.`;

describe('parseFrontmatter', () => {
  it('splits frontmatter keys from body', () => {
    const { fm, body } = parseFrontmatter(RAW);
    expect(fm.title).toBe('Pricing Ladder');
    expect(fm.type).toBe('analysis');
    expect(body.startsWith('# Pricing Ladder')).toBe(true);
  });
  it('handles a file with no frontmatter', () => {
    const { fm, body } = parseFrontmatter('# Bare\n\ntext');
    expect(fm).toEqual({});
    expect(body).toBe('# Bare\n\ntext');
  });
});

describe('buildSyncPage', () => {
  it('builds the canonical donny-knowledge-sync page for a wiki path', () => {
    const page = buildSyncPage('docs/wiki/analyses/pricing-ladder.md', RAW);
    expect(page.source_id).toBe('internal-analyses:pricing-ladder');
    expect(page.scope).toBe('internal');
    expect(page.full_content).toBe(RAW);              // FULL raw markdown, not a boolean
    expect(page.metadata.path).toBe('docs/wiki/analyses/pricing-ladder.md');
    expect(page.metadata.title).toBe('Pricing Ladder');
    expect(page.metadata.type).toBe('analysis');
    expect(page.content.startsWith('Pricing Ladder\n\n')).toBe(true); // `${title}\n\n${body}`
    expect(page.content.length).toBeLessThanOrEqual(24_000);
  });
  it('falls back to slug for title and internal_doc for type when frontmatter is absent', () => {
    const page = buildSyncPage('docs/wiki/concepts/auth-model.md', '# Auth\n\nx');
    expect(page.source_id).toBe('internal-concepts:auth-model');
    expect(page.metadata.title).toBe('auth-model');
    expect(page.metadata.type).toBe('internal_doc');
  });
});
