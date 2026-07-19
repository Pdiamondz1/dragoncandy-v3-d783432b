import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { BRAND_ROLE_ENABLED } from "@/lib/featureConfig";
import { Eyebrow } from "./Eyebrow";
import { LandingButton } from "./LandingButton";
import { Reveal } from "./Reveal";
import { useSubmitLead, type LeadAudience } from "@/hooks/useSubmitLead";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD =
  "h-12 rounded-xl border-2 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint";

const reasons = [
  "See a live demo built around your business",
  "Get matched with local creators",
  "Talk through how it works",
];

/**
 * Final CTA + lead-capture section — the platform's closing pitch (Joe redesign copy: "Ready to
 * build together?") plus the no-account-required lead-capture form (formerly `LeadCaptureSection`,
 * merged into `StartFreeSection`). The lead-form logic (state, `EMAIL_RE`, `useSubmitLead`,
 * honeypot, `handleSubmit`) is ported verbatim from `StartFreeSection` — only the visual styling
 * and surrounding copy changed. This is where the header "Contact" nav link (`#join`) lands.
 */
export const FinalCTASection = () => {
  const navigate = useNavigate();
  const signupAs = (role?: string) =>
    navigate(`/auth?mode=signup${role ? `&role=${role}` : ''}`);

  const submitLead = useSubmitLead();
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [audience, setAudience] = useState<LeadAudience>("business");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Please add your name.");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      setError("Please enter a valid email address.");
      return;
    }
    submitLead.mutate(
      {
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
        company: company.trim() || undefined,
        audience,
        message: message.trim() || undefined,
        website,
      },
      {
        onSuccess: (res) => {
          if (res?.success) setSubmitted(true);
        },
      },
    );
  };

  return (
    <section id="join" className="scroll-mt-24 bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        {/* Role-aware CTA */}
        <Reveal>
          <div className="text-center">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-extrabold leading-[1.08] tracking-tight text-landing-ink sm:text-4xl lg:text-[52px]">
              Ready to build together?
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-landing-ink-soft lg:text-lg">
              Join the platform where real people do the work — and AI makes it fly.
            </p>

            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:flex-wrap">
              <LandingButton variant="pink" onClick={() => signupAs('business')}>
                I run a business
              </LandingButton>
              <LandingButton variant="mint" onClick={() => signupAs('creator')}>
                I'm a creator
              </LandingButton>
              {BRAND_ROLE_ENABLED && (
                <LandingButton variant="ghost" onClick={() => signupAs('brand')}>
                  For Brands
                </LandingButton>
              )}
            </div>
          </div>
        </Reveal>

        {/* No-account-required lead capture */}
        <div className="mt-20 grid gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Pitch */}
          <Reveal>
            <div>
              <Eyebrow className="mb-4 text-landing-pink">Get in touch</Eyebrow>
              <h3 className="font-display text-3xl font-extrabold tracking-tight text-landing-ink sm:text-4xl">
                Let's talk.
              </h3>
              <p className="mt-5 max-w-md text-base leading-relaxed text-landing-ink-soft lg:text-lg">
                Not ready to sign up? Tell us about your business and we'll show you what
                DragonCandy can do — no account required.
              </p>
              <ul className="mt-8 space-y-3">
                {reasons.map((r) => (
                  <li key={r} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-landing-mint" />
                    <span className="text-base text-landing-ink-soft">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Form */}
          <Reveal delay={0.1}>
            <div className="rounded-3xl border-2 border-landing-line bg-white p-6 lg:p-8">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-landing-mint-soft text-landing-mint-ink">
                    <Sparkles className="h-8 w-8" />
                  </span>
                  <h3 className="mt-5 text-2xl font-bold text-landing-ink">You're on our radar.</h3>
                  <p className="mt-2 max-w-xs text-base text-landing-ink-soft">
                    Thanks for reaching out — the DragonCandy team will be in touch soon.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="relative space-y-4" noValidate>
                  {/* Honeypot — hidden from real users */}
                  <input
                    type="text"
                    name="website"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                    aria-hidden="true"
                    className="absolute left-[-9999px] h-0 w-0 overflow-hidden"
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-name" className="text-landing-ink-soft">
                        Name
                      </Label>
                      <Input
                        id="lead-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Your name"
                        className={FIELD}
                        autoComplete="name"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-email" className="text-landing-ink-soft">
                        Email
                      </Label>
                      <Input
                        id="lead-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        className={FIELD}
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-company" className="text-landing-ink-soft">
                        Business <span className="text-landing-ink-soft/60">(optional)</span>
                      </Label>
                      <Input
                        id="lead-company"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        placeholder="Business or brand name"
                        className={FIELD}
                        autoComplete="organization"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="lead-phone" className="text-landing-ink-soft">
                        Phone <span className="text-landing-ink-soft/60">(optional)</span>
                      </Label>
                      <Input
                        id="lead-phone"
                        type="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="(555) 555-5555"
                        className={FIELD}
                        autoComplete="tel"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lead-audience" className="text-landing-ink-soft">
                      I'm a…
                    </Label>
                    <select
                      id="lead-audience"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value as LeadAudience)}
                      className="h-12 w-full rounded-xl border-2 border-landing-line bg-white px-4 text-landing-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-landing-mint"
                    >
                      <option value="business">Local business</option>
                      {BRAND_ROLE_ENABLED && <option value="brand">Brand / sponsor</option>}
                      <option value="creator">Creator</option>
                      <option value="other">Something else</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lead-message" className="text-landing-ink-soft">
                      Message <span className="text-landing-ink-soft/60">(optional)</span>
                    </Label>
                    <Textarea
                      id="lead-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what you're looking for…"
                      className="min-h-[96px] rounded-xl border-2 border-landing-line bg-white text-landing-ink placeholder:text-landing-ink-soft focus-visible:ring-landing-mint"
                    />
                  </div>

                  {error && <p className="text-sm text-landing-pink-ink">{error}</p>}

                  <Button
                    type="submit"
                    isLoading={submitLead.isPending}
                    className="h-12 w-full rounded-full bg-landing-pink text-base font-bold text-white shadow-landing-pink transition-[box-shadow,transform] hover:shadow-landing-pink-hover motion-safe:hover:-translate-y-0.5"
                  >
                    Send message
                  </Button>
                </form>
              )}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
};
