# DragonFeed → Hero Backdrop Adapter (v1) — Design

**Date:** 2026-07-17
**Status:** Design (pre-plan)
**Author:** Claude (with Dame)

## 1. Goal

Make the public landing hero backdrop auto-populate with **real platform video content** as it
appears, instead of only the hand-curated static clips. v1 sources **boosted DragonShare video**,
falling back to the existing static per-role playlists whenever there is no eligible content — so
the hero is never empty and today's behavior is unchanged until real content exists.

One sentence: *the hero backdrop leads with real boosted-creator videos when any exist, and
seamlessly falls back to the curated static clips when none do.*

## 2. Why a backend read path is required (the access reality)

Investigated 2026-07-17. Neither content surface is usable by an anonymous (logged-out) visitor
as-is:

- **Creator portfolio (DragonFeed proper):** rows are anon-readable and tagged `image|video`, but
  the media lives in the **private** `profile-assets` bucket (signed URLs, `authenticated`-only).
  Anon can't load it. Rejected for v1 (would need private→public media migration; also generic,
  not restaurant-specific).
- **DragonShare content:** files live in the **public** `dragonshare-content` bucket (anon-loadable
  by URL, no signing), tagged `content_type`. But the **rows** holding those URLs are **not**
  anon-readable (no anon RLS SELECT on `dragonshare_posts`).

**Chosen source: boosted DragonShare video**, exposed through a small anon **edge function** that
reads the rows with the service role and returns only public file URLs. Rationale:

- On-brand (real creator content *about restaurants*).
- Files already public → no bucket/signing work.
- **Quality gate is intrinsic**: a business *paid* to boost the post (`boost_status='boosted'`), so
  it is implicitly vetted — the safest curation signal for an anonymous top-of-funnel with no
  separate moderation system to build. ("All verified" is trust-then-flag and too risky for the
  hero.)

## 3. Eligibility rule (exact)

A DragonShare post is hero-eligible iff **all** hold (all columns already exist — **no migration**):

- `status = 'verified'`
- `flagged_at IS NULL`
- `boost_status = 'boosted'`  *(the denormalized "a business boosted this" flag —
  `dragonshare_posts.boost_status` check-constrained to `available|boosted|expired|withdrawn`)*
- `content_type IN ('video','reel')`  *(reel is video; excludes photo/story/carousel)*
- `content_file_path IS NOT NULL`  *(only uploaded files are playable; external `post_url`s are
  links to Instagram/TikTok, not media we can put in a `<video>`)*
- **`content_file_path ~* '\.(mp4|webm|mov)$'`** — a hard file-extension guard. `content_type` and
  the actual file can legitimately disagree (the codebase's own `isVideoPost` and its tests treat a
  `content_type='video'` row with a `.jpg` as an expected case — `src/types/dragonshare.test.ts`). An
  image `src` in a `<video>` **never fires `onEnded`**, so — because the dynamic clip leads at index
  0 — the rotation would get **permanently stuck** on it. This guard makes only genuinely-playable
  files eligible. (Mirrored in `buildClips` too — belt and suspenders.)
- **Include the defense-in-depth boost check** (confirmed by spec review — cheap and can't
  over-filter): `EXISTS (SELECT 1 FROM dragonshare_boosts b WHERE b.post_id = p.id AND b.status IN
  ('captured','transferred'))`. `fulfill-boost` writes the boost row to `status='transferred'` *before*
  it sets `boost_status='boosted'`, so a genuinely-boosted post always has a matching row; this blocks
  a stale/incorrect `boost_status` from surfacing content nobody paid to boost.

Order **`created_at DESC, id DESC`** (the `id` tiebreaker makes the cap-of-4 deterministic), cap at **4**.

## 4. Architecture

### 4.1 Backend — `landing-clips` edge function

