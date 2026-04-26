import { useState, useEffect } from 'react';

interface AutoDetectResult {
  timezone: string;
  city: string;
  country: string;
  loading: boolean;
}

export function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return '';
  }
}

export async function detectLocation(): Promise<{ city: string; country: string } | null> {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    return null;
  }

  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
    });

    const { latitude, longitude } = position.coords;
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
    );

    if (!response.ok) return null;

    const data = await response.json();
    return {
      city: data.city || data.locality || '',
      country: data.countryName || '',
    };
  } catch {
    return null;
  }
}

export function useAutoDetect(): AutoDetectResult {
  const [state, setState] = useState<AutoDetectResult>({
    timezone: detectTimezone(),
    city: '',
    country: '',
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    detectLocation().then(location => {
      if (cancelled) return;
      setState(prev => ({
        ...prev,
        city: location?.city ?? '',
        country: location?.country ?? '',
        loading: false,
      }));
    });

    return () => { cancelled = true; };
  }, []);

  return state;
}
