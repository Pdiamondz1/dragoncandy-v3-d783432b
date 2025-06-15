export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      business_profiles: {
        Row: {
          business_name: string
          created_at: string | null
          description: string | null
          facebook_url: string | null
          id: string
          industry: Database["public"]["Enums"]["industry_type"] | null
          instagram_url: string | null
          is_completed: boolean | null
          linkedin_url: string | null
          location: string | null
          logo_url: string | null
          other_social_url: string | null
          sample_content_urls: string[] | null
          tiktok_url: string | null
          updated_at: string | null
          user_id: string
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          business_name: string
          created_at?: string | null
          description?: string | null
          facebook_url?: string | null
          id?: string
          industry?: Database["public"]["Enums"]["industry_type"] | null
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          other_social_url?: string | null
          sample_content_urls?: string[] | null
          tiktok_url?: string | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string | null
          description?: string | null
          facebook_url?: string | null
          id?: string
          industry?: Database["public"]["Enums"]["industry_type"] | null
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          other_social_url?: string | null
          sample_content_urls?: string[] | null
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      creator_profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          base_rate_per_hour: number | null
          bio: string | null
          created_at: string | null
          creator_name: string
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_completed: boolean | null
          linkedin_url: string | null
          location: string | null
          other_social_url: string | null
          portfolio_urls: string[] | null
          skills: Database["public"]["Enums"]["creator_skill"][] | null
          tiktok_url: string | null
          updated_at: string | null
          user_id: string
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          base_rate_per_hour?: number | null
          bio?: string | null
          created_at?: string | null
          creator_name: string
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          other_social_url?: string | null
          portfolio_urls?: string[] | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
          tiktok_url?: string | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          base_rate_per_hour?: number | null
          bio?: string | null
          created_at?: string | null
          creator_name?: string
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          other_social_url?: string | null
          portfolio_urls?: string[] | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
          tiktok_url?: string | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      creator_skill:
        | "video_editing"
        | "ugc_creation"
        | "illustration"
        | "photography"
        | "copywriting"
        | "social_media_management"
        | "graphic_design"
        | "animation"
        | "influencer_marketing"
        | "content_strategy"
        | "other"
      industry_type:
        | "technology"
        | "fashion"
        | "beauty"
        | "fitness"
        | "food"
        | "travel"
        | "lifestyle"
        | "business"
        | "education"
        | "entertainment"
        | "health"
        | "automotive"
        | "real_estate"
        | "finance"
        | "other"
      user_role: "business_client" | "content_creator"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      creator_skill: [
        "video_editing",
        "ugc_creation",
        "illustration",
        "photography",
        "copywriting",
        "social_media_management",
        "graphic_design",
        "animation",
        "influencer_marketing",
        "content_strategy",
        "other",
      ],
      industry_type: [
        "technology",
        "fashion",
        "beauty",
        "fitness",
        "food",
        "travel",
        "lifestyle",
        "business",
        "education",
        "entertainment",
        "health",
        "automotive",
        "real_estate",
        "finance",
        "other",
      ],
      user_role: ["business_client", "content_creator"],
    },
  },
} as const
