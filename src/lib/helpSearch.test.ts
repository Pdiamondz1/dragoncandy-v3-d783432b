import { describe, it, expect } from 'vitest';
import { rankHelpArticles, type HelpArticle } from './helpSearch';

const make = (over: Partial<HelpArticle> & { slug: string }): HelpArticle => ({
  id: over.slug,
  title: '',
  body: '',
  category: 'getting_started',
  roles: ['restaurant'],
  search_terms: [],
  ...over,
});

describe('rankHelpArticles', () => {
  const articles: HelpArticle[] = [
    make({ slug: 'launch', title: 'How to launch a campaign', body: 'Publish your campaign to creators.', search_terms: ['create', 'publish'] }),
    make({ slug: 'crews', title: 'Creator crews & private campaigns', body: 'A crew is a private roster.', search_terms: ['group', 'roster'] }),
    make({ slug: 'pay', title: 'When do creators get paid?', body: 'Payouts arrive after a campaign completes.', search_terms: ['payment', 'earnings'] }),
  ];

  it('returns [] for an empty or whitespace query', () => {
    expect(rankHelpArticles(articles, '')).toEqual([]);
    expect(rankHelpArticles(articles, '   ')).toEqual([]);
  });

  it('ranks a title match above a body-only match', () => {
    // "campaign" is in launch's title + body, crews' title, and pay's body.
    const res = rankHelpArticles(articles, 'campaign');
    expect(res.map((a) => a.slug)).toContain('launch');
    expect(res.map((a) => a.slug)).toContain('crews');
    // 'pay' has "campaign" only in the body → ranks last of the three
    expect(res[res.length - 1].slug).toBe('pay');
  });

  it('matches partial / prefix words as you type', () => {
    const res = rankHelpArticles(articles, 'camp');
    expect(res.map((a) => a.slug).sort()).toEqual(['crews', 'launch', 'pay']);
  });

  it('applies AND semantics across tokens', () => {
    // only crews has both "crew" and "private"
    const res = rankHelpArticles(articles, 'crew private');
    expect(res.map((a) => a.slug)).toEqual(['crews']);
  });

  it('matches against search_terms', () => {
    const res = rankHelpArticles(articles, 'payment');
    expect(res.map((a) => a.slug)).toEqual(['pay']);
  });

  it('returns [] when nothing matches', () => {
    expect(rankHelpArticles(articles, 'zzzznotfound')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(rankHelpArticles(articles, 'CAMPAIGN').map((a) => a.slug)).toContain('launch');
  });

  it('tolerates missing body / search_terms without throwing', () => {
    const sparse = [
      make({ slug: 'sparse', title: 'Sparse article', body: undefined as unknown as string, search_terms: undefined as unknown as string[] }),
    ];
    expect(() => rankHelpArticles(sparse, 'sparse')).not.toThrow();
    expect(rankHelpArticles(sparse, 'sparse').map((a) => a.slug)).toEqual(['sparse']);
  });

  it('does not match against HTML markup in the body (e.g. image URLs)', () => {
    const withImg = [
      make({
        slug: 'imgd',
        title: 'Some feature',
        body: '<p>Intro text.</p>\n<img src="https://x.supabase.co/storage/v1/object/public/help-screenshots/help-launch-campaign.png" alt="a screenshot" />',
      }),
    ];
    // "png" and "screenshots" live only in the <img> markup → must NOT match
    expect(rankHelpArticles(withImg, 'png')).toEqual([]);
    expect(rankHelpArticles(withImg, 'screenshots')).toEqual([]);
    // visible text still matches
    expect(rankHelpArticles(withImg, 'intro').map((a) => a.slug)).toEqual(['imgd']);
  });

  it('breaks score ties by title ascending (deterministic)', () => {
    const tie: HelpArticle[] = [
      make({ slug: 'b', title: 'Beta widget' }),
      make({ slug: 'a', title: 'Alpha widget' }),
    ];
    // both match "widget" only in the title with the same score → alphabetical by title
    expect(rankHelpArticles(tie, 'widget').map((a) => a.title)).toEqual(['Alpha widget', 'Beta widget']);
  });
});
