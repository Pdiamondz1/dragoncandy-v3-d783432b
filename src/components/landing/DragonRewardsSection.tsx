import { ChevronRight } from "lucide-react";
import { useDragonRewardsEnabled } from "@/hooks/useDragonPoints";
import { DRAGON_TIERS, type DragonTierKey } from "@/lib/dragonTiers";
import { Reveal } from "./Reveal";

const TIER_ORDER: DragonTierKey[] = ["egg", "scout", "knight", "master", "legend"];

// Real, action-based earn examples from the Dragon Rewards engine — no signup/welcome
// bonus (there isn't one): every point comes from doing something.
const earnExamples = [
  { label: "Complete your profile", points: "+250" },
  { label: "Add your socials", points: "+150" },
  { label: "Submit your first post", points: "+225" },
  { label: "Complete a campaign", points: "+1,000" },
];

export function DragonRewardsSection() {
  // Launch-gated: the whole section is hidden until DRAGON_REWARDS_ENABLED is on,
  // so there's no empty gap before the rewards program goes live.
  const enabled = useDragonRewardsEnabled();
  if (!enabled) return null;

  return (
    <section id="rewards" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-dc-pink-accent/10 via-white/[0.03] to-dc-teal/10 p-6 sm:p-10 lg:p-14">
            <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-dc-pink-accent/15 blur-3xl" />

            <div className="relative">
              <div className="mb-4 flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-dc-pink-accent" />
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-pink-accent">
                  Dragon Rewards
                </span>
              </div>
              <h2 className="max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Every move earns{" "}
                <span className="font-script text-gradient font-normal">Dragon Points.</span>
              </h2>
              <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65 lg:text-lg">
                Complete your profile, post content, and finish campaigns to rack up points
                and climb five tiers — from Dragon Egg to Dragon Legend.
              </p>

              {/* Tier ladder */}
              <div className="mt-10 flex flex-wrap items-center gap-3">
                {TIER_ORDER.map((key, i) => {
                  const tier = DRAGON_TIERS[key];
                  return (
                    <div key={key} className="flex items-center gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${tier.colorClasses}`}
                      >
                        <span aria-hidden>{tier.emoji}</span>
                        {tier.label}
                      </span>
                      {i < TIER_ORDER.length - 1 && (
                        <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden />
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Earn examples */}
              <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
      </div>
    </section>
  );
}
