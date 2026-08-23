// supabase/scripts/rag-eval/pinned-constants.test.mjs
//
// Ties the two constants the retrieval evaluation VALIDATED to the code that uses them.
//
// The realistic regression here is not corpus drift — it is somebody editing a number. Both of
// these values were chosen by measurement (docs/wiki/concepts/rag-retrieval-evaluation.md), and
// nothing else in the tree connects an edit to the evaluation that justified it: change the 10
// back to 5 and every test still passes, while the wiki page goes on quoting recall figures for a
// configuration that no longer ships.
//
// These are TEXT assertions on the source, not imports, because `donny-chat/index.ts` is a Deno
// edge function with `https://` and `npm:` specifiers that Vitest cannot load. Same technique as
// src/layoutViewportHeight.test.ts and PublicPageHeader.test.tsx — see DESIGN_SYSTEM.md.
//
// If a failure here is intentional: re-run `npm run eval:rag`, update the wiki page AND
// rag-eval/baseline.json, then update the expectation below. Do all four or none.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FUNCTIONS = join(HERE, "..", "..", "functions");
const read = (p) => readFileSync(join(FUNCTIONS, p), "utf8");

describe("constants the retrieval evaluation validated", () => {
  const donnyChat = read("donny-chat/index.ts");

  it("search_internal_knowledge retrieves 10 chunks", () => {
    // Recall 65% at k=5 against 91% at k=10 over the labelled pool: dropping to 5 loses more than
    // a third of the relevant material. Measured 2026-08-23 over 53 real queries.
    const m = donnyChat.match(/const INTERNAL_RETRIEVAL_K = (\d+);/);
    expect(m, "INTERNAL_RETRIEVAL_K is gone from donny-chat/index.ts — did the tool move?").toBeTruthy();
    expect(
      Number(m[1]),
      "k changed without the evaluation being re-run. `npm run eval:rag`, then update " +
        "docs/wiki/concepts/rag-retrieval-evaluation.md and rag-eval/baseline.json.",
    ).toBe(10);
  });

  it("the retrieval call site uses the named constant, not a bare number", () => {
    // Without this, the constant above can sit there being correct while the call passes 5 — the
    // pin holds a value nothing reads, which is worse than no pin at all because it looks green.
    expect(donnyChat).toContain(
      'retrieveContext(internalCtx!.userClient, args.query, embedding, INTERNAL_RETRIEVAL_K, "internal")',
    );
  });

  it("the chunker targets ~6,000 characters", () => {
    // Every number in the evaluation is a number about chunks of roughly this size: change the
    // target and the recall, precision and tail-share figures describe a corpus that no longer
    // exists. HARD_MAX_CHARS is deliberately NOT pinned here — it guards the embedding model's
    // token limit, which is a property of the API, not a finding of this evaluation.
    const m = read("_shared/chunk-doc.ts").match(/export const TARGET_CHARS = ([\d_]+);/);
    expect(m, "TARGET_CHARS is gone from _shared/chunk-doc.ts").toBeTruthy();
    expect(
      Number(m[1].replace(/_/g, "")),
      "chunk size changed without the evaluation being re-run. `npm run eval:rag`, then update " +
        "docs/wiki/concepts/rag-retrieval-evaluation.md and rag-eval/baseline.json.",
    ).toBe(6000);
  });
});
