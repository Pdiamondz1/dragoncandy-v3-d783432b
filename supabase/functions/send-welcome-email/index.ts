import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface WelcomeEmailRequest {
  email: string;
  name: string;
  role: 'business_client' | 'content_creator' | 'brand';
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, name, role }: WelcomeEmailRequest = await req.json();

    console.log('Sending welcome email to:', email, 'Role:', role);

    // Role-specific content
    const roleContent = {
      business_client: {
        subject: "Welcome to DragonCandy - Start Your First Campaign! 🎯",
        nextSteps: `
          <h2 style="color: #8B5CF6; margin-top: 30px;">Get Started with DragonCandy</h2>
          <ol style="color: #374151; line-height: 1.8;">
            <li><strong>Complete your business profile</strong> - Add your business details, logo, and social links</li>
            <li><strong>Create your first campaign</strong> - Use our wizard to define your campaign goals and deliverables</li>
            <li><strong>Browse creators</strong> - Find talented content creators who match your brand</li>
            <li><strong>Launch and collaborate</strong> - Work directly with creators to bring your vision to life</li>
          </ol>
          <p style="margin-top: 20px;">
            <a href="https://${Deno.env.get('SUPABASE_URL')?.replace('https://', '')}/business-profile-setup" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Complete Your Profile
            </a>
          </p>
        `,
      },
      content_creator: {
        subject: "Welcome to DragonCandy - Find Your Next Project! ✨",
        nextSteps: `
          <h2 style="color: #8B5CF6; margin-top: 30px;">Get Started with DragonCandy</h2>
          <ol style="color: #374151; line-height: 1.8;">
            <li><strong>Complete your creator profile</strong> - Showcase your skills, portfolio, and experience</li>
            <li><strong>Browse campaign marketplace</strong> - Discover campaigns that match your expertise</li>
            <li><strong>Apply to campaigns</strong> - Submit proposals and connect with businesses</li>
            <li><strong>Create amazing content</strong> - Get paid for doing what you love</li>
          </ol>
          <p style="margin-top: 20px;">
            <a href="https://${Deno.env.get('SUPABASE_URL')?.replace('https://', '')}/creator-profile-setup" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Complete Your Profile
            </a>
          </p>
        `,
      },
      brand: {
        subject: "Welcome to DragonCandy - Sponsor Amazing Campaigns! 🎨",
        nextSteps: `
          <h2 style="color: #8B5CF6; margin-top: 30px;">Get Started with DragonCandy</h2>
          <ol style="color: #374151; line-height: 1.8;">
            <li><strong>Complete your brand profile</strong> - Showcase your brand and marketing objectives</li>
            <li><strong>Discover campaigns</strong> - Find restaurant campaigns that align with your brand</li>
            <li><strong>Submit sponsorship proposals</strong> - Partner with restaurants and creators</li>
            <li><strong>Amplify your reach</strong> - Get your brand in front of engaged audiences</li>
          </ol>
          <p style="margin-top: 20px;">
            <a href="https://${Deno.env.get('SUPABASE_URL')?.replace('https://', '')}/brand-profile-setup" 
               style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; display: inline-block;">
              Complete Your Profile
            </a>
          </p>
        `,
      },
    };

    const content = roleContent[role] || roleContent.content_creator;

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
                  <!-- Header with gradient -->
                  <tr>
                    <td style="background: linear-gradient(135deg, #EC4899 0%, #8B5CF6 100%); padding: 40px 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
                      <h1 style="color: white; margin: 0; font-size: 32px; font-weight: bold;">
                        Welcome to DragonCandy! 🎉
                      </h1>
                    </td>
                  </tr>
                  
                  <!-- Main content -->
                  <tr>
                    <td style="padding: 40px;">
                      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                        Hi ${name},
                      </p>
                      
                      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                        Thank you for joining DragonCandy - the AI-powered marketplace connecting businesses, brands, and content creators! 🚀
                      </p>
                      
                      <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                        We're excited to have you on board. Let's get you started on your journey!
                      </p>
                      
                      ${content.nextSteps}
                      
                      <div style="margin-top: 40px; padding-top: 30px; border-top: 1px solid #E5E7EB;">
                        <h3 style="color: #8B5CF6; margin: 0 0 15px;">Need Help?</h3>
                        <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0;">
                          Our support team is here to help you succeed. If you have any questions or need assistance, don't hesitate to reach out.
                        </p>
                      </div>
                    </td>
                  </tr>
                  
                  <!-- Footer -->
                  <tr>
                    <td style="background-color: #F9FAFB; padding: 30px 40px; border-radius: 0 0 12px 12px; text-align: center;">
                      <p style="color: #6B7280; font-size: 14px; margin: 0 0 10px;">
                        Happy creating!<br>
                        <strong style="color: #8B5CF6;">The DragonCandy Team</strong>
                      </p>
                      <p style="color: #9CA3AF; font-size: 12px; margin: 15px 0 0;">
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

    const { data, error } = await resend.emails.send({
      from: "DragonCandy <welcome@notify.dragoncandy.io>",
      to: [email],
      subject: content.subject,
      html: emailHtml,
    });

    if (error) {
      console.error("Resend API error:", error);
      throw error;
    }

    console.log("Welcome email sent successfully:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-welcome-email function:", error);
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
