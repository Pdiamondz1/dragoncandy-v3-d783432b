/**
 * campaign-quality-compare.ts
 *
 * Throwaway developer verification harness. Run with:
 *   npx tsx scripts/campaign-quality-compare.ts
 *
 * Two jobs:
 *  1. Let a founder eyeball OLD (Sonnet, closed-enum prompt) vs NEW (Opus 4.8,
 *     Donny-first creative prompt) campaign-idea quality across 5 representative
 *     businesses, side by side.
 *  2. Deploy-time gate + structural check: a 400 on the NEW arm reveals that the
 *     ANTHROPIC_API_KEY lacks `claude-opus-4-8` access, and deterministic
 *     structural assertions validate the NEW output shape.
 *
 * Read-only: this NEVER writes to any DB or file — output goes to stdout only.
 * It requires ANTHROPIC_API_KEY + network; it will not run without them.
 *
 * See docs/superpowers/specs/2026-07-16-donny-campaign-creativity-design.md and
 * scripts/managed-agent-audit.ts (the dotenv / SDK convention this mirrors).
 */

import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  buildDonnyFirstSystemPrompt,
  buildDonnyFirstUserPrompt,
  parseCampaignJson,
  PLATFORMS,
} from "../supabase/functions/donny-campaign-generate/lib.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirror managed-agent-audit.ts: load a local dotenv file, then fall back to the
// real process env. dotenv silently no-ops when .env.local is absent.
dotenv.config({ path: path.join(__dirname, "..", ".env.local") });

const OLD_MODEL = "claude-sonnet-4-6";
const NEW_MODEL = "claude-opus-4-8";

// NEW-arm price per token (as specified for this harness).
const NEW_INPUT_USD_PER_TOKEN = 0.000005;
const NEW_OUTPUT_USD_PER_TOKEN = 0.000025;

// The NEW chat budget: 3 complete ideas must fit under this ceiling.
const NEW_OUTPUT_TOKEN_CEILING = 4096;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConnectedPlatform {
  platform: string;
  platform_handle: string | null;
}

interface Fixture {
  name: string;
  sourceType: string;
  pageContent: string;
  connectedPlatforms: ConnectedPlatform[];
}

interface Deliverable {
  platform?: string;
  content_type?: string;
}

interface CampaignIdea {
  id?: string;
  emoji?: string;
  title?: string;
  description?: string;
  creative_concept?: string;
  campaign_type?: string;
  is_wildcard?: boolean;
  recommended_platforms?: string[];
  deliverables?: Deliverable[];
}

interface ParsedCampaigns {
  business_context?: Record<string, unknown>;
  campaign_ideas?: CampaignIdea[];
}

