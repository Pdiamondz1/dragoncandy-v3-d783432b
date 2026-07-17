import React from "react";
import { Reveal } from "./Reveal";

const steps = [
  {
    number: "01",
    title: "Paste your link",
  },
  {
    number: "02",
    title: "Donny builds it",
  },
  {
    number: "03",
    title: "Creators deliver",
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
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
};
