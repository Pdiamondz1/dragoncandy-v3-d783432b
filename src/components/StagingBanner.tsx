import { SUPABASE_URL, PROD_FALLBACK } from "@/integrations/supabase/client";

/**
 * Fail-safe environment indicator.
 *
 * - Production host (dragoncandy.io): renders nothing.
 * - Localhost dev: calm indicator (local dev intentionally uses the prod
 *   backend, so this is expected — not an alarm).
 * - Any other host (e.g. a Vercel preview): shows the active Supabase project.
 *   If such a host is on the PROD backend, it almost certainly forgot to set
 *   VITE_SUPABASE_* — shown as a RED danger banner so it can't be missed.
 *
 * Because the banner is driven by host (not by whether staging env was set),
 * a preview that silently fell back to prod still surfaces a warning.
 */
const PROD_HOST = "dragoncandy.io";

export function StagingBanner() {
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  if (host === PROD_HOST) return null;

  const isLocal = host === "localhost" || host === "127.0.0.1";
  const ref = SUPABASE_URL.replace("https://", "").split(".")[0];
  const onProdBackend = SUPABASE_URL === PROD_FALLBACK.url;
  const danger = !isLocal && onProdBackend;

  const label = isLocal
    ? `LOCAL · Supabase: ${ref}`
    : danger
      ? `⚠ PREVIEW on PROD backend (${ref}) — set VITE_SUPABASE_* env!`
      : `STAGING · Supabase: ${ref}`;

  return (
    <div
      role="status"
      className={`fixed top-0 left-0 right-0 z-[9999] text-center text-xs font-bold py-0.5 px-2 text-white ${
        danger ? "bg-dc-pink-accent-btn" : "bg-dc-teal-btn"
      }`}
    >
      {label}
    </div>
  );
}
