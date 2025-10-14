import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface VerificationEmailRequest {
  email: string;
  name: string;
  userId: string;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, userId }: VerificationEmailRequest = await req.json();

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

    // Create verification link
    const origin = req.headers.get('origin') ?? '';
    const referer = req.headers.get('referer') ?? '';
    let inferredOrigin = '';
    try {
      inferredOrigin = origin || (referer ? new URL(referer).origin : '');
    } catch (_) {
      inferredOrigin = origin;
    }
    const appUrl = Deno.env.get('APP_URL') || inferredOrigin || 'https://dragoncandy.io';
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
              <h2 style="color: #1f2937; margin-top: 0;">Hi ${name}!</h2>
              
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
        ...corsHeaders,
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
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
