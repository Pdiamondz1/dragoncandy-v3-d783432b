export interface OrchestratorInput {
  query: string;
  page_path: string;
  page_context?: Record<string, unknown>;
  user_role: string;
  org_id?: string;
  conversation_history?: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface OrchestratorOutput {
  answer: string;
  suggested_actions: Array<{ label: string; route: string }>;
  agent_used: string;
}

export interface CreatorCard {
  type: "creator_profile";
  data: {
    id: string;
    name: string;
    avatar_url: string | null;
    profile_slug: string | null;
    platforms: string[];
    niche: string;
    rating: number;
    project_count: number;
    distance_miles: number | null;
  };
}

export interface SubAgentResult {
  context: string;
  suggested_actions?: Array<{ label: string; route: string }>;
  cards?: CreatorCard[]; // NEW — only find_creators sets this
}

export interface UserContext {
  user_id: string;
  user_role: string;
  org_id?: string;
  org_tier?: string;
  full_name?: string;
}
