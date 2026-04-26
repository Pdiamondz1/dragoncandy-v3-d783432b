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
        .select("budget_max, fixed_price, pricing_type, budget_spent, creator_count, per_creator_cap")
        .eq("id", campaignId!)
        .single();

      if (error || !campaign) throw error || new Error("Campaign not found");

      const budgetMax = campaign.budget_max || campaign.fixed_price || 0;
      const budgetSpent = campaign.budget_spent || 0;

      const { count } = await supabase
        .from("campaign_collaborations")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", campaignId!)
        .eq("status", "active");

      return {
        budgetMax,
        budgetSpent,
        budgetRemaining: budgetMax - budgetSpent,
        creatorCount: campaign.creator_count,
        activeCreators: count || 0,
        perCreatorCap: campaign.per_creator_cap,
      };
    },
    enabled: !!campaignId,
  });
}
