import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const SIGNED_URL_TTL = 3500;

export function useSignedUrl(
  bucket: string,
  path: string | null | undefined
): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!path) return undefined;
    const cached = signedUrlCache.get(`${bucket}/${path}`);
    if (cached && cached.expiresAt > Date.now()) return cached.url;
    return undefined;
  });

  useEffect(() => {
    if (!path) { setUrl(undefined); return; }

    const cacheKey = `${bucket}/${path}`;
    const cached = signedUrlCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      setUrl(cached.url);
      return;
    }

    let cancelled = false;
    supabase.storage
      .from(bucket)
      .createSignedUrl(path, SIGNED_URL_TTL)
      .then(({ data }) => {
        if (cancelled || !data?.signedUrl) return;
        signedUrlCache.set(cacheKey, {
          url: data.signedUrl,
          expiresAt: Date.now() + (SIGNED_URL_TTL - 60) * 1000,
        });
        setUrl(data.signedUrl);
      });

    return () => { cancelled = true; };
  }, [bucket, path]);

  return url;
}

export function useResolvedLogoUrl(
  logoUrl: string | null | undefined
): string | undefined {
  const isHttp = logoUrl?.startsWith('http');
  const signedUrl = useSignedUrl('profile-assets', isHttp ? null : logoUrl);
  return isHttp ? logoUrl : signedUrl;
}

export async function getSignedProfileUrl(
  path: string | null | undefined
): Promise<string | undefined> {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;

  const cacheKey = `profile-assets/${path}`;
  const cached = signedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const { data } = await supabase.storage
    .from('profile-assets')
    .createSignedUrl(path, SIGNED_URL_TTL);

  if (data?.signedUrl) {
    signedUrlCache.set(cacheKey, {
      url: data.signedUrl,
      expiresAt: Date.now() + (SIGNED_URL_TTL - 60) * 1000,
    });
    return data.signedUrl;
  }
  return undefined;
}

export function clearSignedUrlCache(): void {
  signedUrlCache.clear();
}
