import { useState, type FormEvent } from "react";
import { CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Reveal } from "./Reveal";
import { useSubmitLead, type LeadAudience } from "@/hooks/useSubmitLead";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FIELD =
  "h-12 rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-dc-teal";

const reasons = [
  "See a live demo built around your business",
  "Get matched with local creators",
  "Talk pricing & DragonDash rush delivery",
];

export function LeadCaptureSection() {
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
    <section id="contact" className="scroll-mt-24 py-20 lg:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-12">
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          {/* Pitch */}
          <Reveal>
            <div>
              <div className="mb-4 flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-dc-teal" />
                <span className="text-xs font-bold uppercase tracking-[0.3em] text-dc-teal">
                  Get in touch
                </span>
              </div>
              <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-5xl">
                Let's <span className="font-script text-gradient font-normal">talk.</span>
              </h2>
              <p className="mt-5 max-w-md text-base leading-relaxed text-white/65 lg:text-lg">
                Not ready to sign up? Tell us about your business and we'll show you what
                DragonCandy can do — no account required.
              </p>
              <ul className="mt-8 space-y-3">
                {reasons.map((r) => (
                  <li key={r} className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-dc-teal" />
                    <span className="text-base text-white/75">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          {/* Form */}
          <Reveal delay={0.1}>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm lg:p-8">
              {submitted ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <span className="flex h-16 w-16 items-center justify-center rounded-full bg-dc-teal/15 text-dc-teal">
                    <Sparkles className="h-8 w-8" />
                  </span>
                  <h3 className="mt-5 text-2xl font-bold text-white">You're on our radar.</h3>
                  <p className="mt-2 max-w-xs text-base text-white/60">
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
                      <Label htmlFor="lead-name" className="text-white/70">
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
                      <Label htmlFor="lead-email" className="text-white/70">
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
                      <Label htmlFor="lead-company" className="text-white/70">
                        Business <span className="text-white/40">(optional)</span>
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
                      <Label htmlFor="lead-phone" className="text-white/70">
                        Phone <span className="text-white/40">(optional)</span>
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
                    <Label htmlFor="lead-audience" className="text-white/70">
                      I'm a…
                    </Label>
                    <select
                      id="lead-audience"
                      value={audience}
                      onChange={(e) => setAudience(e.target.value as LeadAudience)}
                      className="h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-dc-teal"
                    >
                      <option value="business" className="bg-dc-dark">Local business</option>
                      <option value="brand" className="bg-dc-dark">Brand / sponsor</option>
                      <option value="creator" className="bg-dc-dark">Creator</option>
                      <option value="other" className="bg-dc-dark">Something else</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lead-message" className="text-white/70">
                      Message <span className="text-white/40">(optional)</span>
                    </Label>
                    <Textarea
                      id="lead-message"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Tell us what you're looking for…"
                      className="min-h-[96px] rounded-xl border-white/15 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-dc-teal"
                    />
                  </div>

                  {error && <p className="text-sm text-dc-pink-accent">{error}</p>}

                  <Button
                    type="submit"
                    isLoading={submitLead.isPending}
                    className="h-12 w-full rounded-full bg-dc-teal text-base font-bold text-dc-dark hover:bg-dc-teal-dark hover:shadow-glow-teal"
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
}
