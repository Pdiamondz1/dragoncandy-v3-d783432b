/**
 * The fifteen slides, in the order §6 of the spec sets — the investor advisor's order,
 * not the conventional one. The ask lands at slide 7, in the middle, while the room is
 * still paying attention, and everything after it is the evidence for it.
 *
 * **A slide may not hardcode a figure.** Every number here is read from
 * `src/pitch/model/` at render time, so the deck cannot drift from the document or the
 * interactive model. If a number looks wrong, the register is where it is wrong.
 *
 * The confidential half of the ask lives in `ask.confidential.tsx` and is reachable only
 * through a build-time flag — see the note there.
 */
import { QRCodeSVG } from 'qrcode.react';
import type { ReactNode } from 'react';
import {
  ArrowRight,
  Bot,
  Camera,
  Check,
  Database,
  QrCode,
  Store,
  Users,
  X,
} from 'lucide-react';

import { SlideShell, GradientText, type SlideProps } from './SlideShell';
import { MARKET, OPERATING, PRICING, TIER_TAKE_RATES, UNIT_ECONOMICS } from '../model/assumptions';
import { REGISTERED_MIX, avgCampaignValue, projectMonth } from '../model/project';
import {
  LIQUIDITY_THRESHOLD,
  businessStepTable,
  isLiquid,
  monthsToLiquidity,
  unitEconomics,
} from '../model/derive';
// The confidential-FREE half of the model. `consolidated.ts` (shared cost, company EBITDA)
// must NEVER be imported here: it reaches the pre-seed budget by a relative path the
// `@pitch/confidential` alias cannot intercept, so importing it would put every budget line
// label into the public bundle's sourcemap. The company EBITDA line comes from
// `trajectory.confidential.tsx`, behind the same build-time gate the ask uses.
import { rollup } from '../model/rollup';
import { Gloss, PendingMark, Source, Tag } from '../deck/components';
import { count, money, moneyShort, pct } from '../deck/format';
import { FOUNDER_FACTS, FOUNDER_INPUTS, LAUNCH_EVENTS } from '../deck/pending';
import { AskFigures } from './ask.confidential';
import { TrajectoryConsolidatedEbitda } from './trajectory.confidential';

/**
 * Slide 2 exists in three forms, picked by this constant before an export (spec §6.1).
 * The advisor's note was *"if Joe's investor is into data then add that flair"* — which is
 * a variant, not a fifteenth slide. Change this, re-export, send the right deck.
 */
export const THESIS: 'marketplace' | 'data' | 'smb' = 'marketplace';

const THESIS_COPY = {
  marketplace: {
    line: 'One marketplace where restaurants, creators and brands actually transact.',
    usp: 'Every other marketplace hands you a list and walks away. We run the campaign end to end — brief, match, shoot, approve, post, measure — and take a cut of what moves through it.',
  },
  data: {
    line: 'Every campaign we run teaches the model that runs the next one.',
    usp: 'A brief, a set of applicants, a hiring decision, an approval and a performance record — that is a labeled chain per campaign, not a row. Nobody else holds this data because nobody else sits in the middle of the whole transaction.',
  },
  smb: {
    line: 'A social media department for a restaurant that cannot hire one.',
    usp: 'An agency costs $10K a month and will not take you. We are the first price point below that which is not just software you have to operate yourself.',
  },
} as const;

/* ---------- shared primitives (1280x720 canvas) ---------- */

function Stat({
  value,
  label,
  dark = false,
  sub,
}: {
  value: ReactNode;
  label: ReactNode;
  dark?: boolean;
  sub?: ReactNode;
}) {
  return (
    <div>
      <div className="text-5xl font-extrabold leading-none">
        <GradientText>{value}</GradientText>
      </div>
      <div className={`mt-2 text-base font-medium ${dark ? 'text-white/65' : 'text-dc-text-muted'}`}>
        {label}
      </div>
      {sub && (
        <div className={`mt-1 text-[13px] ${dark ? 'text-white/40' : 'text-dc-text-muted/70'}`}>
          {sub}
        </div>
      )}
    </div>
  );
}

function Card({
  children,
  dark = false,
  className = '',
}: {
  children: ReactNode;
  dark?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl p-7 ${
        dark
          ? 'border border-white/10 bg-white/5'
          : 'border border-dc-teal/30 bg-white shadow-[0_10px_40px_-18px_rgba(15,118,110,0.35)]'
      } ${className}`}
    >
      {children}
    </div>
  );
}

function IconBadge({ children, tone = 'teal' }: { children: ReactNode; tone?: 'teal' | 'pink' }) {
  return (
    <div
      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
        tone === 'teal'
          ? 'bg-dc-teal/15 text-dc-teal-btn'
          : 'bg-dc-pink-accent/15 text-dc-pink-accent'
      }`}
    >
      {children}
    </div>
  );
}

