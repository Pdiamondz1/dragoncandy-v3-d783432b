import { Reveal } from "./Reveal";
import { VideoSlot } from "./VideoSlot";

// Creator showreels — Veo 3.1 (Google Flow) reels in the public Supabase `landing` bucket
// (16:9, H.264, fast-start). Swap a URL to change a reel; empty = branded placeholder.
const BUCKET = "https://zocahiffooqdybdhguqv.supabase.co/storage/v1/object/public/landing";
// "Crave" — a chef plating a luxurious dessert, teal-and-magenta lighting. Autoplays (ambient).
const REEL_CRAVE = `${BUCKET}/creator-reel-crave.mp4`;
const REEL_CRAVE_POSTER = `${BUCKET}/poster-crave.jpg`;
// "The Craft" — a creator filming a dish on a gimbal. Click-to-play, so only one reel
// autoplays per section (keeps the landing light on mobile).
const REEL_CRAFT = `${BUCKET}/creator-reel-craft.mp4`;
const REEL_CRAFT_POSTER = `${BUCKET}/poster-craft.jpg`;

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

        <div className="mt-12 grid gap-4 lg:grid-cols-2">
          <Reveal>
            <VideoSlot src={REEL_CRAVE} poster={REEL_CRAVE_POSTER} label="Creator showreel" />
          </Reveal>
          <Reveal delay={0.1}>
            <VideoSlot
              src={REEL_CRAFT}
              poster={REEL_CRAFT_POSTER}
              label="On the shoot"
              autoplay={false}
            />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
