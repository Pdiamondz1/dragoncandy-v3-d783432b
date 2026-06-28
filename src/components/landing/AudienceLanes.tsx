import { useNavigate } from "react-router-dom";
import { ArrowRight, Store, Megaphone, Clapperboard, type LucideIcon } from "lucide-react";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { Reveal } from "./Reveal";
import { MediaSlot } from "./MediaSlot";

interface Lane {
  anchor: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  bullets: string[];
  cta: string;
  accent: "teal" | "pink";
}

const businessLane: Lane = {
  anchor: "for-business",
  icon: Store,
  eyebrow: "For Business",
  title: "Any local business",
  bullets: [
    "Restaurants, cafés, shops & services",
    "AI campaigns built from your website",
    "Same-day content with DragonDash",
  ],
  cta: "Get Started",
  accent: "teal",
};

const brandLane: Lane = {
  anchor: "for-brands",
  icon: Megaphone,
  eyebrow: "For Brands & Sponsors",
  title: "Brands & sponsors",
  bullets: [
    "Multi-location, multi-market campaigns",
    "Real-time reach & ROI analytics",
    "Managed, vetted creator network",
  ],
  cta: "Launch Campaigns",
  accent: "pink",
};

const creatorLane: Lane = {
  anchor: "for-creators",
  icon: Clapperboard,
  eyebrow: "For Creators",
  title: "Content creators",
  bullets: [
    "Paid local gigs, matched to your style",
    "Build a portfolio that pays",
    "Fast, reliable payouts",
  ],
  cta: "Join as a Creator",
  accent: "pink",
};

const lanes: Lane[] = BRAND_ROLE_ENABLED
  ? [businessLane, brandLane, creatorLane]
  : [businessLane, creatorLane];

export function AudienceLanes() {
  const navigate = useNavigate();
  const signup = () => navigate("/auth?mode=signup");
  const colsClass = lanes.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <section id="audiences" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
              Who it's for
            </span>
          </div>
          <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Built for both sides of the camera.
          </h2>
        </Reveal>

        <div className={`mt-12 grid gap-6 md:grid-cols-2 ${colsClass} lg:mt-16`}>
          {lanes.map((lane, i) => {
            const Icon = lane.icon;
            const accentText = lane.accent === "teal" ? "text-dc-teal" : "text-dc-pink-accent";
            const accentChip =
              lane.accent === "teal" ? "bg-dc-teal/15 text-dc-teal" : "bg-dc-pink-accent/15 text-dc-pink-accent";
            const ctaClass =
              lane.accent === "teal"
                ? "bg-dc-teal text-dc-dark hover:bg-dc-teal-dark hover:shadow-glow-teal"
                : "bg-dc-pink-accent-btn text-white hover:bg-dc-pink-accent-btn-hover";
            return (
              <Reveal key={lane.anchor} delay={i * 0.08}>
                <div
                  id={lane.anchor}
                  className="group flex h-full scroll-mt-24 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:border-dc-teal/40 hover:bg-white/[0.07]"
                >
                  <MediaSlot ratio="video" alt={`${lane.title} on DragonCandy`} label={lane.eyebrow} />

                  <div className="mt-6 flex items-center gap-3">
                    <span className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ${accentChip}`}>
                      <Icon className="h-5 w-5" />
                    </span>
                    <span className={`text-xs font-bold uppercase tracking-[0.25em] ${accentText}`}>
                      {lane.eyebrow}
                    </span>
                  </div>

                  <h3 className="mt-4 text-2xl font-bold text-white">{lane.title}</h3>

                  <ul className="mt-4 space-y-2.5">
                    {lane.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2.5 text-sm text-white/65">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${lane.accent === "teal" ? "bg-dc-teal" : "bg-dc-pink-accent"}`} />
                        {b}
                      </li>
                    ))}
                  </ul>

                  <button
                    onClick={signup}
                    className={`group/btn mt-7 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-base font-bold transition-all duration-300 ${ctaClass}`}
                  >
                    {lane.cta}
                    <ArrowRight className="h-4 w-4 transition-transform group-hover/btn:translate-x-1" />
                  </button>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
