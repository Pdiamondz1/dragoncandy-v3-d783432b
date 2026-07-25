// The real-flow marketplace writes the crew-lane behavior engine (../behavior/actions.ts) does NOT
// cover: messaging, DragonFeed posts, and discounts/promotions. Each performs ONE real write AS THE
// BOT (a JWT-scoped client, real RLS), mirroring the app's own hooks:
//   • sendMessage        → useCreateDirectConversation (RPC) + useSendMessage (messages insert)
//   • postDragonFeed     → useSubmitDragonSharePost (dragonshare_posts insert; status 'verified')
//   • createDiscount     → usePromotions.createPromotion (promotions insert; user_id = auth.uid)
// Verified signatures (prod 2026-07-25): create_or_get_direct_conversation(user1_uuid,user2_uuid,
// p_org_unit_id DEFAULT NULL) RETURNS uuid; messages/dragonshare_posts/promotions RLS all with_check
// on auth.uid ownership.
import type { SupabaseClient } from "@supabase/supabase-js";

function orThrow(label: string, error: { message: string } | null): void {
  if (error) throw new Error(`${label}: ${error.message}`);
}

export async function sendMessage(
  bizClient: SupabaseClient,
  p: { bizId: string; creatorId: string; content: string; campaignId?: string; orgUnitId?: string },
): Promise<string> {
  const { data: convId, error: convErr } = await bizClient.rpc("create_or_get_direct_conversation", {
    user1_uuid: p.bizId,
    user2_uuid: p.creatorId,
    p_org_unit_id: p.orgUnitId ?? null,
  });
  orThrow("sendMessage (conversation)", convErr as { message: string } | null);
  const conversationId = convId as string;
  if (!conversationId) throw new Error("sendMessage: create_or_get_direct_conversation returned no id");
  const { error: msgErr } = await bizClient.from("messages").insert({
    conversation_id: conversationId,
    campaign_id: p.campaignId ?? null,
    sender_id: p.bizId,
    recipient_id: p.creatorId,
    content: p.content,
  });
  orThrow("sendMessage (message)", msgErr);
  return conversationId;
}

export async function postDragonFeed(
  creatorClient: SupabaseClient,
  p: { creatorId: string; targetOrgId: string; contentType: string; contentFilePath: string; caption: string; platform?: string },
): Promise<void> {
  const { error } = await creatorClient.from("dragonshare_posts").insert({
    creator_id: p.creatorId,
    target_org_id: p.targetOrgId,
    content_type: p.contentType, // photo|video|reel|story|carousel
    content_file_path: p.contentFilePath,
    platform: p.platform ?? null, // nullable for direct uploads
    caption: p.caption,
    status: "verified", // trust-then-flag (matches the app default)
    boost_status: "available",
  });
  orThrow("postDragonFeed", error);
}

export async function createDiscount(
  bizClient: SupabaseClient,
  p: {
    userId: string; businessId: string; title: string; discountType: string; discountValue: number;
    startDate: string; endDate: string; status?: string;
  },
): Promise<string> {
  const { data, error } = await bizClient
    .from("promotions")
    .insert({
      user_id: p.userId,
      business_id: p.businessId,
      title: p.title,
      discount_type: p.discountType,
      discount_value: p.discountValue,
      start_date: p.startDate,
      end_date: p.endDate,
      status: p.status ?? "active", // active + in-window → browsable AND CGC-submittable
    })
    .select("id")
    .single();
  orThrow("createDiscount", error);
  const id = (data as { id: string } | null)?.id;
  if (!id) throw new Error("createDiscount: promotions insert returned no id");
  return id;
}
