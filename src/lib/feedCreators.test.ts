import { describe, test, expect } from 'vitest';
import { feedCreatorsFromMedia, highlightMatch, filterCreatorsByRadius, type FeedCreator } from './feedCreators';
import type { PortfolioMedia } from '@/hooks/useUniqueCreatorPortfolio';

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };

const mk = (over: Partial<PortfolioMedia>): PortfolioMedia => ({
  id: 'm', url: 'u', type: 'image', creatorName: 'C', creatorSlug: '', creatorId: 'c', ...over,
});

describe('feedCreatorsFromMedia', () => {
  test('one entry per creatorId; postCount counts that creator\'s media', () => {
    const media = [
      mk({ id: 'a1', creatorId: 'A', creatorName: 'Anna' }),
      mk({ id: 'a2', creatorId: 'A', creatorName: 'Anna' }),
      mk({ id: 'b1', creatorId: 'B', creatorName: 'Bob' }),
    ];
    const out = feedCreatorsFromMedia(media);
    expect(out.map(c => c.creatorId)).toEqual(['A', 'B']);
    expect(out.find(c => c.creatorId === 'A')?.postCount).toBe(2);
    expect(out.find(c => c.creatorId === 'B')?.postCount).toBe(1);
  });

  test('carries name/slug/avatar/location/skills/rating/reviews from the first-seen item', () => {
    const media = [mk({
      creatorId: 'A', creatorName: 'Anna', creatorSlug: 'anna', avatarUrl: 'av',
      city: 'Hoboken', country: 'US', postalCode: '07030', location: 'Hoboken, US',
      skills: ['Food', 'Reels'], averageRating: 4.9, totalReviews: 23,
    })];
    const [c] = feedCreatorsFromMedia(media);
    expect(c).toMatchObject({
      creatorName: 'Anna', creatorSlug: 'anna', avatarUrl: 'av', city: 'Hoboken',
      country: 'US', postalCode: '07030', location: 'Hoboken, US',
      skills: ['Food', 'Reels'], averageRating: 4.9, totalReviews: 23, postCount: 1,
    });
  });

  test('missing skills/rating/reviews default to [] / null', () => {
    const [c] = feedCreatorsFromMedia([mk({ creatorId: 'A' })]);
    expect(c.skills).toEqual([]);
    expect(c.averageRating).toBeNull();
    expect(c.totalReviews).toBeNull();
  });

  test('empty input → []', () => {
    expect(feedCreatorsFromMedia([])).toEqual([]);
  });
});

describe('highlightMatch', () => {
  test('splits around the case-insensitive term, preserving original case in the matched span', () => {
    const segs = highlightMatch('Anna Banana', 'ann');
    expect(segs.map(s => s.text).join('')).toBe('Anna Banana');
    expect(segs.filter(s => s.match).map(s => s.text)).toEqual(['Ann']);
  });

  test('no term → one plain segment', () => {
    expect(highlightMatch('Anna', '')).toEqual([{ text: 'Anna', match: false }]);
    expect(highlightMatch('Anna', '   ')).toEqual([{ text: 'Anna', match: false }]);
  });

  test('no match → one plain segment', () => {
    expect(highlightMatch('Anna', 'xyz')).toEqual([{ text: 'Anna', match: false }]);
  });

  test('highlights every occurrence', () => {
    const segs = highlightMatch('aXa', 'a');
    expect(segs).toEqual([
      { text: 'a', match: true },
      { text: 'X', match: false },
      { text: 'a', match: true },
    ]);
  });
});

describe('filterCreatorsByRadius', () => {
  const base: Omit<FeedCreator, 'creatorId' | 'city' | 'country'> = {
    creatorName: 'C', creatorSlug: '', skills: [], averageRating: null, totalReviews: null, postCount: 1,
  };
  const near: FeedCreator = { ...base, creatorId: 'near', city: 'Nowhere', country: 'US' };
  const far: FeedCreator = { ...base, creatorId: 'far', city: 'Nowhere', country: 'US' };
  const lost: FeedCreator = { ...base, creatorId: 'lost' };
  const creators = [near, far, lost];
  const geocoded = new Map([['near', NYC], ['far', LA]]);

  test('no center → passthrough (never silent-empty)', () => {
    expect(filterCreatorsByRadius(creators, null, 25, geocoded)).toHaveLength(3);
  });

  test('finite radius keeps in-range creators, drops far and unplaceable ones', () => {
    const out = filterCreatorsByRadius(creators, NYC, 25, geocoded);
    expect(out.map(c => c.creatorId)).toEqual(['near']);
  });

  test('a larger radius includes the far creator', () => {
    const out = filterCreatorsByRadius(creators, NYC, 3000, geocoded);
    expect(out.map(c => c.creatorId).sort()).toEqual(['far', 'near']);
  });

  test('"Any" radius (null) with a center keeps all creators', () => {
    expect(filterCreatorsByRadius(creators, NYC, null, geocoded)).toHaveLength(3);
  });
});
