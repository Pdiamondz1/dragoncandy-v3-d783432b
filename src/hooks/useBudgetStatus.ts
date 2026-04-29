import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface BudgetStatus {
  budgetMax: number;
  budgetSpent: number;
  budgetRemaining: number;
  creatorCount: number | null;
  activeCreators: number;
  perCreatorCap: number | null;
}

export function useBudgetStatus(campaignId: string | undefined) {
  return useQuery({
    queryKey: ["budget-status", campaignId],
    queryFn: async (): Promise<BudgetStatus> => {
      const { data: campaign, error } = await supabase
        .from("campaigns")
        .select("budget_max, fixed_price, pricing_type, ai_analysis")
        .eq("id", campaignId!)
        .single();

      if (error || !campaign) throw error || new Error("Campaign not found");

      const ai = campaign.ai_analysis as Record<string, unknown> | null;
      const budgetMax = campaign.budget_max || campaign.fixed_price || 0;

      const { count } = await supabase
        .from("campaign_collaborations")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId!)
        .eq("status", "active");

      return {
        budgetMax,
        budgetSpent: 0,
        budgetRemaining: budgetMax,
        creatorCount: (ai?.creator_count as number) ?? null,
        activeCreators: count || 0,
        perCreatorCap: (ai?.per_creator_cap as number) ?? null,
      };
    },
    enabled: !!campaignId,
  });
}
