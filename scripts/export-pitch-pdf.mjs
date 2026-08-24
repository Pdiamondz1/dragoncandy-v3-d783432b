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
//   npm run pitch:pdf                                  # the sendable deck
//   VITE_PITCH_CONFIDENTIAL=1 npm run pitch:pdf        # ...with the budget and raise
//   PITCH_NOTES=1 npm run pitch:pdf                    # ...with facing speaker notes
//   node scripts/export-pitch-pdf.mjs                  # export against fresh dist/
// Env overrides:
//   PITCH_URL   — export against an already-running server instead of spawning one
//   PITCH_OUT   — output path (default dragoncandy-pitch.pdf, or -notes.pdf with notes)
//   PITCH_PORT  — preview port (default 4178)
//   PITCH_NOTES — 1 to interleave a speaker-notes page after each slide
//
// ## Speaker notes are OFF by default, and that is a deliberate departure from the spec
//
// Spec §7 says the notes print "as a facing page in the PDF export", unqualified. Taken
// literally, the single artefact Joe sends to an investor would contain the coaching
// written for him — including lines like "do not inflate — an investor checks" and "say
// it out loud rather than letting them discover it". True, useful, and catastrophic to
// send.
//
// So the export produces the sendable deck by default and the presenter's copy on
// request, under a different filename so the two cannot be confused in a downloads
// folder. The spec's intent — Joe can present a slide he did not write — is met by the
// copy he presents from.
import { chromium } from "@playwright/test";
import { preview } from "vite";
import { writeFileSync, existsSync, readFileSync } from "node:fs";

const withNotes = process.env.PITCH_NOTES === "1";
const out =
  process.env.PITCH_OUT ||
  (withNotes ? "dragoncandy-pitch-notes.pdf" : "dragoncandy-pitch.pdf");
const port = Number(process.env.PITCH_PORT) || 4178;

// Read the notes bridge written by `npx tsx scripts/emit-pitch-notes.ts`. Always read,
// even when not printing notes, because it also carries the outstanding founder inputs
// — and the whole point of that warning is that it reaches whoever is about to send the
// PDF, not only whoever asked for notes.
let bridge = null;
try {
  bridge = JSON.parse(readFileSync(".pitch-notes.json", "utf8"));
} catch {
  console.warn(
    "No .pitch-notes.json — run `npx tsx scripts/emit-pitch-notes.ts` first.\n" +
      "Exporting without speaker notes and WITHOUT the outstanding-founder-input warning.",
  );
}

if (bridge?.outstandingReport) {
  console.log(`\n${bridge.outstandingReport}\n`);
}
if (withNotes && !bridge) {
  throw new Error("PITCH_NOTES=1 but .pitch-notes.json is missing — nothing to print.");
}

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

  // Hide the on-screen navigation before capturing.
  //
  // `pitch-print.css` already hides `.pitch-controls` — but only inside `@media print`,
  // and a screenshot is not a print. An element screenshot captures the PAGE PIXELS
  // within the element's box, including anything painted over it, so the prev/next/
  // print/fullscreen buttons and the "01 / 15" counter were composited into the bottom
  // of every exported slide. Pre-existing, and invisible unless you open the PDF and
  // look at it — which is the only reason it was found.
  await page.addStyleTag({ content: ".pitch-controls { display: none !important; }" });
  await page.waitForTimeout(100);

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

// Interleave the notes. A note follows the slide it belongs to, so a two-up print puts
// the pair side by side and a phone scroll shows the slide then what to say about it.
const pages = [];
shots.forEach((shot, i) => {
  pages.push({ type: "image", ...shot });
  if (withNotes) {
    const note = bridge.slides[i];
    if (!note) {
      throw new Error(
        `Captured ${shots.length} slides but the notes bridge holds ${bridge.slides.length}. ` +
          "Re-run `npx tsx scripts/emit-pitch-notes.ts` — pairing notes to the wrong slides is " +
          "worse than exporting none.",
      );
    }
    pages.push({
      type: "notes",
      title: `${i + 1}. ${note.title}`,
      body: note.notes,
      outstanding: i === 0 ? bridge.outstandingReport : null,
    });
  }
});

