# DragonFeed → Hero Backdrop Adapter (v1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The public landing hero backdrop auto-populates with real **boosted DragonShare video** when any exists, falling back to the existing static curated clips otherwise — with zero visible change until such content exists.

**Architecture:** A new anonymous `landing-clips` edge function reads eligible rows with the service role and returns only public video URLs. The landing seam (`landingClips.ts`) gains pure `mergeBackdropPlaylist` + `playlistSignature` helpers and a `useLandingBackdropPlaylist` hook that renders the static playlist immediately, fetches the dynamic clips once (React Query), and merges them (dynamic leads). `HeroSection` remounts `RotatingBackdrop` on a clip-content signature so its index-based rotation always starts against a stable playlist. No schema/RLS/migration/secret.

**Tech Stack:** Deno edge function (supabase-js v2), React 18 + TypeScript, `@tanstack/react-query@^5`, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-17-dragonfeed-backdrop-adapter-design.md`

**Global Constraints (bind every task):**
- **Video-only.** No images, no Ken Burns for dynamic content.
- **No migration, no new RLS policy, no new table/column, no new secret.** Read existing columns via the service role.
- **Never break the hero.** Any fetch error/empty → static clips only. `fetchLandingBackdropClips` never throws to the UI.
- **`landingClips.ts` stays pure** (no React / supabase imports). The hook + fetch live in a separate file.
- **Existing exports unchanged**: `LANDING_CLIPS`, `LANDING_PLAYLISTS`, `resolveLandingClip`, `resolveLandingPlaylist`, `useLandingClip`, `useLandingPlaylist` keep their current signatures. Additions only.
- **Eligibility (exact):** `status='verified' AND flagged_at IS NULL AND boost_status='boosted' AND content_type IN ('video','reel') AND content_file_path IS NOT NULL AND content_file_path ~* '\.(mp4|webm|mov)$'`, plus an inner-joined captured/transferred boost row. Order `created_at DESC, id DESC`, cap 4.
- **Edge function `verify_jwt=true`** (platform default — do NOT add a `config.toml` entry).
- **Do not touch `RotatingBackdrop.tsx`** — it needs no change; the remount key does the work.

---

## File Structure

- **Create** `supabase/functions/landing-clips/lib.ts` — pure `buildClips(rows, cap?)` (ext-guard + poster mapping + de-dupe by src + cap). No `https://` imports (vitest-loadable), mirroring the `_shared` test-mode helpers pattern.
- **Create** `supabase/functions/landing-clips/lib.test.ts` — vitest for `buildClips`.
- **Create** `supabase/functions/landing-clips/index.ts` — the Deno edge function (`serve`, CORS, service-role query, `buildClips`, `{clips}` response, empty-on-error).
- **Modify** `src/components/landing/landingClips.ts` — add pure `mergeBackdropPlaylist` + `playlistSignature` (+ the `DYNAMIC_BACKDROP_KEYS` / cap consts).
- **Modify** `src/components/landing/landingClips.test.ts` — add tests for the two pure helpers.
- **Create** `src/components/landing/useLandingBackdropPlaylist.ts` — `fetchLandingBackdropClips` + `useLandingBackdropPlaylist` hook (React Query v5, static-first, memoized merge).
- **Create** `src/components/landing/useLandingBackdropPlaylist.test.tsx` — `fetchLandingBackdropClips` mapping/error tests (mock `supabase.functions.invoke`).
- **Modify** `src/components/landing/HeroSection.tsx` — swap to `useLandingBackdropPlaylist` + signature key.

---

## Task 1: `buildClips` pure helper (edge-function lib)

**Files:**
- Create: `supabase/functions/landing-clips/lib.ts`
- Test: `supabase/functions/landing-clips/lib.test.ts`

