import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseOutstandEvent, verifyOutstandSignature } from "./outstand-webhook-lib.ts";

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

Deno.test("valid signature passes", async () => {
  const body = JSON.stringify({ event: "post.published" });
  assertEquals(await verifyOutstandSignature(body, await sign(body, SECRET), SECRET), true);
});

Deno.test("tampered body fails", async () => {
  const header = await sign(JSON.stringify({ event: "post.published" }), SECRET);
  assertEquals(await verifyOutstandSignature(JSON.stringify({ event: "x" }), header, SECRET), false);
});

Deno.test("wrong secret fails", async () => {
  const body = JSON.stringify({ a: 1 });
  assertEquals(await verifyOutstandSignature(body, await sign(body, "other"), SECRET), false);
});

Deno.test("missing header fails", async () => {
  assertEquals(await verifyOutstandSignature("{}", null, SECRET), false);
});

Deno.test("parse extracts postId across shapes", () => {
  assertEquals(
    parseOutstandEvent({ event: "post.published", data: { postId: "p1", publishedAt: "t" } }).postId,
    "p1",
  );
  assertEquals(parseOutstandEvent({ type: "post.error", post: { id: "p2" } }).postId, "p2");
  assertEquals(
    parseOutstandEvent({ event: "account.token_expired", data: { accountId: "a1" } }).accountId,
    "a1",
  );
});
