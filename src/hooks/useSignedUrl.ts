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

export function useResolvedStorageUrl(
  path: string | null | undefined
): string | undefined {
  if (!path) return undefined;
  if (path.startsWith('http')) return path;
  const { data } = supabase.storage.from('profile-assets').getPublicUrl(path);
  return data?.publicUrl;
}

export const useResolvedAvatarUrl = useResolvedStorageUrl;
export const useResolvedLogoUrl = useResolvedStorageUrl;

export async function getSignedProfileUrl(
  path: string | null | undefined
): Promise<string | undefined> {
  if (!path) return undefined;
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  const { data } = supabase.storage.from('profile-assets').getPublicUrl(path);
  return data?.publicUrl;
}

export function clearSignedUrlCache(): void {
  signedUrlCache.clear();
}
