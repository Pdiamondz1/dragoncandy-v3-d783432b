/**
 * Generates `public/privacy.html` and `public/terms.html` from the SAME React source
 * the app renders.
 *
 * Run: `npm run legal:static`
 *
 * ## Why this file exists
 *
 * Four platform reviews — Google (YouTube), Meta (Instagram, Facebook), TikTok and
 * X — each require an **anonymously reachable** privacy policy. `/privacy` is a SPA
 * route, so the moment `SITE_GATE_ENABLED` is on it answers 401 along with the rest
 * of the site, and every one of those reviews fails. That made the site lockdown and
 * the connector approvals mutually exclusive: a decision nobody should have to make.
 *
 * The gate's own rule (`gate/decide.ts`) is that a path may only be allowlisted if a
 * **real file exists for it under `public/`** — `vercel.json` rewrites every unmatched
 * path to `/index.html`, so allowlisting `/privacy` would serve the SPA shell to an
 * unauthenticated browser, which is precisely what the gate exists to prevent. And
 * because the app talks straight to `supabase.co`, which never traverses Vercel,
 * serving that shell effectively un-gates the product.
 *
 * So: a real static file, allowlisted, generated rather than written by hand.
 *
 * ## Four things it encodes that are easy to get wrong by hand
 *
 * **(1) The page must be entirely self-contained.** When the gate is on, EVERYTHING
 * that is not allowlisted answers 401 — `/assets/*.css`, `/fonts/*`, `/logo.webp`.
 * A stylesheet link would leave a reviewer looking at unstyled text, and a logo would
 * be a broken image on the one page we are asking them to judge us by. All CSS is
 * inline and there are no image requests. `/favicon.ico` is the single exception, and
 * only because it is itself on the allowlist.
 *
 * **(2) It must not become a second copy of a legal document.** The body comes from
 * `PrivacyPolicyBody.tsx` via `renderToStaticMarkup`, so there is one source of truth
 * and the "Last updated" date cannot drift — which matters more than the prose,
 * because that date is what a reader uses to decide whether to trust the page.
 * `privacyStatic.test.tsx` re-renders and fails if the committed HTML falls behind.
 *
 * **(3) The output is COMMITTED, not built on the fly.** Vite copies `public/` at the
 * start of a build, so generating into it mid-build is too late, and a `prebuild` hook
 * would make every plain `npm run build` depend on this script running. Committing the
 * artifact keeps a fresh checkout correct; the test is what keeps it honest.
 *
 * **(4) `rel="canonical"` points at `/privacy`, not at itself.** In the normal ungated
 * state the React route is the page a human should land on, and two indexable URLs for
 * one policy is a duplicate-content problem. While the gate is on the canonical target
 * answers 401 — accepted, because the whole site is de-listed then anyway, and
 * `/sitemap.xml` is deliberately NOT allowlisted for the same reason.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { PRIVACY_LAST_UPDATED, PrivacyPolicyBody } from '../src/pages/legal/PrivacyPolicyBody';
import { TERMS_LAST_UPDATED, TermsOfServiceBody } from '../src/pages/legal/TermsOfServiceBody';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicPath = (file: string) => join(ROOT, 'public', file);

export const PRIVACY_STATIC_PATH = publicPath('privacy.html');
export const TERMS_STATIC_PATH = publicPath('terms.html');

/**
 * Every legal page that needs to survive the gate.
 *
 * **Terms is here because a console asks for BOTH URLs on the same form.** The privacy
 * page shipped first, since four platform reviews name a privacy policy explicitly — but
 * every one of those forms has a Terms field beside it, and a 401 there is an anonymously
 * inaccessible legal URL sitting in a live submission. The first runbook wording hedged
 * that as "TikTok does not appear to fetch it", which is an assumption about a reviewer's
 * behaviour, not a basis for calling a platform unblocked. Caught by the Codex second
 * review; note the repo's own `google-oauth-demo-video.md` had proposed BOTH files from
 * the start and only privacy got built.
 *
 * Adding a page here is not enough on its own — `gate/decide.ts` must allowlist its path
 * in the same change, which the guard below enforces rather than trusts.
 */
const PAGES = [
  {
    file: 'privacy.html',
    route: '/privacy',
    title: 'Privacy Policy',
    description: 'How DragonCandy collects, uses, shares, and protects your personal information.',
    lastUpdated: PRIVACY_LAST_UPDATED,
    body: PrivacyPolicyBody,
  },
  {
    file: 'terms.html',
    route: '/terms',
    title: 'Terms of Service',
    description: 'The terms and conditions that govern your use of DragonCandy.',
    lastUpdated: TERMS_LAST_UPDATED,
    body: TermsOfServiceBody,
  },
] as const;

