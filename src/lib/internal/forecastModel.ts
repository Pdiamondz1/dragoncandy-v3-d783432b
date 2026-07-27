/**
 * Cost model + DAU forecast — pure, deterministic (NO LLM). Projects infra footprint + full
 * unit-economics at Today / 500K / 750K / 1M DAU from measured coefficients + editable assumptions.
 * See docs/superpowers/specs/2026-07-27-cost-dau-forecast-design.md. Mirrors the scorecardModel /
 * weightThresholds pattern (constants + pure functions, locked by unit tests).
 */
import { COMPUTE_TIERS, GB } from './weightThresholds';

// ---- Editable assumptions (seeded into aios_dashboard_settings; founder-tunable) ----
export const FORECAST_KEYS = [
  'forecast_registered_per_dau',
  'forecast_db_kb_per_user',
  'forecast_storage_kb_per_user',
  'forecast_peak_concurrency_pct',
  'forecast_requests_per_dau',
  'forecast_ai_cost_per_dau_cents',
  'forecast_business_share_pct',
  'forecast_paying_conversion_pct',
  'forecast_arpu_usd',
] as const;
export type ForecastKey = (typeof FORECAST_KEYS)[number];

export interface ForecastAssumptions {
  registered_per_dau: number;      // registered users per 1 daily-active
  db_kb_per_user: number;          // DB KB per registered user
  storage_kb_per_user: number;     // file storage KB per registered user
  peak_concurrency_pct: number;    // peak concurrent as % of DAU (whole percent, e.g. 8)
  requests_per_dau: number;        // media/content requests per DAU per day
  ai_cost_per_dau_cents: number;   // AI serving ¢ per DAU per month (pre-cap)
  business_share_pct: number;      // % of registered users that are businesses (whole percent)
  paying_conversion_pct: number;   // % of businesses on a paid plan (whole percent)
  arpu_usd: number;                // blended monthly revenue per paying business
}

export const DEFAULT_ASSUMPTIONS: ForecastAssumptions = {
  registered_per_dau: 4,
  db_kb_per_user: 150,
  storage_kb_per_user: 2048,
  peak_concurrency_pct: 8,
  requests_per_dau: 40,
  ai_cost_per_dau_cents: 0.5,
  business_share_pct: 20,
  paying_conversion_pct: 15,
  arpu_usd: 149,
};

// ---- Supabase pricing + model constants (documented; verify against the plan — pricing drifts) ----
export const SUPABASE_PRICING = {
  proBaseUsd: 25,
  includedDiskGb: 8,
  diskOverageUsdPerGb: 0.125,
  includedEgressGb: 250,
  egressOverageUsdPerGb: 0.09,
};
export const PEAK_CONCURRENT_PER_GB = 2000;   // tier-selection heuristic (ASSUMED, not measured)
export const AI_FLOOR_USD = 250;              // PROJECT_CONTEXT §8 pre-revenue AI floor
export const DEFAULT_DB_CONNS_PER_CONCURRENT = 0.0068;
export const DEFAULT_EGRESS_BYTES_PER_REQUEST = 120_000;

const DAU_LEVELS = [500_000, 750_000, 1_000_000] as const;

export interface LoadCeiling {
  honest_peak_concurrency: number;
  db_active_conn_peak: number;
  max_connections: number;
  media_bytes: number;
  media_requests: number;
}

export interface ForecastMeasured {
  dbBytes: number;                 // latest platform_weight.db_bytes (physical, synthetic-inclusive)
  storageBytes: number;            // latest platform_weight.storage_bytes
  registeredUsersReal: number;     // real (synthetic-excluded) registered users
  currentTierIndex: number;        // useCurrentTierIndex → COMPUTE_TIERS index
  loadMatrix: LoadCeiling | null;  // useSimLoadMatrixSummary (null if no matrix run captured)
  currentAiSpendUsd: number;       // cost ledger MTD
  currentOpexUsd: number;          // Σ active operating_expenses / 100
  currentRevenueUsd: number;       // dragonshare MTD platform fee / 100
}

