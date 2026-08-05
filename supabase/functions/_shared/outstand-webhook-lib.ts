// Pure, runtime-agnostic helpers for the outstand-webhook edge function.
// No Deno/std imports here so the logic stays unit-testable.

export async function verifyOutstandSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
  const expectedHex = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0")).join("");
  const provided = signatureHeader.replace(/^sha256=/, "");
  const a = encoder.encode(expectedHex);
  const b = encoder.encode(provided);
  if (a.byteLength !== b.byteLength) return false;
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface OutstandSocialAccount {
  accountId: string | null;
  network: string | null;
  username: string | null;
  platformPostId: string | null;
  platformPostUrl: string | null;
}

export interface OutstandEvent {
  event: string;
  postId: string | null;
  accountId: string | null;
  publishedAt: string | null;
  /**
   * Top-level event timestamp. The documented post.published payload has NO
   * data.publishedAt, so this is the only time the event carries.
   */
  timestamp: string | null;
  socialAccounts: unknown;
  /** One entry per published account; `network` is the platform. */
  accounts: OutstandSocialAccount[];
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function parseAccounts(raw: unknown): OutstandSocialAccount[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is Record<string, unknown> => !!e && typeof e === "object").map((e) => ({
    accountId: str(e.accountId) ?? str(e.account_id) ?? (typeof e.accountId === "number" ? String(e.accountId) : null),
    network: str(e.network) ?? str(e.platform),
    username: str(e.username),
    platformPostId: str(e.platformPostId) ?? str(e.platform_post_id),
    platformPostUrl: str(e.platformPostUrl) ?? str(e.platform_post_url),
  }));
}

// Outstand payload casing/nesting isn't fully pinned (see spec §10); accept the
// common variants defensively, mirroring outstand-proxy's id extraction.
export function parseOutstandEvent(body: Record<string, any>): OutstandEvent {
  const event = body?.event ?? body?.type ?? "";
  const data = body?.data ?? body;
  return {
    event,
    postId: data?.postId ?? data?.post_id ?? data?.post?.id ?? null,
    accountId: data?.accountId ?? data?.account_id ?? null,
    publishedAt: data?.publishedAt ?? data?.published_at ?? null,
    timestamp: str(body?.timestamp) ?? str(body?.created_at),
    socialAccounts: data?.socialAccounts ?? data?.social_accounts ?? null,
    accounts: parseAccounts(data?.socialAccounts ?? data?.social_accounts),
  };
}
