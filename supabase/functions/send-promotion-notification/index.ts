import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "npm:resend@2.0.0";
import { corsHeaders } from "../_shared/cors.ts";
import { htmlEscape } from "../_shared/htmlEscape.ts";

interface PromotionNotificationRequest {
  type: 'video_approved' | 'video_rejected';
  customerEmail: string;
  customerPhone?: string;
  customerName?: string;
  discountCode?: string;
  businessName: string;
  discountType: string;
  discountValue: number;
  expiresAt?: string;
  rejectionReason?: string;
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
    const token = authHeader.replace("Bearer ", "");
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const { data: { user: caller }, error: authError } = await supabaseAuth.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const data: PromotionNotificationRequest = await req.json();
    console.log("Received notification request:", { ...data, customerPhone: "***" });

    // Bind the RECIPIENT to a submission on a promotion this caller owns.
    //
    // `caller` was verified above and then never used again: recipient address, phone, name and
    // every line of copy came from the request body. This function sends a Resend email from
    // `onboarding@notify.dragoncandy.io` and a Twilio SMS from the org number — so any
    // authenticated user could send branded DragonCandy mail and texts to arbitrary strangers,
    // burning sender reputation and org-wide Twilio credit. That is a phishing carrier, not a
    // notification endpoint.
    //
    // The contact details are re-read from `promotion_submissions` and the body's values are
    // discarded, so the caller can only reach someone who actually submitted to THEIR promotion.
    // Deliberately keyed off the existing `customerEmail` field rather than a new `submissionId`:
    // it closes the hole without a request-contract change, so there is no window where a
    // not-yet-deployed frontend and a deployed function disagree.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: submission, error: submissionError } = await admin
      .from("promotion_submissions")
      .select("customer_email, customer_phone, customer_name, promotions!inner(user_id)")
      .eq("customer_email", data.customerEmail)
      .eq("promotions.user_id", caller.id)
      .limit(1)
      .maybeSingle();

