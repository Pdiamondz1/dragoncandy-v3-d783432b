import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { uploadAsset, loadSampleAsset } from "./content";
import { makePicker } from "./text";

function fakeStorage(rec: { uploads: { bucket: string; path: string; contentType?: string }[] }): SupabaseClient {
  return {
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string, _bytes: Uint8Array, opts?: { contentType?: string }) => {
          rec.uploads.push({ bucket, path, contentType: opts?.contentType });
          return { data: { path }, error: null };
        },
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
      }),
    },
  } as unknown as SupabaseClient;
}

describe("marketplace content upload", () => {
  it("uploadAsset writes under the bot's uid folder and returns the public URL", async () => {
    const rec = { uploads: [] as { bucket: string; path: string; contentType?: string }[] };
    const url = await uploadAsset(fakeStorage(rec), {
      bucket: "campaign-deliverables", uid: "cr-1", subpath: "collab-1/clip.jpg",
      bytes: new Uint8Array([1, 2, 3]), contentType: "image/jpeg",
    });
    expect(rec.uploads[0].bucket).toBe("campaign-deliverables");
    expect(rec.uploads[0].path).toBe("cr-1/collab-1/clip.jpg"); // first segment = uid (RLS requirement)
    expect(url).toBe("https://cdn/campaign-deliverables/cr-1/collab-1/clip.jpg");
  });

  it("loadSampleAsset always yields non-empty bytes (generated fallback when assets/ is empty)", () => {
    const img = loadSampleAsset(makePicker(1), "image");
    expect(img.bytes.length).toBeGreaterThan(0);
    expect(img.contentType).toMatch(/^image\//);
  });
});
