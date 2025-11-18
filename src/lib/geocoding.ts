interface GeocodingResult {
  lat: number;
  lng: number;
  address: string;
}

interface GeocodingCache {
  [key: string]: GeocodingResult;
}

const GEOCODING_CACHE_KEY = 'creator_geocoding_cache';
const CACHE_EXPIRY_DAYS = 7;

export class GeocodingService {
  private cache: GeocodingCache;

  constructor() {
    this.cache = this.loadCache();
    try {
      const count = Object.keys(this.cache).length;
      console.log('[Geocoding] Service initialized. Cache entries:', count);
    } catch {}
  }

  private loadCache(): GeocodingCache {
    try {
      const cached = localStorage.getItem(GEOCODING_CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const isExpired = Date.now() - timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        if (!isExpired) return data;
      }
    } catch (e) {
      console.error('Failed to load geocoding cache:', e);
    }
    return {};
  }

  private saveCache() {
    try {
      localStorage.setItem(GEOCODING_CACHE_KEY, JSON.stringify({
        data: this.cache,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to save geocoding cache:', e);
    }
  }

  private getCacheKey(postal_code?: string, city?: string, country?: string): string {
    return [postal_code, city, country].filter(Boolean).join('|');
  }

  async geocodeLocation(
    postal_code?: string,
    city?: string,
    country?: string
  ): Promise<GeocodingResult | null> {
    const cacheKey = this.getCacheKey(postal_code, city, country);
    
    if (this.cache[cacheKey]) {
      console.log('[Geocoding] Cache hit', { cacheKey, address: this.cache[cacheKey].address });
      return this.cache[cacheKey];
    }

    const queryParts = [];
    if (postal_code) queryParts.push(postal_code);
    if (city) queryParts.push(city);
    if (country) queryParts.push(country);
    
    if (queryParts.length === 0) return null;
    
    const query = queryParts.join(', ');

    try {
      const { GOOGLE_MAPS_API_KEY } = await import('./googleMapsConfig');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_API_KEY}`;
      const maskedUrl = url.replace(GOOGLE_MAPS_API_KEY, '***');
      console.log('[Geocoding] Fetching Google Geocode:', { query, url: maskedUrl });
      
      const response = await fetch(url);
      const data = await response.json();
      console.log('[Geocoding] Google response status:', data.status, 'results:', data.results?.length ?? 0);

      if (data.status !== 'OK') {
        console.warn('[Geocoding] Google status not OK', { status: data.status, error: data.error_message, query });
        return null;
      }

      if (data.results.length > 0) {
        const result = data.results[0];
        const geocodedResult: GeocodingResult = {
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng,
          address: result.formatted_address
        };
        console.log('[Geocoding] Google geocode success', { address: geocodedResult.address, lat: geocodedResult.lat, lng: geocodedResult.lng });

        this.cache[cacheKey] = geocodedResult;
        this.saveCache();
        console.log('[Geocoding] Cached result', { cacheKey });

        return geocodedResult;
      }

      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  async geocodeCreators(
    creators: Array<{
      id: string;
      postal_code?: string;
      city?: string;
      country?: string;
    }>
  ): Promise<Map<string, GeocodingResult>> {
    console.log('[Geocoding] Batch geocode start', { count: creators.length });
    const results = new Map<string, GeocodingResult>();

    for (const creator of creators) {
      console.log('[Geocoding] Geocoding creator', { id: creator.id, postal_code: creator.postal_code, city: creator.city, country: creator.country });
      const result = await this.geocodeLocation(
        creator.postal_code,
        creator.city,
        creator.country
      );
      
      if (result) {
        console.log('[Geocoding] Success for creator', { id: creator.id, lat: result.lat, lng: result.lng });
        results.set(creator.id, result);
      } else {
        console.warn('[Geocoding] No result for creator', { id: creator.id });
      }

      await new Promise(resolve => setTimeout(resolve, 25));
    }

    console.log('[Geocoding] Batch geocode complete', { results: results.size });
    return results;
  }
}

export const geocodingService = new GeocodingService();
