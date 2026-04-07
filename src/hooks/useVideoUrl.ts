import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useVideoUrl = (videoUrl: string | null) => {
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!videoUrl) {
      setResolvedUrl(null);
      return;
    }

    // The promotion-videos bucket is public, so we use getPublicUrl
    // instead of createSignedUrl (which may fail on public buckets).
    const bucketName = 'promotion-videos';

    // If the URL already contains the bucket path, extract the file path
    if (videoUrl.includes(bucketName)) {
      const parts = videoUrl.split(`${bucketName}/`);
      const filePath = parts[parts.length - 1].split('?')[0];
      const { data } = supabase.storage
        .from(bucketName)
        .getPublicUrl(filePath);
      setResolvedUrl(data.publicUrl);
    } else {
      // Already a usable URL or a bare file path
      setResolvedUrl(videoUrl);
    }
  }, [videoUrl]);

  return { resolvedUrl, isLoading, error };
};
