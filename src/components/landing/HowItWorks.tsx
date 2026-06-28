import React from "react";
import { Reveal } from "./Reveal";

const steps = [
  {
    number: "01",
    title: "Paste your link",
    description:
      "Drop your website or socials. Donny reads your brand and writes a complete campaign brief in seconds.",
  },
  {
    number: "02",
    title: "Get matched with creators",
    description:
      "Our AI scores and matches local creators by style, audience, and track record — no guesswork.",
  },
  {
    number: "03",
    title: "Content for your business, fast",
    description:
      "Choose DragonDash for content in hours, or standard delivery in days. Approve, pay, done.",
  },
];

export const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
              How it works
            </span>
          </div>
          <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            From paste to posted in three steps.
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-12 md:grid-cols-3 md:gap-8 lg:mt-20">
          {steps.map((step, i) => (
            <Reveal key={step.number} delay={i * 0.08}>
              <div className="relative">
                <span className="text-gradient text-5xl font-extrabold tabular-nums lg:text-6xl">
                  {step.number}
                </span>
                <h3 className="mt-5 text-xl font-bold text-white lg:text-2xl">
                  {step.title}
                </h3>
                <p className="mt-3 max-w-sm text-base leading-relaxed text-white/55">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};
