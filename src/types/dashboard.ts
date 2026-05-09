export interface DashboardSummary {
  campaign_count: number;
  active_campaigns: number;
  active_collaborations: number;
  completed_collaborations: number;
  pending_applications: number;
  total_applications: number;
  avg_review_score: number;
  total_spent: number;
  monthly_data: Array<{ month: string; collaborations: number }>;
}
