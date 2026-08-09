// staging-login.mjs  (Node 18+)
//
// Mints a browser-ready session for one of the seeded STAGING test accounts, so an
// agent (or a human) can reach authenticated surfaces without ever typing a password.
//
// Why this exists: verifying an auth-gated screen used to require the founder to sign
// in by hand, because the only sign-in path in the repo is Playwright filling the real
// login form (tests/e2e/playwright/auth.setup.ts). That made a person the bottleneck on
// every UI check. This routes around it with Supabase's admin API instead.
//
// How it works — no password is involved at any step:
//   1. admin `generate_link` mints a one-time magiclink token for the test user.
//   2. That token is exchanged at `/auth/v1/verify` for a real session (JSON, not a
//      redirect), so Supabase's Redirect-URL allow-list never comes into play — which
//      matters because Vercel preview URLs are per-branch and can't be pre-allowlisted.
//   3. The session is printed as a URL hash. supabase-js runs with `detectSessionInUrl`
//      on by default, so opening that URL makes the app persist the session itself. We
//      never hand-craft a localStorage payload, so nothing here breaks when supabase-js
//      changes its storage format.
//
// Usage:
//   npm run staging:login -- restaurant --base https://<preview>.vercel.app
//   npm run staging:login -- creator    --base http://127.0.0.1:8080
//   Roles: restaurant (business_client) | creator (content_creator) | brand (brand)
//
// Setup (once): put the STAGING service-role key in the gitignored
// supabase/scripts/.env.sync.local as STAGING_SUPABASE_SECRET_KEY=...
// (Supabase dashboard → dragoncandy-staging → Project Settings → API → service_role.)
//
// The printed URL carries a short-lived (~1h) session for a seeded STAGING test account
// holding no real user data. Do not adapt this script to production: it refuses to.

import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Where the gitignored key file may live, most-specific first.
 *
 * Work happens in worktrees under .claude/worktrees/ (30+ of them), and a gitignored
 * file cannot be shared across them by git. Reading only the local copy would force the
 * key to be duplicated into every worktree — more copies of a secret on disk, and a
 * confusing "not set" error when it is in fact set in the main checkout. So fall back to
 * the main working tree, which is where it naturally gets created once.
 */
function keyFileCandidates() {
  const local = join(HERE, ".env.sync.local");
  const paths = [local];
  try {
    // In a worktree, --git-common-dir points at the MAIN checkout's .git; its parent is
    // that checkout's root. In the main checkout this just resolves back to the same file.
    const commonGitDir = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: HERE,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const mainRoot = dirname(resolve(HERE, commonGitDir));
    const shared = join(mainRoot, "supabase", "scripts", ".env.sync.local");
    if (shared !== local) paths.push(shared);
  } catch {
    // git unavailable or not a repo — the local path is all we have.
  }
  return paths;
}

const KEY_FILES = keyFileCandidates();
const ENV_FILE = KEY_FILES[0];

// Snapshot the real shell environment BEFORE the key file is merged in below, so the
// Vite-env check can tell "you exported this" apart from "our key file set this".
const SHELL_ENV = { ...process.env };

const STAGING_REF = "mhffqrawgizhprbobcta";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PROD_REF = "zocahiffooqdybdhguqv";

// Vercel names a branch preview "<project>-git-<branch>-<team-slug>.vercel.app". Pin BOTH
// ends — the project prefix AND the team-slug suffix — so the only host that passes is a
// preview of THIS project under THIS team. Pinning the suffix alone would still accept a
// different project under the same team; pinning neither would accept a foreign origin,
// which would then receive the staging tokens in its URL fragment (a token leak, since
// that origin's JS can read them). Only this project's previews are wired to staging.
const VERCEL_PREVIEW_PREFIX = "dragoncandy-v3-d783432b-git-";
const VERCEL_PREVIEW_SUFFIX = "-dragon-candy-s-projects.vercel.app";

const ROLES = {
  restaurant: { email: "restaurant.staging@dragoncandy.test", role: "business_client" },
  creator: { email: "creator.staging@dragoncandy.test", role: "content_creator" },
  brand: { email: "brand.staging@dragoncandy.test", role: "brand" },
};

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// ── Load the gitignored key file(s) without overriding a real env var ───────────────
// Candidates are most-specific first, and an earlier hit wins per key, so a worktree
// copy can override the shared one in the main checkout.
let loadedFrom = null;
for (const file of KEY_FILES) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    const val = rawVal.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
  if (!loadedFrom) loadedFrom = file;
}

