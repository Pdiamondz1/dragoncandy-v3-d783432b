// Client-side ranked search for the help center. Pure + deterministic so it
// stays instant and type-ahead friendly for the (small) help_articles corpus.
// Deliberately NOT server-side full-text (search_vector) — see
// docs/superpowers/specs/2026-07-19-help-sidebar-and-search-design.md.

export interface HelpArticle {
  id: string;
  slug: string;
  title: string;
  body: string;
  category: string;
  roles: string[];
  search_terms: string[];
}

// Field weights: a token in the title matters most, then search terms, then body.
const TITLE_WEIGHT = 3;
const TERMS_WEIGHT = 2;
const BODY_WEIGHT = 1;
const WORD_BOUNDARY_BONUS = 1; // title hit that starts a word ranks above a mid-word hit

function startsWord(haystack: string, needle: string): boolean {
  const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${esc}`).test(haystack);
}

interface Searchable {
  title: string;
  terms: string;
  body: string;
}

// Precompute the lowercased searchable text once per article. The body is HTML
// (it can contain <img src="…help-screenshots/…png"> markup), so strip tags
// first — otherwise queries like "png" or "screenshots" would match the image
// URLs in every article that has a screenshot.
function toSearchable(article: HelpArticle): Searchable {
  return {
    title: (article.title ?? '').toLowerCase(),
    terms: (article.search_terms ?? []).join(' ').toLowerCase(),
    body: (article.body ?? '').replace(/<[^>]*>/g, ' ').toLowerCase(),
  };
}

/** Score one query token against one article's searchable text. 0 = not present (fails AND). */
function tokenScore(s: Searchable, token: string): number {
  let score = 0;
  if (s.title.includes(token)) {
    score = Math.max(score, TITLE_WEIGHT + (startsWord(s.title, token) ? WORD_BOUNDARY_BONUS : 0));
  }
  if (s.terms.includes(token)) score = Math.max(score, TERMS_WEIGHT);
  if (s.body.includes(token)) score = Math.max(score, BODY_WEIGHT);
  return score;
}

/**
 * Rank help articles for a search query.
 * - Empty/whitespace query → [] (caller shows the category tree instead).
 * - AND semantics: every whitespace-separated token must appear somewhere.
 * - Substring matching preserves partial/type-ahead ("camp" → campaign).
 * - Sorted by summed score desc, then title asc (stable, deterministic).
 */
export function rankHelpArticles(articles: HelpArticle[], query: string): HelpArticle[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const tokens = q.split(/\s+/).filter(Boolean);

  const scored: { article: HelpArticle; score: number }[] = [];
  for (const article of articles) {
    const searchable = toSearchable(article);
    let total = 0;
    let allMatch = true;
    for (const token of tokens) {
      const s = tokenScore(searchable, token);
      if (s === 0) {
        allMatch = false;
        break;
      }
      total += s;
    }
    if (allMatch && total > 0) scored.push({ article, score: total });
  }

  scored.sort((a, b) => b.score - a.score || a.article.title.localeCompare(b.article.title));
  return scored.map((s) => s.article);
}