function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-5xl font-extrabold leading-[1.06] tracking-tight">{children}</h2>;
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
            A social media
            <br />
            department for every
            <br />
            <GradientText>local restaurant.</GradientText>
          </h1>
          <p className="mt-8 font-script text-4xl text-dc-pink">Less typing = more margin.</p>
        </div>

        <div className="flex items-center justify-between text-white/60">
          <span className="text-base font-medium">
            Restaurants · creators · brands, in one marketplace
          </span>
          <span className="text-base font-semibold">Hoboken, NJ · Confidential</span>
        </div>
      </div>
    </SlideShell>
  );
}

/* ---------- 02 · What we're building ---------- */

export function SlideWhatWeAreBuilding({ index, total }: SlideProps) {
  const copy = THESIS_COPY[THESIS];
  return (
    <SlideShell index={index} total={total} eyebrow="What we're building">
      <H2>{copy.line}</H2>
      <p className="mt-8 max-w-4xl text-2xl leading-relaxed text-dc-text-muted">{copy.usp}</p>

      <div className="mt-auto grid grid-cols-3 gap-5">
        <Card>
          <IconBadge>
            <Store className="h-6 w-6" />
          </IconBadge>
          <p className="mt-4 text-xl font-bold">Restaurants</p>
          <p className="mt-1.5 text-base text-dc-text-muted">
            Get the content made and posted without hiring anyone.
          </p>
        </Card>
        <Card>
          <IconBadge tone="pink">
            <Camera className="h-6 w-6" />
          </IconBadge>
          <p className="mt-4 text-xl font-bold">Creators</p>
          <p className="mt-1.5 text-base text-dc-text-muted">
            Paid work that finds them, and money that arrives on time.
          </p>
        </Card>
        <Card>
          <IconBadge>
            <Bot className="h-6 w-6" />
          </IconBadge>
          <p className="mt-4 text-xl font-bold">Donny</p>
          <p className="mt-1.5 text-base text-dc-text-muted">
            Writes the brief, picks the creators, schedules the posts, reports what happened.
          </p>
        </Card>
      </div>
    </SlideShell>
  );
}

/* ---------- 03 · The problem ---------- */

export function SlideProblem({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="The problem">
      <H2>
        I own restaurants in Hoboken.
        <br />
        <GradientText>Social media nearly ate them.</GradientText>
      </H2>

      <div className="mt-8 grid max-w-5xl grid-cols-2 gap-x-12 gap-y-5 text-xl leading-relaxed text-white/80">
        <p>
          To compete, a restaurant has to live on social. So I found creators, briefed them,
          chased them, approved the work, posted it, and paid premium rates for all of it.
        </p>
        <p>
          It was slow, expensive and never finished. And every owner I knew in Hoboken was
          fighting exactly the same fight.
        </p>
        <p>
          Most of them do not have time to run campaigns. Frankly, they should not have to —
          they should be running a restaurant.
        </p>
        <p className="font-semibold text-white">
          So I stopped complaining about the wall and started building the thing that removes it.
        </p>
      </div>

      <p className="mt-auto text-lg font-semibold text-dc-teal">
        Joe Castelo · CEO · Antique Bar &amp; Bakery, Hoboken
      </p>
    </SlideShell>
  );
}

/* ---------- 04 · Why this is different ---------- */

const COMPETITORS = [
  {
    who: 'Creator marketplaces',
    what: 'Hand you a list of names and take a fee for the introduction.',
    gap: 'You still run the campaign.',
  },
  {
    who: 'AI content tools',
    what: 'Generate a caption about a pizza the model has never eaten.',
    gap: 'No creator, no camera, no post.',
  },
  {
    who: 'Agencies',
    what: 'Do the whole job properly, from about $10K a month.',
    gap: 'Will not take a single restaurant.',
  },
];

export function SlideWhyDifferent({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} eyebrow="Why this is different">
      <H2>
        Content is a <GradientText>supply problem</GradientText>, not a software problem.
      </H2>
      <p className="mt-5 max-w-4xl text-xl text-dc-text-muted">
        Everyone sells the restaurant a tool and leaves them to find the people. We supply the
        people, and the software runs them.
      </p>

      <div className="mt-8 space-y-3">
        {COMPETITORS.map((c) => (
          <div
            key={c.who}
            className="grid grid-cols-[15rem_1fr_20rem] items-center gap-6 rounded-2xl border border-dc-teal/15 bg-white px-7 py-4"
          >
            <p className="text-lg font-bold">{c.who}</p>
            <p className="text-base text-dc-text-muted">{c.what}</p>
            <p className="flex items-center gap-2 text-base font-semibold text-dc-pink-accent">
              <X className="h-4 w-4 shrink-0" />
              {c.gap}
            </p>
          </div>
        ))}
        <div className="grid grid-cols-[15rem_1fr_20rem] items-center gap-6 rounded-2xl border-2 border-dc-teal bg-dc-teal/[0.06] px-7 py-4">
          <p className="text-lg font-extrabold">DragonCandy</p>
          <p className="text-base text-dc-text">
            Brief, match, shoot, approve, post, measure — one flow, one bill.
          </p>
          <p className="flex items-center gap-2 text-base font-bold text-dc-teal-btn">
            <Check className="h-4 w-4 shrink-0" />
            Priced for one restaurant.
          </p>
        </div>
      </div>
    </SlideShell>
  );
}

