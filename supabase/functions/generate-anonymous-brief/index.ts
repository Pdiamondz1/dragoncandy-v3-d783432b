import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic-fetch.ts';
import { logCost } from '../_shared/cost-ledger.ts';
import {
  isHoneypotTripped,
  extractClientIp,
  isBlockedTarget,
  extractContent,
  computeSourceQuality,
  parseBrief,
  type GeneratedBrief,
} from './lib.ts';

// Self-contained anonymous brief generator. Does NOT delegate to the user-gated
// donny-campaign-generate (that 401s a service-role caller). Layered-v1 abuse hardening:
// honeypot, hardened SSRF guard, global daily cap (best-effort), best-effort per-IP cap.
// Every HANDLED outcome returns HTTP 200 with an `error` discriminator, because
// supabase.functions.invoke exposes the body only on 2xx.

const GLOBAL_DAILY_CAP = 150;
const MODEL = 'claude-haiku-4-5-20251001'; // hardcoded cheap tier — NOT getModelConfig (defaults to Sonnet)
const MAX_TOKENS = 768;
const FETCH_TIMEOUT_MS = 8000;
const MAX_REDIRECT_HOPS = 2;

function json(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

/** Fetch with manual, re-validated redirects (an allowed URL can 302 to an internal one). */
async function fetchGuarded(startUrl: string): Promise<string | null> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (isBlockedTarget(current)) return null;
    const res = await fetch(current, {
      headers: { 'User-Agent': 'DragonCandy-Bot/1.0' },
      redirect: 'manual',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      current = new URL(loc, current).toString(); // resolve relative redirects
      continue;
    }
    if (!res.ok) return null;
    return await res.text();
  }
  return null; // too many redirects
}

async function generateBrief(
  apiKey: string,
  url: string,
  extracted: { title: string; description: string; bodyText: string },
): Promise<{ text: string; usage: { input_tokens: number; output_tokens: number } }> {
  const system =
    `You are Donny, DragonCandy's AI campaign assistant. From a business's website content, ` +
    `draft a STARTING social-media campaign brief the owner will review and refine. ` +
    `Respond with raw JSON ONLY — no markdown fences, no prose. Exact shape:\n` +
    `{"campaign_name":"<catchy short name>","campaign_description":"<2-3 sentences: what to post and the angle>",` +
    `"target_audience":"<who this reaches>","content_suggestions":["<idea 1>","<idea 2>","<idea 3>"]}`;
  const userContent =
    `Business URL: ${url}\nTitle: ${extracted.title}\nMeta description: ${extracted.description}\n` +
    `Page content: ${extracted.bodyText}`;

  const res = await anthropicFetch(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        temperature: 0.7,
        system,
        messages: [{ role: 'user', content: userContent }],
      }),
    },
    1,
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Anthropic ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  // Return the raw model text + usage; parsing happens at the call site AFTER cost is
  // logged, so a billed 200 with unparseable JSON still records its spend.
  return {
    text: data.content?.[0]?.text ?? '{}',
    usage: {
      input_tokens: data.usage?.input_tokens ?? 0,
      output_tokens: data.usage?.output_tokens ?? 0,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // 1. Honeypot — benign no-op (no fetch, no model call, no row).
    if (isHoneypotTripped(body)) return json(req, 200, { error: 'rate_limited' });

    // 2. URL validation + hardened SSRF guard (before any spend).
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) return json(req, 400, { error: 'A valid URL is required' });
    if (isBlockedTarget(url)) return json(req, 400, { error: 'URL is not allowed' });

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);

    // 3. Global daily cap (best-effort; fail-closed on count error).
    const { count, error: capErr } = await supabase
      .from('campaign_brief_generations')
      .select('id', { count: 'exact', head: true })
      .is('user_id', null)
      .gte('generated_at', todayStart.toISOString());
    if (capErr) {
      console.error('Global-cap count failed (fail-closed):', capErr);
      return json(req, 200, { error: 'capacity' });
    }
    if ((count ?? 0) >= GLOBAL_DAILY_CAP) return json(req, 200, { error: 'capacity' });

    // 4. Per-IP cap (best-effort; skipped entirely when no valid client IP).
    const clientIp = extractClientIp((n) => req.headers.get(n));
    if (clientIp) {
      const { count: ipCount, error: ipErr } = await supabase
        .from('campaign_brief_generations')
        .select('id', { count: 'exact', head: true })
        .eq('ip_address', clientIp)
        .is('user_id', null)
        .gte('generated_at', todayStart.toISOString());
      if (!ipErr && (ipCount ?? 0) >= 1) return json(req, 200, { error: 'rate_limited' });
    }

    // 5. Fetch + extract (manual, re-validated redirects).
    let html: string | null = null;
    try {
      html = await fetchGuarded(url);
    } catch (e) {
      console.warn('Fetch failed:', (e as Error).message);
    }
    if (html === null) return json(req, 200, { error: 'fetch_failed' });

    const extracted = extractContent(html);
    const sourceQuality = computeSourceQuality(extracted.bodyText, true);

    // 6. Call the model (Haiku). A non-200 / network error → generation_failed (no billed
    //    response, so no spend to log).
    let text: string;
    let usage = { input_tokens: 0, output_tokens: 0 };
    try {
      const gen = await generateBrief(anthropicKey, url, extracted);
      text = gen.text;
      usage = gen.usage;
    } catch (e) {
      console.error('Generation failed:', (e as Error).message);
      return json(req, 200, { error: 'generation_failed' });
    }

    // Log runtime AI spend as soon as we have a billed 200 — BEFORE parsing, since a 200 with
    // unparseable JSON still cost money (anonymous → no user; best-effort, never blocks).
    await logCost(supabase, {
      userId: null,
      edgeFunction: 'generate-anonymous-brief',
      model: MODEL,
      tier: 'T1',
      inputTokens: usage.input_tokens,
      outputTokens: usage.output_tokens,
    });

    // Parse (a 200 with bad JSON → graceful generation_failed; the spend is already logged).
    let brief: GeneratedBrief;
    try {
      brief = parseBrief(text);
    } catch (e) {
      console.error('Brief parse failed:', (e as Error).message);
      return json(req, 200, { error: 'generation_failed' });
    }

    // 7. Save the anonymous record only on success (non-blocking).
    const { error: insErr } = await supabase.from('campaign_brief_generations').insert({
      user_id: null,
      org_id: null,
      source_url: url,
      brief_jsonb: brief,
      ip_address: clientIp,
    });
    if (insErr) console.error('Failed to save anonymous brief (non-blocking):', insErr);

    return json(req, 200, { ...brief, source_quality: sourceQuality });
  } catch (err) {
    console.error('generate-anonymous-brief error:', err);
    return json(req, 500, { error: 'Internal server error' });
  }
});
