import { Eyebrow } from "./Eyebrow";
import { LandingButton } from "./LandingButton";

interface Door {
  id: "business" | "creators";
  containerClassName: string;
  eyebrowClassName: string;
  eyebrow: string;
  heading: string;
  body: string;
  ctaLabel: string;
  href: string;
  variant: "pink" | "mint";
}

/**
 * The two static doors below the hero — the real conversion surface (the hero CTAs above only
 * scroll here; these route to signup). Fixed literal `role=` values only, so there's nothing to
 * guard at the emit site — `AuthPage`'s own `?role=` own-property guard rejects any unknown/gated
 * role on receipt regardless.
 */
const DOORS: Door[] = [
  {
    id: "business",
    containerClassName: "bg-landing-pink-soft border-landing-pink-line",
    eyebrowClassName: "text-landing-pink",
    eyebrow: "For business owners",
    heading: "Your own social media department — without hiring one.",
    body: "Get matched with a real, human creator who learns your brand and becomes your social team. Strategy, content, posting, engagement — handled by a person, sped up by AI.",
    ctaLabel: "Find your creator",
    href: "/auth?mode=signup&role=business",
    variant: "pink",
  },
  {
    id: "creators",
    containerClassName: "bg-landing-mint-soft border-landing-mint-line",
    eyebrowClassName: "text-landing-mint-ink",
    eyebrow: "For creators",
    heading: "Turn what you do every day into a real business.",
    body: "Get matched with businesses that need your skills. Steady work, real partnerships, and a platform that handles the back office so you can focus on creating.",
    ctaLabel: "Find your clients",
    href: "/auth?mode=signup&role=creator",
    variant: "mint",
  },
];

export function HeroDoors() {
  return (
    <div className="relative mx-auto mt-16 grid max-w-[960px] gap-6 px-5 text-left sm:grid-cols-2 sm:px-8">
      {DOORS.map((door) => (
        <div
          key={door.id}
          id={door.id}
          className={`scroll-mt-24 rounded-[20px] border-2 p-9 ${door.containerClassName}`}
        >
          <Eyebrow className={door.eyebrowClassName}>{door.eyebrow}</Eyebrow>
          <h3 className="mt-3.5 font-display text-2xl font-extrabold leading-[1.15] text-landing-ink">
            {door.heading}
          </h3>
          <p className="mt-2.5 text-base text-landing-ink-soft">{door.body}</p>
          <LandingButton variant={door.variant} href={door.href} className="mt-6">
            {door.ctaLabel}
          </LandingButton>
        </div>
      ))}
    </div>
  );
}
