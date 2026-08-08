import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import {
  allowedMediaPrefix,
  buildClips,
  likePrefixPattern,
  type LandingClipRow,
} from "./lib.ts";

// Anonymous read: returns public URLs of BOOSTED, verified, unflagged DragonShare VIDEO content.
// verify_jwt=true (platform default — no config.toml entry). Never throws to the client: any
// failure returns { clips: [] } so the hero silently falls back to its static clips.
// NOTE: `corsHeaders` in this repo is a FUNCTION `(req) => Headers-object`, NOT a bare object.
// Call it as `corsHeaders(req)` at every use (matches capture-lead / generate-anonymous-brief).
// Spreading the bare function emits NO Access-Control-Allow-Origin and breaks the browser invoke.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Inner-join the boost row (captured/transferred) as the defense-in-depth "someone paid" gate.
    // (PostgREST embedding returns ONE parent row with a nested `dragonshare_boosts` array — it does
    // not duplicate the parent; the `as LandingClipRow[]` cast ignores the nested array. buildClips's
    // de-dupe-by-src is a harmless belt for the direct-row test case.)
    // Origin-pin the media URLs to the public dragonshare-content bucket: they are creator-writable
    // free text and this response is served to anonymous visitors. See lib.ts. Applied BOTH in the
    // query and in buildClips, deliberately: in the query so off-bucket rows can't consume the
    // limit(20) window and starve the valid ones, and in buildClips because that is what covers
    // `screenshot_url` (and keeps the pure helper safe for any future caller).
    const mediaPrefix = allowedMediaPrefix(supabaseUrl);

    const { data, error } = await supabase
      .from("dragonshare_posts")
      .select("content_file_path, screenshot_url, dragonshare_boosts!inner(status)")
      .eq("status", "verified")
      .is("flagged_at", null)
      .eq("boost_status", "boosted")
      .in("content_type", ["video", "reel"])
      .not("content_file_path", "is", null)
      .like("content_file_path", likePrefixPattern(mediaPrefix))
      .in("dragonshare_boosts.status", ["captured", "transferred"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20); // over-fetch; buildClips applies the ext-guard + de-dupe + cap(4)

    if (error) throw error;
    return json({ clips: buildClips((data ?? []) as LandingClipRow[], mediaPrefix) });
  } catch (_e) {
    return json({ clips: [] }); // never break the hero
  }
});
