/**
 * The deck: order, and the pairing of each slide with its speaker note.
 *
 * The notes themselves live in `notes.ts` as plain data, so the PDF exporter (a Node
 * script) can read them without importing React. This file is the only place that knows
 * both halves.
 */
import type { ComponentType } from 'react';
import type { SlideProps } from './SlideShell';
import { NOTES, type SlideId } from './notes';
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
  readonly id: SlideId;
  /** Title for the facing notes page and the Q&A sheet. */
  readonly title: string;
  readonly Component: ComponentType<SlideProps>;
  /** What Joe says. Written to be read aloud, not skimmed. */
  readonly notes: string;
}

/**
 * Order is the spec's §6 order, and the ids must match `notes.ts` exactly — a typo here
 * is a compile error rather than a slide that silently exports with no notes, because
 * `SlideId` is derived from the notes object.
 */
const ORDER: readonly { id: SlideId; Component: ComponentType<SlideProps> }[] = [
  { id: 'cover', Component: SlideCover },
  { id: 'what', Component: SlideWhatWeAreBuilding },
  { id: 'problem', Component: SlideProblem },
  { id: 'different', Component: SlideWhyDifferent },
  { id: 'supply', Component: SlideSupplyLines },
  { id: 'built', Component: SlideBuilt },
  { id: 'ask', Component: SlideAsk },
  { id: 'revenue', Component: SlideRevenue },
  { id: 'unit', Component: SlideUnitEconomics },
  { id: 'liquidity', Component: SlideLiquidity },
  { id: 'scale', Component: SlideScale },
  { id: 'trajectory', Component: SlideTrajectory },
  { id: 'compounds', Component: SlideCompounds },
  { id: 'team', Component: SlideTeam },
  { id: 'close', Component: SlideClose },
];

export const deck: readonly DeckSlide[] = ORDER.map(({ id, Component }) => ({
  id,
  Component,
  title: NOTES[id].title,
  notes: NOTES[id].notes,
}));

/** The components, in order — what `PitchDeck` renders. */
export const slides: readonly ComponentType<SlideProps>[] = deck.map((s) => s.Component);