- [ ] **Step 1: Write the failing test** — `supabase/functions/landing-clips/lib.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildClips, type LandingClipRow } from "./lib";

const row = (over: Partial<LandingClipRow>): LandingClipRow => ({
  content_file_path: "https://cdn.example.com/uid/a.mp4",
  screenshot_url: null,
  ...over,
});

describe("buildClips", () => {
  it("maps a playable video row to { src } (no poster when screenshot_url is null)", () => {
    expect(buildClips([row({})])).toEqual([{ src: "https://cdn.example.com/uid/a.mp4" }]);
  });

  it("includes poster when screenshot_url is present", () => {
    expect(buildClips([row({ screenshot_url: "https://cdn.example.com/uid/a.jpg" })])).toEqual([
      { src: "https://cdn.example.com/uid/a.mp4", poster: "https://cdn.example.com/uid/a.jpg" },
    ]);
  });

  it("drops rows with a null content_file_path", () => {
    expect(buildClips([row({ content_file_path: null })])).toEqual([]);
  });

  it("drops rows whose file is not a video extension (mislabeled image)", () => {
    expect(buildClips([row({ content_file_path: "https://cdn.example.com/uid/a.jpg" })])).toEqual([]);
  });

  it("accepts mp4/webm/mov, case-insensitive", () => {
    const rows = ["a.mp4", "b.WEBM", "c.mov"].map((p) =>
      row({ content_file_path: `https://cdn.example.com/uid/${p}` }),
    );
    expect(buildClips(rows).map((c) => c.src)).toEqual([
      "https://cdn.example.com/uid/a.mp4",
      "https://cdn.example.com/uid/b.WEBM",
      "https://cdn.example.com/uid/c.mov",
    ]);
  });

  it("de-dupes by src (a post joined to >1 boost row arrives duplicated)", () => {
    const dup = row({ content_file_path: "https://cdn.example.com/uid/a.mp4" });
    expect(buildClips([dup, dup])).toEqual([{ src: "https://cdn.example.com/uid/a.mp4" }]);
  });

  it("caps at 4 by default", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ content_file_path: `https://cdn.example.com/uid/v${i}.mp4` }),
    );
    expect(buildClips(rows)).toHaveLength(4);
  });

  it("preserves input order", () => {
    const rows = ["z.mp4", "a.mp4"].map((p) => row({ content_file_path: `https://cdn.example.com/uid/${p}` }));
    expect(buildClips(rows).map((c) => c.src.endsWith("z.mp4"))).toEqual([true, false]);
  });
});
```

- [ ] **Step 2: Run it, verify it fails** — `npx vitest run supabase/functions/landing-clips/lib.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `supabase/functions/landing-clips/lib.ts`

```ts
/**
 * Pure helpers for the landing-clips edge function — kept free of `https://` imports so vitest can
 * load them (mirrors the _shared test-mode helper pattern).
 */
export interface LandingClipRow {
  content_file_path: string | null;
  screenshot_url?: string | null;
}
export interface LandingClipDTO {
  src: string;
  poster?: string;
}

const VIDEO_EXT = /\.(mp4|webm|mov)$/i;

/**
 * Map eligible DragonShare rows to the response shape. Belt-and-suspenders over the SQL filter:
 * drops rows without a `content_file_path` or whose file isn't a playable video extension (a
 * mislabeled image `src` would never fire `onEnded` and would stall the rotation), de-dupes by
 * `src` (a post inner-joined to multiple boost rows arrives duplicated), and caps the result.
 */
