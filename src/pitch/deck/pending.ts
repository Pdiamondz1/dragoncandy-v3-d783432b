/**
 * The inputs the build stops at — the five §8 of the spec named, plus any the work since
 * has turned up (see `launchEventPlan`).
 *
 * None of them is derivable from the repo — they are founder decisions and other
 * people's consent. The spec's instruction is explicit about the team bios and the
 * principle covers all five: *"That is thin and will not be invented."*
 *
 * So each one is a hole with a name. A slide that needs an unfilled input renders
 * `<PendingMark>` — a visibly marked amber slot carrying the question — rather than
 * a plausible-looking number. The deck is complete except where it is honestly not.
 *
 * ## Why the test here does not simply fail while these are unfilled
 *
 * The tempting design is a test that goes red until every hole is filled. It was
 * rejected: this repo's CI gates every unrelated PR, so a deliberately-red test
 * stops being a signal within a day and starts being an obstacle someone routes
 * around — and the thing they would route around is the only mechanism preventing
 * an invented number from shipping to an investor.
 *
 * What the tests actually enforce is stronger and stays useful:
 *
 * 1. Every unfilled input appears in `OUTSTANDING` — so the list cannot drift from
 *    the data.
 * 2. Filling an input's `value` removes it from `OUTSTANDING` automatically, and the
 *    slide starts rendering the real thing with no further edit.
 * 3. A slide may not present a founder input as prose; it must go through
 *    `PendingMark`, which either shows the value or shows the hole. There is no
 *    third rendering, so "silently omitted" is not reachable.
 *
 * And `npm run pitch:pdf` prints the outstanding list before it exports, so nobody
 * sends a deck without being told what is still a placeholder.
 */

export interface FounderInput {
  /** Stable key, used by slides and by the PDF export's warning. */
  readonly key: string;
  /** What is being asked, phrased as the question to put to the founders. */
  readonly question: string;
  /** Which slide goes vague without it. */
  readonly blocks: string;
  /** Why the repo cannot answer it. */
  readonly why: string;
  /**
   * The answer, once given. `null` means genuinely unanswered — never a default,
   * never a placeholder string, because a placeholder string renders as an answer.
   */
  readonly value: string | null;
}

export const FOUNDER_INPUTS = {
  safeTerms: {
    key: 'safeTerms',
    question:
      'What are the SAFE terms — target size within $500K–$1.5M, valuation cap, discount, MFN?',
    blocks: 'The ask',
    why: 'The budget derives a *need*. The terms are a founder decision and a negotiation, not a calculation.',
    value: null,
  },
  teamBios: {
    key: 'teamBios',
    question:
      'What are the three founders\' real track records, in the form an investor reads — "Ex-product at X", "Founding engineer at Y"?',
    blocks: 'Team & board',
    why: 'What the repo holds is Joe (ten years running ABB, filmmaker), Damon (CTO, builds the platform) and Juwan (shareholder). The spec calls that thin and forbids inventing more.',
    value: null,
  },
  uncleRoccoStatus: {
    key: 'uncleRoccoStatus',
    question:
      'Has Uncle Rocco\'s agreed to USE the platform as a launch restaurant, or only to let us use their footage?',
    blocks: 'The three supply lines',
    why: 'The permission on record covers the reels on the landing page. A second launch restaurant is a different claim, and the slide says different things depending.',
    // Answered by the founder 2026-08-24: they are using the platform, not merely
    // licensing footage. That is the stronger of the two readings, so the slide now makes
    // the stronger claim — which is exactly why it was worth asking rather than assuming.
    value: "Uncle Rocco's — confirmed, using the platform",
  },
  adrianConsent: {
    key: 'adrianConsent',
    question:
      'Has Adrian Vella agreed in writing to be named in a document sent to investors, and in what role?',
    blocks: 'Team & board',
    why: 'Naming a real person to investors is his decision, not ours. He briefed the deck; that is not the same as consenting to appear in it.',
    // Answered by the founder 2026-08-24: consent given, and the role is BOARD MEMBER, not
    // advisor. The question asked for the role as well as the consent, and it mattered —
    // the deck had him down as an advisor throughout, which understates a board seat.
    value: 'Adrian Vella — named with consent',
  },
  hobokenRestaurantCount: {
    key: 'hobokenRestaurantCount',
    question:
      'How many restaurants operate in Hoboken IN TOTAL — the town-wide denominator, with its source? (Our own count is not this number: that is two.)',
    blocks: 'Hoboken liquidity',
    why: 'The liquidity model reaches a threshold in N months; the share of the town that represents is what makes the number mean anything, and no file in this repo holds it.',
    // Asked once and answered with a different fact (2026-08-24): the founder replied "two —
    // Uncle Rocco's and Antique Bar & Bakery", which is OUR restaurant count, not the town's.
    // That is not a misreading to shrug at — the slide's own label read "Restaurants in
    // Hoboken:", which next to a liquidity model says our supply just as naturally as it says
    // the denominator. The label and this question are both now explicit about which is meant.
    // The founder's answer is recorded where it belongs, in the Q&A doc's traction paragraph.
    value: null,
  },
  launchEventPlan: {
    key: 'launchEventPlan',
    question:
      'For the three launch events: what dates, are the venues booked or only intended, and what is the budget for all three?',
    blocks: 'Hoboken \u2192 NYC',
    // Deliberately vague about the money, and that is not squeamishness: this module is in
    // the public bundle's graph, so its strings AND its comments ship — a comment would ride
    // out in the sourcemap even after minification. The first draft of this `why` quoted a
    // budget line label verbatim and `npm run pitch:verify-public` failed the build over it.
    // The arithmetic that makes this urgent lives in `confidential.ts`, next to the line it
    // is about, where the public build never resolves it.
    why:
      'The cities and two of the venues are decided (see FOUNDER_FACTS.launchEvents); nothing ' +
      'else about them is. It is not cosmetic either: the ask is COMPUTED from the budget, and ' +
      'the budget provides for launch marketing in one city, not three. Price the events and the ' +
      'raise moves; leave them out and the deck asks for a plan it has not costed. Both are ' +
      'founder decisions and neither is a thing to infer.',
    value: null,
  },
} as const satisfies Record<string, FounderInput>;

