import type { ComponentType } from "react";
import type { SlideProps } from "./SlideShell";
import {
  SlideCover,
  SlideProblem,
  SlideSolution,
  SlideWhyNow,
  SlideProduct,
  SlideMarket,
  SlideModel,
  SlideTraction,
  SlideGTM,
  SlideMoat,
  SlideTeam,
  SlideFinancials,
  SlideAsk,
  SlideClose,
} from "./slides";

/** Ordered deck — index drives the page number shown in each slide footer. */
export const slides: ComponentType<SlideProps>[] = [
  SlideCover,
  SlideProblem,
  SlideSolution,
  SlideWhyNow,
  SlideProduct,
  SlideMarket,
  SlideModel,
  SlideTraction,
  SlideGTM,
  SlideMoat,
  SlideTeam,
  SlideFinancials,
  SlideAsk,
  SlideClose,
];
