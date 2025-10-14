import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VerifyEmailRequest {
  token: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token }: VerifyEmailRequest = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, message: 'Missing token' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
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
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid or expired verification link' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!tokenData || tokenData.verified_at !== null) {
      return new Response(
        JSON.stringify({ success: false, message: 'Invalid or expired verification link' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Expiration check
    const expiresAt = new Date(tokenData.expires_at as unknown as string);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt < new Date()) {
      return new Response(
        JSON.stringify({ success: false, message: 'Verification link has expired. Please request a new one.' }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark token as verified
    const { error: updateTokenError } = await supabase
      .from('email_verification_tokens')
      .update({ verified_at: new Date().toISOString() })
      .eq('id', tokenData.id);

    if (updateTokenError) {
      console.error('verify-email: update token error', updateTokenError);
      return new Response(
        JSON.stringify({ success: false, message: 'Could not verify token' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Update profile email_verified status
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ email_verified: true })
      .eq('id', tokenData.user_id);

    if (profileError) {
      console.error('verify-email: update profile error', profileError);
      return new Response(
        JSON.stringify({ success: false, message: 'Could not update profile' }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Email verified successfully' }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error('verify-email: unexpected error', error);
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Unexpected error' }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
