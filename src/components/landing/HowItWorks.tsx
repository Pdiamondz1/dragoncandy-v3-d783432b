import React from "react";

const steps = [
  {
    number: 1,
    title: "Describe Your Restaurant's Content Needs",
    description:
      "Tell Donny what you need. Paste your restaurant's website URL and get a complete campaign brief in seconds.",
  },
  {
    number: 2,
    title: "Get Matched with Creators",
    description:
      "Our AI scores and matches you with local creators based on style, audience, and track record.",
  },
  {
    number: 3,
    title: "Content for Your Restaurant — Fast",
    description:
      "Choose DragonDash for content in hours, or standard delivery in days. Approve, pay, done.",
  },
];

export const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="bg-gray-50 -mx-4 md:-mx-8 lg:-mx-12 px-4 md:px-8 lg:px-12 py-10 md:py-16 lg:py-20 mb-8 animate-fade-in-up">
      <h2 className="text-xl md:text-3xl lg:text-4xl font-extrabold uppercase text-dc-text text-center mb-2">
        How It Works
      </h2>
      <p className="text-sm md:text-base text-gray-500 text-center mb-8 md:mb-12">
        Get professional content in 3 simple steps
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
        {steps.map((step) => (
          <div
            key={step.number}
            className="bg-white rounded-2xl p-6 border border-gray-200"
          >
            {/* Mobile: inline number + title */}
            <div className="flex items-center gap-3 mb-3 md:flex-col md:items-center md:text-center md:gap-4">
              <div className="w-9 h-9 md:w-12 md:h-12 rounded-full bg-dc-teal-btn text-white font-extrabold text-sm md:text-lg flex items-center justify-center flex-shrink-0">
                {step.number}
              </div>
              <h3 className="text-base md:text-lg font-bold text-dc-text">
                {step.title}
              </h3>
            </div>
            <p className="text-sm text-gray-500 leading-relaxed pl-12 md:pl-0 md:text-center">
              {step.description}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};
