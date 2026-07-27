// Prompt matrix for the WORK-SAMPLE pool — the images that fill creator portfolios and DragonFeed.
//
// Subjects are venue- and food-centric and deliberately EXCLUDE people as the subject. A portfolio
// full of generated portraits would create a second, unmanaged population of synthetic people
// outside the faces pool — same impersonation questions, none of the accounting. Incidental hands
// or a blurred figure across a dining room are fine; a portrait is not.
// See docs/superpowers/specs/2026-07-27-synthetic-content-pass-design.md §4.2.

const SUBJECTS = [
  "a plated main dish on a restaurant table",
  "a finished cocktail on a bar top",
  "a dining-room interior with set tables",
  "a restaurant storefront from across the pavement",
  "a kitchen prep counter mid-service",
  "a patio table set for two",
  "an overhead flat-lay of several small plates",
  "a close-up detail shot of a dish being finished",
  "a coffee and pastry on a cafe table",
  "a bar shelf of bottles and glassware",
];

const CUISINES = [
  "Italian",
  "Mexican",
  "Japanese",
  "Southern American",
  "Mediterranean",
  "Korean",
  "New American",
  "Indian",
  "Vietnamese",
];

const TIMES = ["morning", "midday", "late afternoon", "evening", "night"];

const LIGHT = [
  "soft natural window light",
  "warm golden-hour light",
  "moody low light with warm highlights",
  "bright even daylight",
  "candlelit ambience",
];

const FRAMING = [
  "shot slightly overhead",
  "shot at table height",
  "shot at a three-quarter angle",
  "shot straight on",
];

/**
 * Deterministic per index. Arrays are sampled at co-prime strides so consecutive indices differ on
 * several axes at once rather than marching through one list.
 */
export function workPrompt(index: number): string {
  const subject = SUBJECTS[index % SUBJECTS.length];
  const cuisine = CUISINES[(index * 3) % CUISINES.length];
  const time = TIMES[(index * 7) % TIMES.length];
  const light = LIGHT[(index * 11) % LIGHT.length];
  const framing = FRAMING[(index * 5) % FRAMING.length];

  return (
    `Editorial food-and-venue photograph of ${subject} at a ${cuisine} restaurant, ${time}, ` +
    `${light}, ${framing}. Natural styling, shallow depth of field, realistic. ` +
    `No people are the subject and no identifiable individuals appear. ` +
    `The venue and the scene are fictional.`
  );
}
