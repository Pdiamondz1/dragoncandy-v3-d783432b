import { ChevronRight, Sparkles } from "lucide-react";
import { useDragonRewardsEnabled } from "@/hooks/useDragonPoints";
import { DRAGON_TIERS, type DragonTierKey } from "@/lib/dragonTiers";
import { Reveal } from "./Reveal";

const TIER_ORDER: DragonTierKey[] = ["egg", "scout", "knight", "master", "legend"];

// Real, action-based earn examples from the Dragon Rewards engine — no signup/welcome
// bonus (there isn't one): every point comes from doing something.
const earnExamples = [
  { label: "Complete your profile", points: "+250" },
  { label: "Submit your first post", points: "+225" },
  { label: "Complete a campaign", points: "+1,000" },
];

// Honest, verifiable facts only — never invented counts ("500+ creators", "10,000 posts", etc.).
const trustChips = [
  "Hoboken-born",
  "Vetted local creators",
  "Content in hours, not weeks",
  "Powered by Donny",
];

interface Testimonial {
  quote: string;
  name: string;
  role: string;
}

// PRE-REVENUE HONESTY GUARDRAIL: this ships empty by design. Do not invent quotes here —
// drop in REAL testimonials (with the person's consent to be named) as they come in. Until
// then the Proof band shows only verifiable trust chips + the rewards teaser, never fake
// social proof.
const testimonials: Testimonial[] = [];

function RewardsTeaser() {
  // Launch-gated: this sub-block is hidden until DRAGON_REWARDS_ENABLED is on — the rest of
  // the Proof band (trust chips, testimonial slot) always renders regardless of this flag.
  const enabled = useDragonRewardsEnabled();
  if (!enabled) return null;

  return (
    <Reveal delay={0.12}>
      <div className="relative mt-10 overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-dc-pink-accent/10 via-white/[0.03] to-dc-teal/10 p-6 sm:p-8 lg:p-10">
        <div className="pointer-events-none absolute -left-16 -bottom-16 h-56 w-56 rounded-full bg-dc-pink-accent/15 blur-3xl" />

        <div className="relative">
          <div className="mb-3 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-pink-accent" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-pink-accent">
              DC Rewards
            </span>
          </div>
          <h3 className="max-w-xl text-2xl font-extrabold tracking-tight text-white sm:text-3xl">
            Every move earns{" "}
            <span className="font-script text-gradient font-normal">DC Points.</span>
          </h3>

          {/* Condensed tier ladder */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {TIER_ORDER.map((key, i) => {
              const tier = DRAGON_TIERS[key];
              return (
                <div key={key} className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${tier.colorClasses}`}
                  >
                    {tier.emoji && <span aria-hidden>{tier.emoji}</span>}
                    {tier.label}
                  </span>
                  {i < TIER_ORDER.length - 1 && (
                    <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>

          {/* Condensed earn examples */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {earnExamples.map((ex) => (
              <div
                key={ex.label}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3"
              >
                <span className="text-sm text-white/70">{ex.label}</span>
                <span className="text-sm font-bold text-dc-teal">{ex.points}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Reveal>
  );
}

export function ProofSection() {
  return (
    <section id="proof" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
              Why trust DragonCandy
            </span>
          </div>
          <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Built local. Built honest.
          </h2>
        </Reveal>

        {/* Honest trust chips — verifiable facts only, no invented counts */}
        <Reveal delay={0.06}>
          <div className="mt-8 flex flex-wrap gap-3">
            {trustChips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white/80"
              >
                <Sparkles className="h-3.5 w-3.5 text-dc-teal" aria-hidden />
                {chip}
              </span>
            ))}
          </div>
        </Reveal>

        {/* Testimonial slot — renders only when real quotes are added above. */}
        {testimonials.length > 0 && (
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {testimonials.map((story, i) => (
              <Reveal key={story.name} delay={i * 0.08}>
                <figure className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-6">
                  <blockquote className="flex-1 text-base leading-relaxed text-white/80">
                    “{story.quote}”
                  </blockquote>
                  <figcaption className="mt-6">
                    <p className="text-sm font-bold text-white">{story.name}</p>
                    <p className="text-xs text-white/50">{story.role}</p>
                  </figcaption>
                </figure>
              </Reveal>
            ))}
          </div>
        )}

        <RewardsTeaser />
      </div>
    </section>
  );
}
