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

export interface OutstandEvent {
  event: string;
  postId: string | null;
  accountId: string | null;
  publishedAt: string | null;
  socialAccounts: unknown;
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
    socialAccounts: data?.socialAccounts ?? data?.social_accounts ?? null,
  };
}
