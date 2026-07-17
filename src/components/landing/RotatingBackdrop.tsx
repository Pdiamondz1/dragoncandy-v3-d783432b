import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingClip } from "./landingClips";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

interface RotatingBackdropProps {
  /** Ordered playlist; each entry is a direct MP4 + still. Rotates in order, then loops. */
  playlist: LandingClip[];
  className?: string;
}

const nextIndex = (i: number, len: number) => (i + 1) % len;

/** Crossfade duration; must match the `duration-700` opacity transition on the layers. */
const CROSSFADE_MS = 700;

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

  /** Point a layer's <video> at a clip (loading only when it changes) and play or pause it. */
  const setLayerSource = useCallback(
    (layer: 0 | 1, clipIdx: number, play: boolean) => {
      const v = layerRefs[layer].current;
      const clip = clips[clipIdx];
      if (!v || !clip?.src) return;
      const changed = v.dataset.clip !== String(clipIdx);
      if (changed) {
        v.src = clip.src;
        v.poster = clip.poster ?? "";
        v.dataset.clip = String(clipIdx);
        v.load(); // <source>/src swap needs an explicit load() to re-run resource selection
      }
      if (play && inViewRef.current) {
        // Only (re)start when the clip changed or the layer is idle — never restart a clip that
        // is already playing (a parent re-render must not jump the active clip back to frame 0).
        if (changed) v.currentTime = 0;
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
    return (
      <div ref={wrapRef} className={wrapClass} aria-hidden>
        {first.poster ? (
          <img src={first.poster} alt="" className="h-full w-full object-cover" />
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
        <SingleClip clip={only} />
      </div>
    );
  }

  // Rotating → two crossfading layers.
  return (
    <div ref={wrapRef} className={wrapClass} aria-hidden>
      {[0, 1].map((layer) => (
        <video
          key={layer}
          ref={layerRefs[layer]}
          data-testid={`backdrop-layer-${layer}`}
          data-active={visible === layer}
          muted
          playsInline
          preload="auto"
          poster={clips[layerClip[layer]]?.poster}
          onEnded={() => handleEnded(layer as 0 | 1)}
          onError={() => handleEnded(layer as 0 | 1)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-in-out ${
            visible === layer ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
    </div>
  );
}

/** A single looping backdrop clip — imperative src + load() so it can't get stuck on an old clip. */
function SingleClip({ clip }: { clip: LandingClip }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v || !clip.src) return;
    v.src = clip.src;
    v.load();
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
  return (
    <video
      ref={ref}
      data-testid="backdrop-single"
      muted
      loop
      playsInline
      preload="auto"
      poster={clip.poster}
      className="h-full w-full object-cover"
    />
  );
}
