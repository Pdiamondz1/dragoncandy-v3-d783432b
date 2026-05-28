import { useEffect, useRef, useState } from 'react';

const VERSION_POLL_MS = 5 * 60 * 1000;

interface VersionInfo {
  hash: string;
  built: string;
}

async function fetchVersion(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(`/version.json?_t=${Date.now()}`);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function useAppVersion(): { updateAvailable: boolean } {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  // null = not yet fetched, string = initial hash captured
  const [initialHash, setInitialHash] = useState<string | null>(null);

  // Effect 1: fetch initial hash on mount
  useEffect(() => {
    if (!import.meta.env.PROD) return;

    fetchVersion().then((info) => {
      if (info) setInitialHash(info.hash);
    });
  }, []);

  // Effect 2: start polling after initial hash is known
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!import.meta.env.PROD) return;
    if (initialHash === null) return;

    const poll = () => {
      timerRef.current = setTimeout(async () => {
        const info = await fetchVersion();
        if (info && info.hash !== initialHash) {
          setUpdateAvailable(true);
        }
        poll();
      }, VERSION_POLL_MS);
    };
    poll();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchVersion().then((info) => {
          if (info && info.hash !== initialHash) setUpdateAvailable(true);
        });
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [initialHash]);

  return { updateAvailable };
}