export function buildClips(rows: LandingClipRow[], cap = 4): LandingClipDTO[] {
  const out: LandingClipDTO[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const src = r.content_file_path;
    if (!src || !VIDEO_EXT.test(src) || seen.has(src)) continue;
    seen.add(src);
    out.push(r.screenshot_url ? { src, poster: r.screenshot_url } : { src });
    if (out.length >= cap) break;
  }
  return out;
}
```

- [ ] **Step 4: Run tests, verify pass** — `npx vitest run supabase/functions/landing-clips/lib.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/landing-clips/lib.ts supabase/functions/landing-clips/lib.test.ts
git commit -m "feat(landing-clips): buildClips pure helper + tests"
```

---

## Task 2: `landing-clips` edge function

**Files:**
- Create: `supabase/functions/landing-clips/index.ts`

No unit test (does I/O + `https://` imports). Correctness is covered by Task 1's shape tests, the `edge-function-reviewer` subagent, and the manual seed test (Task 6). **Verify the deps it imports (`../_shared/cors.ts`) exist and export `corsHeaders`** before writing.

- [ ] **Step 1: Confirm the CORS helper shape** — read `supabase/functions/_shared/cors.ts`. It exports `corsHeaders` as a **function** `(req: Request) => headersObject` (NOT a bare object). Every use must call `corsHeaders(req)` (matches `capture-lead` / `generate-anonymous-brief`). The code below already does this — do not "simplify" it to a bare `corsHeaders`.

- [ ] **Step 2: Implement** — `supabase/functions/landing-clips/index.ts`

```ts
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { buildClips, type LandingClipRow } from "./lib.ts";

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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Inner-join the boost row (captured/transferred) as the defense-in-depth "someone paid" gate.
    // (PostgREST embedding returns ONE parent row with a nested `dragonshare_boosts` array — it does
    // not duplicate the parent; the `as LandingClipRow[]` cast ignores the nested array. buildClips's
    // de-dupe-by-src is a harmless belt for the direct-row test case.)
    const { data, error } = await supabase
      .from("dragonshare_posts")
      .select("content_file_path, screenshot_url, dragonshare_boosts!inner(status)")
      .eq("status", "verified")
      .is("flagged_at", null)
      .eq("boost_status", "boosted")
      .in("content_type", ["video", "reel"])
      .not("content_file_path", "is", null)
      .in("dragonshare_boosts.status", ["captured", "transferred"])
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(20); // over-fetch; buildClips applies the ext-guard + de-dupe + cap(4)

    if (error) throw error;
    return json({ clips: buildClips((data ?? []) as LandingClipRow[]) });
  } catch (_e) {
    return json({ clips: [] }); // never break the hero
  }
});
```

