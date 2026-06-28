import { Reveal } from "./Reveal";
import { MediaSlot } from "./MediaSlot";
import { VideoSlot } from "./VideoSlot";

// Drop your Veo / Flow MP4 URL here — either a file in public/ (e.g. "/creator-reel.mp4")
// or a public Supabase Storage / CDN URL. Empty = the branded placeholder shows.
const CREATOR_REEL = "";
// Optional still frame shown before the reel plays (a Nano Banana Pro 16:9 image or a video frame).
const CREATOR_REEL_POSTER = "";

const gallery = [
  { label: "On set", ratio: "square" as const },
  { label: "Behind the scenes", ratio: "square" as const },
  { label: "Community", ratio: "square" as const },
  { label: "Your work", ratio: "square" as const },
];

export function CreatorHubSection() {
  return (
    <section id="creator-hub" className="py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <Reveal>
          <div className="mb-4 flex items-center gap-3">
            <span className="h-2 w-2 rounded-full bg-dc-teal" />
            <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
              Creator hub
            </span>
          </div>
          <h2 className="max-w-3xl text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
            Where creators come to{" "}
            <span className="font-script text-gradient font-normal">level up.</span>
          </h2>
          <p className="mt-5 max-w-xl text-base leading-relaxed text-white/65 lg:text-lg">
            More than gigs — DragonCandy is where local creators sharpen their craft, share
            their best work, and grow a following that gets them booked.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <VideoSlot
            src={CREATOR_REEL || undefined}
            poster={CREATOR_REEL_POSTER || undefined}
            label="Creator showreel"
            className="mt-12"
          />
        </Reveal>

        <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {gallery.map((item, i) => (
            <Reveal key={item.label} delay={i * 0.06}>
              <MediaSlot ratio={item.ratio} alt={`Creator hub — ${item.label}`} label={item.label} />
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