- New Deno edge function `supabase/functions/landing-clips/index.ts`, **`verify_jwt=true` (the
  platform default — no `config.toml` entry)**. Correction from the reviewed draft: the cited
  `generate-anonymous-brief` has no `config.toml` entry, so it is already `verify_jwt=true`, and
  logged-out `supabase.functions.invoke` still works because the client attaches the **anon key's
  JWT**. Keeping the default `true` is marginally safer for an uncached read endpoint (it rejects a
  totally keyless `curl`) and requires *no* `config.toml` change. (If a future need forces
  `verify_jwt=false`, the correct precedent is `capture-lead` (`config.toml:163-164`), and it must be
  set explicitly — `verify_jwt` drift is a documented deploy hazard.)
- Uses the injected **service-role** client to run the §3 query (RLS bypass is intentional and
  contained; the filter is the gate).
- Selects **only** `content_file_path` (public URL) and `screenshot_url` (optional poster). No other
  columns leave the function. **Honest PII note:** `content_file_path` is built as
  `${creatorUserId}/${uuid}.${ext}` (`useDragonShareUpload.ts`), so the returned `src` **does embed
  the creator's `auth.users.id`** as the first path segment. This is acceptable, not a leak: the
  bucket is already fully public and enumerable, the content is *boosted* (creator + business chose to
  amplify it publicly), and the segment is an opaque UUID. We do **not** return `creator_id`,
  `target_org_id`, captions, or any other field — only the media URL that must be public to play.
- Returns `{ clips: Array<{ src: string; poster?: string }> }`, ≤4, newest first.
- CORS via the shared `_shared/cors.ts`.
- Read-only, no request body, no writes → minimal abuse surface. No cost-ledger (no AI/paid call).
  **De-dup is client-side** via React Query `staleTime` (see §4.2) — a `Cache-Control` header would be
  a no-op because `functions.invoke` issues a **POST** (POST responses aren't CDN/browser-cached), so
  the spec does **not** rely on one. The endpoint returns only already-public URLs behind the anon-key
  gate, capped at 4; that is the whole abuse surface.
- Pure, unit-tested helpers in `landing-clips/lib.ts`:
  - `buildClips(rows): {src,poster?}[]` — maps rows → the response shape, drops rows without a
    `content_file_path` or whose path fails the `\.(mp4|webm|mov)$/i` guard, caps at 4.
  (The SQL filter itself is asserted by a shape test over representative rows.)

**No migration, no new RLS policy, no new table/column, no new secret.** The only new artifact is
the edge function.

### 4.2 Frontend — async seam in `landingClips.ts`

Add an async layer over the existing sync resolver (existing `resolveLandingPlaylist` /
`useLandingPlaylist` / `LANDING_PLAYLISTS` stay **unchanged** — additive):

- `fetchLandingBackdropClips(): Promise<LandingClip[]>` — `supabase.functions.invoke('landing-clips')`;
  maps `{clips}` → `LandingClip[]`; returns `[]` on any error/empty (never throws to the UI).
- `useLandingBackdropPlaylist(key: LandingClipKey): LandingClip[]` —
  1. `const staticPlaylist = resolveLandingPlaylist(key)` (sync, returned immediately → **no flash**,
     zero regression on first paint).
  2. React Query **v5 object form** (the project is on `@tanstack/react-query@^5`, which removed the
     positional overload):
     ```ts
     const { data: dynamic = [] } = useQuery({
       queryKey: ['landing-backdrop-clips'],
       queryFn: fetchLandingBackdropClips,
       staleTime: 5 * 60_000,
       gcTime: 30 * 60_000,
       retry: 1,
     });
     ```
     Fetched **once**, shared across roles.
  3. `return mergeBackdropPlaylist(key, staticPlaylist, dynamic)`.
- `mergeBackdropPlaylist(key, staticClips, dynamicClips)` — **pure, unit-tested**:
  - Dynamic clips apply to **`hero.business` and `hero.creator`** only (real restaurant/creator
    content fits both; `hero.brand` is hidden and stays static).
  - When dynamic non-empty for an eligible key: `[...dynamicClips, ...staticClips]` (real content
    **leads**, static **backfills** so the rotation is never thin), total capped (e.g. 6).
  - Otherwise: `staticClips` unchanged.
  - De-dupe by `src` defensively.

### 4.3 `HeroSection.tsx` — the C1 fix (remount on merge)

`RotatingBackdrop` manages its rotation **by array index** and imperative `video.load()`
(`setLayerSource` compares `v.dataset.clip !== String(clipIdx)` — an *index*, not a src). If the
playlist **grows/changes identity after mount** while the component stays mounted, prepended clips
shift every index, the "changed?" check misfires, and **the new leading clip is never actually shown
(plus a one-cycle crossfade desync)**. Since the dynamic clips resolve ~1 fetch *after* first paint,
this is the real path, not a corner case.

Fix at the `HeroSection` call site — **make the merge observable as a remount** by keying
`RotatingBackdrop` on a signature that changes when the effective playlist **contents** change, not on
`role` or length alone. Key on the joined `src`s (not `length`): a React Query refetch could return a
*different* set of clips with the *same* count — length wouldn't change, but the content would, and an
index-based component must remount to pick it up. The joined-src signature also stays **stable** when a
refetch returns identical content (no spurious remount).

```tsx
const playlist = useLandingBackdropPlaylist(content.clipKey);
// A small pure helper keeps the key readable and testable:
//   playlistSignature(role, playlist) => `${role}::${playlist.map(c => c.src ?? '').join('|')}`
<RotatingBackdrop
  key={playlistSignature(role, playlist)}
  playlist={playlist}
  className="-z-20"
/>
```

When the fetch resolves and dynamic clips prepend, the signature changes → `RotatingBackdrop`
**remounts fresh**, its arm effect runs against the merged array, and the dynamic clip correctly leads
at index 0 with no index desync. This is a **one-time** remount ~1 fetch after paint (imperceptible;
today, with no eligible content, it never fires at all). So `HeroSection` is **not** a pure one-line
swap: it's the import, the hook call, and the signature key (`playlistSignature` — a pure, unit-tested
helper).

