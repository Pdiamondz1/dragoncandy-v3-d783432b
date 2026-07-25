import { describe, it, expect } from "vitest";
import { US_LOCATIONS, locationAt, type UsLocation } from "./locations";

describe("US_LOCATIONS pool", () => {
  it("has exactly 24 regionally-diverse entries", () => {
    expect(US_LOCATIONS).toHaveLength(24);
  });

  it("every entry has city/state/location/postalCode/timezone/lat/lng populated", () => {
    for (const loc of US_LOCATIONS) {
      expect(typeof loc.city).toBe("string");
      expect(loc.city.length).toBeGreaterThan(0);
      expect(typeof loc.state).toBe("string");
      expect(loc.state).toHaveLength(2);
      expect(loc.location).toBe(`${loc.city}, ${loc.state}`);
      expect(typeof loc.postalCode).toBe("string");
      expect(loc.postalCode).toMatch(/^\d{5}$/);
      expect(typeof loc.timezone).toBe("string");
      expect(loc.timezone.startsWith("America/")).toBe(true);
      expect(typeof loc.lat).toBe("number");
      expect(typeof loc.lng).toBe("number");
    }
  });

  it("every location is unique (no duplicate cities)", () => {
    const cities = new Set(US_LOCATIONS.map((l) => l.location));
    expect(cities.size).toBe(US_LOCATIONS.length);
  });

  it("first entry is New York, NY (verbatim transcription check)", () => {
    const nyc: UsLocation = US_LOCATIONS[0];
    expect(nyc).toEqual({
      city: "New York", state: "NY", location: "New York, NY", postalCode: "10001",
      timezone: "America/New_York", lat: 40.7128, lng: -74.0060,
    });
  });
});

describe("locationAt", () => {
  it("returns the location at the given index for in-range indices", () => {
    expect(locationAt(0)).toBe(US_LOCATIONS[0]);
    expect(locationAt(23)).toBe(US_LOCATIONS[23]);
  });

  it("wraps by modulo for out-of-range indices", () => {
    expect(locationAt(24)).toBe(US_LOCATIONS[0]);
    expect(locationAt(25)).toBe(US_LOCATIONS[1]);
    expect(locationAt(48)).toBe(US_LOCATIONS[0]);
  });

  it("is deterministic — repeated calls at the same index yield the same location", () => {
    expect(locationAt(5)).toBe(locationAt(5));
    expect(locationAt(100)).toBe(locationAt(100));
  });
});
