import { lazy, Suspense } from "react";
import { CheckCircle2, ArrowDown } from "lucide-react";
import { Reveal } from "./Reveal";

// Code-split the interactive brief generator so it stays out of the initial bundle.
const BriefGeneratorPreview = lazy(() =>
  import("./BriefGeneratorPreview").then((m) => ({ default: m.BriefGeneratorPreview })),
);

const growthPoints = [
  "Full campaigns in seconds, not days",
  "AI-scored creator matching — quality, not luck",
  "Auto-scheduling across every connected channel",
  "Performance analytics that compound into a moat",
];

export function DonnySection() {
  return (
    <section id="donny" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.05] via-white/[0.02] to-dc-teal/[0.07] p-6 sm:p-10 lg:p-14">
          <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-dc-teal/15 blur-3xl" />

          <div className="relative grid gap-12 lg:grid-cols-2 lg:items-center lg:gap-16">
            <Reveal>
              <div>
                <div className="mb-4 flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-dc-teal" />
                  <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
                    The tech
                  </span>
                </div>
                <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                  Meet Donny — your{" "}
                  <span className="text-gradient">AI growth engine.</span>
                </h2>
                <p className="mt-5 max-w-md text-base leading-relaxed text-white/65 lg:text-lg">
                  Donny is the intelligence layer under everything: it reads your brand,
                  writes the campaign, finds the right creators, schedules the posts, and
                  learns from every result — so your content gets smarter as you grow.
                </p>

                <ul className="mt-8 space-y-3">
                  {growthPoints.map((point) => (
                    <li key={point} className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-dc-teal" />
                      <span className="text-base text-white/75">{point}</span>
                    </li>
                  ))}
                </ul>

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
