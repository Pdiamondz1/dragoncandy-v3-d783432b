import { lazy, Suspense } from "react";
import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

// Code-split the interactive brief generator so it stays out of the initial bundle — relocated
// here (from `DonnySection`) as the "see it work" proof block under the 3 steps.
const BriefGeneratorPreview = lazy(() =>
  import("./BriefGeneratorPreview").then((m) => ({ default: m.BriefGeneratorPreview })),
);

interface Step {
  id: string;
  number: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    id: "tell-us",
    number: "01",
    title: "Tell us what you're building",
    body: "Businesses share their brand and goals. Creators share their skills and style. Takes minutes.",
  },
  {
    id: "get-matched",
    number: "02",
    title: "Get matched with a person",
    body: "We pair businesses with creators who genuinely fit — voice, industry, and ambition.",
  },
  {
    id: "build-together",
    number: "03",
    title: "Build together, faster",
    body: "Work runs through the platform — with AI handling drafts, scheduling, and research in the background.",
  },
];

/**
 * The lilac "how it works" section — a centered head over a 3-card grid of pixel-numbered
 * steps (verbatim copy from the mockup's `.how`/`.how-grid`/`.step`), followed by a "see it
 * work" proof block that folds in the live brief generator (relocated from `DonnySection`).
 */
export function HowItWorks() {
  return (
    <section id="how" className="bg-landing-lilac py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mx-auto mb-14 max-w-xl text-center">
            <Eyebrow className="mb-4 justify-center text-landing-pink">How it works</Eyebrow>
            <h2 className="font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-landing-ink sm:text-4xl lg:text-[42px]">
              From match to momentum.
            </h2>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Reveal key={step.id} delay={i * 0.08}>
              <div className="h-full rounded-[20px] bg-white p-8">
                <span
                  className="block font-pixel text-[13px] text-landing-pink mb-3.5"
                  aria-hidden="true"
                >
                  {step.number}
                </span>
                <h3 className="font-display text-xl font-semibold text-landing-ink">
                  {step.title}
                </h3>
                <p className="mt-2 text-[15px] text-landing-ink-soft">{step.body}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={0.1}>
          <div id="see-it-work" className="mt-16 scroll-mt-20 lg:mt-20">
            <div className="mx-auto mb-8 max-w-xl text-center">
              <Eyebrow className="mb-4 justify-center text-landing-mint">See it work</Eyebrow>
              <h3 className="font-display text-2xl font-semibold text-landing-ink sm:text-3xl">
                Paste your website — watch Donny draft a campaign brief.
              </h3>
              <p className="mt-3 text-[15px] text-landing-ink-soft">
                A free starting point Donny drafts for you — no sign-up required.
              </p>
            </div>

            <Suspense fallback={null}>
              <BriefGeneratorPreview />
            </Suspense>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
