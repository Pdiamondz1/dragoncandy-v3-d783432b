import {
  Sparkles,
  Rocket,
  Share2,
  Database,
  Network,
  Plug,
  Scale,
  ShieldCheck,
  Tag,
  Check,
  ArrowRight,
  Bot,
  Brain,
  Layers,
} from "lucide-react";
import type { ReactNode } from "react";
import { SlideShell, GradientText, type SlideProps } from "./SlideShell";

/* ---------- small shared primitives (1280x720 canvas) ---------- */

function Stat({ value, label, dark = false }: { value: ReactNode; label: string; dark?: boolean }) {
  return (
    <div>
      <div className="text-5xl font-extrabold leading-none">
        <GradientText>{value}</GradientText>
      </div>
      <div className={`mt-2 text-base font-medium ${dark ? "text-white/65" : "text-dc-text-muted"}`}>
        {label}
      </div>
    </div>
  );
}

function Card({
  children,
  dark = false,
  className = "",
}: {
  children: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl p-8 ${
        dark
          ? "border border-white/10 bg-white/5"
          : "border border-dc-teal/30 bg-white shadow-[0_10px_40px_-18px_rgba(15,118,110,0.35)]"
      } ${className}`}
    >
      {children}
    </div>
  );
}

function IconBadge({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "pink" }) {
  return (
    <div
      className={`flex h-14 w-14 items-center justify-center rounded-2xl ${
        tone === "teal" ? "bg-dc-teal/15 text-dc-teal-btn" : "bg-dc-pink-accent/15 text-dc-pink-accent"
      }`}
    >
      {children}
    </div>
  );
}

/* ---------- 01 · Cover ---------- */

export function SlideCover({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="gradient" bare>
      <div className="relative flex h-full flex-col justify-between px-20 py-16">
        <img src="/logo.webp" alt="DragonCandy" className="h-14 w-auto self-start" />

        <div className="max-w-4xl">
          <p className="mb-4 text-lg font-semibold uppercase tracking-[0.32em] text-dc-teal">
            Investor Presentation
          </p>
          <h1 className="text-7xl font-extrabold leading-[1.02] tracking-tight">
            The AI marketing
            <br />
            command center for
            <br />
            <GradientText>local restaurants.</GradientText>
          </h1>
          <p className="mt-8 font-script text-4xl text-dc-pink">Less typing = more margin.</p>
        </div>

        <div className="flex items-center justify-between text-white/60">
          <span className="text-base font-medium">
            AI-powered creator · restaurant · brand marketplace
          </span>
          <span className="text-base font-semibold">Hoboken, NJ · Confidential</span>
        </div>
      </div>
    </SlideShell>
  );
}

/* ---------- 02 · Problem ---------- */

export function SlideProblem({ index, total }: SlideProps) {
  const cols = [
    {
      tone: "teal" as const,
      title: "Restaurants",
      body: "Spend $2,000–$4,000/mo across fragmented tools — social, photography, outreach — with no time and no clear ROI.",
      stat: "Only 13% are satisfied with their tech stack.",
    },
    {
      tone: "pink" as const,
      title: "Creators",
      body: "Talented local food creators have no reliable way to find paid work or get paid on time near where they live.",
      stat: "Monetizing locally is ad-hoc and manual.",
    },
    {
      tone: "teal" as const,
      title: "Content",
      body: "Producing on-brand, compliant content is slow, expensive, and disconnected from where it actually gets posted.",
      stat: "Days of back-and-forth per campaign.",
    },
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="The Problem">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Local restaurants are flying blind on marketing.
      </h2>
      <p className="mt-4 max-w-3xl text-xl text-dc-text-muted">
        The people, the content, and the channels live in three different places — and none of them talk to each other.
      </p>
      <div className="mt-10 grid flex-1 grid-cols-3 gap-6">
        {cols.map((c) => (
          <Card key={c.title} className="flex flex-col">
            <h3 className={`text-2xl font-bold ${c.tone === "pink" ? "text-dc-pink-accent" : "text-dc-teal-btn"}`}>
              {c.title}
            </h3>
            <p className="mt-3 flex-1 text-lg leading-relaxed text-dc-text-muted">{c.body}</p>
            <p className="mt-5 border-t border-dc-teal/20 pt-4 text-base font-semibold text-dc-text">
              {c.stat}
            </p>
          </Card>
        ))}
      </div>
    </SlideShell>
  );
}

/* ---------- 03 · Solution ---------- */

export function SlideSolution({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="The Solution">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        One marketplace. Three sides. <GradientText>One AI.</GradientText>
      </h2>

      <div className="mt-8 flex items-center justify-center gap-4 text-center">
        {["Restaurants", "Creators", "Brands"].map((n, i) => (
          <div key={n} className="flex items-center gap-4">
            <div className="rounded-2xl border border-white/10 bg-white/5 px-8 py-5 text-xl font-bold">
              {n}
            </div>
            {i < 2 && <ArrowRight className="h-6 w-6 text-dc-teal" />}
          </div>
        ))}
      </div>

      <div className="mt-10 grid flex-1 grid-cols-2 gap-6">
        <Card dark className="flex flex-col">
          <div className="flex items-center gap-3 text-dc-teal">
            <Sparkles className="h-7 w-7" />
            <h3 className="text-2xl font-bold text-white">Donny AI</h3>
          </div>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            The intelligence layer — campaign generation, creator matching, scheduling, and analytics. Every brief and
            outcome compounds into proprietary data.
          </p>
          <p className="mt-auto pt-5 text-base font-semibold text-dc-teal">The brain.</p>
        </Card>
        <Card dark className="flex flex-col">
          <div className="flex items-center gap-3 text-dc-pink-accent">
            <Rocket className="h-7 w-7" />
            <h3 className="text-2xl font-bold text-white">DragonDash</h3>
          </div>
          <p className="mt-4 text-lg leading-relaxed text-white/70">
            The profit engine — rush content delivery at premium margins. A service, not a commoditizable AI feature.
          </p>
          <p className="mt-auto pt-5 text-base font-semibold text-dc-pink-accent">The engine.</p>
        </Card>
      </div>

      <p className="mt-7 text-center text-xl font-semibold text-white/80">
        Donny powers DragonDash. <span className="text-dc-teal">DragonDash sells.</span>
      </p>
    </SlideShell>
  );
}

/* ---------- 04 · Why Now ---------- */

export function SlideWhyNow({ index, total }: SlideProps) {
  const points = [
    {
      stat: "25%",
      title: "AI commoditized content",
      body: "1 in 4 YC W25 startups shipped 95% AI-generated code. Features are cloned in days — durable value is data + service, not a wrapper.",
    },
    {
      stat: "76% / 13%",
      title: "Restaurants want tech",
      body: "76% of operators see tech as a competitive edge; only 13% are satisfied today. The category is wide open.",
    },
    {
      stat: "$2–4K",
      title: "Marketing budgets exist",
      body: "The average restaurant already spends $2–4K/mo on marketing — fragmented across vendors waiting to be consolidated.",
    },
    {
      stat: "Now",
      title: "Creator economy is local",
      body: "Food creators are everywhere, but local monetization is unsolved. Whoever organizes hyperlocal supply wins the liquidity.",
    },
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="Why Now">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        The window is open — briefly.
      </h2>
      <div className="mt-10 grid flex-1 grid-cols-2 gap-x-12 gap-y-8">
        {points.map((p) => (
          <div key={p.title} className="flex gap-6">
            <div className="w-40 shrink-0 text-4xl font-extrabold leading-none">
              <GradientText>{p.stat}</GradientText>
            </div>
            <div>
              <h3 className="text-xl font-bold text-dc-text">{p.title}</h3>
              <p className="mt-2 text-lg leading-relaxed text-dc-text-muted">{p.body}</p>
            </div>
          </div>
        ))}
      </div>
    </SlideShell>
  );
}

/* ---------- 05 · Product ---------- */

export function SlideProduct({ index, total }: SlideProps) {
  const features = [
    {
      icon: <Sparkles className="h-7 w-7" />,
      tone: "teal" as const,
      title: "Donny AI",
      body: "Campaign-from-URL, AI-scored creator matching, and auto cross-scheduling across every connected channel.",
    },
    {
      icon: <Rocket className="h-7 w-7" />,
      tone: "pink" as const,
      title: "DragonDash",
      body: "Rush content delivery with platform-count surcharges — premium margins on the work restaurants need fast.",
    },
    {
      icon: <Share2 className="h-7 w-7" />,
      tone: "teal" as const,
      title: "DragonShare",
      body: "Creators post organic content; restaurants boost it cross-channel. Live, with an 80/20 creator-first split.",
    },
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="Product">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        From a URL to a paid campaign in <GradientText>under 60 seconds.</GradientText>
      </h2>
      <p className="mt-4 max-w-3xl text-xl text-dc-text-muted">
        Surface priority: voice → camera → paste-URL → tap-a-chip → typing (last resort).
      </p>
      <div className="mt-10 grid flex-1 grid-cols-3 gap-6">
        {features.map((f) => (
          <Card key={f.title} className="flex flex-col">
            <IconBadge tone={f.tone}>{f.icon}</IconBadge>
            <h3 className="mt-5 text-2xl font-bold text-dc-text">{f.title}</h3>
            <p className="mt-3 text-lg leading-relaxed text-dc-text-muted">{f.body}</p>
          </Card>
        ))}
      </div>
    </SlideShell>
  );
}

/* ---------- 06 · Market ---------- */

export function SlideMarket({ index, total }: SlideProps) {
  const tiers = [
    { label: "TAM", note: "U.S. restaurant marketing + creator economy", value: "$[verify]B" },
    { label: "SAM", note: "SMB restaurants × food creators in target metros", value: "$[verify]B" },
    { label: "SOM", note: "3-year reachable footprint (20+ metros)", value: "$[verify]M" },
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="Market">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        A budget that already exists — newly consolidatable.
      </h2>
      <div className="mt-8 grid flex-1 grid-cols-2 gap-12">
        <div className="flex flex-col justify-center gap-4">
          {tiers.map((t, i) => (
            <div
              key={t.label}
              className="flex items-center gap-6 rounded-3xl border border-dc-teal/30 bg-white p-5 shadow-[0_10px_40px_-18px_rgba(15,118,110,0.35)]"
              style={{ marginRight: i * 56 }}
            >
              <div className="text-3xl font-extrabold text-dc-teal-btn">{t.label}</div>
              <div className="flex-1">
                <div className="text-2xl font-extrabold">
                  <GradientText>{t.value}</GradientText>
                </div>
                <div className="text-base text-dc-text-muted">{t.note}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col justify-center">
          <h3 className="text-2xl font-bold text-dc-text">Bottom-up wedge</h3>
          <p className="mt-3 text-lg leading-relaxed text-dc-text-muted">
            The average restaurant spends <span className="font-semibold text-dc-text">$2,000–$4,000/mo</span> on
            marketing across disconnected vendors. DragonCandy consolidates that spend into one platform at a blended
            ARPU of <span className="font-semibold text-dc-text">$350–$500/mo</span> — before take-rate and rush.
          </p>
          <p className="mt-3 text-lg leading-relaxed text-dc-text-muted">
            <span className="font-semibold text-dc-pink-accent">Brands</span> are the high-LTV third side —
            ~$800/mo plus sponsor campaigns, a <span className="font-semibold text-dc-text">$24K–$72K</span> LTV
            at a 3–5 month payback.
          </p>
          <p className="mt-3 rounded-2xl bg-dc-pink-bg/60 px-5 py-3 text-base font-medium text-dc-text">
            Dollar TAM/SAM/SOM figures pending sourced market data.
          </p>
        </div>
      </div>
    </SlideShell>
  );
}

/* ---------- 07 · Business Model ---------- */

export function SlideModel({ index, total }: SlideProps) {
  const streams = [
    { name: "Subscription", detail: "Free / $149 / $449 / $899 / Enterprise", margin: "80–90%" },
    { name: "Marketplace take-rate", detail: "Tiered 10% → 2% on creator & brand deals", margin: "65–80%" },
    { name: "Donny AI credits", detail: "$0.10–0.25 per call overage", margin: "70–90%" },
    { name: "DragonDash rush", detail: "$25–75 delivery + platform surcharges", margin: "high" },
  ];
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="Business Model">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Four revenue streams. <GradientText>One customer.</GradientText>
      </h2>
      <div className="mt-9 grid flex-1 grid-cols-2 gap-5">
        {streams.map((s, i) => (
          <Card key={s.name} dark className="flex items-center gap-5">
            <div className="text-3xl font-extrabold text-dc-teal/60 tabular-nums">{i + 1}</div>
            <div className="flex-1">
              <div className="text-xl font-bold text-white">{s.name}</div>
              <div className="text-base text-white/65">{s.detail}</div>
            </div>
            <div className="rounded-full bg-dc-teal/15 px-4 py-1.5 text-sm font-bold text-dc-teal">
              {s.margin} margin
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-7 text-center text-lg font-medium text-white/75">
        Restaurants subscribe; <span className="font-semibold text-dc-pink-accent">brands</span> sponsor at the
        high end. The take-rate ladder discounts as spend scales — we grow with the customer.
      </p>
    </SlideShell>
  );
}

/* ---------- 08 · Traction ---------- */

export function SlideTraction({ index, total }: SlideProps) {
  const shipped = [
    "DragonShare amplification — live on web (Stripe Connect, 80/20 split)",
    "DragonCandy AIOS — internal ops dashboard + Google Workspace",
    "Outstand social integration — Instagram, TikTok, YouTube",
    "Capacitor iOS shell — App Store path, Phase 1 shipped",
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="Traction">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Pre-revenue by design — and already shipping.
      </h2>
      <div className="mt-9 grid grid-cols-4 gap-8">
        <Stat value="~30" label="organic users, $0 spent" />
        <Stat value="73" label="edge functions in prod" />
        <Stat value="60+" label="pages · 183 hooks" />
        <Stat value="Day 1" label="data flywheel logging" />
      </div>
      <div className="mt-9 grid flex-1 grid-cols-2 gap-x-10 gap-y-4 content-center">
        {shipped.map((s) => (
          <div key={s} className="flex items-start gap-3">
            <Check className="mt-1 h-5 w-5 shrink-0 text-dc-teal-btn" />
            <span className="text-lg text-dc-text">{s}</span>
          </div>
        ))}
      </div>
      <p className="text-base font-medium text-dc-text-muted">
        Every brief, match, and completed campaign is logged from launch — the dataset is the moat.
      </p>
    </SlideShell>
  );
}

/* ---------- 09 · Go-to-Market ---------- */

export function SlideGTM({ index, total }: SlideProps) {
  const phases = [
    { n: "Metro 1", body: "Founder-led: hand-onboard 20–30 creators + 5–10 restaurants. Reach 70%+ search-to-fill." },
    { n: "Density", body: "3:1–5:1 creator-to-restaurant ratio per market before scaling spend. Creators first." },
    { n: "Replicate", body: "Documented playbook → 2–3 adjacent metros, then concentric expansion to 20+." },
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="Go-to-Market">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Win one metro. Then <GradientText>copy-paste.</GradientText>
      </h2>
      <p className="mt-4 max-w-3xl text-xl text-dc-text-muted">
        The DoorDash playbook — liquidity in one market beats thin coverage everywhere. Explicit budget gates and
        kill-switches at each step.
      </p>
      <div className="mt-10 grid flex-1 grid-cols-3 gap-6">
        {phases.map((p, i) => (
          <Card key={p.n} className="flex flex-col">
            <div className="text-base font-bold uppercase tracking-widest text-dc-teal">Step {i + 1}</div>
            <h3 className="mt-2 text-2xl font-bold text-dc-text">{p.n}</h3>
            <p className="mt-3 text-lg leading-relaxed text-dc-text-muted">{p.body}</p>
          </Card>
        ))}
      </div>
    </SlideShell>
  );
}

/* ---------- 10 · Moat ---------- */

export function SlideMoat({ index, total }: SlideProps) {
  const layers = [
    { icon: <Database className="h-6 w-6" />, name: "Data flywheel", body: "Every campaign makes Donny smarter — primary, compounding moat." },
    { icon: <Network className="h-6 w-6" />, name: "Network effects", body: "Hyperlocal liquidity per metro — 70%+ search-to-fill." },
    { icon: <Plug className="h-6 w-6" />, name: "Ecosystem", body: "POS + social workflow integration raises switching costs." },
    { icon: <Scale className="h-6 w-6" />, name: "Legal", body: "Trademarks, trade secrets, provisional patents — sequenced." },
    { icon: <ShieldCheck className="h-6 w-6" />, name: "Regulatory", body: "Built-in FTC disclosure + AI transparency = trust edge." },
    { icon: <Tag className="h-6 w-6" />, name: "Brand", body: '"#DragonDashed" — verbification as a distribution moat.' },
  ];
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="Defensibility">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Six layers. <GradientText>Compounding.</GradientText>
      </h2>
      <p className="mt-4 max-w-3xl text-xl text-white/70">
        No single feature is the moat — the compounding interaction is. Surface features clone in days; data and
        liquidity don't.
      </p>
      <div className="mt-8 grid flex-1 grid-cols-3 gap-5">
        {layers.map((l, i) => (
          <Card key={l.name} dark className={i === 0 ? "ring-1 ring-dc-teal/50" : ""}>
            <div className="flex items-center gap-3 text-dc-teal">
              {l.icon}
              <h3 className="text-xl font-bold text-white">{l.name}</h3>
            </div>
            <p className="mt-2 text-base leading-relaxed text-white/65">{l.body}</p>
          </Card>
        ))}
      </div>
    </SlideShell>
  );
}

/* ---------- 11 · Team ---------- */

export function SlideTeam({ index, total }: SlideProps) {
  const team = [
    {
      name: "Damon “Dame” Williams",
      role: "Co-founder · CTO",
      body: "Product and platform — architect of the DragonCandy experience and the Donny AI intelligence layer.",
    },
    {
      name: "Joe Castelo",
      role: "Co-founder · CEO",
      body: "Sales & partnerships. 70-year Hoboken hospitality family; award-winning operator and dealmaker.",
    },
    {
      name: "Juwan Robinson",
      role: "Co-founder",
      body: "Strategic guidance and capital network across the growth roadmap.",
    },
  ];
  return (
    <SlideShell index={index} total={total} variant="light" eyebrow="Team">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Built by operators, not tourists.
      </h2>
      <div className="mt-10 grid flex-1 grid-cols-3 gap-6">
        {team.map((m) => (
          <Card key={m.name} className="flex flex-col">
            <div className="h-14 w-14 rounded-full bg-gradient-to-br from-dc-teal to-dc-pink-accent" />
            <h3 className="mt-5 text-2xl font-bold text-dc-text">{m.name}</h3>
            <div className="mt-1 text-base font-semibold text-dc-teal-btn">{m.role}</div>
            <p className="mt-3 text-lg leading-relaxed text-dc-text-muted">{m.body}</p>
          </Card>
        ))}
      </div>
    </SlideShell>
  );
}

/* ---------- 12 · Vision (Donny super-intelligence + adaptability) ---------- */

export function SlideVision({ index, total }: SlideProps) {
  const trajectory = [
    {
      icon: <Sparkles className="h-6 w-6" />,
      title: "Today — the copilot",
      body: "Campaign-from-URL, AI matching, scheduling, and analytics inside the app.",
    },
    {
      icon: <Bot className="h-6 w-6" />,
      title: "Next — the super-agent",
      body: "Runs campaigns end-to-end, and delivers value beyond the app — a public Donny API and a standalone assistant.",
    },
    {
      icon: <Brain className="h-6 w-6" />,
      title: "Horizon — AGI-adjacent",
      body: "Self-improving agents that build, fix, scale, and secure the platform itself.",
    },
  ];
  const adapt = [
    {
      icon: <Layers className="h-6 w-6" />,
      title: "Model-agnostic routing",
      body: "Adopt the best or cheapest model the day it ships — backend-only, no rewrite.",
    },
    {
      icon: <Network className="h-6 w-6" />,
      title: "Provider-independent",
      body: "Anthropic + OpenAI today, any frontier lab tomorrow. Never locked in.",
    },
    {
      icon: <Database className="h-6 w-6" />,
      title: "Owns its data",
      body: "Proprietary flywheel → fine-tune our own models. Capability up, cost down.",
    },
  ];
  return (
    <SlideShell index={index} total={total} variant="gradient" eyebrow="Vision">
      <h2 className="max-w-5xl text-5xl font-extrabold leading-tight">
        Donny is becoming a <GradientText>super-intelligence</GradientText> — and we're built to ride the curve.
      </h2>
      <p className="mt-2 max-w-4xl text-lg text-white/70">
        Increasingly autonomous, increasingly capable — riding the frontier instead of being disrupted by it.
      </p>
      <div className="mt-4 grid flex-1 grid-cols-2 gap-10">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-dc-teal">From assistant → super-agent</h3>
          <div className="mt-3 flex flex-col gap-3">
            {trajectory.map((t) => (
              <div key={t.title} className="flex gap-4">
                <div className="mt-0.5 shrink-0 text-dc-teal">{t.icon}</div>
                <div>
                  <div className="text-lg font-bold text-white">{t.title}</div>
                  <div className="text-base leading-relaxed text-white/65">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-widest text-dc-pink-accent">Built to ride the AI curve</h3>
          <div className="mt-3 flex flex-col gap-3">
            {adapt.map((t) => (
              <div key={t.title} className="flex gap-4">
                <div className="mt-0.5 shrink-0 text-dc-pink-accent">{t.icon}</div>
                <div>
                  <div className="text-lg font-bold text-white">{t.title}</div>
                  <div className="text-base leading-relaxed text-white/65">{t.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-lg font-semibold text-white/80">
        We don't bet on one model — we ride every model.{" "}
        <span className="text-dc-teal">Adaptability is the moat that compounds.</span>
      </p>
    </SlideShell>
  );
}

/* ---------- 13 · Financials ---------- */

export function SlideFinancials({ index, total }: SlideProps) {
  const rows = [
    { y: "Year 1", arr: "$300–600K", team: "5–6", metros: "2–3", note: "Launch + first liquidity" },
    { y: "Year 2", arr: "$2–4.5M", team: "7–8", metros: "8–12", note: "Brands drive NRR > 110%" },
    { y: "Year 3", arr: "$7–12M", team: "10–11", metros: "20+", note: "$2–5M profit" },
  ];
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="Financials">
      <h2 className="max-w-4xl text-5xl font-extrabold leading-tight">
        Lean by design. <GradientText>Margin by discipline.</GradientText>
      </h2>
      <div className="mt-9 overflow-hidden rounded-3xl border border-white/10">
        <div className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_1.6fr] bg-white/5 px-8 py-4 text-sm font-bold uppercase tracking-wider text-dc-teal">
          <div>Year</div>
          <div>ARR</div>
          <div>Headcount</div>
          <div>Metros</div>
          <div>Notes</div>
        </div>
        {rows.map((r) => (
          <div
            key={r.y}
            className="grid grid-cols-[1.1fr_1.4fr_1fr_1fr_1.6fr] items-center border-t border-white/10 px-8 py-5 text-lg"
          >
            <div className="font-bold text-white">{r.y}</div>
            <div className="text-2xl font-extrabold">
              <GradientText>{r.arr}</GradientText>
            </div>
            <div className="text-white/80">{r.team}</div>
            <div className="text-white/80">{r.metros}</div>
            <div className="text-white/65">{r.note}</div>
          </div>
        ))}
      </div>
      <p className="mt-6 text-center text-lg font-semibold text-white/80">
        This round: a <span className="text-dc-teal">~$3M seed</span> buys an 18-month runway to
        Year-2 scale — <span className="text-dc-teal">50%</span> build · <span className="text-dc-teal">30%</span> GTM ·
        <span className="text-dc-teal"> 20%</span> working capital.
      </p>
      <div className="mt-5 flex items-center justify-center gap-10 text-base font-semibold text-white/75">
        <span>Guardrails:</span>
        <span>LTV:CAC &ge; 2:1</span>
        <span>CAC payback &le; 12 mo</span>
        <span>Churn &lt; 6%/mo</span>
        <span>AI spend capped at 15% of revenue</span>
      </div>
    </SlideShell>
  );
}

/* ---------- 13 · The Ask ---------- */

export function SlideAsk({ index, total }: SlideProps) {
  const use = [
    { pct: "50%", label: "Engineering & Donny AI" },
    { pct: "30%", label: "GTM & metro expansion" },
    { pct: "20%", label: "Working capital" },
  ];
  return (
    <SlideShell index={index} total={total} variant="gradient" eyebrow="The Ask">
      <div className="flex flex-1 flex-col justify-center">
        <h2 className="text-6xl font-extrabold leading-tight">
          Raising <GradientText>$2.5–3.5M</GradientText>
        </h2>
        <p className="mt-3 text-2xl font-semibold text-white/80">
          ~$12–15M post-money · 18-month runway to Year-2 scale
        </p>

        <div className="mt-10 grid grid-cols-3 gap-6">
          {use.map((u) => (
            <Card key={u.label} dark className="text-center">
              <div className="text-4xl font-extrabold">
                <GradientText>{u.pct}</GradientText>
              </div>
              <div className="mt-2 text-lg font-medium text-white/75">{u.label}</div>
            </Card>
          ))}
        </div>

        <p className="mt-9 rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-base font-medium text-white/70">
          Recommended from the 18-month operating plan (full cost model on file). Final raise,
          valuation, and structure to be set by the founders.
        </p>
      </div>
    </SlideShell>
  );
}

/* ---------- 14 · Close ---------- */

export function SlideClose({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="dark" bare>
      <div className="relative flex h-full flex-col items-center justify-center px-20 text-center">
        <div className="pointer-events-none absolute -right-32 top-10 h-80 w-80 rounded-full bg-dc-teal/15 blur-3xl" />
        <div className="pointer-events-none absolute -left-32 bottom-10 h-80 w-80 rounded-full bg-dc-pink-accent/15 blur-3xl" />
        <img src="/logo.webp" alt="DragonCandy" className="relative h-16 w-auto" />
        <p className="relative mt-10 font-script text-6xl text-dc-pink">Less typing = more margin.</p>
        <p className="relative mt-8 max-w-3xl text-2xl font-semibold text-white/80">
          The intelligence layer for local restaurant marketing — and the service that sells it.
        </p>
        <div className="relative mt-12 flex items-center gap-8 text-lg text-white/60">
          <span className="font-semibold text-dc-teal">#DragonDashed</span>
          <span>dragoncandy.com</span>
          <span>[founders@dragoncandy.com]</span>
        </div>
      </div>
    </SlideShell>
  );
}
