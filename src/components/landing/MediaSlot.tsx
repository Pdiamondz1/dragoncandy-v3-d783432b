import { Image as ImageIcon } from "lucide-react";

type Ratio = "square" | "video" | "portrait" | "wide" | "ultrawide";

const RATIO: Record<Ratio, string> = {
  square: "aspect-square",
  video: "aspect-video",
  portrait: "aspect-[3/4]",
  wide: "aspect-[16/7]",
  ultrawide: "aspect-[21/9]",
};

interface MediaSlotProps {
  /** Final image URL. Drop in a Nano Banana Pro export here to replace the placeholder. */
  src?: string;
  /** Required for accessibility — describes the (eventual) image. */
  alt: string;
  ratio?: Ratio;
  /** Small label shown only while the placeholder is visible (no src). */
  label?: string;
  /** Eager-load above-the-fold imagery (e.g. the hero). */
  priority?: boolean;
  className?: string;
}

/**
 * A branded image slot. With `src` it renders a cover image; without one it renders a
 * polished on-brand placeholder (teal→pink gradient + soft blobs + label) so the page
 * looks finished before real assets exist. Swappable later via the single `src` prop.
 */
export function MediaSlot({
  src,
  alt,
  ratio = "video",
  label = "Imagery",
  priority = false,
  className = "",
}: MediaSlotProps) {
  return (
    <div className={`relative overflow-hidden rounded-3xl ${RATIO[ratio]} ${className}`}>
      {src ? (
        <img
          src={src}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 bg-gradient-to-br from-dc-teal/25 via-white to-dc-pink-accent/25 ring-1 ring-inset ring-dc-text/10"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-dc-teal/25 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 -left-16 h-48 w-48 rounded-full bg-dc-pink-accent/20 blur-3xl" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <ImageIcon className="h-6 w-6 text-dc-text-muted/70" aria-hidden />
            <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-dc-text-muted/70">
              {label}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
