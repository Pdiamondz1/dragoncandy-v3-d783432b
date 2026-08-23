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
 * It's a stall backstop, not a pacer — sized to comfortably outlast a normal backdrop clip so it
 * never cuts a healthy one short.
 *
 * This is the reason the reel library is capped at 12s per clip: this constant is a limit on the
 * PLAYER, and 12s is the encoding-time limit chosen to stay comfortably under it (see
 * `docs/runbooks/landing-video-backdrop-kit.md` §"The 12-second cap — and why it exists"). If you
 * are about to add a reel longer than 12s, either trim it or raise this constant first — a longer
 * clip trips the watchdog mid-play and reads as a stutter, not a clean cut.
 *
 * The timer is armed the instant a layer becomes ACTIVE (so a clip that never starts at all is
 * still caught — see the backstop note on the watchdog effect below), and then RESET the instant
 * that layer's `playing` event actually fires. Those are not the same moment: becoming active
 * only means the layer was told to play, not that a frame has rendered — on a slow connection the
 * clip can spend real time buffering first. Against a 12s clip, the margin between "active" and
 * "12s of playback" is only ~3s, which slow-start buffering can easily exceed; measuring from
 * `playing` instead gives every clip that DOES start its own full 15s from the moment it's
 * actually visible, while a clip that never fires `playing` still times out on the original
 * from-active schedule.
 */
const MAX_DWELL_MS = 15000;

/**
 * Full-bleed cinematic hero backdrop that rotates through the landing's reel playlist with a
 * crossfade.
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
  // Bumped every time the ACTIVE layer's `playing` event fires — a dependency purely so the
  // watchdog effect below re-arms its timer from that moment. See MAX_DWELL_MS's comment.
  const [playSignal, setPlaySignal] = useState(0);

  // Refs mirror state so the async `ended`/observer handlers never read a stale closure.
  const visibleRef = useRef<0 | 1>(0);
  const layerClipRef = useRef<[number, number]>(layerClip);
  const inViewRef = useRef(true); // above the fold → assume in view until told otherwise
  const queueTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors `isLandscape` so async handlers (`handleEnded`, the watchdog) never read a stale
  // closure — same pattern as `visibleRef`/`layerClipRef`. Assigned during RENDER (not only in an
  // effect): the "arm rotation" effect below runs in the same commit and reads this ref, so if the
  // write happened only inside a later-declared effect, a commit where `isLandscape` changes
  // together with `rotating`/`len` would let the arming effect run first against a stale value —
  // exactly the double-fetch Ruling A exists to prevent.
  const landscapeRef = useRef(isLandscape);
  landscapeRef.current = isLandscape;
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

  // Re-point both layers at their CURRENT clip indices when orientation changes — leaving
  // `layerClip`/`visible` untouched, so a flip never restarts the rotation from clip 0 or jumps
  // the playing clip back to frame 0 (setLayerSource's own clip-vs-orientation tracking handles
  // the resume-in-place behaviour). `landscapeRef` itself is kept current during render, above —
  // not here — so this effect and the arming effect above never race on a stale ref value.
  useEffect(() => {
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
      // next cycle. The next `ended` is up to 12s away (the reel library's hard cap), so preload
      // lead time is ample.
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

  // Fired on the active layer's `playing` event — i.e. playback has genuinely started, as
  // opposed to merely having been told to play. Bumps `playSignal` so the watchdog effect below
  // re-arms its timer from this moment rather than from whenever the layer became active. Guarded
  // the same way `handleEnded` is: a `playing` event from the hidden/preloading layer (which is
  // never given `play: true`) is ignored.
  const handlePlaying = useCallback(
    (layer: 0 | 1) => {
      if (!rotating || layer !== visibleRef.current) return;
      setPlaySignal((n) => n + 1);
    },
    [rotating],
  );

  // Stall watchdog: arm a max-dwell timer each time a layer becomes active, AND re-arm it (full
  // window, from scratch) the moment that layer's video actually starts playing. Two triggers,
  // deliberately kept both:
  //  - `visible` changing is the BACKSTOP — it fires the instant a layer is told to play, so a
  //    clip that never starts at all (never fires `playing`, `ended`, or `error`) is still force-
  //    advanced on schedule. Arming only on `playing` would let such a clip freeze the backdrop
  //    forever — a strictly worse bug than the one this timer resets are fixing.
  //  - `playSignal` changing means the active clip's `playing` event just fired — playback has
  //    genuinely started, so the clip is re-measured a full MAX_DWELL_MS from THAT moment instead
  //    of from whenever it became active. See MAX_DWELL_MS's comment for why that gap matters.
  // A normal advance (`ended`/`error` → handleEnded → setVisible) changes `visible`, which
  // re-runs this effect and clears the prior timer either way — so a healthy clip never trips it.
  useEffect(() => {
    if (!rotating) return;
    const t = setTimeout(() => handleEnded(visibleRef.current), MAX_DWELL_MS);
    return () => clearTimeout(t);
  }, [visible, playSignal, rotating, handleEnded]);

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
            onPlaying={() => handlePlaying(layer as 0 | 1)}
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
  const inViewRef = useRef(true); // above the fold → assume in view until told otherwise

  // Swap the source only when the RESOLVED url actually changes — a reel with no `wide` encode
  // resolves to the same file regardless of orientation, and reloading it would pointlessly
  // interrupt an already-playing clip. `dataset.baseSrc` tracks the underlying (unresolved) clip
  // identity so a genuine reload resumes in place on an orientation-only flip rather than
  // restarting from frame 0 — the same clip-vs-orientation distinction as the rotating layers.
  // `v.load()` pauses the element and nothing else re-triggers playback afterward (an already-
  // observing IntersectionObserver does not re-fire on its own, and there is no `autoplay`), so
  // this effect resumes playback itself, subject to the same in-view condition the observer
  // effect maintains — otherwise an orientation flip permanently freezes the clip on its poster.
  useEffect(() => {
    const v = ref.current;
    if (!v || !clip.src) return;
    const { src } = resolveReelSource(clip, isLandscape);
    if (v.dataset.resolvedSrc === src) return; // same file already loaded/playing — no-op
    const resumeAt = v.dataset.baseSrc === clip.src ? v.currentTime : 0;
    v.src = src;
    v.dataset.baseSrc = clip.src;
    v.dataset.resolvedSrc = src;
    v.load(); // <source>/src swap needs an explicit load() to re-run resource selection
    v.currentTime = resumeAt;
    if (inViewRef.current) void v.play().catch(() => {});
  }, [clip.src, isLandscape]);

  // Pause off-screen / resume on-screen. Set up once per clip, independent of orientation, so a
  // flip never tears down and recreates the observer mid-play.
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    const play = () => {
      inViewRef.current = true;
      void v.play().catch(() => {});
    };
    const pause = () => {
      inViewRef.current = false;
      v.pause();
    };
    if (typeof IntersectionObserver === "undefined") {
      play();
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => (entry.isIntersecting ? play() : pause()),
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
