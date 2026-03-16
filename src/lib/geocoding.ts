interface GeocodingResult {
  lat: number;
  lng: number;
  address: string;
}

interface GeocodingCache {
  [key: string]: GeocodingResult;
}

interface PostalLookupResult {
  city: string;
  country: string;
  lat: number;
  lng: number;
}

interface PostalLookupCache {
  [key: string]: PostalLookupResult;
}

const GEOCODING_CACHE_KEY = 'creator_geocoding_cache';
const CACHE_EXPIRY_DAYS = 7;

export class GeocodingService {
  private cache: GeocodingCache;
  private postalCache: PostalLookupCache;

  constructor() {
    this.cache = this.loadCache();
    this.postalCache = this.loadPostalCache();
    try {
      const count = Object.keys(this.cache).length;
      const postalCount = Object.keys(this.postalCache).length;
      console.log('[Geocoding] Service initialized. Cache entries:', count, 'Postal cache:', postalCount);
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

  private loadPostalCache(): PostalLookupCache {
    try {
      const cached = localStorage.getItem('postal_geocoding_cache');
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const isExpired = Date.now() - timestamp > CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        if (!isExpired) return data;
      }
    } catch (e) {
      console.error('Failed to load postal geocoding cache:', e);
    }
    return {};
  }

  private savePostalCache() {
    try {
      localStorage.setItem('postal_geocoding_cache', JSON.stringify({
        data: this.postalCache,
        timestamp: Date.now()
      }));
    } catch (e) {
      console.error('Failed to save postal geocoding cache:', e);
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

  async lookupPostalCode(postalCode: string): Promise<{ city: string; country: string } | null> {
    if (!postalCode || postalCode.trim().length < 3) return null;

    const cacheKey = postalCode.trim().toLowerCase();
    
    // Check postal-specific cache
    if (this.postalCache[cacheKey]) {
      console.log('[Geocoding] Postal lookup cache hit', { postalCode });
      const cached = this.postalCache[cacheKey];
      return { city: cached.city, country: cached.country };
    }

    try {
      const { GOOGLE_MAPS_API_KEY } = await import('./googleMapsConfig');
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(postalCode)}&key=${GOOGLE_MAPS_API_KEY}`;
      console.log('[Geocoding] Looking up postal code:', postalCode);
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.status !== 'OK' || !data.results?.[0]) {
        console.warn('[Geocoding] Postal lookup failed', { status: data.status, postalCode });
        return null;
      }

      const result = data.results[0];
      let city = '';
      let country = '';

      // Extract city and country from address_components
      result.address_components.forEach((component: any) => {
        if (component.types.includes('locality')) {
          city = component.long_name;
        } else if (component.types.includes('administrative_area_level_1') && !city) {
          city = component.long_name;
        }
        if (component.types.includes('country')) {
          country = component.long_name;
        }
      });

      if (city && country) {
        // Cache the result in postal-specific cache
        const postalResult: PostalLookupResult = {
          city,
          country,
          lat: result.geometry.location.lat,
          lng: result.geometry.location.lng
        };
        this.postalCache[cacheKey] = postalResult;
        this.savePostalCache();
        
        console.log('[Geocoding] Postal lookup success', { postalCode, city, country });
        return { city, country };
      }

      return null;
    } catch (error) {
      console.error('Postal code lookup error:', error);
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