// ── Args ────────────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const roleArg = argv.find((a) => !a.startsWith("--"));
const baseIdx = argv.indexOf("--base");
const baseArg = baseIdx !== -1 ? argv[baseIdx + 1] : undefined;

if (!roleArg || !ROLES[roleArg]) {
  die(
    `Usage: npm run staging:login -- <${Object.keys(ROLES).join("|")}> --base <url>\n` +
      `  e.g. npm run staging:login -- restaurant --base https://my-preview.vercel.app`
  );
}
if (!baseArg) {
  // Deliberately no default. playwright.config.ts:5 defaults to https://dragoncandy.io,
  // which means a bare local run silently drives PRODUCTION — exactly the footgun this
  // script must not repeat. Make the target explicit every time.
  die("Missing --base <url>. There is no default: the target must be explicit.");
}

let base;
try {
  base = new URL(baseArg);
} catch {
  die(`--base is not a valid URL: ${baseArg}`);
}
// Both production TLDs. dragoncandy.com is the new canonical host and .io now
// 301s to it; if this guard matched only .io it would silently stop protecting
// the moment the migration completed.
if (/(^|\.)dragoncandy\.(io|com)$/i.test(base.hostname)) {
  die(
    "Refusing to target production (dragoncandy.com / dragoncandy.io).\n" +
      "  This mints STAGING sessions only — they would not authenticate on prod anyway."
  );
}

// ── The target's FRONTEND must also point at staging ────────────────────────────────
// A staging session is useless if the app it opens in talks to a different Supabase:
// client.ts falls back to the PROD project whenever VITE_SUPABASE_URL is unset, so the
// app would send a staging JWT to prod and stay signed out — while this script happily
// printed "success". Refuse instead of lying about it.
assertTargetUsesStaging(base);

function assertTargetUsesStaging(url) {
  const host = url.hostname.toLowerCase();
  const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]";

  // A branch PREVIEW of THIS project is the only remote target wired to staging Supabase.
  // Must match the project prefix AND the team suffix — see the constants above for why
  // both are load-bearing (a foreign or same-team-other-project preview would otherwise be
  // handed the staging tokens in its URL fragment). A bare prod alias fails the prefix too.
  if (host.endsWith(".vercel.app")) {
    if (host.startsWith(VERCEL_PREVIEW_PREFIX) && host.endsWith(VERCEL_PREVIEW_SUFFIX)) return;
    die(
      `${host} is not a preview of this project.\n\n` +
        `  Expected "${VERCEL_PREVIEW_PREFIX}<branch>${VERCEL_PREVIEW_SUFFIX}".\n` +
        "  Any other *.vercel.app host is refused: a prod alias points at prod, and a\n" +
        "  foreign/other-project preview would receive the staging tokens in its URL\n" +
        "  fragment. Pass this project's PR preview URL, or a local dev server on staging."
    );
  }

  if (!isLocal) {
    die(
      `Cannot confirm ${host} is built against staging Supabase.\n\n` +
        "  Known-good targets: a *.vercel.app preview, or a local dev server whose\n" +
        "  VITE_SUPABASE_URL points at the staging project."
    );
  }

  // Local dev server: Vite reads .env* at startup, so those files decide the backend.
  // BOTH vars matter — client.ts falls back to prod independently for each, so a staging
  // URL paired with the hardcoded prod anon key still fails to authenticate.
  const envUrl = resolveViteEnv("VITE_SUPABASE_URL");
  const envKey = resolveViteEnv("VITE_SUPABASE_ANON_KEY");

  const fix =
    `\n  Fix: create .env.local (gitignored, wins over .env) with BOTH staging values:\n` +
    `    VITE_SUPABASE_URL=${STAGING_URL}\n` +
    `    VITE_SUPABASE_ANON_KEY=<staging anon key>\n` +
    `  (dashboard → dragoncandy-staging → Project Settings → API → anon/public)\n` +
    `  then restart the dev server. Or just target a *.vercel.app preview instead.`;

  if (!envUrl?.value.includes(STAGING_REF)) {
    die(
      "Your local dev server is not pointed at staging, so a staging session cannot work.\n\n" +
        (envUrl
          ? `  ${envUrl.file} has VITE_SUPABASE_URL=${envUrl.value}\n` +
            (envUrl.value.includes(PROD_REF) ? "  ^ that is PRODUCTION.\n" : "")
          : "  No VITE_SUPABASE_URL in any .env* file — client.ts then falls back to PROD.\n") +
        fix
    );
  }

  // The URL is staging; the key must be too. Unset is the dangerous case: client.ts
  // substitutes a hardcoded PROD anon key, so the app talks to staging with prod's key
  // and simply fails to authenticate — while everything *looks* configured.
  if (!envKey) {
    die(
      "VITE_SUPABASE_URL points at staging, but VITE_SUPABASE_ANON_KEY is not set.\n\n" +
        "  client.ts falls back to a hardcoded PRODUCTION anon key when it's unset, so the\n" +
        "  app would call staging with prod's key and stay signed out.\n" +
        fix
    );
  }

  const keyRef = projectRefOfSupabaseKey(envKey.value);
  if (keyRef && keyRef !== STAGING_REF) {
    die(
      `VITE_SUPABASE_ANON_KEY belongs to project "${keyRef}", not staging.\n\n` +
        `  Set in ${envKey.file}${keyRef === PROD_REF ? " — that is the PRODUCTION key." : "."}\n` +
        fix
    );
  }
  // A non-JWT publishable key (sb_publishable_…) carries no ref to check; being set and
  // paired with a staging URL is as far as this can verify.
}

