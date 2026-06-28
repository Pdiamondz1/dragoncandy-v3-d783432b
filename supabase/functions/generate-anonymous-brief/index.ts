import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { anthropicFetch } from '../_shared/anthropic-fetch.ts';

// Public, unauthenticated landing teaser: paste a URL → a draft campaign brief.
// Generates DIRECTLY with a cheap model — deliberately NOT routed through the
// user-gated donny-campaign-generate (which requires a Donny/user token via
// validateDonnyToken and would 401 a server-to-server call). Isolated so this
// public endpoint can never affect the authenticated campaign pipeline, and so
// the teaser stays cheap (Haiku) and rate-limited (1/IP/day).
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')!;
const BRIEF_MODEL = 'claude-haiku-4-5-20251001'; // cheapest tier; this is a teaser

interface AnonBrief {
  campaign_name: string;
  campaign_description: string;
  target_audience: string;
  content_suggestions: string[];
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

// SSRF guard: block non-http(s) and private/internal hosts.
function isBlockedUrl(parsed: URL): boolean {
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  const h = parsed.hostname.toLowerCase();
  if (
    h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' ||
    h === '169.254.169.254' || h === 'metadata.google.internal'
  ) return true;
  const parts = h.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => !isNaN(p))) {
    if (
      parts[0] === 10 ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168)
    ) return true;
  }
  return false;
}

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'DragonCandy-Bot/1.0' },
    redirect: 'follow',
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const html = await res.text();
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? '';
  const desc =
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1]?.trim() ??
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)?.[1]?.trim() ??
    '';
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
  const parts = [
    title && `Title: ${title}`,
    desc && `Description: ${desc}`,
    body && `Page text: ${body}`,
  ].filter(Boolean);
  if (parts.length === 0) throw new Error('no extractable content');
  return parts.join('\n');
}

function parseBrief(text: string): AnonBrief {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const slice = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;
  const obj = JSON.parse(slice) as Record<string, unknown>;
  const suggestions = Array.isArray(obj.content_suggestions)
    ? obj.content_suggestions.slice(0, 5).map((s) => String(s))
    : [];
  return {
    campaign_name: String(obj.campaign_name ?? 'Your Campaign'),
    campaign_description: String(obj.campaign_description ?? ''),
    target_audience: String(obj.target_audience ?? ''),
    content_suggestions: suggestions,
  };
}

async function generateBrief(pageText: string, sourceUrl: string): Promise<AnonBrief> {
  const system = `You are Donny, DragonCandy's creative AI. DragonCandy connects local businesses (especially restaurants) with content creators for short-form social campaigns.
Given a business's website content, draft ONE punchy content-campaign brief tailored to that business.
Respond with ONLY valid JSON (no markdown, no prose) in exactly this shape:
{
  "campaign_name": "<short, catchy campaign title>",
  "campaign_description": "<2-3 sentences describing the campaign concept for THIS business>",
  "target_audience": "<one sentence describing who the content is aimed at>",
  "content_suggestions": ["<concrete creator deliverable>", "<another>", "<another>"]
}
Be specific to the business. Provide exactly 3 content_suggestions.`;
  const user = `Business URL: ${sourceUrl}

Website content:
${pageText}

Draft the campaign brief JSON now.`;

  const res = await anthropicFetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: BRIEF_MODEL,
      max_tokens: 800,
      temperature: 0.7,
      system,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`anthropic ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data?.content?.[0]?.text ?? '';
  return parseBrief(text);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return json(req, 400, { error: 'A valid URL is required' });
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return json(req, 400, { error: 'URL is not allowed' });
    }
    if (isBlockedUrl(parsed)) {
      return json(req, 400, { error: 'URL is not allowed' });
    }

    // Client IP from x-forwarded-for (first hop), for the per-IP rate limit.
    const clientIp = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || '0.0.0.0';

    // Rate-limit: one free brief per IP per day.
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: countError } = await supabase
      .from('campaign_brief_generations')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', clientIp)
      .is('user_id', null)
      .gte('generated_at', todayStart.toISOString());
    if (countError) {
      console.error('Rate-limit check failed:', countError);
      return json(req, 500, { error: 'Internal server error' });
    }
    if ((count ?? 0) > 0) {
      // 200 (not 429) so supabase.functions.invoke surfaces this as `data.error`
      // rather than a thrown FunctionsHttpError — the frontend keys the
      // rate-limit view off `data.error === 'rate_limited'`.
      return json(req, 200, { error: 'rate_limited', message: 'One free brief per day' });
    }

    // Generate the teaser directly (cheap model, no user scope).
    let brief: AnonBrief;
    try {
      const pageText = await fetchPageText(url);
      brief = await generateBrief(pageText, url);
    } catch (genErr) {
      console.error('Anonymous brief generation failed:', genErr);
      return json(req, 502, {
        error: 'Could not generate a brief for that URL. Try a homepage or menu URL.',
      });
    }

    // Save the anonymous generation record (non-blocking).
    const { error: insertError } = await supabase
      .from('campaign_brief_generations')
      .insert({
        user_id: null,
        org_id: null,
        source_url: url,
        brief_jsonb: brief,
        ip_address: clientIp,
      });
    if (insertError) {
      console.error('Failed to save anonymous brief generation:', insertError);
    }

    return json(req, 200, brief);
  } catch (err) {
    console.error('generate-anonymous-brief error:', err);
    return json(req, 500, { error: 'Internal server error' });
  }
});
