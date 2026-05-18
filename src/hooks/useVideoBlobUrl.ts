import { useState, useEffect } from 'react';

export function useVideoBlobUrl(signedUrl: string | null | undefined) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!signedUrl);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!signedUrl) {
      setBlobUrl(null);
      setLoading(false);
      setError(false);
      return;
    }

    let revoke: string | null = null;
    let cancelled = false;
    setLoading(true);
    setError(false);

    fetch(signedUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        revoke = url;
        setBlobUrl(url);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [signedUrl]);

  return { blobUrl, loading, error };
}
