import { useState, useCallback, useRef, useEffect } from 'react';
import { needsTranscoding, transcodeToMp4, MAX_TRANSCODE_SIZE } from '@/lib/videoProcessing';

type TranscodingStatus = 'idle' | 'fetching' | 'transcoding' | 'ready' | 'failed';

const STATUS_MESSAGES: Record<TranscodingStatus, string> = {
  idle: '',
  fetching: 'Downloading video for conversion…',
  transcoding: 'Converting video for preview…',
  ready: '',
  failed: '',
};

export function useLightboxTranscoding(
  mimeType: string,
  fileSize: number | null,
) {
  const [status, setStatus] = useState<TranscodingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [transcodedUrl, setTranscodedUrl] = useState<string | null>(null);

  const blobUrlRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const lastProgressRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, []);

  const startTranscoding = useCallback(async (signedUrl: string, filename: string) => {
    if (busyRef.current) return;

    if (!needsTranscoding(mimeType)) {
      setStatus('failed');
      return;
    }
    if (fileSize != null && fileSize > MAX_TRANSCODE_SIZE) {
      setStatus('failed');
      return;
    }

    busyRef.current = true;

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setTranscodedUrl(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setStatus('fetching');
      setProgress(0);
      lastProgressRef.current = 0;

      const resp = await fetch(signedUrl, { signal: controller.signal });
      if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);

      const blob = await resp.blob();
      if (!mountedRef.current) return;

      if (blob.size > MAX_TRANSCODE_SIZE) {
        setStatus('failed');
        return;
      }

      setStatus('transcoding');

      const file = new File([blob], filename, { type: mimeType });
      const mp4 = await transcodeToMp4(file, (pct) => {
        if (mountedRef.current && pct - lastProgressRef.current >= 5) {
          lastProgressRef.current = pct;
          setProgress(pct);
        }
      });

      if (!mountedRef.current) return;

      const url = URL.createObjectURL(mp4);
      blobUrlRef.current = url;
      setTranscodedUrl(url);
      setProgress(100);
      setStatus('ready');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (mountedRef.current) {
        console.warn('Lightbox transcoding failed:', err);
        setStatus('failed');
      }
    } finally {
      busyRef.current = false;
    }
  }, [mimeType, fileSize]);

  return {
    transcodedUrl,
    status,
    progress,
    statusMessage: STATUS_MESSAGES[status],
    startTranscoding,
  };
}
