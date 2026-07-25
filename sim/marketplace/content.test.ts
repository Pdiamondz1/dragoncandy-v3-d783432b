import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadAsset, loadSampleAsset } from "./content";
import { makePicker } from "./text";

interface UploadRec { bucket: string; path: string; contentType?: string; upsert?: boolean }
function fakeStorage(rec: { uploads: UploadRec[] }): SupabaseClient {
  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts?: { contentType?: string; upsert?: boolean }) => {
          rec.uploads.push({ bucket, path, contentType: opts?.contentType, upsert: opts?.upsert });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("marketplace content upload", () => {
  it("uploadAsset writes under the bot's uid folder and returns the public URL", async () => {
    const rec = { uploads: [] as UploadRec[] };
    const url = await uploadAsset(fakeStorage(rec), {
      bucket: "campaign-deliverables", uid: "cr-1", subpath: "collab-1/clip.jpg",
      bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg",
    });
    expect(rec.uploads[0].bucket).toBe("campaign-deliverables");
    expect(rec.uploads[0].path).toBe("cr-1/collab-1/clip.jpg"); // first segment = uid (RLS requirement)
    expect(rec.uploads[0].upsert).toBe(true); // default (backward-compat)
    expect(url).toBe("https://cdn/campaign-deliverables/cr-1/collab-1/clip.jpg");
  });

  it("uploadAsset forwards upsert:false (needed for promotion-videos: no anon UPDATE policy)", async () => {
    const rec = { uploads: [] as UploadRec[] };
    await uploadAsset(fakeStorage(rec), {
      bucket: "promotion-videos", uid: "promo-1", subpath: "cgc_0.jpg",
      bytes: new Uint8Array([1]), contentType: "image/jpeg", upsert: false,
    });
    expect(rec.uploads[0].upsert).toBe(false); // plain INSERT, not INSERT..ON CONFLICT DO UPDATE
  });

  it("loadSampleAsset always yields non-empty bytes (generated fallback when assets/ is empty)", () => {
    const img = loadSampleAsset(makePicker(1), "image");
    expect(img.bytes.length).toBeGreaterThan(0);
    expect(img.contentType).toMatch(/^image\//);
  });
});
