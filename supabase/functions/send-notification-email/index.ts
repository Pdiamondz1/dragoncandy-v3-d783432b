import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type NotificationType = 
  | 'new_application'
  | 'application_status'
  | 'new_message'
  | 'payment_received'
  | 'review_request'
  | 'campaign_update'
  | 'sponsorship_proposal'
  | 'sponsorship_status';

interface NotificationEmailRequest {
  to?: string;
  recipientName?: string;
  type: NotificationType;
  data: {
    campaignTitle?: string;
    campaignId?: string;
    recipientUserId?: string; // optional user id to resolve recipient email server-side
    applicantName?: string;
    applicationStatus?: string;
    senderName?: string;
    amount?: number;
    message?: string;
    reviewUrl?: string;
    updateDetails?: string;
    brandName?: string;
    sponsorshipAmount?: number;
    proposalStatus?: string;
  };
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { to, recipientName, type, data }: NotificationEmailRequest = await req.json();

    console.log('Incoming notification request:', { type, to, recipientUserId: data?.recipientUserId });

    const baseUrl = Deno.env.get('SUPABASE_URL')?.replace('https://', '') || '';

    // Resolve recipient if email not provided
    let resolvedTo = to;
    let resolvedRecipientName = recipientName || 'User';

    if (!resolvedTo && data?.recipientUserId) {
      console.log('Resolving recipient email via service role for user:', data.recipientUserId);
      const supabaseUrl = Deno.env.get('SUPABASE_URL') as string;
      const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') as string;
      const supabase = createClient(supabaseUrl, serviceRoleKey);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', data.recipientUserId)
        .single();

      if (profileError) {
        console.error('Failed to resolve recipient profile:', profileError);
      } else if (profile?.email) {
        resolvedTo = profile.email;
        resolvedRecipientName = profile.full_name || resolvedRecipientName;
      }
    }

