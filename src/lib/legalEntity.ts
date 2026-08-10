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
 * THESE VALUES MUST MATCH THE D&B RECORD — not the IRS one. D&B stores the name
 * as "DRAGON CANDY LLC" (its records are uppercase, as are the IRS's); the
 * mixed-case form below is the same entity. If the registered address ever
 * changes, it changes at D&B first and here second — a site that disagrees with
 * the D-U-N-S record is the failure mode this is meant to prevent, and it fails
 * silently.
 *
 * THE TWO OFFICIAL RECORDS DISAGREE ON THE STREET LINE, so pick deliberately:
 * the IRS CP 575 B EIN letter has "33-41 NEWARK ST" with NO floor, while D&B
 * has "33-41 Newark St., 5th Floor". The address below is the D&B form, which
 * is correct here, because Apple matches the D-U-N-S record. The EIN letter's
 * instruction to use the address "exactly as shown" governs FEDERAL TAX FILINGS
 * — not this website. Do not "correct" this to the IRS form.
 *
 * NOT STATED ON THE SITE, deliberately: the D-U-N-S number, the EIN and the
 * business phone. None is what a verifier looks for on a website; the D-U-N-S
 * and phone are footer clutter, and an EIN is sensitive and belongs nowhere
 * near a public page or this repo. They live in the enrollment record.
 *
 * THERE IS NO STATE-OF-FORMATION CONSTANT HERE, AND THAT IS ON PURPOSE.
 * An earlier draft of this branch asserted "a New Jersey limited liability
 * company" in the operative sentence of the Terms. Nothing on hand established
 * it. The IRS CP 575 B EIN letter proves the name, that the entity is an LLC,
 * and a Hoboken *mailing* address — it never states where the LLC was formed,
 * and a Delaware-formed LLC with a New Jersey office is indistinguishable in
 * that document. The Terms' §15 New Jersey governing-law clause is a
 * choice-of-law term, not a formation claim, so it cannot stand in either.
 * The words were removed rather than sourced from an inference. Re-add this
 * only with the NJ Certificate of Formation in hand.
 */

/** Registered company name. Note the space — the entity is two words, the brand is one. */
export const LEGAL_ENTITY_NAME = 'Dragon Candy LLC';

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
