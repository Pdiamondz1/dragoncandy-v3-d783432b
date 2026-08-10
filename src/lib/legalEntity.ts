/**
 * The legal entity behind DragonCandy, as published on the public site.
 *
 * WHY THIS FILE EXISTS: the same reason `contactAddresses.ts` does. Before this,
 * the site named no legal entity anywhere — and the fix touches three surfaces at
 * once (the landing footer, the Terms of Service, the Privacy Policy). Three
 * hardcoded copies of a company name is three chances to update two of them, and
 * an entity name that disagrees with itself across a site is worse than one
 * that is merely absent: it is the exact thing a verifier is checking for.
 *
 * WHY IT IS PUBLISHED AT ALL: Apple Developer Program **Organization** enrollment
 * is verified partly by visiting the company website and looking for evidence it
 * belongs to the legal entity on the D-U-N-S record. `LegalPageLayout`'s own
 * docstring already says the legal pages exist to "expose stable, indexable URLs
 * for App Store Connect" — this is the content that makes them do that job.
 *
 * THESE VALUES MUST MATCH THE D&B RECORD. D&B stores the name as
 * "DRAGON CANDY LLC" (its records are uppercase); the mixed-case form below is
 * the same entity. If the registered address ever changes, it changes at D&B
 * first and here second — a site that disagrees with the D-U-N-S record is the
 * failure mode this is meant to prevent, and it fails silently.
 *
 * NOT STATED ON THE SITE, deliberately: the D-U-N-S number and the business
 * phone. Neither is what a verifier looks for on a website, and both are
 * clutter on a footer. They live in the Apple enrollment record, not here.
 */

/** Registered company name. Note the space — the entity is two words, the brand is one. */
export const LEGAL_ENTITY_NAME = 'Dragon Candy LLC';

/** State of formation, for the "a <state> limited liability company" clause in the Terms. */
export const LEGAL_ENTITY_JURISDICTION = 'New Jersey';

/**
 * City + state only. This is the discreet form used in the landing footer, where a
 * full postal address would be clutter. It still corroborates the D&B record's
 * locality rather than merely asserting a name.
 */
export const LEGAL_ENTITY_LOCALITY = 'Hoboken, NJ';

/**
 * Full registered address, as separate lines so a caller can render it as a block.
 *
 * Used in the legal pages, where a complete postal address for the operating
 * entity is standard and expected, rather than in the landing footer.
 */
export const LEGAL_ENTITY_ADDRESS_LINES = [
  '33-41 Newark St., 5th Floor',
  'Hoboken, NJ 07030',
] as const;
