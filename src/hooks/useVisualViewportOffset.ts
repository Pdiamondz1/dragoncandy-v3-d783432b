import { useEffect, useState } from 'react';

/**
 * Height (px) of the on-screen keyboard overlapping the layout viewport.
 * Returns 0 on desktop or when the keyboard is closed. Uses the
 * visualViewport API, which tracks the keyboard on iOS Safari, Android
 * Chrome, and Capacitor's WKWebView (dvh units do not).
 */
export function useVisualViewportOffset(enabled: boolean) {
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setOffset(0);
      return;
    }
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      setOffset(Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)));
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [enabled]);

  return offset;
}
