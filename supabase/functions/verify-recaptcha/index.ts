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
      console.error('❌ No reCAPTCHA token provided');
      return new Response(
        JSON.stringify({ success: false, error: 'No reCAPTCHA token provided' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('📝 Token received (length:', token.length, 'chars)');

    const recaptchaSecretKey = Deno.env.get('RECAPTCHA_SECRET_KEY');
    
    if (!recaptchaSecretKey) {
      console.error('❌ RECAPTCHA_SECRET_KEY not configured');
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Server configuration error',
          errorCodes: ['missing-secret-key']
        }),
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

    console.log('🔒 Verifying reCAPTCHA token with Google...');

    const verificationResponse = await fetch(verificationUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: verificationBody.toString(),
    });

    const verificationResult = await verificationResponse.json();
    const errorCodes = verificationResult['error-codes'] || [];

    console.log('📊 reCAPTCHA verification result:', {
      success: verificationResult.success,
      challenge_ts: verificationResult.challenge_ts,
      hostname: verificationResult.hostname,
      'error-codes': errorCodes,
    });

    if (verificationResult.success) {
      console.log('✅ reCAPTCHA verified successfully for hostname:', verificationResult.hostname);
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'reCAPTCHA verification successful',
          hostname: verificationResult.hostname,
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    } else {
      // Provide specific error messages based on error codes
      let errorMessage = 'reCAPTCHA verification failed';
      
      if (errorCodes.includes('invalid-input-secret')) {
        console.error('❌ Invalid secret key - secret key mismatch!');
        errorMessage = 'Server configuration error (invalid secret key)';
      } else if (errorCodes.includes('timeout-or-duplicate')) {
        console.error('❌ Token timeout or duplicate submission');
        errorMessage = 'CAPTCHA expired or already used';
      } else if (errorCodes.includes('invalid-input-response')) {
        console.error('❌ Invalid token response - possible domain mismatch or corrupted token');
        errorMessage = 'Invalid CAPTCHA response';
      } else if (errorCodes.includes('missing-input-response')) {
        console.error('❌ Missing token in request');
        errorMessage = 'CAPTCHA token missing';
      }

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: errorMessage,
          errorCodes: errorCodes,
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
