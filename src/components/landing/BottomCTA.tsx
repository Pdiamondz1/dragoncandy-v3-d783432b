import { useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { Reveal } from "./Reveal";

export const BottomCTA = () => {
  const navigate = useNavigate();
  const signupAs = (role?: string) =>
    navigate(`/auth?mode=signup${role ? `&role=${role}` : ''}`);

  return (
    <section id="cta" className="py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-dc-teal/12 via-white/[0.04] to-dc-pink-accent/12 px-6 py-16 text-center lg:px-16 lg:py-24">
            <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-dc-teal/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -left-24 h-72 w-72 rounded-full bg-dc-pink-accent/15 blur-3xl" />

            <div className="relative">
              <h2 className="mx-auto max-w-2xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-6xl">
                Ready to make content{" "}
                <span className="font-script text-gradient font-normal">effortless?</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-white/65 lg:text-lg">
                Join DragonCandy and put your content on autopilot —{" "}
                {BRAND_ROLE_ENABLED
                  ? "for any business, brand, or creator."
                  : "for any business or creator."}
              </p>

              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row sm:flex-wrap">
                <button
                  onClick={() => signupAs()}
                  className="group inline-flex h-14 items-center justify-center gap-2 rounded-full bg-dc-teal px-8 text-base font-bold text-dc-dark transition-all duration-300 hover:bg-dc-teal-dark hover:shadow-glow-teal"
                >
                  Get Started
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </button>
                <button
                  onClick={() => signupAs('business')}
                  className="inline-flex h-14 items-center justify-center rounded-full bg-dc-pink-accent-btn px-8 text-base font-semibold text-white transition-all duration-300 hover:bg-dc-pink-accent-btn-hover"
                >
                  Join as a Business
                </button>
                <button
                  onClick={() => signupAs('creator')}
                  className="inline-flex h-14 items-center justify-center rounded-full border border-white/20 bg-white/5 px-8 text-base font-semibold text-white backdrop-blur transition-all duration-300 hover:border-dc-teal hover:text-dc-teal"
                >
                  Join as a Creator
                </button>
                {BRAND_ROLE_ENABLED && (
                  <button
                    onClick={() => signupAs('brand')}
                    className="inline-flex h-14 items-center justify-center rounded-full border border-dc-pink-accent/40 bg-transparent px-8 text-base font-semibold text-white transition-all duration-300 hover:border-dc-pink-accent hover:text-dc-pink-accent"
                  >
                    For Brands
                  </button>
                )}
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
};