interface AssertionResult {
  label: string;
  pass: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Fixtures — 5 representative businesses covering the required dimensions
// ---------------------------------------------------------------------------

const FIXTURES: Fixture[] = [
  {
    // (a) website blurb
    name: "Website blurb — El Fuego Taco Truck",
    sourceType: "website",
    pageContent:
      "Title: El Fuego Taco Truck | Austin's #1 Late-Night Tacos\n" +
      "Description: Mesquite-grilled al pastor, house salsas, and $2 street tacos " +
      "parked on Rainey St every Thu-Sun until 2am.\n" +
      "Content: Family recipe from Guadalajara. Cash and card. Vegan jackfruit " +
      "option. Regulars line up for the birria consommé dip.",
    connectedPlatforms: [
      { platform: "instagram", platform_handle: "@elfuegotacos" },
      { platform: "facebook", platform_handle: "ElFuegoTacoTruckATX" },
    ],
  },
  {
    // (b) manual-text-only local restaurant
    name: "Manual text only — Nonna's Corner Trattoria",
    sourceType: "manual",
    pageContent:
      "Small family-run Italian trattoria in a Brooklyn brownstone. 8 tables, " +
      "hand-rolled pasta made every morning, a rotating Sunday gravy special, and " +
      "a tiny natural-wine list. No website, no reservations — just a chalkboard " +
      "menu and a wood oven. Owner Nonna Lucia still greets every guest.",
    connectedPlatforms: [
      { platform: "google_business", platform_handle: null },
    ],
  },
  {
    // (c) photo-only case
    name: "Photo only — steaming ramen bar",
    sourceType: "photo",
    pageContent:
      "[Photo uploaded: dimly lit ramen bar, steam rising off tonkotsu bowls, a " +
      "neon sign reading 'SLURP', counter seating, chef torching chashu, condensation " +
      "on the window with rain outside]",
    connectedPlatforms: [
      { platform: "tiktok", platform_handle: "@slurpramen" },
    ],
  },
  {
    // (d) business WITH connected platforms (instagram + tiktok)
    name: "Connected IG+TikTok — Third Wave Coffee Roasters",
    sourceType: "website",
    pageContent:
      "Title: Third Wave Coffee Roasters — Single-origin, roasted in Portland\n" +
      "Description: Micro-lot pour-overs, a cupping bar, and a rotating guest-roaster " +
      "program. Latte art throwdowns every first Friday.\n" +
      "Content: Ethically sourced beans, in-house barista training, oat/almond/house " +
      "cashew milks. Sells whole-bean subscriptions.",
    connectedPlatforms: [
      { platform: "instagram", platform_handle: "@thirdwavepdx" },
      { platform: "tiktok", platform_handle: "@thirdwavepdx" },
    ],
  },
  {
    // (e) business with NO connected platforms
    name: "No platforms connected — Brick & Fire Pizzeria",
    sourceType: "website",
    pageContent:
      "Title: Brick & Fire Pizzeria | Neapolitan pies in Somerville\n" +
      "Description: 90-second 900°F wood-fired pizza, 48-hour cold-fermented dough, " +
      "imported San Marzano tomatoes, and a rotating negroni tap.\n" +
      "Content: Family recipes, patio seating, weekend brunch pizza. Just opened — " +
      "building an audience from scratch.",
    connectedPlatforms: [],
  },
];

// ---------------------------------------------------------------------------
// OLD-arm prompt reconstruction (faithful to the pre-change index.ts:
// closed enums + a hard "MUST use ONLY connected platforms" block + one-sentence
// description caps). For eyeballing only — this arm drives no assertions.
// ---------------------------------------------------------------------------

function reconstructOldSystemPrompt(connectedPlatforms: ConnectedPlatform[]): string {
  const hasConnected = connectedPlatforms.length > 0;
  const platformList = connectedPlatforms.map((p) => p.platform).join(", ");
  const platformConstraint = hasConnected
    ? "\n\nCONNECTED SOCIAL MEDIA PLATFORMS: " + platformList + "\n" +
      "The business has ONLY these platforms connected. You MUST:\n" +
      "- Set \"recommended_platforms\" to ONLY include connected platforms (no others)\n" +
      "- Set each deliverable's \"platform\" to one of the connected platforms\n" +
      "- Generate content_strategy posts ONLY for connected platforms\n" +
      "- Adapt content types to what works best on the connected platforms\n" +
      "Do NOT suggest content for platforms the business has not connected."
    : "\n\nNo social media platforms are currently connected. Generate campaigns " +
      "with diverse platform suggestions, but set \"content_strategy\" to null.";

  return "You are Donny, a creative AI assistant for DragonCandy — a marketplace " +
    "connecting restaurants with content creators.\n\n" +
    "Given information about a business, you will:\n" +
    "1. Extract structured business context (name, location, cuisine, vibe, etc.)\n" +
    "2. Generate exactly 3 DIVERSE campaign ideas. Each idea must be a DIFFERENT campaign type.\n" +
    "3. For each campaign idea, generate a content_strategy that maps deliverables to a " +
    "posting plan optimized for the business's connected platforms.\n\n" +
    "Campaign types to choose from: ugc_content, launch_hype, ongoing_presence, event_promo, seasonal.\n" +
    "Platforms: instagram, tiktok, facebook, youtube, google_business, multi_platform.\n" +
    "Content types: photo, video_reel, story, carousel, tiktok, youtube_short.\n" +
    "Aspect ratios: 9:16, 16:9, 1:1, 4:5.\n" +
    "Delivery tiers: dragondash (rush, 1-3 hours), express (24-48 hours), standard (5-7 days)." +
    platformConstraint +
    "\n\nRespond ONLY with valid JSON matching this exact schema:\n" +
    "{\n" +
    "  \"business_context\": {\n" +
    "    \"source_url\": \"<url or empty string>\",\n" +
    "    \"source_type\": \"<google_business|instagram|website|yelp|photo|manual>\",\n" +
    "    \"business_name\": \"<name>\",\n" +
    "    \"cuisine_type\": \"<type or null>\",\n" +
    "    \"location\": { \"city\": \"<city>\", \"state\": \"<state or null>\", \"country\": \"<country>\" },\n" +
    "    \"vibe_tags\": [\"<tag>\"]\n" +
    "  },\n" +
    "  \"campaign_ideas\": [\n" +
    "    {\n" +
    "      \"id\": \"<uuid>\",\n" +
    "      \"emoji\": \"<single emoji>\",\n" +
    "      \"title\": \"<short catchy title>\",\n" +
    "      \"description\": \"<one sentence>\",\n" +
    "      \"campaign_type\": \"<type>\",\n" +
    "      \"recommended_platforms\": [\"<platform>\"],\n" +
    "      \"deliverables\": [\n" +
    "        { \"description\": \"<what the creator makes>\", \"content_type\": \"<type>\", " +
    "\"platform\": \"<platform>\", \"aspect_ratio\": \"<ratio>\", \"estimated_duration\": <seconds or null> }\n" +
    "      ],\n" +
    "      \"price\": <number>,\n" +
    "      \"timeline_days\": <number>,\n" +
    "      \"tier\": \"<dragondash|express|standard>\",\n" +
    "      \"tier_reasoning\": \"<one sentence why this tier>\",\n" +
    "      \"style_direction\": \"<visual style guidance>\",\n" +
    "      \"target_creator_persona\": [\"<persona>\"],\n" +
    "      \"key_messages\": [\"<message>\"],\n" +
    "      \"hashtags\": [\"<hashtag>\"]\n" +
    "    }\n" +
    "  ]\n" +
    "}";
}

function buildOldUserPrompt(pageContent: string, sourceType: string): string {
  return "Source type: " + sourceType + "\nRole: anonymous\n\n" +
    "Business information:\n" + pageContent +
    "\n\nGenerate 3 diverse campaign ideas based on this business.";
}

// ---------------------------------------------------------------------------
// Anthropic call + parse helpers
// ---------------------------------------------------------------------------

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function extractText(resp: Anthropic.Message): string {
  const block = resp.content.find(
    (b): b is Anthropic.TextBlock => b.type === "text",
  );
  return block?.text ?? "";
}

async function timedCall(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
): Promise<{ resp: Anthropic.Message; latencyMs: number }> {
  const t0 = performance.now();
  const resp = await client.messages.create(params);
  return { resp, latencyMs: performance.now() - t0 };
}

function parseIdeas(resp: Anthropic.Message): CampaignIdea[] {
  const parsed = parseCampaignJson(extractText(resp)) as ParsedCampaigns;
  return Array.isArray(parsed.campaign_ideas) ? parsed.campaign_ideas : [];
}

// ---------------------------------------------------------------------------
// Printing
// ---------------------------------------------------------------------------

function bar(): string {
  return "=".repeat(64);
}

function printFixtureHeader(fixture: Fixture, index: number, total: number): void {
  const connected =
    fixture.connectedPlatforms.map((p) => p.platform).join(", ") || "none";
  console.log("\n" + bar());
  console.log(`FIXTURE ${index + 1}/${total} — ${fixture.name}`);
  console.log(`  [source: ${fixture.sourceType} | connected: ${connected}]`);
  console.log(bar());
}

function printIdeas(ideas: CampaignIdea[]): void {
  if (ideas.length === 0) {
    console.log("  (no ideas parsed)");
    return;
  }
  ideas.forEach((idea, i) => {
    const wc = idea.is_wildcard === true ? "[WILDCARD] " : "";
    const type = typeof idea.campaign_type === "string" ? idea.campaign_type : "?";
    const title = typeof idea.title === "string" ? idea.title : "(untitled)";
    const desc = typeof idea.description === "string" ? idea.description : "";
    console.log(`  ${i + 1}. ${wc}[${type}] ${title}`);
    if (desc) console.log(`       ${desc}`);
  });
}

/** Prints one arm's ideas + summary line and returns the parsed ideas. */
function printArm(
  label: string,
  resp: Anthropic.Message,
  latencyMs: number,
  isNew: boolean,
): CampaignIdea[] {
  console.log(`\n-- ${label} --`);
  let ideas: CampaignIdea[] = [];
  try {
    ideas = parseIdeas(resp);
    printIdeas(ideas);
  } catch (err) {
    console.log(`  (unparseable output: ${errMsg(err)})`);
  }

  const types = ideas
    .map((i) => i.campaign_type)
    .filter((t): t is string => typeof t === "string");
  const distinct = new Set(types).size;
  const usd = isNew
    ? resp.usage.input_tokens * NEW_INPUT_USD_PER_TOKEN +
      resp.usage.output_tokens * NEW_OUTPUT_USD_PER_TOKEN
    : null;

  const usdPart = usd !== null ? ` | ~$${usd.toFixed(4)}` : "";
  console.log(
    `  summary: distinct campaign_type ${distinct}/${ideas.length} | ` +
      `out ${resp.usage.output_tokens} tok | ${Math.round(latencyMs)} ms${usdPart}`,
  );
  return ideas;
}

function printAssertions(results: AssertionResult[]): void {
  console.log("\n-- STRUCTURAL ASSERTIONS (NEW) --");
  for (const r of results) {
    console.log(`  ${r.pass ? "PASS" : "FAIL"}  ${r.label} (${r.detail})`);
  }
}

// ---------------------------------------------------------------------------
// Structural assertions on the NEW output
// ---------------------------------------------------------------------------

function evaluateNew(
  ideas: CampaignIdea[],
  connectedPlatforms: ConnectedPlatform[],
  outputTokens: number,
): { results: AssertionResult[]; pass: boolean } {
  const platformSet = new Set<string>(PLATFORMS);
  const connectedSet = new Set(connectedPlatforms.map((p) => p.platform));
  const results: AssertionResult[] = [];

  // 1. exactly one idea is the wildcard
  const wildcardCount = ideas.filter((i) => i.is_wildcard === true).length;
  results.push({
    label: "exactly one wildcard",
    pass: wildcardCount === 1,
    detail: String(wildcardCount),
  });

  // 2. the 3 campaign_type values are all distinct
  const types = ideas
    .map((i) => i.campaign_type)
    .filter((t): t is string => typeof t === "string");
  const distinctTypes = new Set(types).size;
  results.push({
    label: "campaign_types distinct",
    pass: ideas.length === 3 && distinctTypes === 3,
    detail: `${distinctTypes}/${ideas.length}`,
  });

  // 3. every recommended_platforms value is a valid PLATFORMS member
  const allRecs: string[] = [];
  for (const idea of ideas) {
    if (Array.isArray(idea.recommended_platforms)) {
      for (const p of idea.recommended_platforms) {
        if (typeof p === "string") allRecs.push(p);
      }
    }
  }
  const badRecs = allRecs.filter((p) => !platformSet.has(p));
  results.push({
    label: "recommended_platforms all in PLATFORMS",
    pass: allRecs.length > 0 && badRecs.length === 0,
    detail: badRecs.length ? `invalid: ${badRecs.join(", ")}` : `${allRecs.length} ok`,
  });

  // 4. every idea has a non-empty creative_concept string
  const conceptOk =
    ideas.length > 0 &&
    ideas.every(
      (i) =>
        typeof i.creative_concept === "string" &&
        i.creative_concept.trim().length > 0,
    );
  results.push({
    label: "creative_concept non-empty on all ideas",
    pass: conceptOk,
    detail: conceptOk ? "ok" : "missing/empty",
  });

  // 5. when platforms are connected: >=1 deliverable targets a connected one
  if (connectedPlatforms.length > 0) {
    const deliverablePlatforms: string[] = [];
    for (const idea of ideas) {
      if (Array.isArray(idea.deliverables)) {
        for (const d of idea.deliverables) {
          if (d && typeof d.platform === "string") deliverablePlatforms.push(d.platform);
        }
      }
    }
    const hit = deliverablePlatforms.some((p) => connectedSet.has(p));
    results.push({
      label: "at least one deliverable targets a connected platform",
      pass: hit,
      detail: hit ? "ok" : "none match",
    });
  } else {
    results.push({
      label: "at least one deliverable targets a connected platform",
      pass: true,
      detail: "N/A (no connected platforms)",
    });
  }

  // 6. NEW output tokens under the bounded chat budget (its own line)
  results.push({
    label: `NEW output tokens < ${NEW_OUTPUT_TOKEN_CEILING}`,
    pass: outputTokens < NEW_OUTPUT_TOKEN_CEILING,
    detail: String(outputTokens),
  });

  return { results, pass: results.every((r) => r.pass) };
}

// ---------------------------------------------------------------------------
// Per-fixture runner
// ---------------------------------------------------------------------------

async function runFixture(
  client: Anthropic,
  fixture: Fixture,
  index: number,
  total: number,
): Promise<boolean> {
  printFixtureHeader(fixture, index, total);

  // OLD arm — Sonnet, closed-enum prompt, temperature 0.8. Eyeball only; a
  // failure here never fails the fixture.
  try {
    const oldParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: OLD_MODEL,
      max_tokens: 4096,
      temperature: 0.8,
      system: reconstructOldSystemPrompt(fixture.connectedPlatforms),
      messages: [
        {
          role: "user",
          content: buildOldUserPrompt(fixture.pageContent, fixture.sourceType),
        },
      ],
    };
    const { resp, latencyMs } = await timedCall(client, oldParams);
    printArm("OLD (claude-sonnet-4-6, temp 0.8)", resp, latencyMs, false);
  } catch (err) {
    console.error(`  !! OLD arm failed: ${errMsg(err)}`);
  }

