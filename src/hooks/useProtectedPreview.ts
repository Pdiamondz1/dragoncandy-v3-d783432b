import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseProtectedPreviewParams {
  filePath: string;
  bucketName: string;
  collaborationId: string;
  enabled?: boolean;
}

interface UseProtectedPreviewResult {
  signedUrl: string | null;
  canDownload: boolean;
  message: string;
  loading: boolean;
  refetch: () => Promise<{ signedUrl: string | null; canDownload: boolean }>;
}

export function useProtectedPreview({
  filePath,
  bucketName,
  collaborationId,
  enabled = true,
}: UseProtectedPreviewParams): UseProtectedPreviewResult {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [canDownload, setCanDownload] = useState(false);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchPreview = useCallback(async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('get-watermarked-preview', {
        body: {
          file_path: filePath,
          bucket_name: bucketName,
          collaboration_id: collaborationId,
        },
      });
      const url = response.data?.signed_url ?? null;
      const download = response.data?.can_download ?? false;
      const msg = response.data?.message ?? '';
      setSignedUrl(url);
      setCanDownload(download);
      setMessage(msg);
      return { signedUrl: url, canDownload: download };
    } catch (err) {
      console.error('Error fetching protected preview:', err);
      return { signedUrl: null, canDownload: false };
    } finally {
      setLoading(false);
    }
  }, [filePath, bucketName, collaborationId]);

  useEffect(() => {
    if (enabled) {
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, filePath, bucketName, collaborationId]);

  return { signedUrl, canDownload, message, loading, refetch: fetchPreview };
}
