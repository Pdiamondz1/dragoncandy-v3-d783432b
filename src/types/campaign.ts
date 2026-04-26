
export interface ContentIdea {
  concept: string;
  format: string;
  description: string;
  estimated_duration?: string;
}

export interface PostingScheduleEntry {
  platform: string;
  frequency: string;
  best_times: string;
  content_mix: string;
}

export interface CampaignAnalysis {
  title?: string;
  description?: string;
  target_audience?: string;
  goals?: string[];
  recommended_platforms?: string[];
  content_types?: string[];
  key_messages?: string[];
  success_metrics?: string[];
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
  // Creative Brief fields (AI-generated)
  content_ideas?: ContentIdea[];
  hashtags?: string[];
  captions?: string[];
  posting_schedule?: PostingScheduleEntry[];
  style_direction?: {
    visual_style: string;
    mood: string;
    color_palette: string;
    references: string;
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
