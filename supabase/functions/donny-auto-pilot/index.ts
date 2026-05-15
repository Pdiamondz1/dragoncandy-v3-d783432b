import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { createOutstandMcpBridge } from "../_shared/outstand-mcp.ts";
import { getModelConfig } from "../_shared/model-routing.ts";
import { logCost } from "../_shared/cost-ledger.ts";
import { anthropicFetch } from "../_shared/anthropic-fetch.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  const cronSecret = req.headers.get('x-cron-secret');
  if (cronSecret !== Deno.env.get('CRON_SECRET')) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Find all users with Auto-Pilot enabled
  const { data: users, error } = await supabase
    .from("profiles")
    .select("id, full_name, org_id, role, donny_system_conversation_id")
    .eq("auto_pilot_enabled", true);

  if (error || !users || users.length === 0) {
    console.log("[donny-auto-pilot] No users with Auto-Pilot enabled");
    return new Response(JSON.stringify({ processed: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  let processed = 0;

  for (const user of users) {
    try {
      // Look up org tier
      let orgTier = "free";
      if (user.org_id) {
        const { data: org } = await supabase
          .from("organizations")
          .select("subscription_tier")
          .eq("id", user.org_id)
          .single();
        orgTier = org?.subscription_tier ?? "free";
      }

      // Growth+ only
      if (orgTier !== "growth" && orgTier !== "pro" && orgTier !== "enterprise") continue;

      const mcpBridge = await createOutstandMcpBridge({
        userId: user.id,
        userRole: user.role ?? "business",
        orgTier,
        supabase,
      });

      if (!mcpBridge) continue;

      // Fetch recent metrics
      const metricsResult = await mcpBridge.callTool("social_get_account_metrics", {});
      const analyticsResult = await mcpBridge.callTool("social_get_post_analytics", { days: 7 });

      const modelConfig = getModelConfig("social-analysis", "full_power");

      const response = await anthropicFetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: modelConfig.model,
          max_tokens: modelConfig.maxTokens,
          system: `You are Donny, DragonCandy's AI assistant. Generate 1-3 social media posts for today based on the user's recent performance data. For each post, include: platform, suggested time, caption text. Keep captions authentic and engaging. Return as JSON array: [{"platform":"instagram","time":"11:30 AM","caption":"..."}]`,
          messages: [{
            role: "user",
            content: `My account metrics: ${JSON.stringify(metricsResult)}\n\nRecent post analytics: ${JSON.stringify(analyticsResult)}\n\nGenerate today's posts.`,
          }],
        }),
      });

      if (!response.ok) {
        console.error(`[donny-auto-pilot] Claude API error for ${user.id}: ${response.status}`);
        mcpBridge.disconnect();
        continue;
      }

      const claudeResult = await response.json();
      await logCost(supabase, {
        userId: user.id,
        edgeFunction: "donny-auto-pilot",
        model: modelConfig.model,
        tier: modelConfig.tier,
        inputTokens: claudeResult.usage?.input_tokens ?? 0,
        outputTokens: claudeResult.usage?.output_tokens ?? 0,
      });

      const assistantText = (claudeResult.content as Array<{ type: string; text?: string }>)
        ?.filter((b: { type: string }) => b.type === "text")
        .map((b: { type: string; text?: string }) => b.text ?? "")
        .join("") ?? "";

      // Ensure system conversation exists
      let conversationId = user.donny_system_conversation_id;
      if (!conversationId) {
        const { data: conv } = await supabase
          .from("donny_conversations")
          .insert({ user_id: user.id, context_snapshot: { type: "system_digest" } })
          .select("id")
          .single();
        if (conv) {
          conversationId = conv.id;
          await supabase
            .from("profiles")
            .update({ donny_system_conversation_id: conv.id })
            .eq("id", user.id);
        }
      }

      if (conversationId) {
        await supabase.from("donny_messages").insert({
          conversation_id: conversationId,
          user_id: user.id,
          role: "assistant",
          content: assistantText,
          insight_type: "daily_digest",
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        });
      }

      mcpBridge.disconnect();
      processed++;
    } catch (err) {
      console.error(`[donny-auto-pilot] Error for user ${user.id}:`, err);
    }
  }

  console.log(`[donny-auto-pilot] Processed ${processed} users`);
  return new Response(JSON.stringify({ processed }), {
    headers: { "Content-Type": "application/json" },
  });
});
