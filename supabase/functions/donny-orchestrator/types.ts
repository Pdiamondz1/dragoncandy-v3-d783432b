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

export interface SubAgentResult {
  context: string;
  suggested_actions?: Array<{ label: string; route: string }>;
}

export interface UserContext {
  user_id: string;
  user_role: string;
  org_id?: string;
  org_tier?: string;
  full_name?: string;
}
