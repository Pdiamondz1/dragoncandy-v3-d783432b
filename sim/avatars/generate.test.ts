import { describe, it, expect, vi } from "vitest";
import {
  generatePool,
  facePrompt,
  isContentRefusal,
  assertUsableImageModel,
  reconcileManifest,
  poolIndicesPresent,
  type GenerateDeps,
  type Manifest,
} from "./generate";

/** Valid JPEG magic (FF D8 FF) — the upload path sniffs the bytes to label the object. */
const bytes = (n: number) => new Uint8Array([0xff, 0xd8, 0xff, n]);

function makeDeps(over: Partial<GenerateDeps> = {}): GenerateDeps & { generateImage: ReturnType<typeof vi.fn> } {
  const cache = new Map<number, Uint8Array>();
  let manifest: Manifest | null = null;
  return {
    generateImage: vi.fn(async () => bytes(1)),
    upload: vi.fn(async () => {}),
    readManifest: () => manifest,
    writeManifest: (m: Manifest) => {
      manifest = m;
    },
    cacheWrite: (i: number, b: Uint8Array) => {
      cache.set(i, b);
    },
    cacheRead: (i: number) => cache.get(i) ?? null,
    ...over,
  } as GenerateDeps & { generateImage: ReturnType<typeof vi.fn> };
}

describe("facePrompt", () => {
  it("varies across the demographic matrix", () => {
    expect(facePrompt(0)).not.toBe(facePrompt(7));
  });

  it("asks for a portrait and states the subject is fictional", () => {
    const p = facePrompt(0).toLowerCase();
    expect(p).toMatch(/portrait/);
    expect(p).toMatch(/fictional|not a real person/);
  });

  it("is deterministic per index", () => {
    expect(facePrompt(42)).toBe(facePrompt(42));
  });
});

// Regression for the Codex round-7 finding: after avatars-purge the manifest still claimed every
// index was uploaded, so a regenerate skipped everything and left storage empty.
describe("reconcileManifest", () => {
  const m = {
    model: "m",
    entries: { 0: { uploaded: true }, 1: { uploaded: false, refused: true }, 2: { uploaded: true } },
  };

  it("clears upload flags when the remote pool is gone", () => {
    const out = reconcileManifest(m, new Set());
    expect(out.entries[0]).toBeUndefined();
    expect(out.entries[2]).toBeUndefined();
  });

  it("keeps refusals — the model's verdict does not expire with the objects", () => {
    expect(reconcileManifest(m, new Set()).entries[1]).toEqual({ uploaded: false, refused: true });
  });

  it("keeps the flags of objects that are still present", () => {
    const out = reconcileManifest(m, new Set([0, 2]));
    expect(out.entries[0]).toEqual({ uploaded: true });
    expect(out.entries[2]).toEqual({ uploaded: true });
  });

  // Round 12: a partial deletion leaves SOME objects, so a count>0 would bless every stale flag.
  it("drops only the flags whose objects went missing in a partial purge", () => {
    const out = reconcileManifest(m, new Set([0]));
    expect(out.entries[0]).toEqual({ uploaded: true });
    expect(out.entries[2]).toBeUndefined();
  });

  it("preserves the model so a rebuild matches the original pool", () => {
    expect(reconcileManifest(m, new Set()).model).toBe("m");
  });
});

describe("poolIndicesPresent", () => {
  it("extracts indices from listed object paths, any extension", () => {
    const s = poolIndicesPresent(["synthetic/faces/0007.jpg", "synthetic/faces/0012.png"]);
    expect(s).toEqual(new Set([7, 12]));
  });

  it("ignores anything that is not an indexed pool object", () => {
    expect(poolIndicesPresent(["synthetic/faces/notes.txt", "synthetic/logos/ab12cd34.png"])).toEqual(new Set());
  });

  it("returns empty for an empty pool", () => {
    expect(poolIndicesPresent([])).toEqual(new Set());
  });
});

describe("assertUsableImageModel", () => {
  it("rejects the retired model before any spend", () => {
    expect(() => assertUsableImageModel("gpt-image-1")).toThrow(/retired/);
  });

  it("rejects a missing model", () => {
    expect(() => assertUsableImageModel(undefined)).toThrow(/SIM_IMAGE_MODEL/);
    expect(() => assertUsableImageModel("")).toThrow(/SIM_IMAGE_MODEL/);
  });

  it("returns a usable model unchanged", () => {
    expect(assertUsableImageModel("some-current-image-model")).toBe("some-current-image-model");
  });
});

