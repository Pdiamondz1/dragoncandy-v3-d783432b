// Headless PDF export for the DragonCandy investor deck.
// Renders each slide at native 1280x720 (2x) and assembles a 16:9 PDF with
// exactly one slide per page — deterministic, no dependency on browser print
// pagination. Each page is a 13.333in x 7.5in (960pt x 540pt) landscape page.
//
// Self-contained: builds (via the npm script) then serves the production bundle
// with `vite preview` internally, exports, and tears the server down. The deck
// only renders from the production build (a dev-mode module-init quirk makes
// /pitch fall through to the landing page under `vite dev`), so we never use dev.
//
// Usage:
//   npm run pitch:pdf                 # build + export (recommended)
//   node scripts/export-pitch-pdf.mjs # export against fresh dist/ (run build first)
// Env overrides:
//   PITCH_URL  — export against an already-running server instead of spawning one
//   PITCH_OUT  — output path (default dragoncandy-pitch.pdf)
//   PITCH_PORT — preview port (default 4178)
import { chromium } from "@playwright/test";
import { preview } from "vite";
import { writeFileSync, existsSync } from "node:fs";

const out = process.env.PITCH_OUT || "dragoncandy-pitch.pdf";
const port = Number(process.env.PITCH_PORT) || 4178;

const PAGE_W = 960; // points (13.333in @ 72dpi)
const PAGE_H = 540; // points (7.5in @ 72dpi)

// Acquire a server: reuse PITCH_URL if given, else spawn `vite preview` on dist/.
let server;
let url = process.env.PITCH_URL;
if (!url) {
  if (!existsSync("dist/index.html")) {
    throw new Error("dist/ not found — run `npm run build` first (or use `npm run pitch:pdf`).");
  }
  server = await preview({ preview: { port, strictPort: false }, logLevel: "warn" });
  const base = server.resolvedUrls?.local?.[0] ?? `http://localhost:${port}/`;
  url = base.replace(/\/+$/, "") + "/pitch";
  console.log(`Serving production bundle at ${url}`);
}

const browser = await chromium.launch();
const shots = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 2,
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const total = await page.evaluate(() => document.querySelectorAll(".pitch-slide").length);
  if (!total) throw new Error("No slides found at " + url + " (is this the production build?)");

  await page.keyboard.press("Home");
  for (let i = 0; i < total; i++) {
    if (i > 0) await page.keyboard.press("ArrowRight");
    await page.waitForTimeout(450); // let the opacity transition settle
    const el = page.locator(".pitch-slide-wrap.is-active .pitch-slide");
    const buf = await el.screenshot({ type: "jpeg", quality: 92 });
    // JPEG SOF marker → intrinsic pixel dimensions.
    const dims = jpegSize(buf);
    shots.push({ buf, ...dims });
  }
  console.log(`Captured ${shots.length} slides`);
} finally {
  await browser.close();
  if (server) await new Promise((r) => server.httpServer.close(r));
}

writeFileSync(out, buildPdf(shots, PAGE_W, PAGE_H));
console.log(`Wrote ${out} (${shots.length} pages)`);

/* ---------- helpers ---------- */

// Read width/height from a baseline JPEG (first SOF0/2 marker).
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return { w: 2560, h: 1440 };
}

// Minimal PDF writer: one full-bleed JPEG image per page.
function buildPdf(slides, pageW, pageH) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (data) => {
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1");
    chunks.push(b);
    pos += b.length;
  };
  const obj = (n, body) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xff\xff\xff\xff\n");

  const n = slides.length;
  // Object numbering: 1=catalog, 2=pages, then per slide: page, content, image.
  const pageIds = [];
  for (let i = 0; i < n; i++) pageIds.push(3 + i * 3);

  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${n} >>`);

  slides.forEach((s, i) => {
    const pageId = 3 + i * 3;
    const contentId = pageId + 1;
    const imageId = pageId + 2;
    const content = `q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`;

    obj(
      pageId,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    obj(contentId, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);

    // Image XObject (raw JPEG, DCTDecode).
    offsets[imageId] = pos;
    push(`${imageId} 0 obj\n`);
    push(
      `<< /Type /XObject /Subtype /Image /Width ${s.w} /Height ${s.h} ` +
        `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${s.buf.length} >>\nstream\n`,
    );
    push(s.buf);
    push("\nendstream\nendobj\n");
  });

  const xrefStart = pos;
  const objCount = 2 + n * 3;
  push(`xref\n0 ${objCount + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= objCount; i++) {
    push(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objCount + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return Buffer.concat(chunks);
}
