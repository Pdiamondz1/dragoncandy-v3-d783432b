import { Eyebrow } from "./Eyebrow";
import { LandingButton } from "./LandingButton";

/**
 * The landing page's content: one eyebrow, one slogan, one CTA — centred in whatever vertical
 * space the page's flex column leaves between the (absolutely overlaid) header and the footer.
 *
 * Deliberately owns NO background. The rotating video and its scrim live on the page wrapper
 * (LandingPage.tsx) so the footage runs edge to edge behind the footer too — the footer used to
 * be an opaque white band, which broke the full-bleed cinematic screen the page exists to be.
 * Anything painted here would sit on top of that footage and reintroduce a seam.
 *
 * `flex-1` (not `min-h-[100dvh]`) — the page itself is the single `min-h-[100dvh]` flex column,
 * and this section fills what's left. Claiming the full viewport height here too would push the
 * footer off-screen. `dvh` governs the OUTER wrapper because the app document never scrolls, so
 * iOS toolbars never collapse and `vh` overshoots the visible area (DESIGN_SYSTEM.md).
 */
export function LandingHero() {
  return (
    <section className="relative flex flex-1 flex-col items-center justify-center px-5 text-center sm:px-8">
      <Eyebrow className="text-white/65">People-Driven · Donny-Assisted</Eyebrow>

      <h1 className="mt-5 max-w-3xl font-display text-4xl font-extrabold leading-[1.06] tracking-tight text-white sm:text-5xl lg:text-6xl">
        Where <span className="text-landing-pink-line">Restaurants</span> &amp;{" "}
        <span className="text-landing-mint-line-bright">Creators</span> build content together.
      </h1>

      <LandingButton
        variant="pink"
        href="/auth?mode=signup"
        className="mt-9 px-10 py-4 text-lg"
      >
        Get started
      </LandingButton>
    </section>
  );
}