/* ---------- 05 · The three supply lines ---------- */

export function SlideSupplyLines({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} eyebrow="The three supply lines">
      <H2>Three ways content arrives — and only one of them costs money.</H2>

      <div className="mt-9 grid grid-cols-3 gap-5">
        <Card>
          <IconBadge>
            <Users className="h-6 w-6" />
          </IconBadge>
          <p className="mt-4 text-2xl font-bold">Hired creators</p>
          <p className="mt-2 text-base leading-relaxed text-dc-text-muted">
            The restaurant posts a campaign; creators apply; one is hired, shoots, and is paid
            through the platform. The paid line, and the one we take a cut of.
          </p>
          <p className="mt-3 text-sm font-semibold text-dc-teal-btn">Live today</p>
        </Card>
        <Card>
          <IconBadge tone="pink">
            <Camera className="h-6 w-6" />
          </IconBadge>
          <p className="mt-4 text-2xl font-bold">DragonShare</p>
          <p className="mt-2 text-base leading-relaxed text-dc-text-muted">
            A creator eating at the table posts anyway. The restaurant can boost that post after
            the fact — $5 to $500 — instead of commissioning it in advance.
          </p>
          <p className="mt-3 text-sm font-semibold text-dc-teal-btn">Live today</p>
        </Card>
        <Card>
          <IconBadge>
            <QrCode className="h-6 w-6" />
          </IconBadge>
          <p className="mt-4 text-2xl font-bold">Customer QR</p>
          <p className="mt-2 text-base leading-relaxed text-dc-text-muted">
            A code on the table turns an ordinary customer's phone into supply. The cheapest
            content in the building is already being filmed by the people sitting in it.
          </p>
          <p className="mt-3 text-sm font-semibold text-dc-pink-accent">Built, not yet switched on</p>
        </Card>
      </div>

      {/* Not `mt-auto`: with three tall cards above, auto margin collapses to zero and the
          mark overlaps the card bottoms. A fixed gap is what actually reserves the space. */}
      <div className="mt-6 flex items-baseline gap-3">
        <p className="shrink-0 text-lg text-dc-text-muted">Second launch restaurant:</p>
        <PendingMark input={FOUNDER_INPUTS.uncleRoccoStatus} />
      </div>
    </SlideShell>
  );
}

/* ---------- 06 · What is actually built ---------- */

