import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

type LandingButtonVariant = "pink" | "mint" | "ghost";

const BASE_CLASSES =
  "inline-flex items-center justify-center rounded-full font-semibold px-6 py-3 " +
  "transition-[transform,box-shadow] motion-safe:hover:-translate-y-0.5 " +
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-landing-yellow";

const VARIANT_CLASSES: Record<LandingButtonVariant, string> = {
  // `text-landing-grape`, NOT white. White on `landing-pink` (#F43F7F) measures **3.58:1**,
  // under the 4.5:1 WCAG needs for this label (18px — the 3.0:1 large-text allowance starts
  // at 18.66px bold). Lighthouse fails it, and it is the primary CTA on the homepage.
  // Grape on the same pink is **4.83:1**, and it keeps the BRAND COLOUR itself unchanged.
  // The alternative was darkening the fill to `landing-pink-ink` (#C22760, 5.60:1 with white)
  // — rejected because the page behind this button is dark video, and the bright pink is what
  // makes the CTA pop off it; #C22760 sits close to the grape scrim and recedes.
  // This also matches the sibling variant, which has always been grape-on-fill (8.01:1).
  pink: "bg-landing-pink text-landing-grape shadow-landing-pink hover:shadow-landing-pink-hover",
  mint: "bg-landing-mint text-landing-grape shadow-landing-mint hover:shadow-landing-mint-hover",
  ghost: "border-2 border-landing-grape text-landing-grape hover:bg-landing-lilac",
};

interface LandingButtonSharedProps {
  variant?: LandingButtonVariant;
  className?: string;
  children?: ReactNode;
}

type LandingAnchorProps = LandingButtonSharedProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children"> & { href: string };

type LandingBtnProps = LandingButtonSharedProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "children"> & { href?: undefined };

type LandingButtonProps = LandingAnchorProps | LandingBtnProps;

/**
 * The landing's chunky pill CTA (`.btn`/`.btn-pink`/`.btn-mint`/`.btn-ghost` in the mockup) —
 * a hard drop-shadow "step" that grows on hover, a motion-safe lift, and a visible focus ring.
 * Polymorphic: pass `href` for an in-page anchor CTA, omit it for an action `<button>`.
 */
export function LandingButton({ variant = "pink", className, children, href, ...rest }: LandingButtonProps) {
  const classes = cn(BASE_CLASSES, VARIANT_CLASSES[variant], className);

  if (href !== undefined) {
    return (
      <a href={href} className={classes} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {children}
      </a>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;

  return (
    <button {...buttonRest} type={buttonRest.type ?? "button"} className={classes}>
      {children}
    </button>
  );
}
