import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_WARNING_MS = 165 * 60 * 1000;
const IDLE_LOGOUT_MS = 180 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 1000;
const STORAGE_KEY = 'dc_last_activity';
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

function touchActivity(): void {
  const now = Date.now();
  try { localStorage.setItem(STORAGE_KEY, String(now)); } catch {}
}

function getLastActivity(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return Number(stored);
  } catch {}
  return Date.now();
}

export function useInactivityTimeout(onLogout: () => void, enabled = true) {
  const [showWarning, setShowWarning] = useState(false);
  const showWarningRef = useRef(false);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  const checkInactivity = useCallback(() => {
    const elapsed = Date.now() - getLastActivity();
    if (elapsed >= IDLE_LOGOUT_MS) {
      setShowWarning(false);
      showWarningRef.current = false;
      onLogoutRef.current();
    } else if (elapsed >= IDLE_WARNING_MS) {
      setShowWarning(true);
      showWarningRef.current = true;
    }
  }, []);

  const confirmActive = useCallback(() => {
    touchActivity();
    setShowWarning(false);
    showWarningRef.current = false;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setShowWarning(false);
      showWarningRef.current = false;
      return;
    }

    touchActivity();

    const intervalId = setInterval(checkInactivity, CHECK_INTERVAL_MS);

    const onActivity = () => {
      if (!showWarningRef.current) {
        touchActivity();
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkInactivity();
      }
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(intervalId);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [enabled, checkInactivity]);

  return { showWarning, confirmActive };
}