- [ ] **Step 3: Typecheck-adjacent sanity** — run `npm run build` (the frontend build won't compile the Deno file, so this only confirms nothing else broke). The real gate is the `edge-function-reviewer` in Task 5.

- [ ] **Step 4: Note the embedded-filter fallback (do NOT implement unless needed).** If, during the manual seed test (Task 6), the `dragonshare_boosts!inner(status)` embed proves unreliable (e.g. relationship not detected), the documented fallback is to drop the embed and gate on `boost_status='boosted'` alone (service-role/admin-guarded, trustworthy) — a strict simplification. Record which was used.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/landing-clips/index.ts
git commit -m "feat(landing-clips): anon edge function returning boosted DragonShare video URLs"
```

---

## Task 3: Pure seam helpers `mergeBackdropPlaylist` + `playlistSignature`

**Files:**
- Modify: `src/components/landing/landingClips.ts` (append; existing exports untouched)
- Test: `src/components/landing/landingClips.test.ts` (append a describe block)

- [ ] **Step 1: Write the failing tests** — append the describe blocks to `src/components/landing/landingClips.test.ts`, and **merge `mergeBackdropPlaylist, playlistSignature` into the existing top-of-file `import { … } from "./landingClips"` block** (rather than adding the separate import line shown here — a duplicate import is legal but untidy).

```ts
// add mergeBackdropPlaylist, playlistSignature to the existing "./landingClips" import at the top

describe("mergeBackdropPlaylist", () => {
  const s = (n: string) => ({ src: `/landing/${n}.mp4`, poster: `/landing/${n}.jpg` });
  const d = (n: string) => ({ src: `https://cdn/${n}.mp4` });
  const staticClips = [s("h1"), s("h2")];
  const dynamicClips = [d("boost1"), d("boost2")];

  it("leads with dynamic clips, then static, for hero.business", () => {
    const out = mergeBackdropPlaylist("hero.business", staticClips, dynamicClips);
    expect(out.map((c) => c.src)).toEqual([
      "https://cdn/boost1.mp4", "https://cdn/boost2.mp4", "/landing/h1.mp4", "/landing/h2.mp4",
    ]);
  });

  it("also applies to hero.creator", () => {
    expect(mergeBackdropPlaylist("hero.creator", staticClips, dynamicClips)[0].src).toBe("https://cdn/boost1.mp4");
  });

  it("returns static unchanged for hero.brand (not an eligible key)", () => {
    expect(mergeBackdropPlaylist("hero.brand", staticClips, dynamicClips)).toBe(staticClips);
  });

  it("returns static unchanged when there are no dynamic clips", () => {
    expect(mergeBackdropPlaylist("hero.business", staticClips, [])).toBe(staticClips);
  });

  it("de-dupes by src", () => {
    const out = mergeBackdropPlaylist("hero.business", [d("x")], [d("x")]);
    expect(out).toHaveLength(1);
  });

  it("caps the merged total", () => {
    const many = Array.from({ length: 10 }, (_, i) => d(`v${i}`));
    expect(mergeBackdropPlaylist("hero.business", staticClips, many).length).toBeLessThanOrEqual(6);
  });
});

describe("playlistSignature", () => {
  it("changes when the joined srcs change (grow)", () => {
    const a = playlistSignature("business", [{ src: "a.mp4" }]);
    const b = playlistSignature("business", [{ src: "x.mp4" }, { src: "a.mp4" }]);
    expect(a).not.toBe(b);
  });
  it("changes for same-length different-clips", () => {
    const a = playlistSignature("business", [{ src: "a.mp4" }]);
    const b = playlistSignature("business", [{ src: "b.mp4" }]);
    expect(a).not.toBe(b);
  });
  it("is stable for identical contents", () => {
    expect(playlistSignature("business", [{ src: "a.mp4" }]))
      .toBe(playlistSignature("business", [{ src: "a.mp4" }]));
  });
  it("differs by role", () => {
    expect(playlistSignature("business", [{ src: "a.mp4" }]))
      .not.toBe(playlistSignature("creator", [{ src: "a.mp4" }]));
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/components/landing/landingClips.test.ts` → FAIL (exports missing).

- [ ] **Step 3: Implement** — append to `src/components/landing/landingClips.ts`

```ts
/** Roles whose hero backdrop can lead with real (dynamic) clips. Brand stays static (hidden). */
const DYNAMIC_BACKDROP_KEYS: LandingClipKey[] = ["hero.business", "hero.creator"];
const BACKDROP_MERGED_CAP = 6;

/**
 * Merge real (dynamic) clips ahead of the curated static playlist for eligible hero keys.
 * Dynamic leads (real content first), static backfills so the rotation is never thin. Returns the
 * static array UNCHANGED (same reference) for non-eligible keys or when there are no dynamic clips —
 * so the signature stays stable and nothing remounts. De-dupes by src; caps the total.
 */
export function mergeBackdropPlaylist(
  key: LandingClipKey,
  staticClips: LandingClip[],
  dynamicClips: LandingClip[],
): LandingClip[] {
  if (!DYNAMIC_BACKDROP_KEYS.includes(key) || dynamicClips.length === 0) return staticClips;
  const seen = new Set<string>();
  const merged: LandingClip[] = [];
  for (const c of [...dynamicClips, ...staticClips]) {
    if (!c.src || seen.has(c.src)) continue;
    seen.add(c.src);
    merged.push(c);
    if (merged.length >= BACKDROP_MERGED_CAP) break;
  }
  return merged;
}

/**
 * A stable string that changes whenever the playlist's clip CONTENTS change (grow, or same-length
 * different-clips), and stays identical when contents are unchanged. Used as the RotatingBackdrop
 * `key` so its index-based rotation always mounts against a stable playlist (see spec §4.3).
 */
export function playlistSignature(role: string, playlist: LandingClip[]): string {
  return `${role}::${playlist.map((c) => c.src ?? "").join("|")}`;
}
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/components/landing/landingClips.test.ts` → PASS (existing tests still green too).

- [ ] **Step 5: Lint** — `npx eslint src/components/landing/landingClips.ts` → 0 errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/landingClips.ts src/components/landing/landingClips.test.ts
git commit -m "feat(landing): mergeBackdropPlaylist + playlistSignature pure helpers"
```

---

## Task 4: `useLandingBackdropPlaylist` hook + fetch

**Files:**
- Create: `src/components/landing/useLandingBackdropPlaylist.ts`
- Test: `src/components/landing/useLandingBackdropPlaylist.test.tsx`

- [ ] **Step 1: Write the failing test** (fetch mapping + error path — the highest-risk glue) — `src/components/landing/useLandingBackdropPlaylist.test.tsx`

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...a) } },
}));

