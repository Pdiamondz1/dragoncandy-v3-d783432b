/**
 * Vercel Routing Middleware — the site's front door.
 *
 * Framework-agnostic: a default export from `middleware.ts` at the project
 * root, which Vercel runs ahead of routing. That ordering matters twice — it
 * fires before the `/(.*)` -> `/index.html` rewrite in `vercel.json`, so a
 * challenged request never reaches the SPA shell, and it fires before the CDN,
 * so no gate response can be served from cache to the wrong visitor.
 *
 * This file deliberately holds no logic. Everything decidable lives in
 * `gate/decide.ts`, which is unit-tested; the gate is production-only and
 * therefore cannot be exercised on a preview deploy.
 *
 * Rollback: set SITE_GATE_ENABLED=0 in the Vercel dashboard AND redeploy — an
 * environment-variable change does not reach a deployment that is already
 * running. Do NOT roll back by deleting SITE_PASSWORD; the gate fails closed, so
 * that locks everyone out instead of opening the site.
 *
 * See docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
 */
import process from 'node:process';
import { next } from '@vercel/functions';
import { decide } from './gate/decide';

export const config = {
  // Node.js, not the default 'edge'. Two reasons: `node:process` does not
  // resolve on the Edge runtime, and Vercel's current guidance is that Edge has
  // compatibility gaps with no upside here — Fluid Compute runs in the same
  // regions at the same price. Web Crypto, atob and btoa are all global on
  // Node 24, so nothing else in this path changes.
  runtime: 'nodejs',
  // Everything except Vercel's own internal endpoints.
  matcher: '/((?!_vercel/).*)',
};

const NO_STORE = 'private, no-store';

/**
 * The 401 challenge, never a redirect to a gate page: the browser re-requests
 * this exact URL after the prompt, so a password-reset link's #access_token
 * fragment survives. A redirect would drop it and break resets silently.
 */
function challenge(): Response {
  return new Response('DragonCandy is in private preview.\n', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="DragonCandy private preview", charset="UTF-8"',
      'Cache-Control': NO_STORE,
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

export default async function middleware(request: Request): Promise<Response> {
  const decision = await decide(request, {
    vercelEnv: process.env.VERCEL_ENV,
    enabled: process.env.SITE_GATE_ENABLED,
    password: process.env.SITE_PASSWORD,
    bypassToken: process.env.SITE_BYPASS_TOKEN,
    secret: process.env.SITE_GATE_SECRET,
  });

  // `next()` is how framework-agnostic middleware says "continue to the origin".
  // Returning a bare `undefined` is a Next.js convention, not this contract, and
  // if it did not continue then every authorised request would break — in
  // production only, where the gate is the sole thing that runs it.
  //
  // A pass CAN carry headers (`next({ headers })` sets them on the response), so
  // nothing here stops us minting a cookie on the Basic-auth branch. We don't,
  // because browsers cache Basic credentials per origin and realm and replay them
  // automatically: a cookie would be redundant.
  if (decision.kind === 'pass') return next();

  if (decision.kind === 'redirect') {
    return new Response(null, {
      status: 302,
      headers: {
        Location: decision.location,
        'Set-Cookie': decision.setCookie,
        'Cache-Control': NO_STORE,
      },
    });
  }

  if (decision.kind === 'challenge') return challenge();

  // Every GateDecision variant is now handled, and this assignment is what keeps
  // that true: add a fourth and it stops compiling here instead of quietly
  // inheriting the 401 below. The fall-through still challenges, so even an
  // impossible decision leaves the gate closed rather than open.
  const _exhaustive: never = decision;
  void _exhaustive;
  return challenge();
}
