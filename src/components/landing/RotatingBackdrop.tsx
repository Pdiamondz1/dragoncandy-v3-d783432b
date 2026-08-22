import { useCallback, useEffect, useRef, useState } from "react";
import { resolveReelSource, type LandingReel } from "./landingClips";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";
import { useIsLandscape } from "./useIsLandscape";

interface RotatingBackdropProps {
  /** Ordered playlist; each entry is a direct MP4 + still. Rotates in order, then loops. */
  playlist: LandingReel[];
  className?: string;
}

const nextIndex = (i: number, len: number) => (i + 1) % len;

/** Crossfade duration; must match the `duration-700` opacity transition on the layers. */
const CROSSFADE_MS = 700;

/**
 * Max time a single clip may hold the screen before the rotation force-advances. A clip that
 * neither fires `ended` nor `error` (e.g. an undecodable HEVC clip a browser shows black for
 * without erroring, or a mid-play network stall) would otherwise freeze the backdrop forever.
 * Comfortably longer than a normal backdrop clip (~6–10s) so it never cuts a healthy one short —
 * it's a stall backstop, not a pacer.
 */
const MAX_DWELL_MS = 15000;

/**
 * Full-bleed cinematic hero backdrop that rotates through a per-role playlist with a crossfade.
 *
 * Rendering paths:
 * - **rotating** (motion allowed AND playlist has >1 clip): two stacked `<video>` layers. The
 *   active layer plays one clip to its end; the other layer has the *next* clip preloaded and
 *   fades in over ~700ms when the active one ends. Only ever two clips are loaded at once. A clip
 *   that fails to load/decode (bad codec, 404, corrupt) never fires `ended`, so the rotation also
 *   advances on `error` (and skips a preloaded-but-already-errored incoming clip) — an unplayable
 *   clip can never permanently freeze the backdrop.
 * - **single** (motion allowed, one clip): a lone looping `<video>` (identical to the old
 *   single-clip backdrop).
 * - **reduced-motion**: a static poster `<img>` (first clip) — no motion, no video fetch.
 * - **empty**: the branded gradient placeholder (ship-before-clips).
 *
 * Sources are assigned imperatively via refs + `video.load()` (not a declarative `<source>`),
 * because swapping a `<source>` child does NOT re-run a `<video>`'s resource selection.
 *
 * Reset-on-role-switch is handled by the parent keying this component on the role, so each role
 * mounts a fresh instance starting at clip 0 — no cross-role playlist bookkeeping needed here.
 */
