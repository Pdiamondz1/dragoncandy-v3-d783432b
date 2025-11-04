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
  | 'campaign_published'
  | 'sponsorship_proposal'
  | 'sponsorship_status'
  | 'approval_pending'
  | 'content_liked';

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
    party?: string;
    creatorName?: string;
    contentUrl?: string;
    likerName?: string;
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

    const baseUrl = Deno.env.get('APP_URL') || '';
    console.log('Using base URL for email links:', baseUrl);

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
        resolvedRecipientName = profile.full_name || profile.email?.split('@')[0] || 'User';
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
            <a href="${baseUrl}/dashboard/business/campaigns/${data.campaignId}" 
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
            <a href="${baseUrl}/${data.applicationStatus === 'accepted' ? 'dashboard/creator/applications' : 'dashboard/creator/campaigns'}" 
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
            <a href="${baseUrl}/messages${data.campaignId ? `/${data.campaignId}` : ''}" 
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
            <a href="${baseUrl}/dashboard/creator/projects" 
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
            <a href="${baseUrl}${data.reviewUrl}" 
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
            <a href="${baseUrl}/dashboard/business/campaigns/${data.campaignId}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Campaign
            </a>
          </p>
        `,
      },
      campaign_published: {
        subject: `🎉 Your Campaign "${data.campaignTitle}" is Now Live!`,
        html: `
          <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); padding: 40px 20px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">🎉 Campaign Published!</h1>
            </div>
            
            <div style="background: white; padding: 40px 20px; border-radius: 0 0 12px 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <p style="font-size: 16px; color: #374151; margin-top: 0;">Hi ${rn},</p>
              
              <p style="font-size: 16px; color: #374151; line-height: 1.6;">
                Congratulations! Your campaign <strong>"${data.campaignTitle}"</strong> is now <strong>live in the DragonCandy marketplace</strong> and visible to talented content creators! 🚀
              </p>

              <div style="background: #F0FDF4; border-left: 4px solid #10B981; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0; color: #065F46; font-weight: 600;">✅ Your campaign is discoverable by creators</p>
                <p style="margin: 8px 0 0 0; color: #065F46;">Creators can now browse, apply, and submit proposals for your campaign.</p>
              </div>

              <h3 style="color: #1F2937; margin-top: 32px; margin-bottom: 16px;">What Happens Next?</h3>
              
              <div style="margin: 16px 0;">
                <div style="display: flex; margin-bottom: 12px;">
                  <div style="background: #8B5CF6; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 12px; font-weight: bold;">1</div>
                  <p style="margin: 0; color: #374151; line-height: 1.8;"><strong>Creators will apply:</strong> You'll receive email notifications when creators submit applications.</p>
                </div>
                
                <div style="display: flex; margin-bottom: 12px;">
                  <div style="background: #8B5CF6; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 12px; font-weight: bold;">2</div>
                  <p style="margin: 0; color: #374151; line-height: 1.8;"><strong>Review applications:</strong> Check creator portfolios, rates, and proposals.</p>
                </div>
                
                <div style="display: flex; margin-bottom: 12px;">
                  <div style="background: #8B5CF6; color: white; width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-right: 12px; font-weight: bold;">3</div>
                  <p style="margin: 0; color: #374151; line-height: 1.8;"><strong>Accept & collaborate:</strong> Accept your favorite creator and start working together!</p>
                </div>
              </div>

              <div style="background: #EFF6FF; border-left: 4px solid #3B82F6; padding: 16px; margin: 24px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #1E40AF; font-weight: 600;">💡 Pro Tip</p>
                <p style="margin: 0; color: #1E40AF; font-size: 14px; line-height: 1.6;">
                  Campaigns with detailed descriptions and clear deliverables receive 3x more quality applications. 
                  Consider adding example content or references to attract the best creators!
                </p>
              </div>

              <p style="text-align: center; margin-top: 40px;">
                <a href="${baseUrl}/dashboard/business/campaigns/${data.campaignId}" 
                   style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(139, 92, 246, 0.3);">
                  View Campaign & Applications
                </a>
              </p>

              <p style="text-align: center; margin-top: 24px;">
                <a href="${baseUrl}/dashboard/business/creators" 
                   style="color: #8B5CF6; text-decoration: none; font-size: 14px;">
                  Browse Creators →
                </a>
              </p>

              <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 40px 0;" />

              <p style="color: #6B7280; font-size: 14px; text-align: center; margin: 0;">
                Questions? Reply to this email or visit our 
                <a href="${baseUrl}" style="color: #8B5CF6; text-decoration: none;">Help Center</a>
              </p>
            </div>
          </div>
        `,
      },
      sponsorship_proposal: {
        subject: `New Sponsorship Proposal from ${data.brandName}`,
        html: `
          <p>Hi ${recipientName},</p>
          <p><strong>${data.brandName}</strong> has submitted a sponsorship proposal of <strong>$${data.sponsorshipAmount}</strong> for your campaign <strong>"${data.campaignTitle}"</strong>!</p>
          ${data.message ? `<p>Their message:</p><blockquote style="border-left: 4px solid #8B5CF6; padding-left: 16px; margin: 20px 0; color: #374151;">${data.message}</blockquote>` : ''}
          <p style="margin-top: 30px;">
            <a href="${baseUrl}/dashboard/business/sponsorships" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Review Proposal
            </a>
          </p>
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
          <p style="margin-top: 30px;">
            <a href="${baseUrl}/dashboard/brand/sponsorships" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Sponsorships
            </a>
          </p>
        `,
      },
      approval_pending: {
        subject: `Action Required: Creator Application Awaiting Your Approval`,
        html: `
          <p>Hi ${rn},</p>
          <p>A creator application for campaign <strong>"${data.campaignTitle}"</strong> has been approved by the ${data.party}.</p>
          <p><strong>Your approval is now required</strong> to finalize the collaboration.</p>
          <p style="margin-top: 30px;">
            <a href="${baseUrl}/dashboard/business/campaigns/${data.campaignId}" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Review Application
            </a>
          </p>
        `,
      },
      content_liked: {
        subject: `Someone liked your content! ❤️`,
        html: `
          <p>Hi ${rn},</p>
          <p>Great news! <strong>${data.likerName || 'A business client'}</strong> liked your content on DragonCandy!</p>
          <p>This is a great sign that your work is resonating with potential clients. Keep creating amazing content!</p>
          ${data.contentUrl ? `
            <p style="margin: 20px 0;">
              <img src="${data.contentUrl}" alt="Liked content" style="max-width: 300px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
            </p>
          ` : ''}
          <p style="margin-top: 30px;">
            <a href="${baseUrl}/dashboard/creator/dragon-feed" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              View Dragon Feed
            </a>
          </p>
          <p style="color: #6B7280; font-size: 14px; margin-top: 20px;">
            💡 <strong>Tip:</strong> Clients who like your content often reach out for collaborations. Make sure your profile is up to date!
          </p>
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
