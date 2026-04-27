import { useEffect, useRef, useState, useCallback } from 'react';

const IDLE_WARNING_MS = 45 * 60 * 1000;
const IDLE_LOGOUT_MS = 15 * 60 * 1000;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'scroll'] as const;

export function useInactivityTimeout(onLogout: () => void) {
  const [showWarning, setShowWarning] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logoutTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (logoutTimer.current) clearTimeout(logoutTimer.current);
  }, []);

  const startLogoutCountdown = useCallback(() => {
    setShowWarning(true);
    logoutTimer.current = setTimeout(() => {
      setShowWarning(false);
      onLogout();
    }, IDLE_LOGOUT_MS);
  }, [onLogout]);

  const resetIdleTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);
    idleTimer.current = setTimeout(startLogoutCountdown, IDLE_WARNING_MS);
  }, [clearTimers, startLogoutCountdown]);

  const confirmActive = useCallback(() => {
    resetIdleTimer();
  }, [resetIdleTimer]);

  useEffect(() => {
    resetIdleTimer();

    const onActivity = () => {
      if (!showWarning) resetIdleTimer();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      clearTimers();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [showWarning, resetIdleTimer, clearTimers]);

  return { showWarning, confirmActive };
}