### 4.4 `RotatingBackdrop.tsx`

**No change to the component itself.** With the §4.3 signature key it always mounts against a stable
playlist and never has to reconcile a growing one — its index-based rotation stays correct. It already
plays a `LandingClip[]` of videos with crossfade, `load()` on src change, preload, and in-view pause.
Dynamic clips carry a public `src` and an optional `poster`; the component already tolerates a missing
poster (renders the first video frame after buffer; the hero scrim covers the brief gap). Cross-origin
public-bucket videos play in `<video>` without CORS (playback needs no CORS; only canvas pixel-reads
would).

## 5. Data flow

```
HeroSection (role) ─ useLandingBackdropPlaylist(clipKey)
   ├─ static: resolveLandingPlaylist(clipKey)         → immediate, first paint
   └─ dynamic: useQuery → supabase.functions.invoke('landing-clips')
                             → service-role SELECT (verified+unflagged+boosted+video+has-file, ≤4)
                             → [{src, poster?}]
   → mergeBackdropPlaylist(clipKey, static, dynamic)  → LandingClip[]
   → <RotatingBackdrop key={playlistSignature(role, playlist)} playlist={...} />  → crossfade rotation
      (signature = joined srcs → remounts when clip contents change; see §4.3)
```

## 6. Error handling / edge cases

- **Fetch error / function down / empty** → `dynamic=[]` → static only. Hero always works.
- **First paint** → static playlist renders immediately. When the fetch resolves (~a few hundred ms),
  the merged playlist's **contents** change → the §4.3 signature key changes → `RotatingBackdrop`
  remounts once against the merged array, with the dynamic clip leading. One-time, near first paint,
  covered by the scrim. Today (no eligible content) the signature never changes, so **no remount and
  no change at all**.
- **A boosted post is later flagged/rejected** → drops out on the next fetch (bounded by React Query
  `staleTime`, 5 min per client session — not an HTTP cache; see §4.1).
- **Cap** at 4 dynamic + static backfill (≤6 total) keeps only 2 clips loaded at once (unchanged
  RotatingBackdrop behavior).
- **No poster on a dynamic clip (normal motion)** → first video frame shows after buffer; the hero
  scrim covers the brief gap (existing behavior).
