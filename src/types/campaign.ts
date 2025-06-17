
export interface CampaignAnalysis {
  title: string;
  description: string;
  target_audience: string;
  goals: string[];
  recommended_platforms: string[];
  content_types: string[];
  key_messages: string[];
  success_metrics: string[];
  budget_recommendations?: {
    min: number;
    max: number;
    reasoning: string;
  };
  timeline_recommendations?: {
    preparation: string;
    execution: string;
    analysis: string;
  };
}

export interface CampaignData {
  title: string;
  description: string;
  goals: string[];
  target_audience: string;
  platforms: string[];
  content_types: string[];
  key_messages: string[];
  timeline_recommendations?: {
    preparation: string;
    execution: string;
    analysis: string;
  };
  budget_recommendations?: {
    min: number;
    max: number;
    reasoning: string;
  };
}

export interface CampaignCustomizeFormProps {
  initialData: CampaignAnalysis;
  onContinue: (data: CampaignData) => void;
  onBackToAnalysis: () => void;
}
