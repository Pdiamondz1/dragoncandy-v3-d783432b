import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

/**
 * The full-bleed grape "positioning" band between the hero doors and the values grid — states
 * what DragonCandy is in one sentence, with the AI-is-background-only line emphasized. Verbatim
 * copy from the mockup's `.band` section.
 */
export function PositioningBand() {
  return (
    <section className="bg-landing-grape py-20 text-white lg:py-[88px]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <Eyebrow className="mb-5 text-landing-yellow">What DragonCandy is</Eyebrow>
          <h2 className="max-w-[760px] font-display text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-4xl lg:text-[44px]">
            A platform built for two kinds of builders.
          </h2>
          <p className="mt-5 max-w-[680px] text-lg text-[#CBB9E0]">
            Business owners get matched with real, human creators who become their social media
            team. Creators get matched with real businesses — plus the tools to run their
            creative work like the business it is.{" "}
            <strong className="text-white">
              AI works in the background to make everyone faster, but every strategy, every post,
              and every relationship is human-driven.
            </strong>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
