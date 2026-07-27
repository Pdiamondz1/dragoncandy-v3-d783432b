// Face-pool generation. The paid, networked edges (the image API, storage, the filesystem) are
// INJECTED, so the batch loop — checkpointing, resume, refusal handling — is fully testable with
// zero API spend. See docs/superpowers/specs/2026-07-26-synthetic-avatar-pool-design.md §4.2.
import { facePath } from "./pool";
import { sniffImageType } from "./png";

export interface Manifest {
  /** The image model the pool was generated with, so a later top-up can match it. */
  model: string;
  entries: Record<number, { uploaded: boolean }>;
}

export interface GenerateDeps {
  /** Real implementation calls the image API. Throwing is treated as a refusal, not a crash. */
  generateImage: (prompt: string) => Promise<Uint8Array>;
  upload: (objectPath: string, bytes: Uint8Array, contentType: string) => Promise<void>;
  readManifest: () => Manifest | null;
  writeManifest: (m: Manifest) => void;
  cacheWrite: (index: number, bytes: Uint8Array) => void;
  cacheRead: (index: number) => Uint8Array | null;
}

export interface GenerateResult {
  generated: number;
  skipped: number;
  refused: number;
}

// A demographic matrix, sampled with co-prime strides so consecutive indices differ on several
// axes at once. The pool has to look like a real US creator population across 24 cities; faces are
// never matched to a profile's name or city (that mapping is a blind hash — see pool.ts).
const AGES = ["early 20s", "late 20s", "30s", "40s", "50s", "60s"];
const PRESENTATIONS = ["a man", "a woman", "a person"];
const TONES = ["deep", "dark brown", "medium brown", "olive", "light brown", "fair", "pale"];
const HAIR = ["short curly", "long straight", "braided", "shaved", "wavy shoulder-length", "tied back", "cropped grey"];
const SETTINGS = ["a plain studio backdrop", "a softly blurred cafe", "a bright kitchen", "a city street at golden hour", "a neutral grey wall"];
const LIGHT = ["soft natural light", "warm window light", "even studio lighting", "overcast daylight"];

export function facePrompt(index: number): string {
  const age = AGES[index % AGES.length];
  const who = PRESENTATIONS[(index * 5) % PRESENTATIONS.length];
  const tone = TONES[(index * 3) % TONES.length];
  const hair = HAIR[(index * 2) % HAIR.length];
  const setting = SETTINGS[(index * 7) % SETTINGS.length];
  const light = LIGHT[(index * 11) % LIGHT.length];
  return (
    `Head-and-shoulders portrait photograph of ${who} in their ${age}, ${tone} skin tone, ` +
    `${hair} hair, relaxed natural expression, in front of ${setting}, ${light}. ` +
    `Candid, realistic, shot on a 50mm lens. The subject is a fictional person and must not ` +
    `resemble any real or public figure.`
  );
}

export async function generatePool(
  count: number,
  model: string,
  deps: GenerateDeps,
): Promise<GenerateResult> {
  const existing = deps.readManifest();
  if (existing && existing.model !== model) {
    console.warn(
      `[avatars] manifest was generated with "${existing.model}" but this run uses "${model}" — ` +
        `the pool will mix models. Purge the pool first if that matters.`,
    );
  }
  const manifest: Manifest = { model, entries: { ...(existing?.entries ?? {}) } };
  deps.writeManifest(manifest);

  const result: GenerateResult = { generated: 0, skipped: 0, refused: 0 };

  for (let i = 0; i < count; i++) {
    if (manifest.entries[i]?.uploaded) {
      result.skipped++;
      continue;
    }

    // Cache first: a run that generated but failed to upload must never pay to generate again.
    let bytes = deps.cacheRead(i);
    if (!bytes) {
      try {
        bytes = await deps.generateImage(facePrompt(i));
      } catch (e) {
        // Image APIs intermittently refuse person prompts. A refusal is a skipped index, not a
        // failed run — the pool is allowed to land short (spec §4.2).
        console.warn(`[avatars] index ${i} refused/failed: ${e instanceof Error ? e.message : String(e)}`);
        result.refused++;
        continue;
      }
      deps.cacheWrite(i, bytes);
      result.generated++;
    }

    // Label the object by what the bytes ACTUALLY are — the model's output format is its choice.
    const { ext, mime } = sniffImageType(bytes);

    // An upload failure DOES stop the run — it means storage or credentials are wrong, and the
    // cache means the retry costs nothing.
    await deps.upload(facePath(i, ext), bytes, mime);
    manifest.entries[i] = { uploaded: true };
    deps.writeManifest(manifest);
  }

  return result;
}
