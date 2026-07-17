import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mergeBackdropPlaylist,
  resolveLandingPlaylist,
  type LandingClip,
  type LandingClipKey,
} from "./landingClips";

const EMPTY: LandingClip[] = [];

/**
 * Fetch the real (boosted DragonShare video) backdrop clips from the anon `landing-clips` edge fn.
 * NEVER throws — any error/empty/malformed response resolves to [] so the hero falls back to static.
 */
export async function fetchLandingBackdropClips(): Promise<LandingClip[]> {
  try {
    const { data, error } = await supabase.functions.invoke("landing-clips");
    if (error) return [];
    const clips = (data as { clips?: Array<{ src?: string; poster?: string }> } | null)?.clips;
    if (!Array.isArray(clips)) return [];
    return clips
      .filter((c): c is { src: string; poster?: string } => !!c?.src)
      .map((c) => (c.poster ? { src: c.src, poster: c.poster } : { src: c.src }));
  } catch {
    return [];
  }
}

/**
 * Backdrop playlist for a hero role: the static curated playlist immediately (first paint, no flash),
 * with real boosted clips merged in (leading) once the cached fetch resolves. Memoized on [key, dynamic]
 * so the returned array is referentially stable across same-content re-renders (prevents RotatingBackdrop
 * from re-arming its rotation spuriously; content changes are handled by the signature-key remount).
 */
export function useLandingBackdropPlaylist(key: LandingClipKey): LandingClip[] {
  const { data: dynamic = EMPTY } = useQuery({
    queryKey: ["landing-backdrop-clips"],
    queryFn: fetchLandingBackdropClips,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 1,
  });
  return useMemo(() => mergeBackdropPlaylist(key, resolveLandingPlaylist(key), dynamic), [key, dynamic]);
}
