// This file is based on the Lovable-generated client, extended to be
// environment-aware: preview/staging builds override the target via
// VITE_SUPABASE_* env vars; production (env unset) falls back to the prod
// project below, so prod behavior is unchanged.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

// Production project values — used as the fallback when env vars are absent
// (e.g. the Lovable production build does not set VITE_SUPABASE_*).
export const PROD_FALLBACK = {
  url: "https://zocahiffooqdybdhguqv.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpvY2FoaWZmb29xZHliZGhndXF2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NzgzMzQsImV4cCI6MjA2NTU1NDMzNH0.bGhT6ft_zTbw-9v2Typi0wxzlfStg3sGiuPOor8Wfz8",
};

/**
 * Resolve the Supabase target from env, falling back to the prod project.
 * Pure + exported so it is unit-testable without touching the singleton.
 * NOTE: the env var name MUST be VITE_SUPABASE_PUBLISHABLE_KEY (matches
 * .env.example) — a mismatch silently falls back to prod.
 */
export function resolveSupabaseConfig(env: Record<string, string | undefined>) {
  return {
    url: env.VITE_SUPABASE_URL || PROD_FALLBACK.url,
    key: env.VITE_SUPABASE_PUBLISHABLE_KEY || PROD_FALLBACK.key,
  };
}

const { url: SUPABASE_URL, key: SUPABASE_PUBLISHABLE_KEY } = resolveSupabaseConfig(
  import.meta.env as unknown as Record<string, string | undefined>
);

export { SUPABASE_URL };

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

// NOTE: types.ts is auto-generated and currently does not include several
// tables/columns/RPCs that have been added via newer migrations
// (organizations, org_members, account_deletion_requests, dismissed_coachmarks,
// transition_content_status RPC, etc.). Until types are regenerated, we type
// the client loosely so call sites compile. Runtime behavior is unchanged.
export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- types.ts lags behind migrations; loosened intentionally
) as unknown as SupabaseClient<any, "public", any>;
