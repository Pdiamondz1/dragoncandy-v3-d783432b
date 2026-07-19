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
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ENV_FILE = join(HERE, ".env.sync.local");

const STAGING_REF = "mhffqrawgizhprbobcta";
const STAGING_URL = `https://${STAGING_REF}.supabase.co`;
const PROD_REF = "zocahiffooqdybdhguqv";

const ROLES = {
  restaurant: { email: "restaurant.staging@dragoncandy.test", role: "business_client" },
  creator: { email: "creator.staging@dragoncandy.test", role: "content_creator" },
  brand: { email: "brand.staging@dragoncandy.test", role: "brand" },
};

function die(msg) {
  console.error(`\n✖ ${msg}\n`);
  process.exit(1);
}

// ── Load the gitignored key file without overriding a real env var ──────────────────
if (existsSync(ENV_FILE)) {
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    if (/^\s*(#|$)/.test(line)) continue;
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m) continue;
    const [, key, rawVal] = m;
    const val = rawVal.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
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
if (/(^|\.)dragoncandy\.io$/i.test(base.hostname)) {
  die(
    "Refusing to target production (dragoncandy.io).\n" +
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

  // Vercel Preview scope is wired to the staging Supabase project (see
  // docs/runbooks/qa-staging-gate.md), so preview deployments are correct by config.
  if (host.endsWith(".vercel.app")) return;

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

  const keyRef = projectRefOfAnonKey(envKey.value);
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

/** Reads a Vite env var the way Vite would, honouring file precedence. */
function resolveViteEnv(name) {
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

/** Project ref from a Supabase anon JWT, or null if it isn't a decodable JWT. */
function projectRefOfAnonKey(key) {
  const parts = key.split(".");
  if (parts.length !== 3) return null; // sb_publishable_… — not a JWT
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
      `  Add it to the gitignored ${ENV_FILE}:\n` +
      "    STAGING_SUPABASE_SECRET_KEY=<staging service_role key>\n\n" +
      "  Supabase dashboard → dragoncandy-staging → Project Settings → API → service_role.\n" +
      "  (This is the STAGING key. Never put the prod key here.)"
  );
}
if (SECRET.includes(PROD_REF)) {
  die("That looks like the PRODUCTION key. This script targets staging only — aborting.");
}

const { email, role } = ROLES[roleArg];

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
