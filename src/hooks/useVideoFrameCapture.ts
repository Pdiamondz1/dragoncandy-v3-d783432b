import { useState, useEffect, useRef } from 'react';

interface UseVideoFrameCaptureResult {
  frameDataUrl: string | null;
  loading: boolean;
  error: boolean;
}

export function useVideoFrameCapture(
  videoUrl: string | null,
  mimeType: string,
): UseVideoFrameCaptureResult {
  const [frameDataUrl, setFrameDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const mountedRef = useRef(true);
  const attemptedRef = useRef<string | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!videoUrl || !mimeType.startsWith('video/')) return;
    if (attemptedRef.current === videoUrl) return;
    attemptedRef.current = videoUrl;

    setLoading(true);
    setError(false);
    setFrameDataUrl(null);

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';

    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      video.removeAttribute('src');
      video.load();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      if (mountedRef.current) {
        setError(true);
        setLoading(false);
      }
    };

    const timeout = setTimeout(fail, 10_000);

    video.addEventListener('error', fail, { once: true });

    video.addEventListener('loadedmetadata', () => {
      if (settled) return;
      const seekTarget = Math.min(1, video.duration * 0.25);
      video.currentTime = seekTarget;
    }, { once: true });

    video.addEventListener('seeked', () => {
      if (settled) return;
      settled = true;

      try {
        const canvas = document.createElement('canvas');
        const maxWidth = 640;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) { fail(); return; }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        cleanup();

        if (mountedRef.current) {
          setFrameDataUrl(dataUrl);
          setLoading(false);
        }
      } catch {
        fail();
      }
    }, { once: true });

    video.src = videoUrl;

    return () => {
      if (!settled) {
        settled = true;
        cleanup();
      }
    };
  }, [videoUrl, mimeType]);

  return { frameDataUrl, loading, error };
}
