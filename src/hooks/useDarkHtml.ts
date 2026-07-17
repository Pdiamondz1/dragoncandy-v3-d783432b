import { useEffect } from "react";

/**
 * Applies the dark theme to <html> for the lifetime of the calling route,
 * then reverts on unmount. Used by the dark "marketing/entry" surfaces
 * (login/sign-up + onboarding) so they render in a fully dark context —
 * dark <body> (`bg-background`) behind their dark literals — while the rest
 * of the app stays light. Mirrors InternalLayout's approach for /internal.
 *
 * Without this, the app is light (white <body>), so the auth page's
 * translucent glow layers composite over white and wash the page to gray.
 */
export function useDarkHtml() {
  useEffect(() => {
    const el = document.documentElement;
    el.classList.add("dark");
    return () => el.classList.remove("dark");
  }, []);
}
