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

      {/* A returning user has no reason to read "Get started" — the header's Log in is small,
          top-right and easy to miss on a page whose whole design pulls the eye to the centre.
          Deliberately a link, not a second pill: the page's premise is ONE call to action, and a
          co-equal mint button beside the pink one makes it two.
          Underlined, not colour-only — colour is never the sole cue for an affordance, and over
          moving footage it is the least reliable one.
          `landing-mint-line` (#B8ECDA), NOT the slogan's `landing-mint-line-bright` (#7BE3C0).
          This is SMALL text, so it needs 4.5:1 rather than the slogan's 3.0:1, and measured across
          all sixteen encodes in this line's own band the bright mint reaches only 3.91 at p90
          (abb-bread-pudding) while the pale one reaches 4.62. DESIGN_SYSTEM.md calls #B8ECDA "too
          pale against skin/food tones on video" — true of a 60px headline word, and backwards
          here: paler means more contrast against a bright frame, which is what small text needs.
          The lead-in is white/90 (worst 5.27 p90). Re-measure if the reel library changes. */}
      <p className="mt-6 text-base text-white/90">
        Already have an account?{" "}
        <a
          href="/auth?mode=login"
          className="font-semibold text-landing-mint-line underline underline-offset-4 decoration-landing-mint-line/50 transition-colors hover:decoration-landing-mint-line"
        >
          Log in
        </a>
      </p>
    </section>
  );
}