export interface ForecastInput {
  measured: ForecastMeasured;
  assumptions: ForecastAssumptions;
}

export interface DerivedCoefficients {
  dbConnsPerConcurrent: number;
  egressBytesPerRequest: number;
  measuredCeiling: boolean; // false when a documented default was substituted
}

export interface ForecastScenario {
  label: string;               // 'Today' | '500K' | '750K' | '1M'
  dau: number | null;          // null for Today
  measured: boolean;
  registeredUsers: number;
  peakConcurrent: number | null;
  dbBytes: number;
  storageBytes: number;
  pooledDbConns: number | null;
  connCeiling: number | null;
  computeTier: string;
  computeUsd: number;
  diskGb: number;
  supabaseUsd: number;
  aiUncappedUsd: number | null; // null for Today (measured)
  aiUsd: number;
  aiCapBreached: boolean;
  otherOpexUsd: number;
  totalCostUsd: number;
  revenueUsd: number;
  grossMarginUsd: number;
  marginPct: number | null;    // null when revenue = 0
  costPerDauUsd: number | null; // null for Today
}

export interface ForecastModel {
  scenarios: ForecastScenario[];
  coefficients: DerivedCoefficients;
  notes: string[];
}

function deriveCoefficients(m: ForecastMeasured, notes: string[]): DerivedCoefficients {
  const lm = m.loadMatrix;
  const ok = !!lm && lm.honest_peak_concurrency > 0 && lm.media_requests > 0;
  if (!ok) {
    notes.push('Measured load-run ceiling unavailable — using default connection/egress coefficients.');
    return {
      dbConnsPerConcurrent: DEFAULT_DB_CONNS_PER_CONCURRENT,
      egressBytesPerRequest: DEFAULT_EGRESS_BYTES_PER_REQUEST,
      measuredCeiling: false,
    };
  }
  return {
    dbConnsPerConcurrent: lm!.db_active_conn_peak / lm!.honest_peak_concurrency,
    egressBytesPerRequest: lm!.media_bytes / lm!.media_requests,
    measuredCeiling: true,
  };
}

function tierFor(peakConcurrent: number): { name: string; usd: number } {
  const tier = COMPUTE_TIERS.find((t) => peakConcurrent <= t.ramGb * PEAK_CONCURRENT_PER_GB);
  if (tier) return { name: tier.name, usd: tier.monthlyUsd };
  const top = COMPUTE_TIERS[COMPUTE_TIERS.length - 1];
  return { name: 'Custom (contact Supabase)', usd: top.monthlyUsd }; // floor cost; flagged in the UI
}

function diskOverageUsd(dbBytes: number): number {
  const gb = dbBytes / GB;
  return Math.max(0, gb - SUPABASE_PRICING.includedDiskGb) * SUPABASE_PRICING.diskOverageUsdPerGb;
}

function marginPct(revenueUsd: number, marginUsd: number): number | null {
  return revenueUsd > 0 ? marginUsd / revenueUsd : null;
}

function buildToday(m: ForecastMeasured): ForecastScenario {
  const tier = COMPUTE_TIERS[m.currentTierIndex] ?? COMPUTE_TIERS[0];
  const supabaseUsd = SUPABASE_PRICING.proBaseUsd + tier.monthlyUsd + diskOverageUsd(m.dbBytes);
  const aiUsd = m.currentAiSpendUsd;
  const otherOpexUsd = m.currentOpexUsd;
  const totalCostUsd = supabaseUsd + aiUsd + otherOpexUsd;
  const revenueUsd = m.currentRevenueUsd;
  const grossMarginUsd = revenueUsd - totalCostUsd;
  return {
    label: 'Today',
    dau: null,
    measured: true,
    registeredUsers: m.registeredUsersReal,
    peakConcurrent: m.loadMatrix?.honest_peak_concurrency ?? null,
    dbBytes: m.dbBytes,
    storageBytes: m.storageBytes,
    pooledDbConns: m.loadMatrix?.db_active_conn_peak ?? null,
    connCeiling: m.loadMatrix?.max_connections ?? null,
    computeTier: tier.name,
    computeUsd: tier.monthlyUsd,
    diskGb: m.dbBytes / GB,
    supabaseUsd,
    aiUncappedUsd: null,
    aiUsd,
    aiCapBreached: false,
    otherOpexUsd,
    totalCostUsd,
    revenueUsd,
    grossMarginUsd,
    marginPct: marginPct(revenueUsd, grossMarginUsd),
    costPerDauUsd: null,
  };
}

