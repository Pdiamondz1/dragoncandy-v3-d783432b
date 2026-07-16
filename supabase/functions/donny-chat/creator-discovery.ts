// Pure creator-discovery scoring for Donny chat's match_creators tool.
// Imports only the pure _shared/geo.ts helpers, so it runs under Vitest and bundles into Deno.
import { resolveCoords, distanceToScore, haversineDistance, lookupCityCoords } from "../_shared/geo.ts";

type Coords = { lat: number; lng: number };

const US_STATE_ABBR: Record<string, string> = {
  alabama: "al", alaska: "ak", arizona: "az", arkansas: "ar", california: "ca",
  colorado: "co", connecticut: "ct", delaware: "de", florida: "fl", georgia: "ga",
  hawaii: "hi", idaho: "id", illinois: "il", indiana: "in", iowa: "ia",
  kansas: "ks", kentucky: "ky", louisiana: "la", maine: "me", maryland: "md",
  massachusetts: "ma", michigan: "mi", minnesota: "mn", mississippi: "ms", missouri: "mo",
  montana: "mt", nebraska: "ne", nevada: "nv", "new hampshire": "nh", "new jersey": "nj",
  "new mexico": "nm", "new york": "ny", "north carolina": "nc", "north dakota": "nd", ohio: "oh",
  oklahoma: "ok", oregon: "or", pennsylvania: "pa", "rhode island": "ri", "south carolina": "sc",
  "south dakota": "sd", tennessee: "tn", texas: "tx", utah: "ut", vermont: "vt",
  virginia: "va", washington: "wa", "west virginia": "wv", wisconsin: "wi", wyoming: "wy",
  "district of columbia": "dc",
};

// Build a "city st" lookup key from a comma-qualified place ("Portland, ME" or "Portland, Maine"
// -> "portland me"). Returns null when there is no comma qualifier to use.
function stateQualifiedKey(place: string): string | null {
  const parts = place.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const city = parts[0].toLowerCase();
  const rawState = parts[1].toLowerCase();
  const state = US_STATE_ABBR[rawState] ?? rawState; // full name -> abbrev; else assume already an abbrev
  return `${city} ${state}`;
}

// Resolve coords for a place given structured city/country and/or a freeform location string.
// Precedence: state-qualified freeform ("Portland, ME") > structured city+country > bare-city-from-freeform.
function resolvePlace(city: string | null, country: string | null, location: string | null): Coords | null {
  // 1) state-qualified freeform location (most specific — beats an ambiguous bare city like "Portland").
  if (location) {
    const sq = stateQualifiedKey(location);
    if (sq) {
      const hit = lookupCityCoords(sq, "US");
      if (hit) return hit;
    }
  }
  // 2) structured city + country (and resolveCoords' own "City, Country" freeform parse).
  const structured = resolveCoords(city, country, location);
  if (structured) return structured;
  // 3) legacy freeform "City, ST" — take the bare city (first comma part) and assume US.
  if (location) {
    const cityHit = lookupCityCoords(location.split(",")[0].trim(), "US");
    if (cityHit) return cityHit;
  }
  return null;
}

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
    const hit = resolvePlace(null, null, locationArg.trim());
    if (hit) return hit;
  }
  if (owner) {
    const hit = resolvePlace(owner.city, owner.country, owner.location);
    if (hit) return hit;
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
  const hayTokens = new Set(
    [
      (creator.bio ?? "").toLowerCase(),
      (creator.skills ?? []).join(" ").toLowerCase().replace(/[_-]/g, " "),
    ]
      .join(" ")
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
  const hits = words.filter((w) => hayTokens.has(w)).length;
  if (hits === 0) return 40;
  return Math.round(40 + (hits / words.length) * 60);
}

// Resolve a creator's coords, preferring a state-qualified freeform location ("Portland, ME, US")
// over the bare city (an ambiguous "Portland" defaults to Portland OR in the static table).
function resolveCreatorCoords(creator: { city: string | null; country: string | null; location: string | null }): Coords | null {
  return resolvePlace(creator.city, creator.country, creator.location);
}

// Soft location score + distance. center+creatorCoords -> distanceToScore(haversine);
// else explicit-arg substring match on creator city/location -> 80; else neutral. Never excludes.
export function scoreCreatorLocation(
  center: Coords | null,
  locationArg: string | null,
  creator: { city: string | null; country: string | null; location: string | null },
): { score: number; distanceMiles: number | null } {
  if (center) {
    const coords = resolveCreatorCoords(creator);
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
