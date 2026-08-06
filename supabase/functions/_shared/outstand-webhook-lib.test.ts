import { describe, it, expect } from 'vitest';
import { parseOutstandEvent, verifyOutstandSignature } from "./outstand-webhook-lib";

const SECRET = "test-secret";

async function sign(body: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return "sha256=" +
    Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("outstand-webhook-lib", () => {
  it("valid signature passes", async () => {
    const body = JSON.stringify({ event: "post.published" });
    expect(await verifyOutstandSignature(body, await sign(body, SECRET), SECRET)).toEqual(true);
  });

  it("tampered body fails", async () => {
    const header = await sign(JSON.stringify({ event: "post.published" }), SECRET);
    expect(await verifyOutstandSignature(JSON.stringify({ event: "x" }), header, SECRET)).toEqual(false);
  });

  it("wrong secret fails", async () => {
    const body = JSON.stringify({ a: 1 });
    expect(await verifyOutstandSignature(body, await sign(body, "other"), SECRET)).toEqual(false);
  });

  it("missing header fails", async () => {
    expect(await verifyOutstandSignature("{}", null, SECRET)).toEqual(false);
  });

  it("parse extracts postId across shapes", () => {
    expect(
      parseOutstandEvent({ event: "post.published", data: { postId: "p1", publishedAt: "t" } }).postId,
    ).toEqual("p1");
    expect(parseOutstandEvent({ type: "post.error", post: { id: "p2" } }).postId).toEqual("p2");
    expect(
      parseOutstandEvent({ event: "account.token_expired", data: { accountId: "a1" } }).accountId,
    ).toEqual("a1");
  });

  const DOCUMENTED_PUBLISHED = {
    event: "post.published",
    timestamp: "2024-12-29T10:30:00.000Z",
    data: {
      postId: "9dyJS",
      orgId: "org_abc123",
      socialAccounts: [
        {
          accountId: "a1B2c3",
          network: "threads",
          username: "@myaccount",
          platformPostId: "12345678901234567",
          platformPostUrl: "https://www.threads.net/@myaccount/post/DAbCdEfGhIj",
        },
        {
          accountId: "d4E5f6",
          network: "linkedin",
          username: "John Doe",
          platformPostId: "urn:li:share:7654321",
          platformPostUrl: "https://www.linkedin.com/feed/update/urn:li:share:7654321",
        },
      ],
    },
  };

  it("reads the top-level timestamp, which is where the real payload carries it", () => {
    expect(parseOutstandEvent(DOCUMENTED_PUBLISHED).timestamp).toBe("2024-12-29T10:30:00.000Z");
  });

  it("still has no data.publishedAt, so publishedAt stays null on this shape", () => {
    expect(parseOutstandEvent(DOCUMENTED_PUBLISHED).publishedAt).toBeNull();
  });

  it("extracts one account entry per published account, with network as the platform", () => {
    const accounts = parseOutstandEvent(DOCUMENTED_PUBLISHED).accounts;
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toEqual({
      accountId: "a1B2c3",
      network: "threads",
      username: "@myaccount",
      platformPostId: "12345678901234567",
      platformPostUrl: "https://www.threads.net/@myaccount/post/DAbCdEfGhIj",
    });
    expect(accounts[1].network).toBe("linkedin");
  });

  it("returns an empty accounts array rather than throwing when the key is absent", () => {
    expect(parseOutstandEvent({ event: "post.published", data: { postId: "x" } }).accounts)
      .toEqual([]);
  });

  it("tolerates a non-array socialAccounts without throwing", () => {
    expect(parseOutstandEvent({ event: "x", data: { socialAccounts: "nope" } }).accounts)
      .toEqual([]);
  });

  it("fills missing per-account fields with null instead of undefined", () => {
    const accounts = parseOutstandEvent({
      event: "post.published",
      data: { postId: "x", socialAccounts: [{ network: "instagram" }] },
    }).accounts;
    expect(accounts[0]).toEqual({
      accountId: null,
      network: "instagram",
      username: null,
      platformPostId: null,
      platformPostUrl: null,
    });
  });

  it("preserves the raw socialAccounts field untouched for metadata.publish_result", () => {
    expect(parseOutstandEvent(DOCUMENTED_PUBLISHED).socialAccounts)
      .toEqual(DOCUMENTED_PUBLISHED.data.socialAccounts);
  });
});