export function SlideBuilt({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="What is actually built">
      <div className="flex items-start justify-between gap-10">
        <div>
          <H2>
            This is not a deck about
            <br />
            <GradientText>something we intend to build.</GradientText>
          </H2>
          <p className="mt-4 max-w-2xl text-xl text-white/70">
            Payments, three social platforms, and an AI layer that has been running campaigns
            since May. Every figure below is a shell command, not a claim.
          </p>
        </div>
        <div className="shrink-0 rounded-2xl bg-white p-3">
          <QRCodeSVG value="https://dragoncandy.com" size={128} />
          <p className="mt-2 text-center text-[11px] font-bold text-dc-text">dragoncandy.com</p>
        </div>
      </div>

      <div className="mt-9 grid grid-cols-4 gap-x-8 gap-y-7">
        <Stat dark value={count(OPERATING.pageComponents.value)} label="Pages" />
        <Stat dark value={count(OPERATING.hooks.value)} label="React hooks" />
        <Stat dark value={count(OPERATING.edgeFunctions.value)} label="Edge functions" />
        <Stat dark value={count(OPERATING.migrations.value)} label="Database migrations" />
        <Stat dark value={count(OPERATING.sourceFiles.value)} label="TypeScript source files" />
        <Stat
          dark
          value={count(OPERATING.tests.value)}
          label="Tests, all passing"
          sub={`across ${count(OPERATING.testFiles.value)} files`}
        />
        <Stat dark value="3" label="Social platforms live" sub="Instagram · TikTok · YouTube" />
        <Stat dark value={money(OPERATING.burnMonthly.value)} label="Monthly running cost" sub="every vendor, summed" />
      </div>

      <div className="mt-auto flex items-center gap-3">
        <Tag p="MEASURED" dark />
        <Source dark>
          Counted {OPERATING.pageComponents.asOf} by the commands recorded against each row in{' '}
          <code>src/pitch/model/assumptions.ts</code>. Re-runnable in under a second.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 07 · The ask ---------- */

export function SlideAsk({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="gradient" eyebrow="The ask">
      {/*
        `<Gloss>` must NOT go inside `<GradientText>`. GradientText is
        `bg-clip-text text-transparent`, and an inline span that WRAPS has no background
        behind its second line — so the gloss rendered as invisible text on the exported
        slide while `textContent` still contained it, which meant the glossary test
        passed and the deck shipped a term with no visible explanation. Term in the
        gradient, gloss in ordinary text underneath.
      */}
      <H2>
        We are raising a pre-seed on a <GradientText>SAFE</GradientText>.
      </H2>
      <p className="mt-2 max-w-4xl text-lg text-white/70">
        <Gloss t="SAFE" />
      </p>

      <div className="mt-5 max-w-4xl">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-3 text-xl">
          <span className="font-semibold text-white/70">Terms:</span>
          <PendingMark input={FOUNDER_INPUTS.safeTerms} dark />
        </div>
        <p className="mt-3 text-base text-white/60">
          The budget below derives what the company <em>needs</em>. The size, the{' '}
          <Gloss t="valuation cap" />, the discount and <Gloss t="MFN" /> are ours to decide and
          an investor's to negotiate — so this deck does not pretend they are settled.
        </p>
      </div>

      <AskFigures />

      <div className="mt-auto flex items-center gap-4 rounded-2xl border border-white/15 bg-white/5 px-7 py-3.5">
        <span className="text-3xl font-extrabold text-white">$0</span>
        <p className="text-base text-white/70">
          committed so far. Nobody is in this round yet, and we would rather say that on slide 7
          than have you find out on the call.
        </p>
      </div>
    </SlideShell>
  );
}

/* ---------- 08 · How the money works ---------- */

export function SlideRevenue({ index, total }: SlideProps) {
  const m = projectMonth({ month: 0, restaurants: 100, mix: REGISTERED_MIX });
  return (
    <SlideShell index={index} total={total} eyebrow="How the money works">
      <H2>Four streams, stacked on one customer.</H2>

      <div className="mt-7 grid grid-cols-4 gap-4">
        <Card className="!p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-dc-teal-btn">1 · Subscription</p>
          <p className="mt-3 text-3xl font-extrabold">
            {money(PRICING.starter.value)}–{money(PRICING.pro.value)}
          </p>
          <p className="mt-2 text-sm text-dc-text-muted">
            Starter, Growth, Pro. Charged monthly, live in the app today.
          </p>
        </Card>
        <Card className="!p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-dc-teal-btn">
            2 · <Gloss t="take rate" />
          </p>
          <p className="mt-3 text-3xl font-extrabold">
            {pct(TIER_TAKE_RATES.pro.value * 100)}–{pct(TIER_TAKE_RATES.free.value * 100)}
          </p>
          <p className="mt-2 text-sm text-dc-text-muted">
            Falls as the subscription rises. The higher the tier, the smaller our slice.
          </p>
        </Card>
        <Card className="!p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-dc-pink-accent">
            3 · AI overages
          </p>
          <p className="mt-3 text-3xl font-extrabold">$0.10–0.25</p>
          <p className="mt-2 text-sm text-dc-text-muted">
            Per call past the tier's allowance. Live, never charged — excluded from every
            projection here.
          </p>
        </Card>
        <Card className="!p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-dc-pink-accent">
            4 · Rush surcharge
          </p>
          <p className="mt-3 text-3xl font-extrabold">$25–50</p>
          <p className="mt-2 text-sm text-dc-text-muted">
            DragonDash, for content needed today. Live, never charged — also excluded.
          </p>
        </Card>
      </div>

      <div className="mt-7 flex items-end gap-12">
        <Stat
          value={money(m.totalRevenue)}
          label="Monthly revenue at 100 restaurants"
          sub={`${money(m.subscriptionRevenue)} subscription + ${money(m.takeRateRevenue)} take rate`}
        />
        <Stat
          value={money(m.gmvDollars)}
          label={<>Campaign volume through the platform</>}
          sub={`${count(m.campaigns)} campaigns × ${money(avgCampaignValue())} average`}
        />
      </div>

      <div className="mt-auto flex items-center gap-3">
        <Tag p="MEASURED" />
        <Source>
          Prices and take rates are what the app charges today (<code>docs/STRIPE_PRICES.md</code>,{' '}
          <code>stripe-webhook</code>). The volume they are multiplied by is <b>MODELED</b> — see
          the next slide. Streams 3 and 4 are deliberately worth $0 in every figure in this deck.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 09 · Unit economics ---------- */

export function SlideUnitEconomics({ index, total }: SlideProps) {
  const u = unitEconomics(REGISTERED_MIX);
  const m = projectMonth({ month: 0, restaurants: 1, mix: REGISTERED_MIX });
  return (
    <SlideShell index={index} total={total} eyebrow="Unit economics">
      <H2>
        What one restaurant is worth,
        <br />
        against what it costs to win.
      </H2>

      <div className="mt-8 grid grid-cols-4 gap-8">
        <Stat
          value={money(u.grossProfitPerBusinessPerMonth)}
          label="Gross profit per restaurant per month"
          sub={`${pct(m.grossMarginPct, 1)} gross margin`}
        />
        <Stat
          value={money(u.ltv)}
          label={<>LTV</>}
          sub={`${u.customerLifetimeMonths.toFixed(0)} months at ${pct(UNIT_ECONOMICS.monthlyChurn.value * 100, 1)} monthly churn`}
        />
        <Stat
          value={`${u.ltvToCacAtCacHigh.toFixed(1)}–${u.ltvToCacAtCacLow.toFixed(1)}:1`}
          label={<>LTV to CAC</>}
          sub={`kill-switch sits at 2:1`}
        />
        <Stat
          value={`${u.cacPaybackMonthsAtCacLow.toFixed(1)}–${u.cacPaybackMonthsAtCacHigh.toFixed(1)} mo`}
          label="Payback"
          sub="kill-switch sits at 12 months"
        />
      </div>

      <div className="mt-6 max-w-5xl space-y-1.5 text-lg text-dc-text-muted">
        <p>
          <b className="text-dc-text">
            <Gloss t="LTV" />
          </b>{' '}
          — gross profit per month times how long a customer stays.
        </p>
        <p>
          <b className="text-dc-text">
            <Gloss t="CAC" />
          </b>{' '}
          — modelled at {money(UNIT_ECONOMICS.restaurantCacLow.value)}–
          {money(UNIT_ECONOMICS.restaurantCacHigh.value)} for a restaurant.
        </p>
        <p>
          <b className="text-dc-text">
            <Gloss t="gross margin" />
          </b>{' '}
          and <Gloss t="payback" /> are both computed here, not quoted.
        </p>
        <p>
          <b className="text-dc-text">
            <Gloss t="churn" />
          </b>{' '}
          — modelled at {pct(UNIT_ECONOMICS.monthlyChurn.value * 100, 1)} a month, against a
          kill-switch that stops the company at 6%.
        </p>
      </div>

      <div className="mt-auto flex items-center gap-3">
        <Tag p="MODELED" />
        <Source>
          <b>This is a projection measured against a projection.</b> DragonCandy has never
          acquired a paying customer, so the CAC band is a target from our own pricing briefing,
          not an observed cost. The ratio is honest arithmetic on two modelled inputs — treat it
          as the shape of the business, not as evidence.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 10 · Hoboken liquidity ---------- */

export function SlideLiquidity({ index, total }: SlideProps) {
  const ratio = MARKET.creatorsPerRestaurant.value;
  const atTarget = monthsToLiquidity({
    restaurantsPerMonth: 2,
    creatorsPerMonth: 2 * ratio,
    horizonMonths: 36,
  });
  const underRatio = monthsToLiquidity({
    restaurantsPerMonth: 2,
    creatorsPerMonth: 2 * 2,
    horizonMonths: 36,
  });
  const headline = isLiquid(1, ratio).applicantsPerCampaign;

  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="Hoboken liquidity">
      {/* The gloss sits UNDER the headline, not inside it: at 5xl, "liquidity (enough of
          both sides that neither is left waiting)" ran to three lines and the definition
          of the word became the slide's headline instead of the claim about it. */}
      <H2>Liquidity needs a definition before a number.</H2>
      <p className="mt-2 text-base text-white/60">
        <Gloss t="liquidity" />
      </p>

      <div className="mt-3 grid grid-cols-2 gap-5">
        <Card dark className="!p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-dc-teal">Our definition</p>
          <p className="mt-2 text-lg leading-snug text-white/85">
            A posted campaign draws at least{' '}
            <b className="text-white">{LIQUIDITY_THRESHOLD.minApplicantsPerCampaign} applicants</b>{' '}
            over the {MARKET.campaignOpenDays.value} days it stays open,{' '}
            <b className="text-white">and</b> a creator opening the app sees at least{' '}
            <b className="text-white">
              {LIQUIDITY_THRESHOLD.minCampaignsVisibleToCreator} campaigns
            </b>{' '}
            they can apply to right now.
          </p>
        </Card>
        <Card dark className="!p-6">
          <p className="text-sm font-bold uppercase tracking-wider text-dc-teal">The answer</p>
          <p className="mt-2 text-6xl font-extrabold text-white">
            {atTarget === null ? 'Never' : `Month ${atTarget}`}
          </p>
          <p className="mt-1.5 text-base text-white/70">
            at 2 restaurants and {2 * ratio} creators signed per month.
          </p>
        </Card>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-5">
        <div className="rounded-2xl border border-dc-pink-accent/40 bg-dc-pink-accent/10 px-6 py-3">
          <p className="text-lg font-bold text-dc-pink">More restaurants do not fix it.</p>
          <p className="mt-1 text-base text-white/70">
            Sign 2 restaurants a month but only 2 creators each and the market is{' '}
            <b className="text-white">
              {underRatio === null ? 'never liquid, at any restaurant count' : `liquid only in month ${underRatio}`}
            </b>
            . Creator-side lag is what kills local marketplaces, so the model is built to be able
            to say so.
          </p>
        </div>
        <div className="rounded-2xl border border-white/15 bg-white/5 px-6 py-3">
          <p className="text-lg font-bold text-white">The headline clears by very little.</p>
          <p className="mt-1 text-base text-white/70">
            At the target ratio we get {headline.toFixed(1)} applicants per campaign against a
            floor of {LIQUIDITY_THRESHOLD.minApplicantsPerCampaign.toFixed(1)} — about{' '}
            {(((headline - LIQUIDITY_THRESHOLD.minApplicantsPerCampaign) / headline) * 100).toFixed(0)}%
            of headroom, set by two modelled constants.
          </p>
        </div>
      </div>

      {/* The founder mark gets its own row. Inline inside `Source` it wrapped mid-sentence
          and pushed the whole block off the bottom of the canvas. */}
      <div className="mt-3 flex items-baseline gap-3">
        <p className="shrink-0 text-base text-white/60">Restaurants in Hoboken, town-wide:</p>
        <PendingMark input={FOUNDER_INPUTS.hobokenRestaurantCount} dark />
      </div>

      <div className="mt-2 flex items-center gap-3">
        <Tag p="MODELED" dark />
        <Source dark>
          The one forward-looking claim in this deck that becomes MEASURED the day we launch: our
          own schema computes both halves from real applications.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 11 · Hoboken → NYC ---------- */

export function SlideScale({ index, total }: SlideProps) {
  const rows = businessStepTable([100, 1000, 10000], REGISTERED_MIX);
  return (
    <SlideShell index={index} total={total} eyebrow="Hoboken → NYC">
      <H2>The same engine, three sizes.</H2>
      <p className="mt-4 max-w-4xl text-xl text-dc-text-muted">
        Steady-state economics at a fixed number of businesses — what the company looks like
        while it holds that count, not a calendar prediction of when it gets there.
      </p>

      <div className="mt-6 overflow-hidden rounded-2xl border border-dc-teal/20">
        <table className="w-full">
          <thead className="bg-dc-teal/[0.07]">
            <tr className="text-left text-sm font-bold uppercase tracking-wider text-dc-text-muted">
              <th className="px-7 py-3">Businesses</th>
              <th className="px-7 py-3 text-right">Creators</th>
              <th className="px-7 py-3 text-right">Campaign volume / mo</th>
              <th className="px-7 py-3 text-right">Revenue / mo</th>
              <th className="px-7 py-3 text-right">Revenue / yr</th>
              <th className="px-7 py-3 text-right">Gross margin</th>
            </tr>
          </thead>
          <tbody className="text-xl font-semibold tabular-nums">
            {rows.map((r) => (
              <tr key={r.businesses} className="border-t border-dc-teal/15">
                <td className="px-7 py-3 font-extrabold">{count(r.businesses)}</td>
                <td className="px-7 py-3 text-right text-dc-text-muted">{count(r.creators)}</td>
                <td className="px-7 py-3 text-right text-dc-text-muted">
                  {moneyShort(r.monthlyGmv)}
                </td>
                <td className="px-7 py-3 text-right">{moneyShort(r.monthlyRevenue)}</td>
                <td className="px-7 py-3 text-right text-dc-teal-btn">
                  {moneyShort(r.annualRevenue)}
                </td>
                <td className="px-7 py-3 text-right">{pct(r.grossMarginPct, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* The events sit on THIS slide, not on the ask, because what an investor is buying
          here is the route between the three sizes in the table above. They move the ask all
          the same — the raise is computed from the budget — which is why the mark asks for a
          number and not only for dates.

          The cities render BESIDE the mark rather than behind it. A `PendingMark` alone shows
          only the question, so a slide carrying one and nothing else says "we have not decided
          anything" — when in fact three cities and two rooms are settled, which is the half an
          investor wants. Codex caught the deck hiding its own good news. */}
      <div className="mt-4 flex items-baseline gap-3">
        <p className="shrink-0 text-base text-dc-text-muted">Launch events:</p>
        <p className="text-base font-semibold text-dc-text">
          {LAUNCH_EVENTS.map((e) => (
            <span key={e.city} className="mr-4 inline-block">
              {e.city}
              {' · '}
              {e.venue === null ? (
                <span className="font-normal text-dc-text-muted">venue to be chosen</span>
              ) : (
                e.venue
              )}
            </span>
          ))}
          {/* Provenance rides at the END of the list, not on its own row: this slide has
              about 20px of slack and a second row spends all of it. It is here at all
              because `pending.ts` says every consumer of a founder fact prints where it
              came from, and a slide that renders the cities unqualified reads exactly like
              the MEASURED rows in the table above it. The full attribution is in the Q&A
              document; what the slide owes the reader is that a person said this, and when. */}
          <span className="whitespace-nowrap text-sm font-normal text-dc-text-muted">
            founder-stated {FOUNDER_FACTS.launchEvents.asOf}
          </span>
        </p>
      </div>
      <div className="mt-1.5">
        <PendingMark input={FOUNDER_INPUTS.launchEventPlan} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Tag p="MODELED" />
        <Source>
          Assumes a {pct(MARKET.tierMixFree.value * 100)} free /{' '}
          {pct(MARKET.tierMixStarter.value * 100)} starter /{' '}
          {pct(MARKET.tierMixGrowth.value * 100)} growth / {pct(MARKET.tierMixPro.value * 100)} pro
          mix — i.e. {pct((1 - MARKET.tierMixFree.value) * 100)} of restaurants on a paid plan,
          from a base of zero today. <b>No <Gloss t="churn" /> drag is applied to these rows.</b>{' '}
          Read them as steady state, not as a forecast net of the customers who leave.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 12 · The trajectory ---------- */

export function SlideTrajectory({ index, total }: SlideProps) {
  const years = rollup();
  // Scaled off revenue, not off the cost overlay: 2026 costs more than it earns, so a max
  // taken across both would let the one loss-making year set the scale for all three.
  const max = Math.max(...years.map((y) => y.revenue));
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="The trajectory">
      <H2>
        Three years, built from
        <br />
        <GradientText>venue counts up.</GradientText>
      </H2>

      {/* Spacing here is measured, not chosen. The canvas is a fixed 1280x720 and nothing
          clips it — content simply runs off the bottom of the exported PDF page. With the
          confidential EBITDA line rendered, this slide is the tallest in the deck, and at
          `mt-7 space-y-5` plus a five-line paragraph it overflowed by 59px. Re-measure
          (headless Chrome, `slide.scrollHeight` vs `clientHeight`) before adding a line. */}
      <div className="mt-6 space-y-4">
        {years.map((y) => (
          <div
            key={y.year}
            data-testid={`trajectory-row-${y.year}`}
            className="flex items-center gap-7"
          >
            <p className="w-24 shrink-0 text-2xl font-extrabold">{y.year}</p>
            <div className="relative h-9 flex-1 overflow-hidden rounded-lg bg-white/5">
              <div
                className="absolute inset-y-0 left-0 rounded-lg bg-gradient-to-r from-dc-teal-btn to-dc-teal"
                style={{ width: `${(y.revenue / max) * 100}%` }}
              />
              {/* What the metros themselves cost — delivery plus that metro's own
                  marketing. In 2026 it is wider than the revenue bar, which is the point. */}
              <div
                className="absolute inset-y-0 left-0 rounded-lg bg-white/25"
                style={{ width: `${((y.revenue - y.metroEbitda) / max) * 100}%` }}
              />
            </div>
            <div className="w-[24rem] shrink-0 text-right">
              <p className="text-lg tabular-nums">
                <span className="font-bold text-white">{moneyShort(y.revenue)}</span>
                <span className="text-white/45"> booked · </span>
                <span
                  className={
                    y.metroEbitda >= 0 ? 'font-bold text-dc-teal' : 'font-bold text-dc-pink'
                  }
                >
                  {moneyShort(y.metroEbitda)}
                </span>
                <span className="text-white/45"> metro contribution</span>
              </p>
              <p className="text-sm text-white/45">
                {moneyShort(y.exitArr)} exit ARR · {y.metrosLive} metros live
              </p>
            </div>
          </div>
        ))}
      </div>

      <TrajectoryConsolidatedEbitda />

      {/* The opening "built bottom-up: Census venue counts, a stated share, our live pricing"
          sentence that used to start this paragraph was DELETED, not moved: the Source block
          below already says it almost word for word, and the slide has no vertical slack to
          spend saying it twice. See the measurement note above. */}
      <p className="mt-3 max-w-5xl text-base leading-relaxed text-white/70">
        Bars are revenue <b className="text-white">booked</b> during the year; exit{' '}
        <Gloss t="ARR" className="text-white" /> is where it ends, and it is what a plan is
        stated in — our superseded plan put{' '}
        <b className="text-white">
          {moneyShort(years[2].priorPlanArrLow)}–{moneyShort(years[2].priorPlanArrHigh)}
        </b>{' '}
        on 2028, a cross-check we did not tune to meet. The pale overlay is what the metros
        cost to run; what is left is <b className="text-white">metro contribution</b>, before
        company payroll, AI and infrastructure — so it is not{' '}
        <Gloss t="EBITDA" className="text-white" />. The company&rsquo;s own line stays
        negative through 2027, which is what the raise is for.
      </p>

      <div className="mt-auto flex items-center gap-3">
        <Tag p="MODELED" dark />
        <Source dark>
          Every figure here is read from the model at render time: Census venue counts per
          metro, a stated share of them signed, and our live pricing. Metro contribution is
          after delivery cost and that metro&rsquo;s own marketing and before every
          company-level cost, so it is not comparable to the margin figure on the
          unit-economics slide, which excludes everything below gross profit.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 13 · Why it compounds ---------- */

export function SlideCompounds({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} eyebrow="Why it compounds">
      <H2>
        Every campaign teaches the thing
        <br />
        that runs the <GradientText>next campaign.</GradientText>
      </H2>

      <div className="mt-6 grid grid-cols-2 gap-5">
        <Card className="!p-6">
          <IconBadge>
            <Database className="h-6 w-6" />
          </IconBadge>
          <p className="mt-3 text-2xl font-bold">A campaign is not one row.</p>
          <p className="mt-2 text-base leading-snug text-dc-text-muted">
            It is a chain: a brief that states intent, several applicants resolving to one hire —
            a preference pair — an approve-or-reject that is a quality label, and a performance
            record that is the outcome. One campaign yields tens of labelled rows, not one.
          </p>
        </Card>
        <Card className="!p-6">
          <IconBadge tone="pink">
            <Bot className="h-6 w-6" />
          </IconBadge>
          <p className="mt-3 text-2xl font-bold">Which is why the threshold is low.</p>
          <p className="mt-2 text-base leading-snug text-dc-text-muted">
            A few thousand campaigns produce tens of thousands of labelled preference pairs — the
            regime <Gloss t="LoRA" /> is sample-efficient in, at $50–300 a run. We tune three
            things: match ranking, brief generation, performance prediction.
          </p>
        </Card>
      </div>

      <div className="mt-4 flex items-center gap-4 rounded-2xl border-2 border-dc-teal/40 bg-dc-teal/[0.05] px-6 py-3.5">
        <ArrowRight className="h-6 w-6 shrink-0 text-dc-teal-btn" />
        <p className="text-base text-dc-text">
          <b>The unit is labelled examples, not campaigns.</b> If an investor with an AI
          background challenges "1,000 to 5,000 campaigns", that is the right challenge and this
          is the answer — the number was defensible, the unit was wrong, and we fixed the unit.
        </p>
      </div>

      <div className="mt-auto flex items-center gap-3">
        <Tag p="MODELED" />
        <Source>
          Nothing has been fine-tuned yet — this is the plan the data makes possible, and the
          reason the ledger is written from day one. LoRA run costs are from our own cost model
          §3.1.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 14 · Team & board ---------- */

export function SlideTeam({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="dark" eyebrow="Team & board">
      <H2>Three founders, one board member, no padding.</H2>

      <div className="mt-8 grid grid-cols-3 gap-5">
        <Card dark>
          <p className="text-2xl font-bold">Joe Castelo</p>
          <p className="mt-1 text-base font-semibold text-dc-teal">CEO · Sales &amp; partnerships</p>
          <p className="mt-3 text-base leading-relaxed text-white/70">
            Ten years running restaurants in Hoboken, including Antique Bar &amp; Bakery. Ran a
            production company before that. He is the customer, which is why the product knows
            where the pain is.
          </p>
        </Card>
        <Card dark>
          <p className="text-2xl font-bold">Damon Williams</p>
          <p className="mt-1 text-base font-semibold text-dc-teal">Co-founder · CTO</p>
          <p className="mt-3 text-base leading-relaxed text-white/70">
            Senior engineer. Built the platform on slide 6 — the payments, the AI layer, the
            social integrations and the tests that keep them honest.
          </p>
        </Card>
        <Card dark>
          <p className="text-2xl font-bold">Juwan Robinson</p>
          <p className="mt-1 text-base font-semibold text-dc-teal">Shareholder</p>
          <p className="mt-3 text-base leading-relaxed text-white/70">
            Co-explored the original idea with Joe and stayed through the pivot from agency to
            platform.
          </p>
        </Card>
      </div>

      {/* Labels kept short enough not to wrap: at two lines each they collided with the
          provenance row below. */}
      <div className="mt-6 space-y-3">
        <div className="flex items-baseline gap-3">
          <p className="shrink-0 text-lg text-white/70">Track records:</p>
          <PendingMark input={FOUNDER_INPUTS.teamBios} dark />
        </div>
        <div className="flex items-baseline gap-3">
          <p className="shrink-0 text-lg text-white/70">Board:</p>
          <PendingMark input={FOUNDER_INPUTS.adrianConsent} dark />
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <Tag p="MEASURED" dark />
        <Source dark>
          Engineering is being extended through three outside houses already in conversation
          rather than four full-time hires — the budget on slide 7 is built on that shape.
        </Source>
      </div>
    </SlideShell>
  );
}

/* ---------- 15 · Close ---------- */

export function SlideClose({ index, total }: SlideProps) {
  return (
    <SlideShell index={index} total={total} variant="gradient" bare>
      <div className="relative flex h-full flex-col justify-between px-20 py-16">
        <img src="/logo.webp" alt="DragonCandy" className="h-14 w-auto self-start" />

        <div className="max-w-5xl">
          <p className="text-6xl font-extrabold leading-[1.1] tracking-tight">
            “DragonCandy is my social
            <br />
            media department.
            <br />
            <GradientText>Now it's yours.”</GradientText>
          </p>
          <p className="mt-8 text-2xl font-semibold text-white/70">
            Joe Castelo · CEO, DragonCandy
          </p>
        </div>

        <div className="flex items-end justify-between text-white/60">
          <div>
            <p className="text-base font-semibold text-white">Dragon Candy LLC</p>
            <p className="text-base">33-41 Newark St., 5th Floor · Hoboken, NJ 07030</p>
            <p className="text-base">dragoncandy.com</p>
          </div>
          <p className="font-script text-3xl text-dc-pink">Less typing = more margin.</p>
        </div>
      </div>
    </SlideShell>
  );
}
