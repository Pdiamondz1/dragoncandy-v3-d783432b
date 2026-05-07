import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from "../_shared/cors.ts";

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
      return new Response(
        JSON.stringify({ error: 'A valid URL is required' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    // SSRF protection: block private/internal URLs
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('blocked');
      const h = parsed.hostname.toLowerCase();
      if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' ||
          h === '169.254.169.254' || h === 'metadata.google.internal') throw new Error('blocked');
      const parts = h.split('.').map(Number);
      if (parts.length === 4 && parts.every(p => !isNaN(p))) {
        if (parts[0] === 10 || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
            (parts[0] === 192 && parts[1] === 168)) throw new Error('blocked');
      }
    } catch {
      return new Response(
        JSON.stringify({ error: 'URL is not allowed' }),
        { status: 400, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    // Extract client IP from x-forwarded-for (first IP, trimmed)
    const forwarded = req.headers.get('x-forwarded-for') ?? '';
    const clientIp = forwarded.split(',')[0].trim() || '0.0.0.0';

    // Rate-limit: one free brief per IP per day
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
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    if ((count ?? 0) > 0) {
      return new Response(
        JSON.stringify({ error: 'rate_limited', message: 'One free brief per day' }),
        { status: 429, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    // Call donny-campaign-generate server-to-server
    const generateResponse = await fetch(
      `${supabaseUrl}/functions/v1/donny-campaign-generate`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({ url }),
      },
    );

    if (!generateResponse.ok) {
      const errBody = await generateResponse.text();
      console.error('donny-campaign-generate error:', generateResponse.status, errBody);
      return new Response(
        JSON.stringify({ error: 'Internal server error' }),
        { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
      );
    }

    const briefData = await generateResponse.json();

    // Save generation record with null user_id/org_id (anonymous)
    const { error: insertError } = await supabase
      .from('campaign_brief_generations')
      .insert({
        user_id: null,
        org_id: null,
        source_url: url,
        brief_jsonb: briefData,
        ip_address: clientIp,
      });

    if (insertError) {
      console.error('Failed to save anonymous brief generation:', insertError);
      // Non-blocking: still return the brief even if the record fails to save
    }

    return new Response(
      JSON.stringify(briefData),
      { status: 200, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('generate-anonymous-brief error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } },
    );
  }
});