/** Reads a Vite env var the way Vite would, honouring its precedence. */
function resolveViteEnv(name) {
  // An already-exported variable outranks every file — Vite never overwrites the real
  // environment. Miss this and a dev server started with `VITE_SUPABASE_URL=… npm run
  // dev` gets judged by the committed prod `.env` and wrongly refused.
  if (SHELL_ENV[name]) return { file: "your shell environment", value: SHELL_ENV[name] };

  // HIGHEST-priority first. Vite loads `.env` → `.env.local` → `.env.[mode]` →
  // `.env.[mode].local`, each overriding the last, so the effective value is the reverse
  // of that load order. `npm run dev` runs mode=development. Getting this backwards would
  // make the gate judge the wrong file — worse than no gate, because it looks verified.
  const envFiles = [".env.development.local", ".env.development", ".env.local", ".env"];
  const repoRoot = join(HERE, "..", "..");
  const pattern = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*$`, "m");

  for (const file of envFiles) {
    const p = join(repoRoot, file);
    if (!existsSync(p)) continue;
    const m = readFileSync(p, "utf8").match(pattern);
    if (!m) continue;
    const value = m[1].replace(/^["']|["']$/g, "");
    if (value) return { file, value };
  }
  return null;
}

/**
 * Project ref from a Supabase JWT key (anon OR service-role), or null if it isn't a
 * decodable JWT. Legacy Supabase keys carry the project ref in the base64url payload, not
 * as plaintext — so a substring check can't tell a prod key from a staging one; this can.
 */
function projectRefOfSupabaseKey(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null; // sb_publishable_… / sb_secret_… — not a JWT
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

const SECRET = process.env.STAGING_SUPABASE_SECRET_KEY;
if (!SECRET) {
  die(
    "STAGING_SUPABASE_SECRET_KEY is not set.\n\n" +
      "  Looked in:\n" +
      KEY_FILES.map((f) => `    ${existsSync(f) ? "found, no such key" : "no file"}  ${f}`).join("\n") +
      "\n\n  Add it to whichever you prefer (the main-checkout one is shared by every worktree):\n" +
      "    STAGING_SUPABASE_SECRET_KEY=<staging service_role key>\n\n" +
      "  Supabase dashboard → dragoncandy-staging → Project Settings → API → service_role.\n" +
      "  (This is the STAGING key. Never put the prod key here.)"
  );
}
// Refuse any key we can positively identify as NOT staging. Two key formats exist and they
// pull in opposite directions, so a prod-blocklist alone fails open:
//   • Legacy JWT (today's prod service_role): the ref is base64-encoded in the payload — decode
//     it and ALLOWLIST staging, so a prod JWT (or any other project's JWT) is refused statically,
//     before the key touches the network.
//   • Opaque `sb_secret_…` (today's staging service_role): carries no decodable ref, so we cannot
//     tell staging from prod statically. The substring check catches only a ref-in-the-clear; a
//     prod *opaque* key would slip past. That case is closed by the preflight below — we never
//     send the key anywhere but STAGING_URL, and we refuse to mint unless it authenticates there.
const secretRef = projectRefOfSupabaseKey(SECRET);
if (SECRET.includes(PROD_REF) || (secretRef !== null && secretRef !== STAGING_REF)) {
  die("That key is not the STAGING key — it identifies a different project (looks like PROD). Aborting.");
}

const { email, role } = ROLES[roleArg];

// ── 0. Preflight: prove the key belongs to the STAGING project before minting anything ──
// For opaque `sb_secret_…` keys this is the only way to tell staging from prod — the static guard
// above cannot decode them. A read-only admin GET against STAGING_URL succeeds only for a staging
// service_role key; a prod key pasted into STAGING_SUPABASE_SECRET_KEY fails here (401/403) and we
// refuse to mint, rather than proceeding as if the key were verified. (The key only ever reaches
// STAGING_URL — never prod.)
const preflight = await fetch(`${STAGING_URL}/auth/v1/admin/users?page=1&per_page=1`, {
  headers: { apikey: SECRET, Authorization: `Bearer ${SECRET}` },
});
if (!preflight.ok) {
  die(
    `Staging key preflight failed (${preflight.status}). This key does not authenticate against the ` +
      `staging project (${STAGING_REF}). Make sure STAGING_SUPABASE_SECRET_KEY is the STAGING ` +
      `service_role key — not prod. Aborting before minting a session.`
  );
}

// ── 1. Mint a one-time magiclink token (admin API — no password anywhere) ───────────
const genRes = await fetch(`${STAGING_URL}/auth/v1/admin/generate_link`, {
  method: "POST",
  headers: {
    apikey: SECRET,
    Authorization: `Bearer ${SECRET}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ type: "magiclink", email }),
});

