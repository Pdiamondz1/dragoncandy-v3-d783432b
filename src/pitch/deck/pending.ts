/**
 * The five inputs §8 of the spec says the build will stop at.
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
    blocks: 'Team & advisors',
    why: 'What the repo holds is Joe (ten years running ABB, filmmaker), Damon (CTO, builds the platform) and Juwan (shareholder). The spec calls that thin and forbids inventing more.',
    value: null,
  },
  uncleRoccoStatus: {
    key: 'uncleRoccoStatus',
    question:
      'Has Uncle Rocco\'s agreed to USE the platform as a launch restaurant, or only to let us use their footage?',
    blocks: 'The three supply lines',
    why: 'The permission on record covers the reels on the landing page. A second launch restaurant is a different claim, and the slide says different things depending.',
    value: null,
  },
  adrianConsent: {
    key: 'adrianConsent',
    question:
      'Has Adrian Vella agreed in writing to be named as an advisor in a document sent to investors?',
    blocks: 'Team & advisors',
    why: 'Naming a real person to investors is his decision, not ours. He briefed the deck; that is not the same as consenting to appear in it.',
    value: null,
  },
  hobokenRestaurantCount: {
    key: 'hobokenRestaurantCount',
    question: 'How many restaurants are there in Hoboken — a countable number, with its source?',
    blocks: 'Hoboken liquidity',
    why: 'The liquidity model reaches a threshold in N months; the share of the town that represents is what makes the number mean anything, and no file in this repo holds it.',
    value: null,
  },
} as const satisfies Record<string, FounderInput>;

export type FounderInputKey = keyof typeof FOUNDER_INPUTS;

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
