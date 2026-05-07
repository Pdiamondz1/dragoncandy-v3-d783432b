import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { corsHeaders } from "../_shared/cors.ts";

interface VerifyEmailRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    const url = new URL(req.url);
    const isGet = req.method === 'GET';

    // Support both POST JSON body and GET query param
    let token: string | null = null;
    if (isGet) {
      token = url.searchParams.get('token');
    } else {
      const body: VerifyEmailRequest = await req.json();
      token = body?.token ?? null;
    }

    const redirectBase = url.searchParams.get('redirect')
      || req.headers.get('origin')
      || req.headers.get('referer')
      || Deno.env.get('APP_URL')
      || '';

    console.log('verify-email: request received', {
      method: req.method,
      token_prefix: token?.slice(0, 8) || null,
      redirectBase,
    });

    if (!token) {
      const message = 'Missing token';
      if (isGet && redirectBase) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/verify-email?status=error&reason=missing_token` },
        });
      }
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch token row
    const { data: tokenData, error: tokenError } = await supabase
      .from('email_verification_tokens')
      .select('id, user_id, expires_at, verified_at')
      .eq('token', token)
      .maybeSingle();

    if (tokenError) {
      console.error('verify-email: token fetch error', tokenError);
      const message = 'Invalid or expired verification link';
      if (isGet && redirectBase) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/verify-email?status=error&reason=not_found` },
        });
      }
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    if (!tokenData || tokenData.verified_at !== null) {
      const message = 'Invalid or expired verification link';
      if (isGet && redirectBase) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/verify-email?status=error&reason=invalid_or_used` },
        });
      }
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // Expiration check
    const expiresAt = new Date(tokenData.expires_at as unknown as string);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      const message = 'Verification link has expired. Please request a new one.';
      if (isGet && redirectBase) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/verify-email?status=error&reason=expired` },
        });
      }
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // Mark token as verified
    const { error: updateTokenError } = await supabase
      .from('email_verification_tokens')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    if (updateTokenError) {
      console.error('verify-email: update token error', updateTokenError);
      const message = 'Could not verify token';
      if (isGet && redirectBase) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/verify-email?status=error&reason=update_failed` },
        });
      }
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    // Update profile email_verified status
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ email_verified: true })
      .eq('id', tokenData.user_id);

    if (profileError) {
      console.error('verify-email: update profile error', profileError);
      const message = 'Could not update profile';
      if (isGet && redirectBase) {
        return new Response(null, {
          status: 302,
          headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/verify-email?status=error&reason=profile_update_failed` },
        });
      }
      return new Response(
        JSON.stringify({ success: false, message }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
      );
    }

    console.log('verify-email: success for user', tokenData.user_id);

    if (isGet && redirectBase) {
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders(req), Location: `${redirectBase.replace(/\/$/, '')}/auth?mode=login&verified=1` },
      });
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email verified successfully' }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  } catch (error: any) {
    console.error('verify-email: unexpected error', error);
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Unexpected error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders(req) } }
    );
  }
};

serve(handler);
