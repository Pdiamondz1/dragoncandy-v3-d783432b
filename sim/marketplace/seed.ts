// The serial, idempotent, resumable populate sequencer. Pure orchestration over injected SeedSteps —
// so the ordering + flag-gating + resumability are unit-tested with zero network; the real writes live
// in DEFAULT_SEED_STEPS (Task 8 wires it). Serial by contract (mint-429 never bites).
import type { BotRef } from "../types";
import type { Persona } from "../personas"; // Persona/Role live in personas.ts (types.ts imports but does NOT re-export them)
import { generateMarketplaceCohort } from "./personas";

export interface SeededCampaign {
  campaignId: string;
  ownerId: string;
}

export interface SeedSteps {
  /** Emails already on prod (profiles.email LIKE botmk_%) — drives resumable minting. */
  readExistingEmails: () => Promise<Set<string>>;
  /** Mint exactly the given (missing) personas, serially. Full Personas (not just email/role) — the
   *  real mintCohort calls mintBot(svc, persona), which needs fullName/personaKey/cohort too. Returns
   *  the new BotRefs. */
  mintCohort: (personas: Persona[]) => Promise<BotRef[]>;
  /** The FULL botmk cohort (existing + newly minted), split by role — read AFTER minting so every
   *  downstream phase operates on the whole cohort even on a resume where mintCohort minted nothing. */
  readCohortRefs: () => Promise<{ businesses: BotRef[]; creators: BotRef[] }>;
  /** Per business: business_profiles polish + one discount (+ CGC prefs when cgc). Returns count. */
  setupBusinesses: (businesses: BotRef[]) => Promise<number>;
  /** Publish free public campaigns (~1–3 per business). Returns the created campaigns. */
  publishCampaigns: (businesses: BotRef[]) => Promise<SeededCampaign[]>;
  /** Apply→hire→upload→submit→complete→review across campaigns×creators. Returns collaboration count. */
  runCollaborations: (campaigns: SeededCampaign[], creators: BotRef[]) => Promise<number>;
  /** Real message threads between matched biz/creator pairs. Returns thread count. */
  seedMessaging: (campaigns: SeededCampaign[], creators: BotRef[]) => Promise<number>;
  /** Creators post real DragonShare posts targeting botmk orgs. Returns post count. */
  seedDragonFeed: (creators: BotRef[], businesses: BotRef[]) => Promise<number>;
  /** FOLLOW-ON: promote ~25–30% of businesses to multi-location (extra org_units). Returns unit count. */
  promoteMultiLocation: (businesses: BotRef[]) => Promise<number>;
  /** FOLLOW-ON: CGC promotions + anonymous submissions. Returns submission count. */
  seedCgc: (businesses: BotRef[]) => Promise<number>;
}

export interface SeedOpts {
  businesses: number;
  creators: number;
  seed: number;
  multiLocation: boolean;
  cgc: boolean;
}

export interface SeedReport {
  minted: number;
  skipped: number;
  campaigns: number;
  collaborations: number;
  messages: number;
  posts: number;
  units: number;
  cgcSubmissions: number;
}

export async function runMarketplaceSeed(
  steps: SeedSteps,
  opts: SeedOpts,
  log: (m: string) => void = () => {},
): Promise<SeedReport> {
  const personas = generateMarketplaceCohort(opts.businesses, opts.creators, opts.seed);
  const existing = await steps.readExistingEmails();
  const missing = personas.filter((p) => !existing.has(p.email));
  const skipped = personas.length - missing.length;
  log(`[marketplace-seed] cohort=${personas.length} missing=${missing.length} skipped=${skipped}`);

  const minted = await steps.mintCohort(missing);

  // Read the FULL cohort (existing + newly minted) so every downstream phase operates on the whole
  // botmk cohort — correct on a resume where mintCohort minted nothing.
  const { businesses, creators } = await steps.readCohortRefs();

  await steps.setupBusinesses(businesses);
  const campaigns = await steps.publishCampaigns(businesses);
  const collaborations = await steps.runCollaborations(campaigns, creators);
  const messages = await steps.seedMessaging(campaigns, creators);
  const posts = await steps.seedDragonFeed(creators, businesses);

  let units = 0;
  let cgcSubmissions = 0;
  if (opts.multiLocation) units = await steps.promoteMultiLocation(businesses);
  if (opts.cgc) cgcSubmissions = await steps.seedCgc(businesses);

  return {
    minted: minted.length,
    skipped,
    campaigns: campaigns.length,
    collaborations,
    messages,
    posts,
    units,
    cgcSubmissions,
  };
}
