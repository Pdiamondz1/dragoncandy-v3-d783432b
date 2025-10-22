import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'No reCAPTCHA token provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const recaptchaSecretKey = Deno.env.get('RECAPTCHA_SECRET_KEY');
    
    if (!recaptchaSecretKey) {
      console.error('RECAPTCHA_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Server configuration error' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Verify the token with Google's API
    const verificationUrl = 'https://www.google.com/recaptcha/api/siteverify';
    const verificationBody = new URLSearchParams({
      secret: recaptchaSecretKey,
      response: token,
    });

    console.log('Verifying reCAPTCHA token with Google...');

    const verificationResponse = await fetch(verificationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: verificationBody.toString(),
    });

    const verificationResult = await verificationResponse.json();

    console.log('reCAPTCHA verification result:', {
      success: verificationResult.success,
      challenge_ts: verificationResult.challenge_ts,
      hostname: verificationResult.hostname,
      'error-codes': verificationResult['error-codes'],
    });

    if (verificationResult.success) {
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'reCAPTCHA verification successful',
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'reCAPTCHA verification failed',
          errorCodes: verificationResult['error-codes'] || [],
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }
  } catch (error) {
    console.error('Error in verify-recaptcha function:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error during verification',
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
