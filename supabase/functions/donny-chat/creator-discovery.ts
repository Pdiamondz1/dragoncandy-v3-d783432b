// Pure creator-discovery scoring for Donny chat's match_creators tool.
// Imports only the pure _shared/geo.ts helpers, so it runs under Vitest and bundles into Deno.
import { resolveCoords, distanceToScore, haversineDistance, lookupCityCoords } from "../_shared/geo.ts";

type Coords = { lat: number; lng: number };

export interface DiscoveryCreator {
  city: string | null;
  country: string | null;
  location: string | null;
  bio: string | null;
  skills: string[] | null;
  average_rating: number | null;
}

// Resolve a search center: explicit place string (assume US) first, else the caller's business location.
export function resolveSearchCenter(
  locationArg: string | null,
  owner: { city: string | null; country: string | null; location: string | null } | null,
): Coords | null {
  if (locationArg && locationArg.trim()) {
    const trimmed = locationArg.trim();
    // Geo table has state-qualified keys ("portland me" vs bare "portland"=Portland OR).
    // Try the full "City ST" form first, then fall back to the city-only part.
    const full = trimmed.replace(/,/g, " ").replace(/\s+/g, " ").trim();
    const fullHit = lookupCityCoords(full, "US");
    if (fullHit) return fullHit;
    const city = trimmed.split(",")[0].trim();
    const cityHit = lookupCityCoords(city, "US");
    if (cityHit) return cityHit;
  }
  if (owner) {
    const c = resolveCoords(owner.city, owner.country, owner.location);
    if (c) return c;
  }
  return null;
}

// Soft niche score 0..100: keyword(s) present in bio+skills -> boost; no niche -> neutral 60; never 0-excludes.
export function scoreNiche(
  niche: string | null | undefined,
  creator: { bio: string | null; skills: string[] | null },
): number {
  if (!niche || !niche.trim()) return 60;
  const words = niche.toLowerCase().split(/[\s,]+/).filter((w) => w.length >= 2);
  if (words.length === 0) return 60;
  const haystack = [
    (creator.bio ?? "").toLowerCase(),
    (creator.skills ?? []).join(" ").toLowerCase().replace(/[_-]/g, " "),
  ].join(" ");
  const hits = words.filter((w) => haystack.includes(w)).length;
  if (hits === 0) return 40;
  return Math.round(40 + (hits / words.length) * 60);
}

// Soft location score + distance. center+creatorCoords -> distanceToScore(haversine);
// else explicit-arg substring match on creator city/location -> 80; else neutral. Never excludes.
export function scoreCreatorLocation(
  center: Coords | null,
  locationArg: string | null,
  creator: { city: string | null; country: string | null; location: string | null },
): { score: number; distanceMiles: number | null } {
  if (center) {
    const coords = resolveCoords(creator.city, creator.country, creator.location);
    if (coords) {
      const d = haversineDistance(center.lat, center.lng, coords.lat, coords.lng);
      return { score: distanceToScore(d), distanceMiles: d };
    }
  }
  if (locationArg && locationArg.trim()) {
    const needle = locationArg.split(",")[0].trim().toLowerCase();
    const hay = `${creator.city ?? ""} ${creator.location ?? ""}`.toLowerCase();
    if (needle && hay.includes(needle)) return { score: 80, distanceMiles: null };
    return { score: 45, distanceMiles: null };
  }
  return { score: 50, distanceMiles: null };
}

// Combined rank (location 0.4 + niche 0.4 + rating 0.2), sorted desc; never drops a creator.
export function rankCreators<T extends DiscoveryCreator>(
  creators: T[],
  opts: { center: Coords | null; locationArg: string | null; niche: string | null | undefined },
): Array<T & { score: number; distanceMiles: number | null }> {
  return creators
    .map((c) => {
      const loc = scoreCreatorLocation(opts.center, opts.locationArg, c);
      const nicheScore = scoreNiche(opts.niche, c);
      const rating = ((c.average_rating ?? 0) / 5) * 100;
      const score = Math.round(loc.score * 0.4 + nicheScore * 0.4 + rating * 0.2);
      return { ...c, score, distanceMiles: loc.distanceMiles };
    })
    .sort((a, b) => b.score - a.score);
}
