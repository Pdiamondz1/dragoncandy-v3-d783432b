import donnyEmblem from "@/assets/donny-emblem.webp";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

/**
 * The grape "Meet Donny" card — introduces Donny using the real in-app emblem (the same crop
 * used everywhere else, `src/components/donny/DonnyAvatar.tsx`: `object-cover scale-[1.35]`
 * inside a circular mask, since the source image has transparent padding). Verbatim copy from
 * the mockup's `.donny`/`.donny-card` section. The interactive brief-generator proof block that
 * used to live here was relocated to `HowItWorks` (the "see it work" section).
 */
export function DonnySection() {
  return (
    <section id="donny" className="py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="grid items-center gap-10 rounded-[28px] bg-landing-grape p-10 text-center text-white lg:grid-cols-[auto_1fr] lg:p-14 lg:text-left">
            <span className="mx-auto inline-flex h-[150px] w-[150px] overflow-hidden rounded-full shadow-[0_0_0_5px_rgba(47,199,150,0.35)] lg:mx-0">
              <img
                src={donnyEmblem}
                alt="Donny"
                loading="lazy"
                className="h-full w-full object-cover scale-[1.35]"
              />
            </span>

            <div>
              <Eyebrow className="mb-3.5 justify-center text-landing-mint lg:justify-start">
                Meet Donny
              </Eyebrow>
              <h2 className="font-display text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-4xl lg:text-[38px]">
                The assistant in everyone's toolbelt.
              </h2>
              <p className="mx-auto mt-3.5 max-w-[560px] text-lg text-[#CBB9E0] lg:mx-0">
                Donny is DragonCandy's built-in AI — drafting, scheduling, and researching so
                creators and business owners move faster.{" "}
                <strong className="text-white">
                  Donny never replaces the humans. Donny works for them.
                </strong>
              </p>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
