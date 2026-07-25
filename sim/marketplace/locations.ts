// US-diverse location pool for Task 12 (full, US-diverse synthetic profiles). 24 regionally-spread
// cities feed BOTH a profile's location fields and (for a business) its primary org_unit geo, so a
// bot's address is consistent across business_profiles/creator_profiles and org_units. Deterministic:
// locationAt wraps by modulo, so any cohort size maps onto the pool evenly and reproducibly.
export interface UsLocation {
  city: string;
  state: string;
  location: string;
  postalCode: string;
  timezone: string;
  lat: number;
  lng: number;
}

export const US_LOCATIONS: readonly UsLocation[] = [
  { city: "New York", state: "NY", location: "New York, NY", postalCode: "10001", timezone: "America/New_York", lat: 40.7128, lng: -74.0060 },
  { city: "Los Angeles", state: "CA", location: "Los Angeles, CA", postalCode: "90012", timezone: "America/Los_Angeles", lat: 34.0522, lng: -118.2437 },
  { city: "Chicago", state: "IL", location: "Chicago, IL", postalCode: "60601", timezone: "America/Chicago", lat: 41.8781, lng: -87.6298 },
  { city: "Houston", state: "TX", location: "Houston, TX", postalCode: "77002", timezone: "America/Chicago", lat: 29.7604, lng: -95.3698 },
  { city: "Phoenix", state: "AZ", location: "Phoenix, AZ", postalCode: "85004", timezone: "America/Phoenix", lat: 33.4484, lng: -112.0740 },
  { city: "Philadelphia", state: "PA", location: "Philadelphia, PA", postalCode: "19107", timezone: "America/New_York", lat: 39.9526, lng: -75.1652 },
  { city: "San Antonio", state: "TX", location: "San Antonio, TX", postalCode: "78205", timezone: "America/Chicago", lat: 29.4241, lng: -98.4936 },
  { city: "San Diego", state: "CA", location: "San Diego, CA", postalCode: "92101", timezone: "America/Los_Angeles", lat: 32.7157, lng: -117.1611 },
  { city: "Dallas", state: "TX", location: "Dallas, TX", postalCode: "75201", timezone: "America/Chicago", lat: 32.7767, lng: -96.7970 },
  { city: "Austin", state: "TX", location: "Austin, TX", postalCode: "78701", timezone: "America/Chicago", lat: 30.2672, lng: -97.7431 },
  { city: "Miami", state: "FL", location: "Miami, FL", postalCode: "33130", timezone: "America/New_York", lat: 25.7617, lng: -80.1918 },
  { city: "Seattle", state: "WA", location: "Seattle, WA", postalCode: "98101", timezone: "America/Los_Angeles", lat: 47.6062, lng: -122.3321 },
  { city: "Denver", state: "CO", location: "Denver, CO", postalCode: "80202", timezone: "America/Denver", lat: 39.7392, lng: -104.9903 },
  { city: "Atlanta", state: "GA", location: "Atlanta, GA", postalCode: "30303", timezone: "America/New_York", lat: 33.7490, lng: -84.3880 },
  { city: "Nashville", state: "TN", location: "Nashville, TN", postalCode: "37203", timezone: "America/Chicago", lat: 36.1627, lng: -86.7816 },
  { city: "Portland", state: "OR", location: "Portland, OR", postalCode: "97205", timezone: "America/Los_Angeles", lat: 45.5152, lng: -122.6784 },
  { city: "Boston", state: "MA", location: "Boston, MA", postalCode: "02108", timezone: "America/New_York", lat: 42.3601, lng: -71.0589 },
  { city: "Minneapolis", state: "MN", location: "Minneapolis, MN", postalCode: "55401", timezone: "America/Chicago", lat: 44.9778, lng: -93.2650 },
  { city: "New Orleans", state: "LA", location: "New Orleans, LA", postalCode: "70112", timezone: "America/Chicago", lat: 29.9511, lng: -90.0715 },
  { city: "Las Vegas", state: "NV", location: "Las Vegas, NV", postalCode: "89101", timezone: "America/Los_Angeles", lat: 36.1699, lng: -115.1398 },
  { city: "Charlotte", state: "NC", location: "Charlotte, NC", postalCode: "28202", timezone: "America/New_York", lat: 35.2271, lng: -80.8431 },
  { city: "Detroit", state: "MI", location: "Detroit, MI", postalCode: "48226", timezone: "America/Detroit", lat: 42.3314, lng: -83.0458 },
  { city: "Kansas City", state: "MO", location: "Kansas City, MO", postalCode: "64106", timezone: "America/Chicago", lat: 39.0997, lng: -94.5786 },
  { city: "Salt Lake City", state: "UT", location: "Salt Lake City, UT", postalCode: "84101", timezone: "America/Denver", lat: 40.7608, lng: -111.8910 },
];

/** Wraps by modulo — any cohort index maps onto the 24-entry pool evenly and deterministically. */
export function locationAt(i: number): UsLocation {
  return US_LOCATIONS[i % US_LOCATIONS.length];
}
