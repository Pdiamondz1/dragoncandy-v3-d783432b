import { Link } from "react-router-dom";
import { SEO } from "@/components/SEO";
import { PublicPageHeader } from "@/components/PublicPageHeader";
import { Eyebrow } from "@/components/landing/Eyebrow";
import { LEGAL_ENTITY_LOCALITY, LEGAL_ENTITY_NAME } from "@/lib/legalEntity";

/**
 * The page the landing's "Learn more" points at.
 *
 * The landing is deliberately one cinematic screen with a single CTA — it sells the feeling and
 * asks for a signup, and it has nowhere to explain what the product actually does. The six-section
 * marketing page that used to carry that job was deleted in the 2026-08-22 rebuild, which left a
 * real gap: someone who wants to read before they sign up had nowhere to go. This is that page.
 *
 * Light, on PublicPageHeader — the same shell as /terms, /privacy and /pricing. The landing is the
 * one dark public surface (DESIGN_SYSTEM.md); every public page you can READ is white paper. The
 * marketing type system (font-display headings, Eyebrow) carries the brand across the seam, the
 * same way the auth screens do.
 */

const STEPS = [
  {
    n: "01",
    title: "Describe what you want",
    body: "Tell Donny the campaign you have in mind — or paste a link and let him draft it for you. He writes the brief, the deliverables and a suggested budget. You edit anything you disagree with.",
  },
  {
    n: "02",
    title: "Get matched with real creators",
    body: "Donny scores every creator against the brief — craft, location, past work — and puts the strongest matches in front of you. You choose who to invite. Nobody is auto-assigned.",
  },
  {
    n: "03",
    title: "Approve the content, release the money",
    body: "The creator submits, you review, and you approve or ask for a revision. Payment is held until you approve, then released to the creator. Posting can be scheduled across Instagram, TikTok and YouTube from the same place.",
  },
];

const AUDIENCES = [
  {
    eyebrow: "For restaurants & businesses",
    title: "A social media department without hiring one",
    points: [
      "Briefs written for you instead of by you",
      "Local creators who actually eat where you cook",
      "Content you own, scheduled across your channels",
      "You approve every post before it goes out",
    ],
  },
  {
    eyebrow: "For creators",
    title: "Your craft, run like a business",
    points: [
      "Paid campaigns from real businesses near you",
      "Terms agreed up front — negotiate before you shoot",
      "Payment released on approval, not on a promise",
      "Standing that follows you as you deliver good work",
    ],
  },
  {
    eyebrow: "For brands & sponsors",
    title: "Sponsor the work, not the guesswork",
    points: [
      "Back campaigns that are already running",
      "See what was posted and how it performed",
      "Reach local audiences through people they trust",
    ],
  },
];

export default function HowItWorks() {
  return (
    <div className="min-h-[100dvh] bg-white font-instrument text-dc-text">
      <SEO
        title="How it works — DragonCandy"
        description="How DragonCandy connects restaurants, creators and brands: describe the campaign, get matched with real creators, approve the content and release payment. Donny handles the work in between."
        path="/how-it-works"
      />
      <PublicPageHeader />

      <main className="mx-auto max-w-5xl px-5 pb-20 sm:px-8">
        <section className="pt-10 text-center sm:pt-16">
          <Eyebrow className="text-dc-text-muted">People-Driven · Donny-Assisted</Eyebrow>
          <h1 className="mx-auto mt-5 max-w-3xl font-display text-3xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl">
            Restaurants and creators, building content together.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-dc-text-muted sm:text-lg">
            DragonCandy is a marketplace where businesses hire the creators who make their
            content. People make the calls that matter. Donny — our built-in AI — does the
            work in between, so nobody spends their week on admin.
          </p>
        </section>

        <section className="mt-16" aria-labelledby="steps-heading">
          <h2 id="steps-heading" className="font-display text-2xl font-bold sm:text-3xl">
            How a campaign runs
          </h2>
          <ol className="mt-8 grid gap-6 sm:grid-cols-3">
            {STEPS.map((s) => (
              <li
                key={s.n}
                className="rounded-2xl border border-dc-teal/15 bg-white p-6 shadow-dc-sm"
              >
                <span className="font-pixel text-sm text-dc-pink-accent">{s.n}</span>
                <h3 className="mt-3 font-display text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-dc-text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-16" aria-labelledby="audiences-heading">
          <h2 id="audiences-heading" className="font-display text-2xl font-bold sm:text-3xl">
            Who it's for
          </h2>
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <div
                key={a.eyebrow}
                className="rounded-2xl border border-dc-teal/15 bg-white p-6 shadow-dc-sm"
              >
                <Eyebrow className="text-dc-text-muted">{a.eyebrow}</Eyebrow>
                <h3 className="mt-4 font-display text-lg font-bold">{a.title}</h3>
                <ul className="mt-4 space-y-2.5">
                  {a.points.map((point) => (
                    <li key={point} className="flex gap-2.5 text-sm text-dc-text-muted">
                      <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-dc-teal" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16 rounded-2xl bg-dc-teal/[0.04] p-6 sm:p-10" aria-labelledby="donny-heading">
          <Eyebrow className="text-dc-text-muted">Meet Donny</Eyebrow>
          <h2 id="donny-heading" className="mt-4 font-display text-2xl font-bold sm:text-3xl">
            The assistant, not the replacement
          </h2>
          <p className="mt-4 max-w-3xl text-base leading-relaxed text-dc-text-muted">
            Donny drafts the brief, ranks the matches, suggests a price, schedules the posts and
            reports what happened. What he never does is decide. He does not hire anyone, publish
            anything, or move money on his own — a person approves each of those, every time. The
            point is to delete the typing, not the judgement.
          </p>
        </section>

        <section className="mt-16 text-center">
          <h2 className="font-display text-2xl font-bold sm:text-3xl">Ready to start?</h2>
          <p className="mx-auto mt-3 max-w-xl text-dc-text-muted">
            Creating an account is free, and you can see the marketplace before you spend anything.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth?mode=signup"
              className="inline-flex items-center justify-center rounded-full bg-dc-teal-btn px-8 py-3 font-semibold text-white transition-colors hover:bg-dc-teal-btn-hover"
            >
              Get started
            </Link>
            <Link
              to="/pricing"
              className="inline-flex items-center justify-center rounded-full border border-dc-teal/30 bg-white px-8 py-3 font-semibold text-dc-pink-accent transition-colors hover:border-dc-teal/50"
            >
              See pricing
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-dc-teal/15 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 px-5 text-xs text-dc-text-muted sm:flex-row sm:px-8">
          <p>
            © {new Date().getFullYear()} {LEGAL_ENTITY_NAME} · {LEGAL_ENTITY_LOCALITY}
          </p>
          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <Link to="/terms" className="transition-colors hover:text-dc-text">
              Terms
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-dc-text">
              Privacy
            </Link>
            <Link to="/help" className="transition-colors hover:text-dc-text">
              Help
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
