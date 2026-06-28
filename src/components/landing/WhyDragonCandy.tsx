import { Sparkles, Users, Zap } from "lucide-react";
import { Reveal } from "./Reveal";
import { MediaSlot } from "./MediaSlot";

const rows = [
  {
    icon: Sparkles,
    eyebrow: "AI does the work",
    title: "A first draft in seconds.",
    body: "Paste a link and Donny drafts a campaign — audience, angles, and posting cadence — in seconds. Review, tweak, and launch. Works best from your site or menu page.",
    label: "Donny AI brief",
  },
  {
    icon: Users,
    eyebrow: "Real people",
    title: "Creators scored, not guessed.",
    body: "Every creator is rated on engagement, reliability, and content quality. You get matched to the right local talent — not handed a directory to sift through.",
    label: "Creator match",
  },
  {
    icon: Zap,
    eyebrow: "DragonDash",
    title: "Hours, not weeks.",
    body: "Need it today? DragonDash rush delivery puts vetted, on-brand content in your feed the same day. Approve, pay, posted.",
    label: "Same-day delivery",
  },
];

export function WhyDragonCandy() {
  return (
    <section id="why" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
              Why DragonCandy
            </span>
          </div>
          <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Stop chasing content.{" "}
            <span className="font-script text-gradient font-normal">Start collecting it.</span>
          </h2>
        </Reveal>

        <div className="mt-16 space-y-16 lg:mt-24 lg:space-y-28">
          {rows.map((row, i) => {
            const Icon = row.icon;
            const flip = i % 2 === 1;
            return (
              <Reveal key={row.title}>
                <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                  <div className={flip ? "lg:order-2" : ""}>
                    <MediaSlot ratio="wide" alt={row.title} label={row.label} />
                  </div>
                  <div className={flip ? "lg:order-1" : ""}>
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-dc-teal/15 text-dc-teal">
                      <Icon className="h-5 w-5" />
                    </span>
                    <p className="mt-5 text-xs font-bold uppercase tracking-[0.3em] text-dc-teal/80">
                      {row.eyebrow}
                    </p>
                    <h3 className="mt-3 text-2xl font-bold text-white lg:text-4xl">
                      {row.title}
                    </h3>
                    <p className="mt-4 max-w-md text-base leading-relaxed text-white/60 lg:text-lg">
                      {row.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
