// Real content-delivery uploads to DragonCandy's OWN public storage (campaign-deliverables +
// dragonshare-content, both public on prod). Uploading real files gives the marketplace real
// DC-hosted media URLs — the working egress source Sub-project C's SAMPLE_MEDIA_URLS lacked.
// RLS (campaign-deliverables INSERT): first path segment MUST equal auth.uid() → we always prefix uid.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

// cwd-relative, matching the harness convention (run.ts uses "sim/.load-findings.json" from repo root).
// Avoids the __dirname ESM footgun (sim runs under tsx/vitest where __dirname may be undefined).
const ASSETS_DIR = join(process.cwd(), "sim", "marketplace", "assets");

export async function uploadAsset(
  botClient: SupabaseClient,
  p: { bucket: string; uid: string; subpath: string; bytes: Uint8Array; contentType: string; upsert?: boolean },
): Promise<string> {
  const path = `${p.uid}/${p.subpath}`; // uid-first: satisfies the storage RLS folder check
  // upsert defaults to true, BUT a caller must pass upsert:false for a bucket whose RLS has no
  // UPDATE policy for the uploading role (e.g. promotion-videos + the anon CGC client): upsert=true
  // makes the Storage API do INSERT..ON CONFLICT DO UPDATE, which needs an UPDATE policy and is
  // RLS-denied there even for a fresh (non-conflicting) object. A plain INSERT (upsert:false) passes.
  const { error } = await botClient.storage.from(p.bucket).upload(path, p.bytes, {
    contentType: p.contentType,
    upsert: p.upsert ?? true,
  });
  if (error) throw new Error(`uploadAsset ${p.bucket}/${path}: ${error.message}`);
  const { data } = botClient.storage.from(p.bucket).getPublicUrl(path);
  return data.publicUrl;
}

/** A minimal valid single-color JPEG (~few hundred bytes) — used when assets/ has no real media, so
 *  the populate never blocks on sourcing binaries. Real files in assets/ are preferred for realism. */
function generatedImage(): Uint8Array {
  // 1x1..8x8 solid JPEG baseline. This is a real, decodable JPEG byte sequence (SOI…EOI).
  const b64 =
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRof" +
    "Hh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAAgBAREA/8QAFAAB" +
    "AAAAAAAAAAAAAAAAAAAAB//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AfwD/2Q==";
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

/** Pick a sample asset. Reads sim/marketplace/assets/ (images: .jpg/.png; videos: .mp4); falls back
 *  to a generated solid-color JPEG so tests + a fresh checkout work with an empty assets/ dir. */
export function loadSampleAsset(
  picker: { pick: <T>(pool: readonly T[]) => T },
  kind: "image" | "video",
): { bytes: Uint8Array; contentType: string; ext: string } {
  const exts = kind === "image" ? [".jpg", ".jpeg", ".png"] : [".mp4"];
  let files: string[] = [];
  try {
    files = readdirSync(ASSETS_DIR).filter((f) => exts.some((e) => f.toLowerCase().endsWith(e)));
  } catch {
    files = [];
  }
  if (files.length === 0) {
    return { bytes: generatedImage(), contentType: "image/jpeg", ext: ".jpg" };
  }
  const name = picker.pick(files);
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : ext === ".mp4" ? "video/mp4" : "image/jpeg";
  return { bytes: new Uint8Array(readFileSync(join(ASSETS_DIR, name))), contentType, ext };
}