- **Reduced motion + posterless leading dynamic clip** → `RotatingBackdrop` shows `clips[0].poster`
  or, if absent, the branded gradient (`RotatingBackdrop.tsx` reduced-motion branch). Direct-upload
  posts usually have `screenshot_url = null`, so a reduced-motion visitor may see the gradient rather
  than a real still. **Accepted v1 tradeoff** (reduced-motion is a minority and the gradient is an
  on-brand static fallback). Documented as a follow-up: RotatingBackdrop could, under reduced motion,
  pick the first clip that *has* a poster (i.e. fall through to a static clip) — deferred, not v1.

## 7. Testing

- **Pure unit tests (no infra):**
  - `mergeBackdropPlaylist` — dynamic leads for business/creator; static-only for brand; empty
    dynamic → static unchanged; de-dupe by src; total cap.
  - `playlistSignature(role, playlist)` — changes when the joined `src`s change (incl. same-length,
    different-clips), stable when contents are identical.
  - `landing-clips/lib.ts buildClips` — maps rows→shape, drops missing `content_file_path`, caps 4,
    passes `screenshot_url`→poster.
- **Existing tests** (RotatingBackdrop, landingClips, VideoSlot, Header) stay green.
- **`fetchLandingBackdropClips`** error path → `[]` (mock invoke reject).
- **Merge/remount integration (the C1 risk):** a test that mounts the hero (or a harness) with a
  static-only playlist, then supplies the merged (dynamic-led) playlist, asserting the signature key
  changes so `RotatingBackdrop` remounts and the dynamic clip becomes the leading (index-0) source —
  i.e. the growing-playlist path actually shows the dynamic clip rather than silently keeping the
  static one. (Guards against a regression back to `key={role}`.)
- **Manual end-to-end (proves the pipeline, since no real boosted video exists):** in the test
  project, seed one `dragonshare_posts` row (`status=verified`, `flagged_at=null`,
  `boost_status=boosted`, `content_type=video`, `content_file_path`=a public sample mp4) → load the
  landing → confirm the clip leads the Business/Creator rotation; remove the seed after.

## 8. Scope / YAGNI (explicitly OUT of v1)

- **No images / Ken Burns for live content** — video-only (per decision).
- **No admin/curation UI, no "feature on landing" flag** — boost *is* the curation gate.
- **No role-specific dynamic pools** — one shared pool for business+creator.
- **No schema/RLS/migration/secret** — reads existing columns via service role.
- **No `proof.reel` wiring** — hero backdrop only.
- **No realtime** — a 5-min cached poll is enough for a backdrop.
- **Latent by design:** with no boosted video today, there is **no visible change** until such
  content exists; the deliverable is the working, tested pipeline + fallback, proven by the seed test.

## 9. Rollout / verification

- Deploy `landing-clips` (careful gate + `edge-function-reviewer` before deploy; `verify_jwt=true`,
  the default — no `config.toml` entry, per §4.1).
- Frontend ships on merge → Vercel.
- Verify prod: `landing-clips` returns `{clips:[]}` today (no eligible content) → hero shows static
  clips exactly as now (zero regression). Seed test (§7) on the test project proves the populated path.
- Codex second review before PR (touches an anon edge function).

## 10. Decisions (open questions, resolved by spec review 2026-07-17)

1. **Defense-in-depth boost check** → **YES, include the `EXISTS` captured/transferred check** (§3).
   Verified safe: `fulfill-boost` writes the `transferred` boost row *before* flipping
   `boost_status='boosted'`, so a real boost always has a matching row — the check can't over-filter,
   and it blocks a stale flag from surfacing unpaid content.
2. **Business + creator shared pool** → **KEEP** (§4.2). Live marketplace proof is on-brand for both;
   `hero.brand` stays static.
3. **Edge function (not an anon view/RPC)** → **KEEP** (§4.1). Zero new anonymous SQL surface,
   explicit auditable filtering, matches the landing's existing anon-invoke pattern.
4. **`verify_jwt`** → **`true` (default)**, corrected from the draft's `false` — logged-out invoke
   still works via the anon-key JWT, and it rejects keyless `curl`. See §4.1.
```
