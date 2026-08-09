import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Resend } from "npm:resend@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { htmlEscape } from "../_shared/htmlEscape.ts";
import {
  APP_ORIGINS,
  DEFAULT_ORIGIN,
  LOVABLE_PREVIEW_ORIGIN,
  LOVABLE_V3_ORIGIN,
  WWW_APP_ORIGINS,
} from "../_shared/origins.ts";

// Origins a verification link may be built against. Mirrors verify-email's set
// (which gates the redirect on the other end) so a link we mint is always one
// that function will honour.
const ALLOWED_LINK_ORIGINS = new Set<string>([
  ...APP_ORIGINS,
  ...WWW_APP_ORIGINS,
  LOVABLE_V3_ORIGIN,
  LOVABLE_PREVIEW_ORIGIN,
]);

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface VerificationEmailRequest {
  email: string;
  name: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }

  try {
    // Require authentication
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    const bearerToken = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(bearerToken);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { email, name, userId }: VerificationEmailRequest = await req.json();

    // Callers can only send verification emails for themselves
    if (userId !== caller.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    console.log('Sending verification email to:', email);

    // Create Supabase client with service role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Generate a unique verification token
    const token = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // Token expires in 24 hours

    // Store the token in the database
    const { error: tokenError } = await supabase
      .from('email_verification_tokens')
      .insert({
        user_id: userId,
        token: token,
        expires_at: expiresAt.toISOString(),
      });

    if (tokenError) {
      console.error('Error storing verification token:', tokenError);
      throw tokenError;
    }

    // Create verification link.
    //
    // Send the user back to the origin they actually signed up on — otherwise a
    // dragoncandy.com signup receives a dragoncandy.io link and verifies onto a
    // host they never chose (sessions are origin-scoped, so they end up signed
    // in on the wrong one).
    //
    // The request origin is honoured ONLY if it is allow-listed. This value is
    // interpolated into a token-bearing link, so an ungated Origin/Referer would
    // let a caller aim a legitimate-looking DragonCandy verification email at a
    // domain they control. It was previously ungated and only harmless because
    // APP_URL happened to be set and took precedence.
    const origin = req.headers.get('origin') ?? '';
    const referer = req.headers.get('referer') ?? '';
    let inferredOrigin = '';
    try {
      inferredOrigin = origin || (referer ? new URL(referer).origin : '');
    } catch (_) {
      inferredOrigin = origin;
    }
    const trustedOrigin = ALLOWED_LINK_ORIGINS.has(inferredOrigin) ? inferredOrigin : '';
    const appUrl = trustedOrigin || Deno.env.get('APP_URL') || DEFAULT_ORIGIN;
    const verificationLink = `${appUrl}/verify-email?token=${token}`;

    // Send verification email using Resend
    const emailResponse = await resend.emails.send({
      from: "DragonCandy <verify@notify.dragoncandy.io>",
      to: [email],
      subject: "Verify Your Email - DragonCandy",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to DragonCandy!</h1>
            </div>
            
            <div style="background: #ffffff; padding: 40px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
              <h2 style="color: #1f2937; margin-top: 0;">Hi ${htmlEscape(name)}!</h2>
              
              <p style="font-size: 16px; color: #4b5563;">
                Thanks for signing up! Please verify your email address to complete your registration and access all features.
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationLink}" 
                   style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;">
                  Verify Email Address
                </a>
              </div>
              
              <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                This verification link will expire in 24 hours.
              </p>
              
              <p style="font-size: 14px; color: #6b7280;">
                If you didn't create an account with DragonCandy, you can safely ignore this email.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">
              
              <p style="font-size: 12px; color: #9ca3af; text-align: center;">
                DragonCandy - Connecting Brands with Creators<br>
                <a href="${appUrl}" style="color: #8B5CF6; text-decoration: none;">dragoncandy.io</a>
              </p>
            </div>
          </body>
        </html>
      `,
    });

    console.log("Verification email sent successfully:", emailResponse);

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Verification email sent successfully' 
    }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(req),
      },
    });
  } catch (error: any) {
    console.error("Error in send-verification-email function:", error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false 
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      }
    );
  }
};

serve(handler);