import { fetchLandingBackdropClips } from "./useLandingBackdropPlaylist";

beforeEach(() => invoke.mockReset());

describe("fetchLandingBackdropClips", () => {
  it("maps { clips } to LandingClip[]", async () => {
    invoke.mockResolvedValue({ data: { clips: [{ src: "a.mp4", poster: "a.jpg" }, { src: "b.mp4" }] }, error: null });
    expect(await fetchLandingBackdropClips()).toEqual([{ src: "a.mp4", poster: "a.jpg" }, { src: "b.mp4" }]);
  });
  it("returns [] on a function error", async () => {
    invoke.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await fetchLandingBackdropClips()).toEqual([]);
  });
  it("returns [] on a thrown/rejected invoke", async () => {
    invoke.mockRejectedValue(new Error("network"));
    expect(await fetchLandingBackdropClips()).toEqual([]);
  });
  it("returns [] when clips is missing/malformed", async () => {
    invoke.mockResolvedValue({ data: {}, error: null });
    expect(await fetchLandingBackdropClips()).toEqual([]);
  });
  it("drops entries without a src", async () => {
    invoke.mockResolvedValue({ data: { clips: [{ poster: "x.jpg" }, { src: "ok.mp4" }] }, error: null });
    expect(await fetchLandingBackdropClips()).toEqual([{ src: "ok.mp4" }]);
  });
});
```

- [ ] **Step 2: Run, verify fail** — `npx vitest run src/components/landing/useLandingBackdropPlaylist.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — `src/components/landing/useLandingBackdropPlaylist.ts`

```ts
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
```

- [ ] **Step 4: Run, verify pass** — `npx vitest run src/components/landing/useLandingBackdropPlaylist.test.tsx` → PASS.