export function RotatingBackdrop({ playlist, className = "" }: RotatingBackdropProps) {
  const reduce = usePrefersReducedMotion();
  const isLandscape = useIsLandscape();
  const clips = playlist.filter((c) => !!c.src);
  const len = clips.length;
  const rotating = !reduce && len > 1;

  const wrapRef = useRef<HTMLDivElement>(null);
  const layer0Ref = useRef<HTMLVideoElement>(null);
  const layer1Ref = useRef<HTMLVideoElement>(null);
  const layerRefs = [layer0Ref, layer1Ref] as const;

  // Which layer (0|1) is visible/playing, and which clip index each layer currently holds.
  const [visible, setVisible] = useState<0 | 1>(0);
  const [layerClip, setLayerClip] = useState<[number, number]>(() => [0, len > 1 ? 1 : 0]);

  // Refs mirror state so the async `ended`/observer handlers never read a stale closure.
  const visibleRef = useRef<0 | 1>(0);
  const layerClipRef = useRef<[number, number]>(layerClip);
  const inViewRef = useRef(true); // above the fold → assume in view until told otherwise
  const queueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `isLandscape` so async handlers (`handleEnded`, the watchdog) never read a stale
  // closure — same pattern as `visibleRef`/`layerClipRef`. Initialised to the hook's own
  // synchronous first value, so a rotating layer never resolves against a wrong default on mount.
  const landscapeRef = useRef(isLandscape);
  useEffect(() => {
    visibleRef.current = visible;
  }, [visible]);
  useEffect(() => {
    layerClipRef.current = layerClip;
  }, [layerClip]);
  // Clear any pending deferred-preload timer on unmount (role switch remounts this component).
  useEffect(() => () => {
    if (queueTimer.current) clearTimeout(queueTimer.current);
  }, []);

  /**
   * Point a layer's <video> at a clip (loading only when the clip or orientation changes) and
   * play or pause it. Clip and orientation are tracked as SEPARATE dataset keys so a same-clip
   * orientation swap is distinguishable from a clip change — only a genuine clip change resets
   * `currentTime`; an orientation flip keeps its place.
   */
  const setLayerSource = useCallback(
    (layer: 0 | 1, clipIdx: number, play: boolean) => {
      const v = layerRefs[layer].current;
      const clip = clips[clipIdx];
      if (!v || !clip?.src) return;
      const { src, poster } = resolveReelSource(clip, landscapeRef.current);
      const orient = landscapeRef.current ? "w" : "p";
      const clipChanged = v.dataset.clip !== String(clipIdx);
      const orientChanged = v.dataset.orient !== orient;
      if (clipChanged || orientChanged) {
        const resumeAt = orientChanged && !clipChanged ? v.currentTime : 0;
        v.src = src;
        v.poster = poster ?? "";
        v.dataset.clip = String(clipIdx);
        v.dataset.orient = orient;
        v.load(); // <source>/src swap needs an explicit load() to re-run resource selection
        // Only a genuine clip change starts from the top. An orientation flip keeps its place.
        v.currentTime = resumeAt;
      }
      if (play && inViewRef.current) {
        // Never restart a clip that is already playing (a parent re-render must not jump the
        // active clip back to frame 0).
        if (v.paused) void v.play().catch(() => {});
      } else if (!play) {
        v.pause();
      }
    },
    // clips is derived from props each render; layerRefs are stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [playlist],
  );

  // Arm rotation: play clip 0 on the active layer, preload clip 1 on the hidden layer.
  useEffect(() => {
    if (!rotating) return;
    setLayerSource(0, 0, true);
    setLayerSource(1, nextIndex(0, len), false);
  }, [rotating, len, setLayerSource]);

  // Keep landscapeRef in sync, and re-point both layers at their CURRENT clip indices when
  // orientation changes — leaving `layerClip`/`visible` untouched, so a flip never restarts the
  // rotation from clip 0 or jumps the playing clip back to frame 0 (setLayerSource's own
  // clip-vs-orientation tracking handles the resume-in-place behaviour).
  useEffect(() => {
    landscapeRef.current = isLandscape;
    if (!rotating) return;
    const [c0, c1] = layerClipRef.current;
    setLayerSource(0, c0, visibleRef.current === 0);
    setLayerSource(1, c1, visibleRef.current === 1);
  }, [isLandscape, rotating, setLayerSource]);

  // Advance the rotation off the visible layer. Fired on the active clip's `ended` AND on its
  // `error` (a clip that fails to load/decode never fires `ended`, so without the error path a
  // single unplayable clip — e.g. an HEVC .MOV Chrome can't decode, a 404, a corrupt file —
  // would freeze the backdrop forever). Guards `layer === visibleRef.current`, so an `error`
  // fired by the hidden/preloading layer is ignored here (handled lazily by the already-errored
  // skip below when that layer would next become visible).
  const handleEnded = useCallback(
    (layer: 0 | 1) => {
      if (!rotating || layer !== visibleRef.current) return;
      const other = (1 - layer) as 0 | 1;
      let incoming = layerClipRef.current[other]; // already preloaded on `other`

      // If the preloaded incoming clip already failed while it was the hidden layer, its `error`
      // event has ALREADY fired (won't re-fire) and it will NEVER fire `ended` — showing it would
      // stall the rotation. Skip past it to the next clip, which `setLayerSource` loads fresh
      // below (a `load()` resets `.error` to null). A still-bad fresh clip re-advances async via
      // its own `onError`, and the known-good static backfill clips are mp4, so the rotation
      // converges. `.error` is null on a freshly-loaded clip, so this skips at most one dead clip
      // per activation — no synchronous advance loop.
      if (layerRefs[other].current?.error) {
        incoming = nextIndex(incoming, len);
        setLayerClip((prev) => {
          const n: [number, number] = [prev[0], prev[1]];
          n[other] = incoming;
          return n;
        });
      }

      setLayerSource(other, incoming, true); // play the incoming clip as it fades in
      setVisible(other); // starts the 700ms opacity crossfade

      // Defer swapping the OUTGOING layer's source until the fade finishes. It stays on the
      // last frame of the clip that just ended (fading out) instead of flashing the next clip's
      // first frame; once fully hidden we point it at the queued clip and preload it for the
      // next cycle. The next `ended` is ~8-10s away, so preload lead time is ample.
      const queued = nextIndex(incoming, len);
      if (queueTimer.current) clearTimeout(queueTimer.current);
      queueTimer.current = setTimeout(() => {
        setLayerClip((prev) => {
          const n: [number, number] = [prev[0], prev[1]];
          n[layer] = queued;
          return n;
        });
        setLayerSource(layer, queued, false); // preload next on the now-hidden layer
      }, CROSSFADE_MS + 50);
    },
    // layerRefs are stable (ref containers), same as setLayerSource / the observer effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rotating, len, setLayerSource],
  );

  // Stall watchdog: arm a max-dwell timer each time a layer becomes active. A normal advance
  // (`ended`/`error` → handleEnded → setVisible) changes `visible`, which re-runs this effect and
  // clears the prior timer — so a healthy clip never trips it. If a clip neither ends nor errors
  // within MAX_DWELL_MS (undecodable-but-silent HEVC, a mid-play stall), the timer force-advances
  // so the rotation can never permanently freeze. Fires against the *current* visible layer.
  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => handleEnded(visibleRef.current), MAX_DWELL_MS);
    return () => clearTimeout(t);
  }, [visible, rotating, handleEnded]);

  // Pause off-screen / resume the active layer on-screen (battery + CPU). Only relevant in
  // rotating mode; the single-clip and reduced-motion paths self-manage (SingleClip / static img).
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!rotating || !wrap || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        const active = layerRefs[visibleRef.current].current;
        if (entry.isIntersecting) void active?.play().catch(() => {});
        else {
          layer0Ref.current?.pause();
          layer1Ref.current?.pause();
        }
      },
      { rootMargin: "150px 0px" },
    );
    io.observe(wrap);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rotating]);

  const wrapClass = `absolute inset-0 h-full w-full overflow-hidden ${className}`;

  // Empty → branded gradient placeholder (ship-before-clips).
  if (len === 0) {
    return (
      <div ref={wrapRef} className={wrapClass} aria-hidden>
        <div className="absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-dc-dark to-dc-pink-accent/25" />
      </div>
    );
  }

  // Reduced motion → a still poster, no video fetch, no rotation.
  if (reduce) {
    const first = clips[0];
    const { poster: firstPoster } = resolveReelSource(first, isLandscape);
    return (
      <div ref={wrapRef} className={wrapClass} aria-hidden>
        {firstPoster ? (
          <img src={firstPoster} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-dc-dark to-dc-pink-accent/25" />
        )}
      </div>
    );
  }

  // Single clip → one looping video (behaviour identical to the pre-rotation backdrop).
  if (!rotating) {
    const only = clips[0];
    return (
      <div ref={wrapRef} className={wrapClass} aria-hidden>
        <SingleClip clip={only} isLandscape={isLandscape} />
      </div>
    );
  }

  // Rotating → two crossfading layers.
  return (
    <div ref={wrapRef} className={wrapClass} aria-hidden>
      {[0, 1].map((layer) => {
        const layerClipItem = clips[layerClip[layer]];
        const layerPoster = layerClipItem
          ? resolveReelSource(layerClipItem, isLandscape).poster
          : undefined;
        return (
          <video
            key={layer}
            ref={layerRefs[layer]}
            data-testid={`backdrop-layer-${layer}`}
            data-active={visible === layer}
            muted
            playsInline
            preload="auto"
            poster={layerPoster}
            onEnded={() => handleEnded(layer as 0 | 1)}
            onError={() => handleEnded(layer as 0 | 1)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
              visible === layer ? "opacity-100" : "opacity-0"
            }`}
          />
        );
      })}
    </div>
  );
}

/** A single looping backdrop clip — imperative src + load() so it can't get stuck on an old clip. */
function SingleClip({ clip, isLandscape }: { clip: LandingReel; isLandscape: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);

  // Swap the source when the clip or viewport orientation changes. `dataset.baseSrc` tracks the
  // underlying (unresolved) clip identity so an orientation-only flip resumes in place rather
  // than restarting from frame 0 — the same clip-vs-orientation distinction as the rotating layers.
  useEffect(() => {
    const v = ref.current;
    if (!v || !clip.src) return;
    const { src } = resolveReelSource(clip, isLandscape);
    const resumeAt = v.dataset.baseSrc === clip.src ? v.currentTime : 0;
    v.src = src;
    v.dataset.baseSrc = clip.src;
    v.load(); // <source>/src swap needs an explicit load() to re-run resource selection
    v.currentTime = resumeAt;
  }, [clip.src, isLandscape]);

  // Pause off-screen / resume on-screen. Set up once per clip, independent of orientation, so a
  // flip never tears down and recreates the observer mid-play.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const play = () => void v.play().catch(() => {});
    if (typeof IntersectionObserver === "undefined") {
      play();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? play() : v.pause()),
      { rootMargin: "150px 0px" },
    );
    io.observe(v);
    return () => {
      io.disconnect();
      v.pause();
    };
  }, [clip.src]);

  const { poster } = resolveReelSource(clip, isLandscape);
  return (
    <video
      ref={ref}
      data-testid="backdrop-single"
      muted
      loop
      playsInline
      preload="auto"
      poster={poster}
      className="h-full w-full object-cover"
    />
  );
}