function buildScenario(
  dau: number,
  m: ForecastMeasured,
  a: ForecastAssumptions,
  coeff: DerivedCoefficients,
  fixedDbOverhead: number,
): ForecastScenario {
  const registered = dau * a.registered_per_dau;
  const peakConcurrent = dau * (a.peak_concurrency_pct / 100);
  const dbBytes = Math.max(m.dbBytes, fixedDbOverhead + registered * a.db_kb_per_user * 1024);
  const storageBytes = Math.max(m.storageBytes, registered * a.storage_kb_per_user * 1024);
  const pooledDbConns = peakConcurrent * coeff.dbConnsPerConcurrent;
  const tier = tierFor(peakConcurrent);

  const monthlyEgressGb = (dau * a.requests_per_dau * 30 * coeff.egressBytesPerRequest) / GB;
  const egressOverageUsd =
    Math.max(0, monthlyEgressGb - SUPABASE_PRICING.includedEgressGb) * SUPABASE_PRICING.egressOverageUsdPerGb;
  const supabaseUsd = SUPABASE_PRICING.proBaseUsd + tier.usd + diskOverageUsd(dbBytes) + egressOverageUsd;

  const revenueUsd =
    registered * (a.business_share_pct / 100) * (a.paying_conversion_pct / 100) * a.arpu_usd;

  const aiUncappedUsd = (dau * a.ai_cost_per_dau_cents) / 100;
  const aiCap = Math.max(AI_FLOOR_USD, 0.15 * revenueUsd);
  const aiUsd = Math.min(aiUncappedUsd, aiCap);

  const otherOpexUsd = m.currentOpexUsd; // held flat (founder tooling, not activity-scaled)
  const totalCostUsd = supabaseUsd + aiUsd + otherOpexUsd;
  const grossMarginUsd = revenueUsd - totalCostUsd;

  return {
    label: dau >= 1_000_000 ? `${dau / 1_000_000}M` : `${dau / 1000}K`,
    dau,
    measured: false,
    registeredUsers: registered,
    peakConcurrent,
    dbBytes,
    storageBytes,
    pooledDbConns,
    connCeiling: m.loadMatrix?.max_connections ?? null,
    computeTier: tier.name,
    computeUsd: tier.usd,
    diskGb: dbBytes / GB,
    supabaseUsd,
    aiUncappedUsd,
    aiUsd,
    aiCapBreached: aiUncappedUsd > aiCap,
    otherOpexUsd,
    totalCostUsd,
    revenueUsd,
    grossMarginUsd,
    marginPct: marginPct(revenueUsd, grossMarginUsd),
    costPerDauUsd: totalCostUsd / dau,
  };
}

export function buildForecast(input: ForecastInput): ForecastModel {
  const { measured: m, assumptions: a } = input;
  const notes: string[] = [];
  const coeff = deriveCoefficients(m, notes);
  // fixed DB overhead = today's physical bytes minus today's users' modeled contribution (floored ≥0);
  // every scenario's dbBytes is additionally floored at today's measured value (never forecast below reality).
  const currentUserDbBytes = m.registeredUsersReal * a.db_kb_per_user * 1024;
  const fixedDbOverhead = Math.max(0, m.dbBytes - currentUserDbBytes);
  const scenarios = [buildToday(m), ...DAU_LEVELS.map((d) => buildScenario(d, m, a, coeff, fixedDbOverhead))];
  return { scenarios, coefficients: coeff, notes };
}