    if (!resolvedTo) {
      console.warn('No recipient email could be resolved. Aborting send.');
      return new Response(JSON.stringify({ success: false, error: 'Missing recipient email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    console.log('Sending notification email:', type, 'to:', resolvedTo);
    const rn = resolvedRecipientName;
    const templates: Record<NotificationType, { subject: string; html: string }> = {
      new_application: {
        subject: `New Application for "${data.campaignTitle}"`,
        html: `
          <p>Hi ${rn},</p>
          <p>Great news! <strong>${data.applicantName}</strong> has applied to your campaign <strong>"${data.campaignTitle}"</strong>.</p>
          <p>Review their application and portfolio to see if they're a good fit for your project.</p>
          <p style="margin-top: 30px;">
            <a href="https://${baseUrl}/campaign/${data.campaignId}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Review Application
            </a>
          </p>
        `,
      },
      application_status: {
        subject: `Application ${data.applicationStatus} for "${data.campaignTitle}"`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>Your application for <strong>"${data.campaignTitle}"</strong> has been <strong>${data.applicationStatus?.toLowerCase()}</strong>.</p>
          ${data.applicationStatus === 'accepted' 
            ? `<p>Congratulations! The business owner is interested in working with you. Check your messages to coordinate next steps.</p>` 
            : `<p>Don't worry - there are many more great opportunities waiting for you in the marketplace!</p>`
          }
          <p style="margin-top: 30px;">
            <a href="https://${baseUrl}/${data.applicationStatus === 'accepted' ? 'creator-applications' : 'creator-marketplace'}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              ${data.applicationStatus === 'accepted' ? 'View Campaign' : 'Browse More Campaigns'}
            </a>
          </p>
        `,
      },
      new_message: {
        subject: `New message from ${data.senderName}`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>You have a new message from <strong>${data.senderName}</strong>${data.campaignTitle ? ` about "${data.campaignTitle}"` : ''}.</p>
          ${data.message ? `<blockquote style="border-left: 4px solid #8B5CF6; padding-left: 16px; margin: 20px 0; color: #374151;">${data.message}</blockquote>` : ''}
          <p style="margin-top: 30px;">
            <a href="https://${baseUrl}/messages${data.campaignId ? `/${data.campaignId}` : ''}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Message
            </a>
          </p>
        `,
      },
      payment_received: {
        subject: `Payment Received - $${data.amount}`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>Great news! You've received a payment of <strong>$${data.amount}</strong> for your work on <strong>"${data.campaignTitle}"</strong>.</p>
          <p>The funds will be available in your account shortly. Thank you for your excellent work!</p>
          <p style="margin-top: 30px;">
            <a href="https://${baseUrl}/creator-projects" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Projects
            </a>
          </p>
        `,
      },
      review_request: {
        subject: `Please review your collaboration on "${data.campaignTitle}"`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>Your collaboration on <strong>"${data.campaignTitle}"</strong> is now complete! 🎉</p>
          <p>We'd love to hear about your experience. Your feedback helps build trust in the DragonCandy community.</p>
          <p style="margin-top: 30px;">
            <a href="https://${baseUrl}${data.reviewUrl}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Leave a Review
            </a>
          </p>
        `,
      },
      campaign_update: {
        subject: `Campaign Update: "${data.campaignTitle}"`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>There's an update to the campaign <strong>"${data.campaignTitle}"</strong>:</p>
          ${data.updateDetails ? `<div style="background: #F9FAFB; padding: 16px; border-radius: 8px; margin: 20px 0;">${data.updateDetails}</div>` : ''}
          <p style="margin-top: 30px;">
            <a href="https://${baseUrl}/campaign/${data.campaignId}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Campaign
            </a>
          </p>
        `,
      },
      sponsorship_proposal: {
        subject: `New Sponsorship Proposal from ${data.brandName}`,
        html: `
          <p>Hi ${recipientName},</p>
          <p><strong>${data.brandName}</strong> has submitted a sponsorship proposal of <strong>$${data.sponsorshipAmount}</strong> for your campaign <strong>"${data.campaignTitle}"</strong>!</p>
          ${data.message ? `<p>Their message:</p><blockquote style="border-left: 4px solid #8B5CF6; padding-left: 16px; margin: 20px 0; color: #374151;">${data.message}</blockquote>` : ''}
        `,
      },
      sponsorship_status: {
        subject: `Sponsorship ${data.proposalStatus} for "${data.campaignTitle}"`,
        html: `
          <p>Hi ${recipientName},</p>
          <p>Your sponsorship proposal for <strong>"${data.campaignTitle}"</strong> has been <strong>${data.proposalStatus?.toLowerCase()}</strong>.</p>
          ${data.proposalStatus === 'accepted' 
            ? `<p>Congratulations! The restaurant is excited to partner with your brand. Check your messages to coordinate next steps.</p>` 
            : `<p>Thank you for your interest. There are many more great sponsorship opportunities available!</p>`
          }
        `,
      },
    };

    const template = templates[type];
    if (!template) {
      throw new Error(`Unknown notification type: ${type}`);
    }

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #F9FAFB;">
          <table role="presentation" style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 40px 20px;">
                <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 12px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                  <tr>
                    <td style="padding: 40px 40px 30px;">
                      ${template.html}
                      
                      <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #E5E7EB;">
                        <p style="color: #6B7280; font-size: 14px; margin: 0;">
                          Best regards,<br>
                          <strong style="color: #8B5CF6;">The DragonCandy Team</strong>
                        </p>
                      </div>
                    </td>
                  </tr>
                  
                  <tr>
                    <td style="background-color: #F9FAFB; padding: 20px 40px; border-radius: 0 0 12px 12px; text-align: center;">
                      <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
                        © ${new Date().getFullYear()} DragonCandy. All rights reserved.
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;

    const { data: emailData, error } = await resend.emails.send({
      from: "DragonCandy <alerts@notify.dragoncandy.io>",
      to: resolvedTo,
      subject: template.subject,
      html: emailHtml,
    });

    if (error) {
      console.error("Resend API error:", error);
      throw error;
    }

    console.log("Notification email sent successfully:", emailData);

    return new Response(JSON.stringify({ success: true, data: emailData }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-notification-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
