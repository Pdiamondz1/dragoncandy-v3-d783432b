import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Maximize, Minimize, Printer } from "lucide-react";
import { SEO } from "@/components/SEO";
import { slides } from "./slides";
import "./pitch-print.css";

const SLIDE_W = 1280;
const SLIDE_H = 720;

/**
 * DragonCandy investor deck. Standalone, unlisted route (/pitch) rendered
 * outside the app nav/auth chrome. On screen: one slide at a time, scaled to
 * fit. In print: every slide is one landscape 16:9 page (see pitch-print.css).
 */
export default function PitchDeck() {
  const [active, setActive] = useState(0);
  const [scale, setScale] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const total = slides.length;

  // Fit the 1280x720 canvas to the viewport.
  useEffect(() => {
    const fit = () =>
      setScale(Math.min(window.innerWidth / SLIDE_W, window.innerHeight / SLIDE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const next = useCallback(() => setActive((a) => Math.min(total - 1, a + 1)), [total]);
  const prev = useCallback(() => setActive((a) => Math.max(0, a - 1)), []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }, []);

  // Keyboard navigation.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowRight":
        case "PageDown":
        case " ":
          e.preventDefault();
          next();
          break;
        case "ArrowLeft":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Home":
          e.preventDefault();
          setActive(0);
          break;
        case "End":
          e.preventDefault();
          setActive(total - 1);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, total, toggleFullscreen]);

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  return (
    <>
      <SEO
        title="DragonCandy — Investor Deck"
        description="DragonCandy investor presentation. Confidential."
        path="/pitch"
        noindex
      />
      <div className="pitch-root fixed inset-0 overflow-hidden bg-dc-dark">
        <div className="pitch-deck h-full w-full">
          {slides.map((Slide, i) => (
            <div key={i} className={`pitch-slide-wrap ${i === active ? "is-active" : ""}`}>
              <div
                className="pitch-slide"
                style={{ width: SLIDE_W, height: SLIDE_H, transform: `scale(${scale})` }}
              >
                <Slide index={i} total={total} />
              </div>
            </div>
          ))}
        </div>

        {/* On-screen controls (hidden in print) */}
        <div className="pitch-controls absolute inset-x-0 bottom-5 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={prev}
            disabled={active === 0}
            aria-label="Previous slide"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-2 rounded-full bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur tabular-nums">
            {String(active + 1).padStart(2, "0")}
            <span className="text-white/40">/ {String(total).padStart(2, "0")}</span>
          </div>

          <button
            type="button"
            onClick={next}
            disabled={active === total - 1}
            aria-label="Next slide"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            aria-label="Print / export PDF"
            className="ml-2 flex h-11 w-11 items-center justify-center rounded-full bg-dc-teal/20 text-dc-teal backdrop-blur transition hover:bg-dc-teal/30"
          >
            <Printer className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label="Toggle fullscreen"
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur transition hover:bg-white/20"
          >
            {isFullscreen ? <Minimize className="h-5 w-5" /> : <Maximize className="h-5 w-5" />}
          </button>
        </div>
      </div>
    </>
  );
}