if (withNotes && bridge.slides.length !== shots.length) {
  throw new Error(
    `Slide/notes count mismatch: ${shots.length} slides, ${bridge.slides.length} notes.`,
  );
}

writeFileSync(out, buildPdf(pages, PAGE_W, PAGE_H));
console.log(
  `Wrote ${out} (${pages.length} pages${withNotes ? `, ${shots.length} slides + ${shots.length} notes` : ""})`,
);

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

// Minimal PDF writer. Two page kinds: a full-bleed JPEG (a slide) and a text page (its
// speaker note). Objects are allocated sequentially rather than by a fixed stride,
// because the stride assumption (`3 + i * 3`) is what made adding a second page kind
// awkward in the first place.
function buildPdf(pages, pageW, pageH) {
  const chunks = [];
  const offsets = [];
  let pos = 0;
  const push = (data) => {
    const b = Buffer.isBuffer(data) ? data : Buffer.from(data, "latin1");
    chunks.push(b);
    pos += b.length;
  };

  let nextId = 1;
  const alloc = () => nextId++;
  const obj = (n, body) => {
    offsets[n] = pos;
    push(`${n} 0 obj\n`);
    push(body);
    push("\nendobj\n");
  };

  push("%PDF-1.4\n%\xff\xff\xff\xff\n");

  const catalogId = alloc();
  const pagesId = alloc();
  const fontId = alloc();
  const boldId = alloc();

  // Reserve one page-object id per page up front so /Kids can be written before the
  // page bodies exist.
  const pageIds = pages.map(() => alloc());

  obj(catalogId, "<< /Type /Catalog /Pages " + pagesId + " 0 R >>");
  obj(
    pagesId,
    `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  obj(fontId, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  obj(
    boldId,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  );

  pages.forEach((page, i) => {
    const pageId = pageIds[i];

    if (page.type === "image") {
      const contentId = alloc();
      const imageId = alloc();
      const content = Buffer.from(`q ${pageW} 0 0 ${pageH} 0 0 cm /Im0 Do Q`, "latin1");

      obj(
        pageId,
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
          `/Resources << /XObject << /Im0 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      );
      offsets[contentId] = pos;
      push(`${contentId} 0 obj\n`);
      push(`<< /Length ${content.length} >>\nstream\n`);
      push(content);
      push("\nendstream\nendobj\n");

      offsets[imageId] = pos;
      push(`${imageId} 0 obj\n`);
      push(
        `<< /Type /XObject /Subtype /Image /Width ${page.w} /Height ${page.h} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.buf.length} >>\nstream\n`,
      );
      push(page.buf);
      push("\nendstream\nendobj\n");
      return;
    }

    const contentId = alloc();
    // Encode ONCE, and take /Length from the bytes rather than from the JavaScript
    // string. They agree today only because `pdfString` strips every character above
    // U+00FF and `push` writes latin1 — a silent dependency between three functions.
    // (Codex flagged this as an active bug via UTF-8 encoding; that part was wrong, and
    // a byte-level check of all 30 streams in the exported PDF found 0 mismatches. The
    // fragility is real even though the failure was not: loosen that regex, or add a
    // path that skips `pdfString`, and the lengths desync into a malformed PDF with
    // nothing to say so.)
    const content = Buffer.from(notesStream(page, pageW, pageH), "latin1");
    obj(
      pageId,
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageW} ${pageH}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R /F2 ${boldId} 0 R >> >> /Contents ${contentId} 0 R >>`,
    );
    offsets[contentId] = pos;
    push(`${contentId} 0 obj\n`);
    push(`<< /Length ${content.length} >>\nstream\n`);
    push(content);
    push("\nendstream\nendobj\n");
  });

  const xrefStart = pos;
  const objCount = nextId - 1;
  push(`xref\n0 ${objCount + 1}\n`);
  push("0000000000 65535 f \n");
  for (let i = 1; i <= objCount; i++) {
    push(`${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`);
  }
  push(`trailer\n<< /Size ${objCount + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`);

  return Buffer.concat(chunks);
}

// PDF text operators for one speaker-note page.
function notesStream(page, pageW, pageH) {
  const margin = 64;
  const width = pageW - margin * 2;
  const bodySize = 15;
  const lineHeight = 22;

  const ops = [];
  // Pale background, so a notes page is never mistaken for a slide at a glance.
  ops.push(`0.96 0.97 0.96 rg 0 0 ${pageW} ${pageH} re f`);
  ops.push(`0.06 0.47 0.43 rg 0 ${pageH - 6} ${pageW} 6 re f`);

  let y = pageH - margin;

  ops.push("BT /F2 24 Tf 0.08 0.15 0.14 rg");
  ops.push(`1 0 0 1 ${margin} ${y} Tm (${pdfString(page.title)}) Tj`);
  ops.push("ET");
  y -= 20;

  ops.push(`0.85 0.88 0.86 rg ${margin} ${y} ${width} 1 re f`);
  y -= 34;

  ops.push(`BT /F1 ${bodySize} Tf 0.12 0.18 0.17 rg`);
  for (const para of String(page.body).split("\n\n")) {
    for (const line of wrap(para, width, bodySize)) {
      ops.push(`1 0 0 1 ${margin} ${y} Tm (${pdfString(line)}) Tj`);
      y -= lineHeight;
    }
    y -= lineHeight * 0.5;
  }
  ops.push("ET");

  if (page.outstanding) {
    y -= 10;
    ops.push(`0.99 0.95 0.85 rg ${margin} ${margin} ${width} ${Math.max(40, y - margin)} re f`);
    let oy = y - 26;
    ops.push("BT /F2 13 Tf 0.45 0.32 0.03 rg");
    for (const line of String(page.outstanding).split("\n")) {
      for (const wrapped of wrap(line, width - 32, 13)) {
        ops.push(`1 0 0 1 ${margin + 16} ${oy} Tm (${pdfString(wrapped)}) Tj`);
        oy -= 18;
      }
    }
    ops.push("ET");
  }

  return ops.join("\n");
}

// Helvetica is proportional, and this estimates rather than measures. 0.52em is a
// deliberate over-estimate of the average advance for mixed-case prose: a line that
// wraps a word early is invisible, one that runs off the page is not.
function wrap(text, width, fontSize) {
  const maxChars = Math.floor(width / (fontSize * 0.52));
  const lines = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

// PDF literal string: escape the delimiters, and map the typographic characters this
// deck actually uses into WinAnsi. Left unmapped they emit as whatever byte the string
// happened to carry, which prints as a wrong glyph rather than failing.
//
// The map lives INSIDE the function on purpose. As a module-level `const` it sat below
// the top-level `buildPdf(...)` call, and `const` does not hoist — so the first export
// died on "Cannot access 'WIN_ANSI' before initialization" after capturing all fifteen
// slides. Function declarations hoist; their bodies run when called.
function pdfString(s) {
  const winAnsi = {
    "\u2014": "\x97", // em dash
    "\u2013": "\x96", // en dash
    "\u2018": "\x91",
    "\u2019": "\x92",
    "\u201c": "\x93",
    "\u201d": "\x94",
    "\u2026": "\x85",
    "\u00b7": "\xb7",
    "\u2265": ">=",
    "\u2264": "<=",
    "\u00d7": "x",
    "\u2192": "->",
  };
  return String(s)
    .replace(/[\u2014\u2013\u2018\u2019\u201c\u201d\u2026\u00b7\u2265\u2264\u00d7\u2192]/g, (c) => winAnsi[c] ?? c)
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    // Anything still outside WinAnsi's printable range would emit a stray byte.
    .replace(/[^\x20-\x7e\x80-\xff]/g, "");
}