export type FounderInputKey = keyof typeof FOUNDER_INPUTS;

/**
 * Facts the founders supplied that the repo cannot derive, and that are NOT one of the
 * five §8 holes — answers, not gaps.
 *
 * They live here rather than in the assumptions register on purpose. The register's
 * provenance vocabulary is MEASURED / BENCHMARKED / MODELED, and a founder saying a thing
 * is none of the three. Tagging one `MEASURED` because it came from a person who would
 * know is precisely the failure the Codex second review caught on the registered-user
 * count: a provenance tag applied to a copy vouches for it. So these carry their own
 * source and date in the type, and every consumer prints provenance — at minimum that a
 * founder said it and when, which is what distinguishes these from the MEASURED and MODELED
 * rows standing next to them. The slides do that inline for want of vertical space; the Q&A
 * document, which is where diligence happens, prints the full attribution.
 */
/**
 * One launch event. `venue: null` means a city is decided and its room is not — which is a
 * different state from "no event here", and the deck renders it as such.
 */
export interface LaunchEvent {
  readonly city: string;
  readonly venue: string | null;
}

export const LAUNCH_EVENTS: readonly LaunchEvent[] = [
  { city: 'Hoboken, NJ', venue: 'Antique Lofts' },
  { city: 'Palm Beach, FL', venue: 'The Colony Hotel' },
  { city: 'Montauk, NY', venue: null },
];

/**
 * The prose form, derived rather than typed out again.
 *
 * The slide renders the list and the Q&A document renders this sentence; written twice they
 * would eventually disagree about a venue, and the one an investor read would be whichever
 * they happened to open.
 */
export function describeLaunchEvents(events: readonly LaunchEvent[] = LAUNCH_EVENTS): string {
  const parts = events.map((e) =>
    e.venue === null ? `${e.city} at a venue not yet chosen` : `${e.city} at ${e.venue}`,
  );
  // Spelled, because this lands mid-sentence in a document a human reads aloud: "3 launch
  // events are planned" is the register of a status board, not of a founder talking.
  const WORDS = ['no', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const n = WORDS[parts.length] ?? String(parts.length);
  const verb = parts.length === 1 ? 'event is' : 'events are';
  return `${n} launch ${verb} planned: ${parts.join('; ')}.`;
}

export interface FounderFact {
  readonly statement: string;
  /** Who said it, in what setting. Never a document that quotes them. */
  readonly source: string;
  readonly asOf: string;
}

export const FOUNDER_FACTS = {
  /**
   * The count an investor asks for in the room. Deliberately separate from the register's
   * `registeredUsers` (45 accounts) and `payingCustomers` (0): three different numbers
   * that describe three different things, and quoting one for another is how a deck gets
   * caught. A committed launch restaurant is neither an account nor a customer.
   */
  launchRestaurants: {
    statement:
      'Two restaurants are committed to launch: Antique Bar & Bakery (the CEO\'s own) and Uncle Rocco\'s.',
    source: 'founder statement, Damon Williams (CTO), in session',
    asOf: '2026-08-24',
  },
  /**
   * Three launch events, stated by the founders 2026-08-24. Recorded as *cities and venues*
   * and nothing else, because that is all that was said.
   *
   * Note what this is NOT. It is not a change to the metro sequence: the capital-raise cost
   * model's own plan is Hoboken (Mo 0-6) -> Manhattan (Mo 5-12) -> Palm Beach (Mo 11-18),
   * each gated on density before the next, and Montauk is not a metro under anyone's
   * definition (year-round population ~4,000). An event is a night; a market is a year.
   * Conflating the two would put the deck at odds with its own liquidity slide, which argues
   * that creator-side lag is what kills local marketplaces.
   */
  launchEvents: {
    statement: describeLaunchEvents(),
    source: 'founder statement, Damon Williams (CTO), in session',
    asOf: '2026-08-24',
  },
} as const satisfies Record<string, FounderFact>;


/** Every input still unanswered, in declaration order. */
export const OUTSTANDING: readonly FounderInput[] = Object.values(
  FOUNDER_INPUTS as Record<string, FounderInput>,
).filter((i) => i.value === null);

export function isPending(input: FounderInput): boolean {
  return input.value === null;
}

/** One line per outstanding input, for the PDF export's pre-flight warning. */
export function outstandingReport(): string {
  if (OUTSTANDING.length === 0) return 'All founder inputs are filled.';
  return [
    `${OUTSTANDING.length} founder input${OUTSTANDING.length === 1 ? '' : 's'} still outstanding — the deck marks each one on its slide:`,
    ...OUTSTANDING.map((i) => `  · [${i.blocks}] ${i.question}`),
  ].join('\n');
}