- [ ] **Step 5: Lint** — `npx eslint src/components/landing/useLandingBackdropPlaylist.ts` → 0 errors (confirm no `react-hooks/exhaustive-deps` warning on the `useMemo`; `resolveLandingPlaylist(key)` is derived from `key`).

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/useLandingBackdropPlaylist.ts src/components/landing/useLandingBackdropPlaylist.test.tsx
git commit -m "feat(landing): useLandingBackdropPlaylist hook (static-first, memoized merge)"
```

---

## Task 5: Wire `HeroSection` + edge-function-reviewer

**Files:**
- Modify: `src/components/landing/HeroSection.tsx`

- [ ] **Step 1: Swap the import + hook** — in `HeroSection.tsx`, replace `import { useLandingPlaylist } from "./landingClips";` with:

```tsx
import { playlistSignature } from "./landingClips";
import { useLandingBackdropPlaylist } from "./useLandingBackdropPlaylist";
```

- [ ] **Step 2: Use the hook** — replace `const playlist = useLandingPlaylist(content.clipKey);` with:

```tsx
const playlist = useLandingBackdropPlaylist(content.clipKey);
```

- [ ] **Step 3: Key the backdrop on the signature** — change the **`RotatingBackdrop` element** (the current `<RotatingBackdrop key={role} playlist={playlist} className="-z-20" />` line) to:

```tsx
<RotatingBackdrop key={playlistSignature(role, playlist)} playlist={playlist} className="-z-20" />
```

> ⚠️ There is a **second** `key={role}` further down HeroSection (`<div key={role} className="contents">`, the entrance-animation remount) — **do NOT touch it.** Target only the `RotatingBackdrop` line; use the full element as the `old_string` so the edit is unique.

- [ ] **Step 4: Full test + build** — run:

```
npx vitest run src/components/landing
npm run build
```
Expected: all landing tests pass; production build succeeds (this is the real typecheck gate — local `tsc` is slow/unavailable, and `vite build` needs `lovable-tagger`; if the local build can't run, rely on CI `verify`).

- [ ] **Step 5: edge-function-reviewer** — dispatch the `edge-function-reviewer` agent on `supabase/functions/landing-clips/index.ts` (it reads the fn + `_shared/*`). Fix any PASS-blocking findings (verify_jwt config, `_shared` bundling, service-role vs user auth, CORS). Must return PASS before deploy.

- [ ] **Step 6: Commit**

```bash
git add src/components/landing/HeroSection.tsx
git commit -m "feat(landing): hero backdrop leads with real boosted clips (remount on signature)"
```

---

## Task 6: Deploy, seed-verify, land

Not a code task — the rollout + manual proof + PR. Follow the project's deploy discipline.

- [ ] **Step 1: `careful` gate + deploy the edge function** — deploy `landing-clips` via the Supabase CLI, preserving the default `verify_jwt=true` (deploy WITHOUT `--no-verify-jwt`). Boot-check: `supabase.functions.invoke('landing-clips')` returns `{ clips: [] }` today (no eligible content).

- [ ] **Step 2: Manual end-to-end seed test (proves the populated path).** On the test/prod project, insert one eligible row and a captured boost, using a real public sample mp4 as `content_file_path` (a DragonShare public-bucket URL, or any public `.mp4`), then:
  - Load the landing logged-out → confirm the seeded clip **leads** the Business and Creator rotations (two `backdrop-layer-*` videos, layer-0 src = the seeded URL), and that switching roles keeps it.
  - **Remove the seed row + boost afterward.** (Document the exact SQL used and that it was reverted.)

- [ ] **Step 3: Codex second review** — `codex review --base main`. Fix + re-run until clean (it touches an anon edge function + the hero).

- [ ] **Step 4: Open the PR, watch CI, merge on green, verify prod.** Prod verification: `landing-clips` returns `{clips:[]}` (no content) → hero shows static clips exactly as now (zero regression); confirm the shipped bundle references `useLandingBackdropPlaylist` / `landing-clips`.

- [ ] **Step 5: Knowledge** — a `docs/wiki/concepts/` note (extend the Dragon Feed or landing concept) capturing the adapter + the eligibility gate + the index-based-remount lesson; per the knowledge-sync rule.

---

## Notes for the implementer

- **The remount key is load-bearing.** Do not "simplify" it back to `key={role}` — `RotatingBackdrop` tracks clips by array index, so an in-place playlist grow would never show the new clip (spec §4.3). The `landingClips.test.ts` `playlistSignature` tests guard this.
- **Do not add a `config.toml` entry** for `landing-clips` — the default `verify_jwt=true` is intended.
- **`fetchLandingBackdropClips` must never throw.** Every path returns `[]` on trouble.
- **Keep `landingClips.ts` pure** — the hook, React Query, and supabase imports live only in `useLandingBackdropPlaylist.ts`.