/**
 * Deliberately plain. This page is read by app reviewers and crawlers, not sold to
 * anyone, and every byte of styling here is a byte that cannot be shared with the app.
 * `-apple-system` first so it looks native to a reviewer on a Mac without a font fetch.
 */
const STYLE = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #ffffff;
    color: #374151;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 15px;
    line-height: 1.65;
  }
  main { max-width: 44rem; margin: 0 auto; padding: 2.5rem 1.25rem 4rem; }
  header { border-bottom: 1px solid #e5e7eb; }
  header div { max-width: 44rem; margin: 0 auto; padding: 1.25rem; font-weight: 700; color: #1A1A2A; }
  h1 { font-size: 1.75rem; line-height: 1.25; color: #1A1A2A; margin: 0 0 .5rem; }
  h2 { font-size: 1.075rem; color: #1A1A2A; margin: 2rem 0 .5rem; font-weight: 600; }
  p, li { margin: 0 0 .85rem; }
  ul { padding-left: 1.25rem; }
  a { color: #0F766E; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .updated { font-size: .8125rem; color: #6b7280; margin: 0 0 2rem; }
  .note { font-size: .8125rem; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 3rem; padding-top: 1rem; }
`;

type LegalPage = (typeof PAGES)[number];

function render(page: LegalPage): string {
  // `createElement` rather than JSX, and `--tsconfig tsconfig.app.json` in the npm
  // script. Both are needed and neither is style. `npx tsx` otherwise resolves the
  // ROOT tsconfig, which is solution-style (`files: []` + `references`) and carries
  // no `jsx` setting, so esbuild falls back to the CLASSIC transform — for this file
  // AND for the imported component, which then dies at render time with "React is not
  // defined" pointing at a file that looks perfectly fine. Adding `jsx` to the root
  // config does NOT fix it; naming the app config does.
  const body = renderToStaticMarkup(createElement(page.body));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${page.title} — DragonCandy</title>
<meta name="description" content="${page.description}">
<link rel="canonical" href="https://dragoncandy.com${page.route}">
<link rel="icon" href="/favicon.ico">
<style>${STYLE}</style>
</head>
<body>
<header><div>DragonCandy</div></header>
<main>
<h1>${page.title}</h1>
<p class="updated">Last updated: ${page.lastUpdated}</p>
${body}
<p class="note">This is a static copy of the page at <a href="https://dragoncandy.com${page.route}">dragoncandy.com${page.route}</a>, published so it stays reachable without an account. Generated from the same source; do not edit by hand.</p>
</main>
</body>
</html>
`;
}

const pageFor = (file: string): LegalPage => {
  const page = PAGES.find((p) => p.file === file);
  if (!page) throw new Error(`no legal page registered for ${file}`);
  return page;
};

export function buildPrivacyStatic(): string {
  return render(pageFor('privacy.html'));
}

export function buildTermsStatic(): string {
  return render(pageFor('terms.html'));
}

/** Every page this generator owns, as {path, html}. The test walks this, not a copy. */
export function buildAllLegalStatic(): Array<{ path: string; file: string; html: string }> {
  return PAGES.map((page) => ({ path: publicPath(page.file), file: page.file, html: render(page) }));
}

// Only write when run directly, so the test can import `buildPrivacyStatic` without
// the import itself rewriting the file it is about to compare against.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  // The generator refuses to run if the gate does not actually allowlist what it
  // produces. The two halves are useless apart: an allowlisted path with no file
  // serves the SPA shell, and a file nobody allowlists answers 401 like everything
  // else. `gate/decide.ts` says they must land in the same change; this enforces it.
  const gate = readFileSync(join(ROOT, 'gate', 'decide.ts'), 'utf8');
  const unlisted = PAGES.filter((page) => !gate.includes(`'/${page.file}'`));
  if (unlisted.length > 0) {
    console.error(
      `refusing to write: gate/decide.ts does not allowlist ${unlisted.map((p) => `/${p.file}`).join(', ')}.\n` +
      'A static legal page the gate still 401s is worse than none — it looks published.',
    );
    process.exit(1);
  }

  for (const { path, file, html } of buildAllLegalStatic()) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
    console.log(`wrote public/${file} — ${html.length} bytes`);
  }
}
