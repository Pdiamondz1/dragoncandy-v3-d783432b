import { Star } from "lucide-react";
import { Reveal } from "./Reveal";

interface Story {
  quote: string;
  name: string;
  role: string;
  city: string;
  /** Drop in a real headshot URL later; falls back to a branded initial. */
  avatar?: string;
}

const stories: Story[] = [
  {
    quote:
      "DragonCandy filled our feed for a month in one afternoon. The creators just got our vibe — it felt effortless.",
    name: "Maya R.",
    role: "Café owner",
    city: "Hoboken, NJ",
  },
  {
    quote:
      "I went from chasing gigs to getting matched to paid local shoots every week. The payouts actually show up fast.",
    name: "Devon K.",
    role: "Content creator",
    city: "Jersey City, NJ",
  },
  {
    quote:
      "We launched across three locations in minutes and watched the bookings climb. This is our whole content team now.",
    name: "Priya S.",
    role: "Multi-unit operator",
    city: "Newark, NJ",
  },
];

function Avatar({ name, src }: { name: string; src?: string }) {
  if (src) {
    return (
      <img src={src} alt={name} className="h-12 w-12 rounded-full object-cover ring-2 ring-dc-teal/40" />
    );
  }
  return (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-dc-teal/30 to-dc-pink-accent/30 text-base font-bold text-white ring-2 ring-white/10">
      {name.charAt(0)}
    </span>
  );
}

export function StoriesSection() {
  return (
    <section id="stories" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
              Real stories
            </span>
          </div>
          <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Loved by businesses and creators.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-6 md:grid-cols-3 lg:mt-16">
          {stories.map((story, i) => (
            <Reveal key={story.name} delay={i * 0.08}>
              <figure className="flex h-full flex-col rounded-3xl border border-white/10 bg-white/5 p-6 transition-colors duration-300 hover:border-dc-teal/30">
                <div className="flex gap-0.5 text-dc-pink-accent">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star key={s} className="h-4 w-4 fill-current" aria-hidden />
                  ))}
                </div>
                <blockquote className="mt-4 flex-1 text-base leading-relaxed text-white/80">
                  “{story.quote}”
                </blockquote>
                <figcaption className="mt-6 flex items-center gap-3">
                  <Avatar name={story.name} src={story.avatar} />
                  <div>
                    <p className="text-sm font-bold text-white">{story.name}</p>
                    <p className="text-xs text-white/50">
                      {story.role} · {story.city}
                    </p>
                  </div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
