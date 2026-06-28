// Pure, unit-testable helpers for generate-anonymous-brief.
// NO `https://` imports so Vitest can load this in the frontend test run.

export const THIN_CHARS_THRESHOLD = 200;

export interface GeneratedBrief {
  campaign_name?: string;
  campaign_description?: string;
  target_audience?: string;
  content_suggestions?: string[];
  [key: string]: unknown;
}

export interface SourceQuality {
  readable: boolean;
  chars: number;
}

/** True when the honeypot decoy field is filled — request is almost certainly a bot. */
export function isHoneypotTripped(body: Record<string, unknown> | null | undefined): boolean {
  const hp = body?.["subject_hp"];
  return typeof hp === "string" && hp.trim().length > 0;
}

/** Valid Postgres `inet` literal? (IPv4 dotted-quad 0-255, or a loose IPv6.) */
export function isValidInet(ip: string): boolean {
  const v4 = ip.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)) return true;
  // Loose IPv6: hex groups + colons, nothing else, plausible length.
  if (ip.includes(":") && /^[0-9a-fA-F:]+$/.test(ip) && ip.length <= 45) return true;
  return false;
}

/**
 * Best-effort real-client IP. `get` reads a header by name (case-insensitive caller).
 * Tries the most-trustworthy-first candidates, validates to a Postgres `inet`, else null.
 * The exact per-client header is confirmed empirically on prod (see spec); order here is
 * the safe default. Returns null when nothing parses — caller then SKIPS the per-IP check.
 */
export function extractClientIp(get: (name: string) => string | null): string | null {
  const candidates = [
    get("cf-connecting-ip"),
    get("x-real-ip"),
    (get("x-forwarded-for") ?? "").split(",")[0],
  ];
  for (const c of candidates) {
    const ip = (c ?? "").trim();
    if (ip && isValidInet(ip)) return ip;
  }
  return null;
}

function isPrivateV4(parts: number[]): boolean {
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isBlockedV6(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // fc00::/7 ULA
  if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true; // fe80::/10 link-local
  // IPv4-mapped (::ffff:a.b.c.d, or the URL-normalized hex form ::ffff:7f00:1). A mapped-IPv6
  // URL literal is essentially always an SSRF evasion — block all of them.
  if (h.includes("::ffff:")) return true;
  return false;
}

/**
 * Hardened SSRF predicate — true = BLOCK. This endpoint is unauthenticated and fetches
 * arbitrary URLs, so the guard rejects non-http(s) schemes, numeric host encodings
 * (decimal/hex/octal), IPv4 private/loopback/link-local ranges, IPv6 ULA/link-local/mapped,
 * and obvious internal hostnames. DNS-rebinding (public name → internal IP) is a documented
 * residual (the edge runtime can't resolve DNS pre-fetch).
 */
export function isBlockedTarget(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return true;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return true;

  let host = u.hostname.toLowerCase();
  if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1); // IPv6 brackets

  if (host.length === 0) return true;

  // Numeric host encodings (a bare number is an IP in disguise): hex, octal, or decimal.
  if (/^0x[0-9a-f]+$/i.test(host)) return true;
  if (/^0[0-7]+$/.test(host)) return true;
  if (/^\d+$/.test(host)) return true;

  // Dotted IPv4.
  const v4 = host.split(".");
  if (v4.length === 4 && v4.every((p) => /^\d{1,3}$/.test(p))) {
    const parts = v4.map(Number);
    if (parts.some((p) => p > 255)) return true; // malformed → block
    return isPrivateV4(parts);
  }

  // IPv6.
  if (host.includes(":")) return isBlockedV6(host);

  // Hostname (DNS). Block obvious internal names; otherwise allow (residual: DNS rebinding).
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "metadata.google.internal"
  ) {
    return true;
  }
  return false;
}

/** Pure HTML → {title, description, bodyText} extraction (mirrors the core generator). */
export function extractContent(html: string): { title: string; description: string; bodyText: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : "";

  const metaMatch =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i);
  const description = metaMatch ? metaMatch[1].trim() : "";

  const bodyText = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  return { title, description, bodyText };
}

/** Thin-page signal for the preview. `readable` = fetch ok AND enough extracted text. */
export function computeSourceQuality(bodyText: string, fetchOk: boolean): SourceQuality {
  const chars = bodyText.length;
  return { readable: fetchOk && chars >= THIN_CHARS_THRESHOLD, chars };
}

/** Parse the model's response into a brief; strips markdown fences. Throws on invalid JSON. */
export function parseBrief(text: string): GeneratedBrief {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const obj = JSON.parse(cleaned);
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) {
    throw new Error("Brief is not a JSON object");
  }
  return obj as GeneratedBrief;
}
