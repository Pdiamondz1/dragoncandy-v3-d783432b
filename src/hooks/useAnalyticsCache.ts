
import { useState, useEffect } from 'react';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiry: number;
}

class AnalyticsCache {
  private cache = new Map<string, CacheEntry<any>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

  set<T>(key: string, data: T, ttl = this.DEFAULT_TTL): void {
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiry: Date.now() + ttl
    };
    this.cache.set(key, entry);
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }

  clear(): void {
    this.cache.clear();
  }

  clearExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
      }
    }
  }
}

const analyticsCache = new AnalyticsCache();

export const useAnalyticsCache = () => {
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    // Clear expired cache entries every minute
    const interval = setInterval(() => {
      analyticsCache.clearExpired();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const getCachedData = async <T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number
  ): Promise<T> => {
    // Try to get from cache first
    const cached = analyticsCache.get<T>(key);
    if (cached) {
      return cached;
    }

    // Fetch fresh data
    const data = await fetcher();
    analyticsCache.set(key, data, ttl);
    return data;
  };

  const invalidateCache = (pattern?: string) => {
    setIsClearing(true);
    if (pattern) {
      // Clear specific pattern - for now just clear all since we don't have pattern matching
      analyticsCache.clear();
    } else {
      analyticsCache.clear();
    }
    setIsClearing(false);
  };

  return {
    getCachedData,
    invalidateCache,
    isClearing
  };
};