if (!genRes.ok) {
  const body = await genRes.text().catch(() => "");
  die(
    `generate_link failed (${genRes.status}). ${body.slice(0, 300)}\n\n` +
      (genRes.status === 401 || genRes.status === 403
        ? "  A 401/403 here almost always means the key is the anon key, not service_role."
        : `  Confirm ${email} still exists in the staging project.`)
  );
}

const link = await genRes.json();
const tokenHash = link.hashed_token ?? link.properties?.hashed_token;
if (!tokenHash) die(`No hashed_token in the generate_link response: ${JSON.stringify(link).slice(0, 300)}`);

// ── 2. Exchange it for a real session as JSON (not a redirect) ──────────────────────
// Using the JSON verify endpoint keeps us off the Redirect-URL allow-list, which cannot
// cover per-branch Vercel preview hostnames.
const verifyRes = await fetch(`${STAGING_URL}/auth/v1/verify`, {
  method: "POST",
  headers: { apikey: SECRET, "Content-Type": "application/json" },
  body: JSON.stringify({ type: "magiclink", token_hash: tokenHash }),
});

if (!verifyRes.ok) {
  const body = await verifyRes.text().catch(() => "");
  die(`verify failed (${verifyRes.status}). ${body.slice(0, 300)}`);
}

const session = await verifyRes.json();
if (!session.access_token || !session.refresh_token) {
  die(`No session in the verify response: ${JSON.stringify(session).slice(0, 300)}`);
}

// ── 3. Emit a URL the app turns into a persisted session on its own ─────────────────
const hash = new URLSearchParams({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
  expires_in: String(session.expires_in ?? 3600),
  token_type: session.token_type ?? "bearer",
  type: "magiclink",
});

const target = new URL(base.toString());
target.hash = hash.toString();

const mins = Math.round((session.expires_in ?? 3600) / 60);
console.log(`\n✔ Session minted for ${email}  (role: ${role}, valid ~${mins} min)\n`);
console.log("Open this URL — the app will persist the session and land you signed in:\n");
console.log(target.toString());
console.log(
  `\nIf it lands signed-out, the app cleared the hash before supabase-js read it:` +
    `\n  open ${base.origin}/ first, then re-run this and open the URL again.\n`
);
