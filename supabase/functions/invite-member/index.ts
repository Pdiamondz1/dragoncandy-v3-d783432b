import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get("Authorization")!;
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const { org_id, email, role } = await req.json();

    if (!org_id || !email || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: org_id, email, role" }),
        { status: 400, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // Verify caller is owner or admin of the org
    const { data: callerMembership } = await supabase
      .from("org_members")
      .select("role")
      .eq("org_id", org_id)
      .eq("user_id", caller.id)
      .eq("invitation_status", "active")
      .single();

    if (!callerMembership || !["owner", "admin"].includes(callerMembership.role)) {
      return new Response(JSON.stringify({ error: "Insufficient permissions" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Admin cannot assign owner role
    if (callerMembership.role === "admin" && role === "owner") {
      return new Response(JSON.stringify({ error: "Admins cannot assign owner role" }), {
        status: 403,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // Check if user already exists by email in profiles
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();

    if (existingProfile) {
      const { data: existingMember } = await supabase
        .from("org_members")
        .select("id, invitation_status")
        .eq("org_id", org_id)
        .eq("user_id", existingProfile.id)
        .maybeSingle();

      if (existingMember?.invitation_status === "active") {
        return new Response(JSON.stringify({ status: "already_member" }), {
          status: 200,
          headers: { ...corsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Existing user: create or reactivate membership
      const now = new Date().toISOString();
      if (existingMember) {
        await supabase
          .from("org_members")
          .update({ invitation_status: "invited", role, invited_by: caller.id, invited_at: now })
          .eq("id", existingMember.id);
      } else {
        await supabase.from("org_members").insert({
          org_id,
          user_id: existingProfile.id,
          role,
          invited_by: caller.id,
          invitation_status: "invited",
          invited_at: now,
        });
      }

      // Get org name for the email
      const { data: org } = await supabase
        .from("organizations")
        .select("name")
        .eq("id", org_id)
        .single();

      const orgName = org?.name ?? "a team";

      // Send notification email — failure should not block the invite
      try {
        await supabase.functions.invoke("send-notification-email", {
          body: {
            to: email,
            type: "org_invite",
            data: { orgName, role, orgId: org_id, inviteeId: existingProfile.id },
          },
        });
      } catch (emailErr) {
        console.error("Failed to send invitation email:", emailErr);
      }

      return new Response(JSON.stringify({ status: "sent" }), {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    } else {
      // New user: send magic link with org context
      const { error: inviteError } = await supabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `https://dragoncandy.io/invite/accept?org=${org_id}&role=${role}&invited_by=${caller.id}`,
      });

      if (inviteError) {
        return new Response(
          JSON.stringify({ status: "failed", error: inviteError.message }),
          { status: 500, headers: { ...corsHeaders(req), "Content-Type": "application/json" } },
        );
      }

      return new Response(JSON.stringify({ status: "sent" }), {
        status: 200,
        headers: { ...corsHeaders(req), "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("invite-member error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
