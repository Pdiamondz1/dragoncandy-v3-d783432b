import { lazy, Suspense } from "react";
import { ArrowDown } from "lucide-react";
import { Reveal } from "./Reveal";

// Code-split the interactive brief generator so it stays out of the initial bundle.
const BriefGeneratorPreview = lazy(() =>
  import("./BriefGeneratorPreview").then((m) => ({ default: m.BriefGeneratorPreview })),
);

export function DonnySection() {
  return (
    <section id="see-it-work" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-dc-teal/[0.07] p-6 sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-dc-teal/15 blur-3xl" />

          <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <Reveal>
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-dc-teal" />
                  <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
                    See it work
                  </span>
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Watch Donny build your first{" "}
                  <span className="font-script text-gradient">campaign.</span>
                </h2>
                <p className="mt-5 max-w-md text-base text-white/65 lg:text-lg">
                  Paste a URL and watch Donny write a complete campaign brief.
                </p>

                <p className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-dc-pink-accent">
                  Try it now — paste a link
                  <ArrowDown className="h-4 w-4 animate-float lg:hidden" />
                </p>
              </div>
            </Reveal>

            <Reveal delay={0.1}>
              <Suspense fallback={null}>
                <BriefGeneratorPreview />
              </Suspense>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
