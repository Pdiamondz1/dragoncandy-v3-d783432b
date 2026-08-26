import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { corsHeaders } from "../_shared/cors.ts";
import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
  WWW_APP_ORIGINS,
} from "../_shared/origins.ts";
import {
  MAX_CODE_ATTEMPTS,
  isWellFormedCode,
  normalizeVerificationCode,
} from "../_shared/verification-code.ts";

interface VerifyEmailRequest {
  token?: string;
  code?: string;
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
    //
    // The CODE is accepted from the POST body only, never from the query string. A URL
    // is written to server logs, browser history and outbound Referer headers; the token
    // has no choice (it IS the link), but the code does, and the difference costs nothing.
    let token: string | null = null;
    let code: string | null = null;
    if (isGet) {
      token = url.searchParams.get('token');
    } else {
      const body: VerifyEmailRequest = await req.json().catch(() => ({} as VerifyEmailRequest));
      token = body?.token ?? null;
      code = typeof body?.code === 'string' ? normalizeVerificationCode(body.code) : null;
    }

    // Same membership as before the .com migration (apex + www + both Lovable
    // previews, deliberately NOT the internal AIOS host) — now on both TLDs.
    const ALLOWED_ORIGINS = new Set<string>([
      ...APP_ORIGINS,
      ...WWW_APP_ORIGINS,
      LOVABLE_V3_ORIGIN,
      LOVABLE_PREVIEW_ORIGIN,
    ]);
    const rawRedirect = url.searchParams.get('redirect')
      || req.headers.get('origin')
      || req.headers.get('referer')
      || Deno.env.get('APP_URL')
      || '';
    let redirectBase = '';
    try {
      const rUrl = new URL(rawRedirect);
      if (ALLOWED_ORIGINS.has(rUrl.origin)) redirectBase = rUrl.origin;
    } catch {
      // rawRedirect may be just an origin string
      if (ALLOWED_ORIGINS.has(rawRedirect)) redirectBase = rawRedirect;
    }
    if (!redirectBase) redirectBase = Deno.env.get('APP_URL') || DEFAULT_ORIGIN;

    console.log('verify-email: request received', {
      method: req.method,
      token_prefix: token?.slice(0, 8) || null,
      redirectBase,
    });

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    /**
     * THE CODE PATH. Everything below this block is the emailed-link path and is
     * unchanged; a request carrying no `code` never enters here.
     *
     * THIS FUNCTION RUNS AT `verify_jwt = false`, because the emailed link arrives from a
     * mail client with no session. The gateway therefore authenticates nobody, and a
     * six-digit secret accepted without a session would be brute-forceable, anonymously,
     * against every account on the platform. The JWT check below is not defence in depth
     * — it is the only thing standing there, and it is why the code is resolved against
     * `caller.id` rather than against anything the request asserts.
     *
     * The attempt cap is the second control, and it stops a different attack: signing up
     * as somebody else's address, never opening the inbox, and guessing. It lives in
     * `consume_email_verification_code` rather than here, because counting in TypeScript
     * and then acting on the count is check-then-act under concurrency.
     */
    if (code) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
      if (!bearer) {
        return new Response(
          JSON.stringify({ success: false, reason: 'unauthorized', message: 'Sign in to use a verification code.' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }

      const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
      if (!anonKey) {
        // Fail CLOSED. Without the anon key the caller cannot be identified, and an
        // unidentified caller must never reach the code path.
        console.error('verify-email: SUPABASE_ANON_KEY missing; refusing the code path');
        return new Response(
          JSON.stringify({ success: false, reason: 'unavailable', message: 'Verification is temporarily unavailable.' }),
          { status: 503, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }

      const authClient = createClient(supabaseUrl, anonKey);
      const { data: { user: caller }, error: callerError } = await authClient.auth.getUser(bearer);
      if (callerError || !caller) {
        return new Response(
          JSON.stringify({ success: false, reason: 'unauthorized', message: 'Sign in to use a verification code.' }),
          { status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }

      // A malformed code cannot match anything, so it costs no budget. Charging for a
      // typo the client could have caught would spend the cap on the honest user rather
      // than on the attacker it exists for.
      if (!isWellFormedCode(code)) {
        return new Response(
          JSON.stringify({ success: false, reason: 'malformed', message: 'Enter the 6-digit code from your email.' }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }

      const { data: outcome, error: rpcError } = await supabase.rpc('consume_email_verification_code', {
        p_user_id: caller.id,
        p_code: code,
        p_max_attempts: MAX_CODE_ATTEMPTS,
      });

      if (rpcError) {
        console.error('verify-email: consume_email_verification_code failed', rpcError);
        return new Response(
          JSON.stringify({ success: false, reason: 'error', message: 'Could not check that code. Please try again.' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }

      const result = (outcome ?? {}) as { ok?: boolean; reason?: string; remaining?: number };
      if (result.ok) {
        console.log('verify-email: code accepted for user', caller.id, result.reason);
        return new Response(
          JSON.stringify({ success: true, message: 'Email verified successfully' }),
          { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
        );
      }

      const CODE_FAILURES: Record<string, { status: number; message: string }> = {
        mismatch: { status: 400, message: 'That code is not right. Check your email and try again.' },
        too_many_attempts: {
          status: 429,
          message: 'Too many incorrect codes. Use the verification link in your email instead.',
        },
        no_live_code: {
          status: 400,
          message: 'That code has expired. Send yourself a new email and try again.',
        },
      };
      const failure = CODE_FAILURES[result.reason ?? ''] ?? {
        status: 400,
        message: 'Could not verify that code.',
      };
      return new Response(
        JSON.stringify({
          success: false,
          reason: result.reason ?? 'unknown',
          remaining: result.remaining,
          message: failure.message,
        }),
        { status: failure.status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } },
      );
    }

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
