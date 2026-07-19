import { Eyebrow } from "./Eyebrow";
import { Reveal } from "./Reveal";

interface Value {
  id: string;
  emoji: string;
  chipClassName: string;
  heading: string;
  body: string;
}

const VALUES: Value[] = [
  {
    id: "human-connections",
    emoji: "🤝",
    chipClassName: "bg-landing-pink-soft",
    heading: "Human connections, not algorithms",
    body: "We match entrepreneurs with creators — real working relationships built to last, not gig-app roulette.",
  },
  {
    id: "run-your-business",
    emoji: "📈",
    chipClassName: "bg-landing-mint-soft",
    heading: "Run your business, don't just post",
    body: "Whether you're a founder or a creator, DragonCandy helps you manage the work: projects, deliverables, and growth in one place.",
  },
  {
    id: "ai-assists",
    emoji: "⚡",
    chipClassName: "bg-landing-yellow/20",
    heading: "AI assists. Humans decide.",
    body: "Our AI speeds up the busywork — drafts, scheduling, research — so people can focus on the creative and strategic calls only people can make.",
  },
];

/**
 * The white "why it works" section — a centered head over a 3-card grid of value props.
 * Verbatim copy from the mockup's `.values`/`.value-grid` section.
 */
export function ValuesSection() {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mx-auto mb-14 max-w-xl text-center">
            <Eyebrow className="mb-4 justify-center text-landing-pink">Why it works</Eyebrow>
            <h2 className="font-display text-3xl font-extrabold leading-[1.12] tracking-tight text-landing-ink sm:text-4xl lg:text-[42px]">
              People first. Platform underneath.
            </h2>
          </div>
        </Reveal>

        <div className="grid gap-6 md:grid-cols-3">
          {VALUES.map((value, i) => (
            <Reveal key={value.id} delay={i * 0.08}>
              <div className="h-full rounded-[20px] border-2 border-landing-line p-8 transition-colors hover:border-landing-pink">
                <div
                  className={`flex h-11 w-11 items-center justify-center rounded-xl text-xl ${value.chipClassName}`}
                >
                  <span aria-hidden="true">{value.emoji}</span>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold text-landing-ink">
                  {value.heading}
                </h3>
                <p className="mt-2.5 text-[15px] text-landing-ink-soft">{value.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