describe("isContentRefusal", () => {
  it("treats a moderation decline as a refusal", () => {
    expect(isContentRefusal(new Error("content_policy_violation"))).toBe(true);
    expect(isContentRefusal(new Error("Request rejected by safety system"))).toBe(true);
  });

  it("does NOT treat credential, quota or network failures as refusals", () => {
    for (const m of [
      "401 Unauthorized",
      "429 Too Many Requests",
      "500 Internal Server Error",
      "Missing SIM_OPENAI_API_KEY",
      "TypeError: fetch failed",
      "connect ETIMEDOUT",
    ]) {
      expect(isContentRefusal(new Error(m))).toBe(false);
    }
  });

  it("defaults to NOT a refusal for an unrecognised error (fail loud)", () => {
    expect(isContentRefusal(new Error("something weird happened"))).toBe(false);
  });
});

describe("generatePool", () => {
  it("generates, caches and uploads each index once", async () => {
    const d = makeDeps();
    const r = await generatePool(3, "model-x", d);
    expect(r.generated).toBe(3);
    expect(d.generateImage).toHaveBeenCalledTimes(3);
    expect(d.upload).toHaveBeenCalledTimes(3);
  });

  it("resumes: an uploaded index is skipped and never re-generated (no re-spend)", async () => {
    const d = makeDeps();
    await generatePool(2, "model-x", d);
    d.generateImage.mockClear();
    const r = await generatePool(2, "model-x", d);
    expect(d.generateImage).not.toHaveBeenCalled();
    expect(r.skipped).toBe(2);
  });

  it("re-uploads from cache without re-generating when the upload failed last run", async () => {
    const shared = makeDeps({ upload: vi.fn(async () => { throw new Error("network"); }) });
    await generatePool(1, "model-x", shared).catch(() => {});

    const retry = makeDeps({
      cacheRead: shared.cacheRead,
      cacheWrite: shared.cacheWrite,
      readManifest: shared.readManifest,
      writeManifest: shared.writeManifest,
    });
    await generatePool(1, "model-x", retry);
    expect(retry.generateImage).not.toHaveBeenCalled();
    expect(retry.upload).toHaveBeenCalledTimes(1);
  });

  it("counts a refusal, skips it, and keeps going", async () => {
    const d = makeDeps({
      generateImage: vi.fn(async (p: string) => {
        if (p === facePrompt(1)) throw new Error("content_policy_violation");
        return bytes(1);
      }),
    });
    const r = await generatePool(3, "model-x", d);
    expect(r.refused).toBe(1);
    expect(r.generated).toBe(2);
    expect(d.upload).toHaveBeenCalledTimes(2);
  });

  // Regression for the Codex round-4 finding: a bad key or a 401 would otherwise be counted as
  // 1,500 "refusals" and the CLI would exit green with an empty pool.
  it("aborts on a non-refusal failure instead of counting it as a refusal", async () => {
    const d = makeDeps({
      generateImage: vi.fn(async () => {
        throw new Error("401 Unauthorized: invalid api key");
      }),
    });
    await expect(generatePool(3, "model-x", d)).rejects.toThrow(/non-refusal/);
  });

  it("aborts after too many consecutive refusals rather than burning the run", async () => {
    const d = makeDeps({
      generateImage: vi.fn(async () => {
        throw new Error("content_policy_violation");
      }),
    });
    await expect(generatePool(50, "model-x", d)).rejects.toThrow(/consecutive refusals/);
  });

  // Regression for the Codex round-6 finding: without persisting refusals, every rerun re-pays the
  // image endpoint for indices the model already declined.
  it("remembers a refusal so a rerun does not pay to be declined again", async () => {
    const refuseIdx1 = vi.fn(async (p: string) => {
      if (p === facePrompt(1)) throw new Error("content_policy_violation");
      return bytes(1);
    });
    const d = makeDeps({ generateImage: refuseIdx1 });
    await generatePool(3, "model-x", d);
    expect(d.readManifest()?.entries[1]).toEqual({ uploaded: false, refused: true });

    refuseIdx1.mockClear();
    const second = await generatePool(3, "model-x", d);
    expect(refuseIdx1).not.toHaveBeenCalled();
    expect(second.skipped).toBe(3);
    expect(second.refused).toBe(0);
  });

  it("records the model in the manifest so a later top-up can match it", async () => {
    const d = makeDeps();
    await generatePool(1, "model-y", d);
    expect(d.readManifest()?.model).toBe("model-y");
  });

  it("uploads to the durable face path with a jpeg content type", async () => {
    const d = makeDeps();
    await generatePool(1, "model-x", d);
    expect(d.upload).toHaveBeenCalledWith("synthetic/faces/0000.jpg", expect.anything(), "image/jpeg");
  });

  // The model picks its own output format; the object must be labelled by what it actually is.
  it("labels a PNG response as .png/image/png rather than forcing .jpg", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    const d = makeDeps({ generateImage: vi.fn(async () => png) });
    await generatePool(1, "model-x", d);
    expect(d.upload).toHaveBeenCalledWith("synthetic/faces/0000.png", expect.anything(), "image/png");
  });
});
