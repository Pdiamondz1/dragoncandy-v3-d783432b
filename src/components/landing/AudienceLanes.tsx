import { useNavigate } from "react-router-dom";
import { ArrowRight, Store, Megaphone, Clapperboard, type LucideIcon } from "lucide-react";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { Reveal } from "./Reveal";
import { MediaSlot } from "./MediaSlot";

interface Lane {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  hook: string;
  role: "business" | "creator" | "brand";
  cta: string;
  accent: "teal" | "pink";
}

const businessLane: Lane = {
  icon: Store,
  eyebrow: "For Business",
  title: "Any local business",
  hook: "Content in hours.",
  role: "business",
  cta: "Get Started",
  accent: "teal",
};

const brandLane: Lane = {
  icon: Megaphone,
  eyebrow: "For Brands & Sponsors",
  title: "Brands & sponsors",
  hook: "Scale campaigns.",
  role: "brand",
  cta: "Launch Campaigns",
  accent: "pink",
};

const creatorLane: Lane = {
  icon: Clapperboard,
  eyebrow: "For Creators",
  title: "Content creators",
  hook: "Get paid to film.",
  role: "creator",
  cta: "Join as a Creator",
  accent: "pink",
};

const lanes: Lane[] = BRAND_ROLE_ENABLED
  ? [businessLane, brandLane, creatorLane]
  : [businessLane, creatorLane];

export function AudienceLanes() {
  const navigate = useNavigate();
  const signupWithRole = (role: string) => navigate(`/auth?mode=signup&role=${role}`);
  const colsClass = lanes.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";

  return (
    <section id="pick-your-lane" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Pick your lane.
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
              <Reveal key={lane.role} delay={i * 0.08}>
                <div className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/5 p-5 transition-all duration-300 hover:border-dc-teal/40 hover:bg-white/[0.07]">
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

                  <p className="mt-3 text-sm text-white/75">{lane.hook}</p>

                  <button
                    onClick={() => signupWithRole(lane.role)}
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
