
export interface CampaignApplication {
  id: string;
  campaign_id: string;
  creator_id: string;
  intro_message?: string;
  proposed_timeline?: string;
  proposed_rate?: number;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
  brand_approval_status?: 'pending' | 'approved' | 'rejected';
  restaurant_approval_status?: 'pending' | 'approved' | 'rejected';
  final_approval_status?: 'pending' | 'approved' | 'rejected';
  // Joined data
  creator_profile?: {
    creator_name: string;
    avatar_url?: string;
    bio?: string;
    skills?: string[];
  };
  campaign?: {
    title: string;
    description?: string;
    user_id?: string;
    business_profile?: {
      business_name: string;
      logo_url?: string;
      location?: string;
      description?: string;
      user_id: string;
    };
  };
}
