/**
 * The deck, as data: order, titles, and the speaker notes that print facing each slide.
 *
 * Notes are a build requirement, not a nicety (spec §7). Joe presents this cold, to
 * people who will interrupt — so each note is written as *what to say*, plus the answer
 * to the question that slide provokes. They are printed as a facing page in the PDF
 * export and never rendered on screen.
 */
import type { ComponentType } from 'react';
import type { SlideProps } from './SlideShell';
import {
  SlideAsk,
  SlideBuilt,
  SlideClose,
  SlideCompounds,
  SlideCover,
  SlideLiquidity,
  SlideProblem,
  SlideRevenue,
  SlideScale,
  SlideSupplyLines,
  SlideTeam,
  SlideTrajectory,
  SlideUnitEconomics,
  SlideWhatWeAreBuilding,
  SlideWhyDifferent,
} from './slides';

export interface DeckSlide {
  /** Stable id — used by the notes export and by tests, never shown. */
  readonly id: string;
  /** Title for the facing notes page and the Q&A sheet. */
  readonly title: string;
  readonly Component: ComponentType<SlideProps>;
  /** What Joe says. Written to be read aloud, not skimmed. */
  readonly notes: string;
}

export const deck: readonly DeckSlide[] = [
  {
    id: 'cover',
    title: 'Cover',
    Component: SlideCover,
    notes:
      'Say the company name, the one line, and where we are. Then stop talking and let them ask the first question — this is the only slide where silence works in your favour.',
  },
  {
    id: 'what',
    title: "What we're building",
    Component: SlideWhatWeAreBuilding,
    notes:
      'One sentence for what it is, one for why it is different. If they ask "so it is an agency?" — no: an agency does the work with its own staff and starts at $10K a month. We are a marketplace with the campaign management built in, and a restaurant can start at $149.\n\nThe headline on this slide has three versions (marketplace, data, SMB software) picked by the THESIS constant before export. Send the one that matches the investor.',
  },
  {
    id: 'problem',
    title: 'The problem',
    Component: SlideProblem,
    notes:
      'This slide is yours. Tell it in the first person and do not rush it — ten years of restaurants in Hoboken is the single most credible thing in the room, and no number on any later slide will beat it.\n\nIf they ask how you know other owners have the same problem: you have been in the association, you have had the conversation at every bar in town, and every one of them is either paying an agency they resent or posting nothing.',
  },
  {
    id: 'different',
    title: 'Why this is different',
    Component: SlideWhyDifferent,
    notes:
      'The line to land: content is a supply problem, not a software problem. Every competitor sells the restaurant a tool and leaves them to find the humans.\n\nExpect: "what stops a marketplace like Fiverr doing this?" Answer: nothing stops them building it, but their business is transactions between strangers and ours is a standing relationship in one town. The moat is the local supply we recruit, not the software.',
  },
  {
    id: 'supply',
    title: 'The three supply lines',
    Component: SlideSupplyLines,
    notes:
      'Two of the three are live; the QR line is built and not switched on. Say that plainly — it is on the slide.\n\nThe point of this slide is that our cost of supply falls over time: hired creators are the expensive line, and the other two are content we did not commission. Nobody else has the second and third lines at all.',
  },
  {
    id: 'built',
    title: 'What is actually built',
    Component: SlideBuilt,
    notes:
      'The point of this slide is that we are not asking them to fund a plan. Payments work, three social platforms are connected, the AI has been generating campaigns since May.\n\nIf they ask how you know the numbers: every one of them is a shell command recorded next to the figure, re-run the day the deck was built. Offer the demo — the QR goes to the live product.\n\nDo NOT send the /pitch URL to an investor. The site is not password-gated yet. Send the PDF.',
  },
  {
    id: 'ask',
    title: 'The ask',
    Component: SlideAsk,
    notes:
      'Say the number, say what it buys, then stop. The $0-committed line is on the slide on purpose — say it out loud rather than letting them discover it, because they will.\n\nIf they ask why not the $3M in the older plan: that figure was a full team across three metros. This raise buys one town, an outsourced engineering arrangement already in motion, and eighteen months.\n\nThe public build of this deck omits the amounts. If the slide shows placeholders where the numbers should be, you are presenting the wrong export — use VITE_PITCH_CONFIDENTIAL=1.',
  },
  {
    id: 'revenue',
    title: 'How the money works',
    Component: SlideRevenue,
    notes:
      'Four streams on one customer. The prices are real — they are what the app charges today, not a plan.\n\nThe honest bit worth saying yourself: streams 3 and 4 are live in the product but have never been charged, so we value them at zero everywhere in this deck. Volunteering that buys you credibility for the two streams we do count.',
  },
  {
    id: 'unit',
    title: 'Unit economics',
    Component: SlideUnitEconomics,
    notes:
      'This is where an experienced investor pushes. Get in front of it: we have never acquired a paying customer, so the acquisition cost is a target from our own pricing work, not something we have observed. The ratio is arithmetic on two assumptions.\n\nWhat makes it credible is not the ratio, it is that the platform costs almost nothing to serve — the margin line is real because the cost line is small and known.',
  },
  {
    id: 'liquidity',
    title: 'Hoboken liquidity',
    Component: SlideLiquidity,
    notes:
      'Lead with the definition, not the number — a marketplace founder who cannot define liquidity gets marked down.\n\nThe strongest thing on this slide is the second box: more restaurants do not fix a creator shortage. Say it before they ask it. And the headroom line is deliberate honesty — we clear our own threshold by a hair, and we would rather show that than a comfortable number nobody believes.',
  },
  {
    id: 'scale',
    title: 'Hoboken → NYC',
    Component: SlideScale,
    notes:
      'Read this as "what the business looks like holding that many customers", not "when we get there". If they ask about churn: it is benchmarked at 4% a month and it is deliberately NOT applied to this table. Say so — the slide says so too.\n\nThe reason the margin barely moves across three orders of magnitude is that the cost of serving one more restaurant is a few dollars.',
  },
  {
    id: 'trajectory',
    title: 'The trajectory',
    Component: SlideTrajectory,
    notes:
      'Year 1 is negative in every pairing. Do not soften that — it is what the raise is for, and pretending otherwise is the fastest way to lose the room.\n\nThe worst case pairs our lowest revenue with our highest cost, which is not how most decks draw the low end. Point that out.',
  },
  {
    id: 'compounds',
    title: 'Why it compounds',
    Component: SlideCompounds,
    notes:
      'This is the slide for a technical investor. The key correction: a campaign is not one training example, it is a chain that yields many — a brief, a preference pair, a quality label, an outcome.\n\nIf they challenge the 1,000–5,000 threshold, they are right to, and the answer is that the number was defensible but the unit was wrong. We restated it. Nothing has been fine-tuned yet; this is what the data makes possible.',
  },
  {
    id: 'team',
    title: 'Team & advisors',
    Component: SlideTeam,
    notes:
      'Three people, honestly described. Do not inflate — an investor checks.\n\nThe strength here is that the CEO is the customer and the CTO built the thing on slide 6. If they ask about engineering capacity: three outside houses are already in conversation, which is why the budget is not four salaries.',
  },
  {
    id: 'close',
    title: 'Close',
    Component: SlideClose,
    notes:
      'Say the line, then ask for the meeting. Nothing after this slide.',
  },
];

/** The components, in order — what `PitchDeck` renders. */
export const slides: readonly ComponentType<SlideProps>[] = deck.map((s) => s.Component);