    if (submissionError) {
      console.error("[send-promotion-notification] submission lookup failed:", submissionError.message);
      return new Response(JSON.stringify({ error: "Authorization check unavailable" }), {
        status: 503, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
    if (!submission) {
      console.warn("[send-promotion-notification] BLOCKED: recipient has no submission on a promotion owned by this caller", {
        callerId: caller.id,
      });
      return new Response(JSON.stringify({ error: "Not permitted to notify this recipient" }), {
        status: 403, headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Server-resolved contact details win over anything the request supplied.
    data.customerEmail = submission.customer_email;
    data.customerPhone = submission.customer_phone ?? undefined;
    data.customerName = submission.customer_name ?? data.customerName;

    const displayName = data.customerName || 'there';
    const esc = {
      customerName: htmlEscape(displayName),
      businessName: htmlEscape(data.businessName),
      discountCode: htmlEscape(data.discountCode ?? ''),
      rejectionReason: htmlEscape(data.rejectionReason ?? ''),
    };

    const results = {
      emailSent: false,
      smsSent: false,
      errors: [] as string[],
    };

    // Send Email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (resendApiKey && data.customerEmail) {
      try {
        const resend = new Resend(resendApiKey);
        
        if (data.type === 'video_approved' && data.discountCode) {
          const discountDisplay = data.discountType === 'percentage' 
            ? `${data.discountValue}% OFF` 
            : `$${data.discountValue} OFF`;

          const emailResponse = await resend.emails.send({
            from: "DragonCandy Promotions <onboarding@notify.dragoncandy.io>",
            to: [data.customerEmail],
            subject: `🎉 Your Discount Code from ${data.businessName}!`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                  <div style="background: linear-gradient(135deg, #ec4899 0%, #8b5cf6 100%); padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Congratulations, ${esc.customerName}!</h1>
                    <p style="color: rgba(255,255,255,0.9); margin-top: 10px; font-size: 16px;">Your video has been approved!</p>
                  </div>
                  
                  <div style="padding: 40px 30px; text-align: center;">
                    <p style="color: #64748b; font-size: 16px; margin-bottom: 30px;">
                      Thank you for sharing your experience at <strong>${esc.businessName}</strong>! 
                      Here's your exclusive discount code:
                    </p>
                    
                    <div style="background: linear-gradient(135deg, #fdf2f8 0%, #ede9fe 100%); border: 2px dashed #ec4899; border-radius: 12px; padding: 30px; margin: 20px 0;">
                      <p style="color: #64748b; font-size: 14px; margin: 0 0 10px 0; text-transform: uppercase; letter-spacing: 1px;">Your Discount Code</p>
                      <p style="font-size: 36px; font-weight: bold; color: #8b5cf6; margin: 0; letter-spacing: 4px;">${esc.discountCode}</p>
                      <p style="font-size: 24px; color: #ec4899; margin: 15px 0 0 0; font-weight: bold;">${discountDisplay}</p>
                    </div>
                    
                    ${data.expiresAt ? `
                    <p style="color: #94a3b8; font-size: 14px; margin-top: 20px;">
                      ⏰ Valid until: ${new Date(data.expiresAt).toLocaleDateString('en-US', { 
                        weekday: 'long', 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric' 
                      })}
                    </p>
                    ` : ''}
                    
                    <p style="color: #64748b; font-size: 14px; margin-top: 30px;">
                      Show this code at checkout to redeem your discount!
                    </p>
                  </div>
                  
                  <div style="background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                      Powered by DragonCandy • Thank you for being awesome! <img src="https://dragoncandy.io/donny-emblem.webp" alt="" width="14" height="14" style="vertical-align: middle; border-radius: 50%; object-fit: cover;" />
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });

          console.log("Approval email sent successfully:", emailResponse);
          results.emailSent = true;
        } else if (data.type === 'video_rejected') {
          const emailResponse = await resend.emails.send({
            from: "DragonCandy Promotions <onboarding@notify.dragoncandy.io>",
            to: [data.customerEmail],
            subject: `Update on your video submission - ${data.businessName}`,
            html: `
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
              </head>
              <body style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f8f9fa;">
                <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1);">
                  <div style="background: #64748b; padding: 40px 30px; text-align: center;">
                    <h1 style="color: white; margin: 0; font-size: 24px;">Video Submission Update</h1>
                  </div>
                  
                  <div style="padding: 40px 30px;">
                    <p style="color: #374151; font-size: 16px; line-height: 1.6;">
                      Hi ${esc.customerName},
                    </p>
                    <p style="color: #64748b; font-size: 16px; line-height: 1.6;">
                      Thank you for submitting a video to <strong>${esc.businessName}</strong>. 
                      Unfortunately, we weren't able to approve your submission at this time.
                    </p>
                    ${data.rejectionReason ? `
                    <div style="background: #f8fafc; border-left: 4px solid #94a3b8; padding: 15px 20px; margin: 20px 0;">
                      <p style="color: #64748b; font-size: 14px; margin: 0;">
                        <strong>Reason:</strong> ${esc.rejectionReason}
                      </p>
                    </div>
                    ` : ''}
                    <p style="color: #64748b; font-size: 16px; line-height: 1.6;">
                      Feel free to visit us again and try submitting a new video!
                    </p>
                    <p style="color: #374151; font-size: 16px; margin-top: 30px;">
                      Best regards,<br>
                      The ${esc.businessName} Team
                    </p>
                  </div>
                  
                  <div style="background: #f8fafc; padding: 20px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
                    <p style="color: #94a3b8; font-size: 12px; margin: 0;">
                      Powered by DragonCandy <img src="https://dragoncandy.io/donny-emblem.webp" alt="" width="14" height="14" style="vertical-align: middle; border-radius: 50%; object-fit: cover;" />
                    </p>
                  </div>
                </div>
              </body>
              </html>
            `,
          });

          console.log("Rejection email sent successfully:", emailResponse);
          results.emailSent = true;
        }
      } catch (emailError: any) {
        console.error("Error sending email:", emailError);
        results.errors.push(`Email error: ${emailError.message}`);
      }
    } else {
      console.log("Skipping email: No API key or email address");
    }

    // Send SMS via Twilio (only for approvals)
    if (data.type === 'video_approved' && data.discountCode) {
      // Skip SMS if no phone number provided
      if (!data.customerPhone || data.customerPhone.trim() === '') {
        console.warn('No customer phone provided, skipping SMS');
      } else {
        const twilioSid = Deno.env.get("TWILIO_ACCOUNT_SID");
        const twilioToken = Deno.env.get("TWILIO_AUTH_TOKEN");
        const twilioPhone = Deno.env.get("TWILIO_PHONE_NUMBER");

        if (twilioSid && twilioToken && twilioPhone) {
          try {
            const discountDisplay = data.discountType === 'percentage'
              ? `${data.discountValue}%`
              : `$${data.discountValue}`;

            const smsBody = `🎉 ${data.businessName}: Your discount code is ${data.discountCode} for ${discountDisplay} OFF! Show this at checkout. Thank you!`;

            // Format phone number (ensure it has country code)
            let formattedPhone = data.customerPhone.replace(/\D/g, '');
            if (!formattedPhone.startsWith('1') && formattedPhone.length === 10) {
              formattedPhone = '1' + formattedPhone;
            }
            if (!formattedPhone.startsWith('+')) {
              formattedPhone = '+' + formattedPhone;
            }

            const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${twilioSid}/Messages.json`;
            const authHeader = btoa(`${twilioSid}:${twilioToken}`);

            const smsResponse = await fetch(twilioUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Basic ${authHeader}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: new URLSearchParams({
                To: formattedPhone,
                From: twilioPhone,
                Body: smsBody,
              }),
            });

            const smsResult = await smsResponse.json();

            if (smsResponse.ok) {
              console.log("SMS sent successfully:", smsResult.sid);
              results.smsSent = true;
            } else {
              console.error("Twilio error:", smsResult);
              results.errors.push(`SMS error: ${smsResult.message || 'Unknown error'}`);
            }
          } catch (smsError: any) {
            console.error("Error sending SMS:", smsError);
            results.errors.push(`SMS error: ${smsError.message}`);
          }
        } else {
          console.log("Skipping SMS: Missing Twilio credentials or phone number");
        }
      }
    }

    console.log("Notification results:", results);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  } catch (error: any) {
    console.error("Error in send-promotion-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders(req) },
      }
    );
  }
};

serve(handler);