  // NEW arm — Opus 4.8, Donny-first creative prompt, NO temperature (Opus 4.8
  // 400s if temperature is set). This arm drives the structural assertions and
  // doubles as the deploy-time opus-access gate.
  try {
    const newParams: Anthropic.MessageCreateParamsNonStreaming = {
      model: NEW_MODEL,
      max_tokens: 8192,
      system: buildDonnyFirstSystemPrompt(fixture.connectedPlatforms),
      messages: [
        {
          role: "user",
          content: buildDonnyFirstUserPrompt(
            fixture.pageContent,
            fixture.sourceType,
            null,
          ),
        },
      ],
    };
    const { resp, latencyMs } = await timedCall(client, newParams);
    const ideas = printArm("NEW (claude-opus-4-8, no temp)", resp, latencyMs, true);
    const { results, pass } = evaluateNew(
      ideas,
      fixture.connectedPlatforms,
      resp.usage.output_tokens,
    );
    printAssertions(results);
    console.log(`  -> FIXTURE ${pass ? "PASS" : "FAIL"}`);
    return pass;
  } catch (err) {
    console.error(`  !! NEW arm failed: ${errMsg(err)}`);
    console.error(
      "     If this is a 400 / model-access error, this ANTHROPIC_API_KEY likely " +
        "lacks claude-opus-4-8 access.",
    );
    console.log("  -> FIXTURE FAIL (errored)");
    return false;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error(
      "ANTHROPIC_API_KEY is missing (checked scripts/../.env.local and process.env).",
    );
    console.error(
      "This harness needs a real key + network. Set ANTHROPIC_API_KEY and re-run.",
    );
    process.exit(1);
  }

  const client = new Anthropic({ apiKey });
  console.log("DragonCandy — Campaign-idea quality compare");
  console.log("OLD: claude-sonnet-4-6 (closed-enum prompt)  vs  NEW: claude-opus-4-8 (Donny-first)");
  console.log(
    "Deploy gate: a NEW-arm 400 surfaces a key that lacks claude-opus-4-8 access.",
  );

  let passed = 0;
  for (let i = 0; i < FIXTURES.length; i++) {
    const ok = await runFixture(client, FIXTURES[i], i, FIXTURES.length);
    if (ok) passed++;
  }

  const overall = passed === FIXTURES.length;
  console.log("\n" + bar());
  console.log(
    `OVERALL: ${overall ? "PASS" : "FAIL"}  (${passed}/${FIXTURES.length} fixtures passed all assertions)`,
  );
  console.log(bar());
  process.exit(overall ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal error:", errMsg(err));
  process.exit(1);
});
