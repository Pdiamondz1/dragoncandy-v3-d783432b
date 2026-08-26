// Shared overflow-measurement helper for the DragonCandy investor deck.
//
// `.pitch-slide` (see `src/pitch/pitch-print.css`) is the on-screen element carrying the
// deck's fixed 1280x720 box — `overflow: hidden`, explicit inline width/height, scaled
// visually via a CSS `transform` that does not affect its layout box. `clientHeight` on
// that element is therefore always 720 regardless of viewport size; `scrollHeight`
// reports the true height of everything `SlideShell`'s content laid out, overflow or
// not. The difference is exactly the number of pixels of investor-facing content that
// would be missing from the exported PDF.
//
// Used by both `measure-pitch-slides.mjs` (the standalone `npm run pitch:measure` CLI)
// and `export-pitch-pdf.mjs` (the guard on the actual export path) so there is one
// definition of "does this slide fit," not two that can drift apart.
export async function measureSlide(page) {
  return page.evaluate(() => {
    const el = document.querySelector('.pitch-slide-wrap.is-active .pitch-slide');
    if (!el) return { scrollHeight: -1, clientHeight: -1 };
    return { scrollHeight: el.scrollHeight, clientHeight: el.clientHeight };
  });
}
