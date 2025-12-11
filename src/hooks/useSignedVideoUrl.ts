import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export const useSignedVideoUrl = (videoUrl: string | null) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSignedUrl = async () => {
      if (!videoUrl) {
        setSignedUrl(null);
        return;
      }

      // Extract file path from URL
      const bucketName = 'promotion-videos';
      let filePath = videoUrl;
      
      // If it's already a full URL, extract the path
      if (videoUrl.includes(bucketName)) {
        const parts = videoUrl.split(`${bucketName}/`);
        filePath = parts[parts.length - 1].split('?')[0]; // Remove query params if any
      }

      setIsLoading(true);
      setError(null);

      try {
        const { data, error: signError } = await supabase.storage
          .from(bucketName)
          .createSignedUrl(filePath, 3600); // 1 hour expiry

        if (signError) throw signError;
        setSignedUrl(data.signedUrl);
      } catch (err: any) {
        console.error('Error getting signed URL:', err);
        setError(err.message);
        // Fallback to original URL
        setSignedUrl(videoUrl);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSignedUrl();
  }, [videoUrl]);

  return { signedUrl, isLoading, error };
};
