import { filterByRadius, type LatLng } from './creatorLocationFilter';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

/** A creator surfaced in the Dragon Feed search list (one per creatorId, with a post count). */
export interface FeedCreator {
  creatorId: string;
  creatorName: string;
  creatorSlug: string;
  avatarUrl?: string;
  city?: string;
  country?: string;
  postalCode?: string;
  location?: string;
  skills: string[];
  averageRating: number | null;
  totalReviews: number | null;
  postCount: number;
}

/**
 * Group the feed's media into a creator list. One entry per creatorId; `postCount` counts that
 * creator's media items. Per-creator fields are taken from the first-seen media item. Stable order
 * = first-seen (the feed's shuffle order). No sort in v1.
 */
export function feedCreatorsFromMedia(media: PortfolioMedia[]): FeedCreator[] {
  const map = new Map<string, FeedCreator>();
  for (const m of media) {
    const existing = map.get(m.creatorId);
    if (existing) {
      existing.postCount += 1;
      continue;
    }
    map.set(m.creatorId, {
      creatorId: m.creatorId,
      creatorName: m.creatorName,
      creatorSlug: m.creatorSlug,
      avatarUrl: m.avatarUrl,
      city: m.city,
      country: m.country,
      postalCode: m.postalCode,
      location: m.location,
      skills: m.skills ?? [],
      averageRating: m.averageRating ?? null,
      totalReviews: m.totalReviews ?? null,
      postCount: 1,
    });
  }
  return [...map.values()];
}

export interface HighlightSegment {
  text: string;
  match: boolean;
}

/**
 * Split `name` into segments around every case-insensitive occurrence of `term`, preserving the
 * original casing of the matched spans. No term (trimmed empty) or no match → a single plain
 * segment. Lets the creator row bold the matched letters (Instagram-style).
 */
export function highlightMatch(name: string, term: string): HighlightSegment[] {
  const needle = term.trim().toLowerCase();
  if (!needle) return [{ text: name, match: false }];
  const hay = name.toLowerCase();
  const segments: HighlightSegment[] = [];
  let i = 0;
  while (i < name.length) {
    const found = hay.indexOf(needle, i);
    if (found === -1) {
      segments.push({ text: name.slice(i), match: false });
      break;
    }
    if (found > i) segments.push({ text: name.slice(i, found), match: false });
    segments.push({ text: name.slice(found, found + needle.length), match: true });
    i = found + needle.length;
  }
  if (segments.length === 0) return [{ text: name, match: false }];
  return segments;
}

/**
 * Narrow a creator list to those within `radiusMiles` of `center`, reusing the tested per-creator
 * `filterByRadius`. Explicitly remaps each FeedCreator to the `{ id, city, country }` shape
 * `filterByRadius` expects (not a bare cast). `!center` → passthrough (the list never silent-empties
 * while a location is unresolved). Under "Any" (radiusMiles null) everyone is kept.
 */
export function filterCreatorsByRadius(
  creators: FeedCreator[],
  center: LatLng | null,
  radiusMiles: number | null,
  geocodedById: Map<string, LatLng>,
): FeedCreator[] {
  if (!center) return creators;
  const remapped = creators.map(c => ({ id: c.creatorId, city: c.city, country: c.country }));
  const { list } = filterByRadius(remapped, center, radiusMiles, geocodedById);
  const survivors = new Set(list.map(c => c.id));
  return creators.filter(c => survivors.has(c.creatorId));
}
