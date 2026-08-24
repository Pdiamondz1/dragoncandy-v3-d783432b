/**
 * The one size the DragonCandy mark renders at in app and page chrome.
 *
 * Sized by HEIGHT, never by width. Both logo files are stacked badges that are TALLER THAN WIDE
 * — `public/logo.webp` is 280x326 (aspect 0.859), `src/assets/Transparent_DragonCandy_logo.webp`
 * is 400x465 (aspect 0.860) — so a width class does not cap the height, it multiplies it. That is
 * how three headers ended up at 74px, 116px and 163px tall against the landing's 56.
 *
 * Because the two files share an aspect to within 0.001, this one class renders the same size on
 * every surface no matter which file that surface imports.
 *
 * Used by: landing/Header, PublicPageHeader (terms, privacy, how-it-works, pricing, 404, public
 * profiles), AuthPage, MobileTopNav, DashboardLayout's sidebar. `/internal` is deliberately NOT
 * on this constant — the AIOS shell is an internal tool with its own denser chrome.
 */
export const HEADER_LOGO_CLASS = 'h-12 w-auto lg:h-14';

/**
 * The collapsed desktop sidebar rail, which is 56px wide including its own padding. The full
 * `lg:h-14` mark would render 48px wide inside roughly 48px of content box — it fits, but with
 * nothing to spare and no room for the rail to ever get narrower.
 */
export const RAIL_LOGO_CLASS = 'h-8 w-auto';

/**
 * Intrinsic dimensions, per asset. These belong on the `width`/`height` attributes, whose whole
 * job is to reserve the right box before the image loads — at the wrong aspect they reserve the
 * wrong shape and CAUSE the layout shift they exist to prevent (PublicPageHeader carried 140x47
 * against a real 0.859, an aspect of 2.98). If either file is ever replaced, re-read its real
 * dimensions rather than copying these numbers forward.
 */
export const PUBLIC_LOGO_INTRINSIC = { width: 280, height: 326 } as const;
export const APP_LOGO_INTRINSIC = { width: 400, height: 465 } as const;
