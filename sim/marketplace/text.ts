// Curated, deterministic text pools for the marketplace populate (the "hybrid" text seam's cheap,
// zero-AI-cost default). The optional LLM path (Task 11) implements the same BriefFn signature.
import { mulberry32 } from "../personas";

export function makePicker(seed: number): { pick: <T>(pool: readonly T[]) => T } {
  const rng = mulberry32(seed);
  return { pick: <T>(pool: readonly T[]): T => pool[Math.floor(rng() * pool.length)] };
}

export const CREATOR_BIOS: readonly string[] = [
  "Food & lifestyle creator turning local gems into scroll-stopping reels.",
  "NYC-based content creator — short-form video, bright edits, real energy.",
  "I help restaurants look as good online as their food tastes.",
  "Storyteller with a camera. Coffee, plates, and good light.",
  "Gen-Z creator making brands feel human, one clip at a time.",
  "Lifestyle + hospitality content. Ex-line-cook, current camera nerd.",
  "Reels that sell out specials. Hoboken to the Village and back.",
  "Video-first creator. I make the first three seconds count.",
];

export const DISCOUNT_KINDS: readonly { title: string; discount_type: string; discount_value: number }[] = [
  { title: "15% off your first visit", discount_type: "percentage", discount_value: 15 },
  { title: "$10 off orders over $50", discount_type: "fixed_amount", discount_value: 10 },
  { title: "Buy one entrée, get 20% off the second", discount_type: "percentage", discount_value: 20 },
  { title: "Free dessert with any entrée", discount_type: "percentage", discount_value: 100 },
  { title: "25% off weekday lunch", discount_type: "percentage", discount_value: 25 },
];

export const CAMPAIGN_BRIEFS: readonly { title: string; description: string }[] = [
  { title: "Weekend brunch reel", description: "Short vertical video showcasing our weekend brunch — bright, fast, appetite-first." },
  { title: "New menu launch", description: "Highlight three new dishes with close-ups and a quick tasting reaction." },
  { title: "Happy hour spotlight", description: "Capture the room at golden hour: drinks, plates, and the vibe. 15–30s." },
  { title: "Behind-the-pass", description: "A day-in-the-kitchen clip — the craft behind the plate." },
  { title: "Local favorite feature", description: "Tell the story of our signature dish and why regulars keep coming back." },
];

export const MESSAGE_SNIPPETS: readonly string[] = [
  "Hey! Loved your portfolio — would you be up for this one?",
  "Thanks for applying! When could you shoot this week?",
  "Just sent over the brief. Let me know if the vibe fits.",
  "Perfect — see you then. Bring the good lens 😄",
  "Draft looks great. One small tweak on the opening shot?",
];

export const REVIEW_PHRASES: readonly string[] = [
  "Great collaboration — fast, professional, and the content overperformed.",
  "Easy to work with and delivered ahead of schedule. Would book again.",
  "Clear brief, quick approvals, smooth payout. Five stars.",
  "The reel drove real foot traffic. Exactly what we hoped for.",
];

export const CGC_PROMO_TITLES: readonly string[] = [
  "Post a video, get 20% off",
  "Tag us for a free appetizer",
  "Share your visit — win a $25 gift card",
  "Film your meal, unlock a dessert",
];

export type BriefFn = (picker: { pick: <T>(pool: readonly T[]) => T }) => { title: string; description: string };

/** The curated (zero-AI-cost) BriefFn — the default. Task 11 may swap an LLM implementation in. */
export const curatedBrief: BriefFn = (picker) => picker.pick(CAMPAIGN_BRIEFS);
