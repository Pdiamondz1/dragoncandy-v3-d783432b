// Pure Tavily request/response shaping + cap helpers, plus the Tavily HTTP
// client (Task 3). No Deno.* and no runtime https:// imports — Vitest loads this.

export const WEB_TIERS = ["web_search", "web_extract"] as const;

const SEARCH_MAX_RESULTS = 5;
const SEARCH_CONTENT_CHARS = 800;
const EXTRACT_CONTENT_CHARS = 5000;

const TIME_RANGES = new Set(["day", "week", "month", "year"]);

export function recencyToTimeRange(r?: string): string | undefined {
  return r && TIME_RANGES.has(r) ? r : undefined;
}

export function truncate(s: string, n: number): string {
  return typeof s === "string" && s.length > n ? s.slice(0, n) : (s ?? "");
}

export function buildSearchBody(query: string, recency?: string): Record<string, unknown> {
  const time_range = recencyToTimeRange(recency);
  return {
    query,
    max_results: SEARCH_MAX_RESULTS,
    include_answer: true,
    search_depth: "basic",
    topic: "general",
    ...(time_range ? { time_range } : {}),
  };
}

export interface SearchHit { title: string; url: string; content: string }
export interface SearchResult { answer: string | null; results: SearchHit[] }

export function shapeSearchResults(json: any): SearchResult {
  const results = Array.isArray(json?.results) ? json.results : [];
  return {
    answer: typeof json?.answer === "string" ? json.answer : null,
    results: results.slice(0, SEARCH_MAX_RESULTS).map((r: any) => ({
      title: String(r?.title ?? ""),
      url: String(r?.url ?? ""),
      content: truncate(String(r?.content ?? ""), SEARCH_CONTENT_CHARS),
    })),
  };
}

export function buildExtractBody(url: string): Record<string, unknown> {
  return { urls: [url] };
}

export interface ExtractResult { url: string; title: string | null; content: string }

export function shapeExtractResult(json: any, url: string): ExtractResult {
  const first = Array.isArray(json?.results) ? json.results[0] : undefined;
  const raw = first?.raw_content ?? first?.content ?? "";
  return {
    url,
    title: typeof first?.title === "string" ? first.title : null,
    content: truncate(String(raw), EXTRACT_CONTENT_CHARS),
  };
}

export function startOfUtcDayIso(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
}

export function isOverCap(
  userCount: number,
  globalCount: number,
  caps: { perUser: number; global: number },
): boolean {
  return userCount >= caps.perUser || globalCount >= caps.global;
}

const TAVILY_BASE = "https://api.tavily.com";
const TAVILY_TIMEOUT_MS = 8000;

export class TavilyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TavilyError";
  }
}

async function tavilyPost(apiKey: string, path: string, body: Record<string, unknown>): Promise<any> {
  let resp: Response;
  try {
    resp = await fetch(`${TAVILY_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TAVILY_TIMEOUT_MS),
    });
  } catch (e: any) {
    throw new TavilyError(`tavily ${path} request failed: ${e?.message ?? e}`);
  }
  if (!resp.ok) {
    throw new TavilyError(`tavily ${path} returned ${resp.status}`);
  }
  return await resp.json();
}

export async function tavilySearch(apiKey: string, query: string, recency?: string): Promise<SearchResult> {
  const json = await tavilyPost(apiKey, "/search", buildSearchBody(query, recency));
  return shapeSearchResults(json);
}

export async function tavilyExtract(apiKey: string, url: string): Promise<ExtractResult> {
  const json = await tavilyPost(apiKey, "/extract", buildExtractBody(url));
  return shapeExtractResult(json, url);
}
