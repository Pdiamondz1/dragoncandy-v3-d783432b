export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      account_deletion_requests: {
        Row: {
          created_at: string
          hard_purge_scheduled_at: string | null
          hard_purged_at: string | null
          id: string
          notes: string | null
          reason_code: string | null
          requested_by: string | null
          restored_at: string | null
          soft_deleted_at: string | null
          status: string
          target_id: string
          target_type: string
        }
        Insert: {
          created_at?: string
          hard_purge_scheduled_at?: string | null
          hard_purged_at?: string | null
          id?: string
          notes?: string | null
          reason_code?: string | null
          requested_by?: string | null
          restored_at?: string | null
          soft_deleted_at?: string | null
          status?: string
          target_id: string
          target_type: string
        }
        Update: {
          created_at?: string
          hard_purge_scheduled_at?: string | null
          hard_purged_at?: string | null
          id?: string
          notes?: string | null
          reason_code?: string | null
          requested_by?: string | null
          restored_at?: string | null
          soft_deleted_at?: string | null
          status?: string
          target_id?: string
          target_type?: string
        }
        Relationships: []
      }
      analytics_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          org_unit_id: string | null
          page_url: string | null
          session_id: string | null
          updated_at: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          org_unit_id?: string | null
          page_url?: string | null
          session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          org_unit_id?: string | null
          page_url?: string | null
          session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      application_counter_offers: {
        Row: {
          application_id: string
          created_at: string
          id: string
          message: string
          proposed_rate: number | null
          proposed_timeline: string | null
          sender_id: string
          sender_role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          message: string
          proposed_rate?: number | null
          proposed_timeline?: string | null
          sender_id: string
          sender_role: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          message?: string
          proposed_rate?: number | null
          proposed_timeline?: string | null
          sender_id?: string
          sender_role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_counter_offers_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
          browser_info: string | null
          created_at: string
          description: string
          feature_name: string
          feedback_type: string
          id: string
          page_url: string | null
          priority: string
          title: string
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          browser_info?: string | null
          created_at?: string
          description: string
          feature_name: string
          feedback_type: string
          id?: string
          page_url?: string | null
          priority?: string
          title: string
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          browser_info?: string | null
          created_at?: string
          description?: string
          feature_name?: string
          feedback_type?: string
          id?: string
          page_url?: string | null
          priority?: string
          title?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brand_shortlists: {
        Row: {
          brand_id: string
          created_at: string
          creator_id: string
          id: string
          notes: string | null
        }
        Insert: {
          brand_id: string
          created_at?: string
          creator_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          brand_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "brand_shortlists_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_shortlists_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_shortlists_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_shortlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_shortlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brand_shortlists_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_contexts: {
        Row: {
          expires_at: string
          extracted_at: string
          extracted_data: Json
          id: string
          profile_id: string | null
          source_type: string
          source_url: string
        }
        Insert: {
          expires_at?: string
          extracted_at?: string
          extracted_data: Json
          id?: string
          profile_id?: string | null
          source_type: string
          source_url: string
        }
        Update: {
          expires_at?: string
          extracted_at?: string
          extracted_data?: Json
          id?: string
          profile_id?: string | null
          source_type?: string
          source_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_contexts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_contexts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_contexts_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      business_outstand_accounts: {
        Row: {
          business_id: string | null
          connected_at: string
          created_at: string
          id: string
          last_seen_at: string | null
          org_unit_id: string | null
          outstand_social_account_id: string
          platform: string
          platform_handle: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          business_id?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          org_unit_id?: string | null
          outstand_social_account_id: string
          platform: string
          platform_handle?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          business_id?: string | null
          connected_at?: string
          created_at?: string
          id?: string
          last_seen_at?: string | null
          org_unit_id?: string | null
          outstand_social_account_id?: string
          platform?: string
          platform_handle?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_outstand_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_outstand_accounts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "business_outstand_accounts_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      business_profiles: {
        Row: {
          account_type: string | null
          average_rating: number | null
          brand_category: string | null
          brand_social_guidelines: Json | null
          budget_range: string | null
          business_name: string
          cgc_posting_preferences: Json | null
          city: string | null
          company_size: string | null
          country: string | null
          created_at: string | null
          description: string | null
          disconnected_stripe_account_id: string | null
          employee_count_range: string | null
          facebook_url: string | null
          founded_year: number | null
          id: string
          industry: Database["public"]["Enums"]["industry_type"] | null
          instagram_url: string | null
          is_completed: boolean | null
          linkedin_url: string | null
          location: string | null
          logo_url: string | null
          marketing_objectives: string | null
          other_social_url: string | null
          pending_balance: number | null
          postal_code: string | null
          preferred_collaboration_style: string | null
          profile_slug: string | null
          profile_visibility: string | null
          sample_content_urls: string[] | null
          sponsorship_budget: number | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          tiktok_url: string | null
          timezone: string | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          account_type?: string | null
          average_rating?: number | null
          brand_category?: string | null
          brand_social_guidelines?: Json | null
          budget_range?: string | null
          business_name: string
          cgc_posting_preferences?: Json | null
          city?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          disconnected_stripe_account_id?: string | null
          employee_count_range?: string | null
          facebook_url?: string | null
          founded_year?: number | null
          id?: string
          industry?: Database["public"]["Enums"]["industry_type"] | null
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          marketing_objectives?: string | null
          other_social_url?: string | null
          pending_balance?: number | null
          postal_code?: string | null
          preferred_collaboration_style?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          sample_content_urls?: string[] | null
          sponsorship_budget?: number | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          account_type?: string | null
          average_rating?: number | null
          brand_category?: string | null
          brand_social_guidelines?: Json | null
          budget_range?: string | null
          business_name?: string
          cgc_posting_preferences?: Json | null
          city?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          disconnected_stripe_account_id?: string | null
          employee_count_range?: string | null
          facebook_url?: string | null
          founded_year?: number | null
          id?: string
          industry?: Database["public"]["Enums"]["industry_type"] | null
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          marketing_objectives?: string | null
          other_social_url?: string | null
          pending_balance?: number | null
          postal_code?: string | null
          preferred_collaboration_style?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          sample_content_urls?: string[] | null
          sponsorship_budget?: number | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      campaign_applications: {
        Row: {
          agreed_rate: number | null
          brand_approval_status: string | null
          campaign_id: string
          created_at: string
          creator_id: string
          final_approval_status: string | null
          id: string
          intro_message: string | null
          org_id: string | null
          portfolio_url: string | null
          proposed_rate: number | null
          proposed_timeline: string | null
          rejection_reason: string | null
          restaurant_approval_status: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          agreed_rate?: number | null
          brand_approval_status?: string | null
          campaign_id: string
          created_at?: string
          creator_id: string
          final_approval_status?: string | null
          id?: string
          intro_message?: string | null
          org_id?: string | null
          portfolio_url?: string | null
          proposed_rate?: number | null
          proposed_timeline?: string | null
          rejection_reason?: string | null
          restaurant_approval_status?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          agreed_rate?: number | null
          brand_approval_status?: string | null
          campaign_id?: string
          created_at?: string
          creator_id?: string
          final_approval_status?: string | null
          id?: string
          intro_message?: string | null
          org_id?: string | null
          portfolio_url?: string | null
          proposed_rate?: number | null
          proposed_timeline?: string | null
          rejection_reason?: string | null
          restaurant_approval_status?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_applications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_applications_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_brief_generations: {
        Row: {
          brief_jsonb: Json | null
          generated_at: string
          id: string
          ip_address: unknown
          org_id: string | null
          source_url: string | null
          user_id: string | null
        }
        Insert: {
          brief_jsonb?: Json | null
          generated_at?: string
          id?: string
          ip_address?: unknown
          org_id?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Update: {
          brief_jsonb?: Json | null
          generated_at?: string
          id?: string
          ip_address?: unknown
          org_id?: string | null
          source_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_brief_generations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_brief_generations_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_collaborations: {
        Row: {
          application_id: string | null
          business_completion_status: string | null
          campaign_id: string
          completed_at: string | null
          content_deadline: string | null
          content_started_at: string | null
          content_status: string | null
          contract_details: Json | null
          created_at: string
          creator_completion_status: string | null
          creator_id: string
          deliverables_status: Json | null
          dispute_outcome: string | null
          dispute_reason: string | null
          id: string
          milestones: Json | null
          review_extended: boolean | null
          review_status: string | null
          revision_count: number | null
          revision_feedback: Json | null
          status: Database["public"]["Enums"]["collaboration_status"]
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          business_completion_status?: string | null
          campaign_id: string
          completed_at?: string | null
          content_deadline?: string | null
          content_started_at?: string | null
          content_status?: string | null
          contract_details?: Json | null
          created_at?: string
          creator_completion_status?: string | null
          creator_id: string
          deliverables_status?: Json | null
          dispute_outcome?: string | null
          dispute_reason?: string | null
          id?: string
          milestones?: Json | null
          review_extended?: boolean | null
          review_status?: string | null
          revision_count?: number | null
          revision_feedback?: Json | null
          status?: Database["public"]["Enums"]["collaboration_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          business_completion_status?: string | null
          campaign_id?: string
          completed_at?: string | null
          content_deadline?: string | null
          content_started_at?: string | null
          content_status?: string | null
          contract_details?: Json | null
          created_at?: string
          creator_completion_status?: string | null
          creator_id?: string
          deliverables_status?: Json | null
          dispute_outcome?: string | null
          dispute_reason?: string | null
          id?: string
          milestones?: Json | null
          review_extended?: boolean | null
          review_status?: string | null
          revision_count?: number | null
          revision_feedback?: Json | null
          status?: Database["public"]["Enums"]["collaboration_status"]
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_collaborations_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "campaign_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_collaborations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_collaborations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_deliverables: {
        Row: {
          aspect_ratio: string | null
          campaign_id: string
          content_type: string
          created_at: string | null
          description: string | null
          id: string
          max_duration_seconds: number | null
          platform: string
          sort_order: number | null
          status: string | null
          updated_at: string | null
        }
        Insert: {
          aspect_ratio?: string | null
          campaign_id: string
          content_type: string
          created_at?: string | null
          description?: string | null
          id?: string
          max_duration_seconds?: number | null
          platform: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Update: {
          aspect_ratio?: string | null
          campaign_id?: string
          content_type?: string
          created_at?: string | null
          description?: string | null
          id?: string
          max_duration_seconds?: number | null
          platform?: string
          sort_order?: number | null
          status?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_deliverables_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invitations: {
        Row: {
          campaign_id: string
          created_at: string
          creator_id: string
          expires_at: string | null
          id: string
          invitation_message: string | null
          invited_by: string
          status: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          creator_id: string
          expires_at?: string | null
          id?: string
          invitation_message?: string | null
          invited_by: string
          status?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          creator_id?: string
          expires_at?: string | null
          id?: string
          invitation_message?: string | null
          invited_by?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_invitations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_matches: {
        Row: {
          ai_analysis: string | null
          campaign_id: string
          created_at: string
          creator_id: string
          id: string
          match_reasons: Json | null
          match_score: number
        }
        Insert: {
          ai_analysis?: string | null
          campaign_id: string
          created_at?: string
          creator_id: string
          id?: string
          match_reasons?: Json | null
          match_score: number
        }
        Update: {
          ai_analysis?: string | null
          campaign_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          match_reasons?: Json | null
          match_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "campaign_matches_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_matches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_matches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_matches_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_media: {
        Row: {
          ai_analysis: Json | null
          campaign_id: string
          created_at: string | null
          duration_seconds: number | null
          file_name: string
          file_size_bytes: number | null
          file_url: string
          id: string
          media_type: string
          mime_type: string | null
          sort_order: number | null
          thumbnail_url: string | null
          updated_at: string | null
          uploaded_by: string
        }
        Insert: {
          ai_analysis?: Json | null
          campaign_id: string
          created_at?: string | null
          duration_seconds?: number | null
          file_name: string
          file_size_bytes?: number | null
          file_url: string
          id?: string
          media_type: string
          mime_type?: string | null
          sort_order?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uploaded_by: string
        }
        Update: {
          ai_analysis?: Json | null
          campaign_id?: string
          created_at?: string | null
          duration_seconds?: number | null
          file_name?: string
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          media_type?: string
          mime_type?: string | null
          sort_order?: number | null
          thumbnail_url?: string | null
          updated_at?: string | null
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_media_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_media_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_skips: {
        Row: {
          campaign_id: string
          id: string
          restored: boolean
          skipped_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          id?: string
          restored?: boolean
          skipped_at?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          id?: string
          restored?: boolean
          skipped_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_skips_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_skips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_skips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_skips_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_social_hooks: {
        Row: {
          acted_at: string | null
          campaign_id: string
          content_template: string | null
          created_at: string | null
          deliverable_id: string | null
          id: string
          party_role: string
          prompted_at: string | null
          stage: number
          status: string
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          campaign_id: string
          content_template?: string | null
          created_at?: string | null
          deliverable_id?: string | null
          id?: string
          party_role: string
          prompted_at?: string | null
          stage: number
          status?: string
          user_id: string
        }
        Update: {
          acted_at?: string | null
          campaign_id?: string
          content_template?: string | null
          created_at?: string | null
          deliverable_id?: string | null
          id?: string
          party_role?: string
          prompted_at?: string | null
          stage?: number
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_social_hooks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_social_hooks_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sponsorships: {
        Row: {
          brand_completion_status: string | null
          brand_id: string
          business_completion_status: string | null
          campaign_id: string
          completed_at: string | null
          created_at: string
          id: string
          payment_date: string | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_status: string | null
          proposal_message: string | null
          restaurant_id: string
          review_status: string | null
          sponsorship_amount: number | null
          status: string
          terms: Json | null
          updated_at: string
        }
        Insert: {
          brand_completion_status?: string | null
          brand_id: string
          business_completion_status?: string | null
          campaign_id: string
          completed_at?: string | null
          created_at?: string
          id?: string
          payment_date?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          proposal_message?: string | null
          restaurant_id: string
          review_status?: string | null
          sponsorship_amount?: number | null
          status?: string
          terms?: Json | null
          updated_at?: string
        }
        Update: {
          brand_completion_status?: string | null
          brand_id?: string
          business_completion_status?: string | null
          campaign_id?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          payment_date?: string | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_status?: string | null
          proposal_message?: string | null
          restaurant_id?: string
          review_status?: string | null
          sponsorship_amount?: number | null
          status?: string
          terms?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sponsorships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sponsorships_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "public_business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sponsorships_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sponsorships_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sponsorships_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "public_business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          category: string
          created_at: string
          description: string
          display_order: number
          id: string
          is_active: boolean
          template_data: Json
          title: string
        }
        Insert: {
          category: string
          created_at?: string
          description: string
          display_order?: number
          id?: string
          is_active?: boolean
          template_data?: Json
          title: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          is_active?: boolean
          template_data?: Json
          title?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ai_analysis: Json | null
          ai_preview_prompt: string | null
          ai_preview_status: string | null
          budget_max: number | null
          budget_min: number | null
          campaign_deliverables: Json | null
          campaign_media: Json | null
          content_source: string | null
          created_at: string
          deadline: string | null
          deliverables: string[] | null
          delivery_fee: number | null
          delivery_tier: string | null
          delivery_type: string | null
          description: string | null
          duplicated_from: string | null
          escrow_checkout_session_id: string | null
          escrow_payment_intent_id: string | null
          escrow_status: string | null
          estimated_creation_minutes: number | null
          fixed_price: number | null
          goals: string | null
          id: string
          open_for_sponsorship: boolean | null
          org_id: string | null
          org_unit_id: string | null
          platforms: string[] | null
          posting_preferences: Json | null
          posting_schedule_status: string | null
          pricing_type: string | null
          status: Database["public"]["Enums"]["campaign_status"]
          style: string | null
          title: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_analysis?: Json | null
          ai_preview_prompt?: string | null
          ai_preview_status?: string | null
          budget_max?: number | null
          budget_min?: number | null
          campaign_deliverables?: Json | null
          campaign_media?: Json | null
          content_source?: string | null
          created_at?: string
          deadline?: string | null
          deliverables?: string[] | null
          delivery_fee?: number | null
          delivery_tier?: string | null
          delivery_type?: string | null
          description?: string | null
          duplicated_from?: string | null
          escrow_checkout_session_id?: string | null
          escrow_payment_intent_id?: string | null
          escrow_status?: string | null
          estimated_creation_minutes?: number | null
          fixed_price?: number | null
          goals?: string | null
          id?: string
          open_for_sponsorship?: boolean | null
          org_id?: string | null
          org_unit_id?: string | null
          platforms?: string[] | null
          posting_preferences?: Json | null
          posting_schedule_status?: string | null
          pricing_type?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          style?: string | null
          title: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_analysis?: Json | null
          ai_preview_prompt?: string | null
          ai_preview_status?: string | null
          budget_max?: number | null
          budget_min?: number | null
          campaign_deliverables?: Json | null
          campaign_media?: Json | null
          content_source?: string | null
          created_at?: string
          deadline?: string | null
          deliverables?: string[] | null
          delivery_fee?: number | null
          delivery_tier?: string | null
          delivery_type?: string | null
          description?: string | null
          duplicated_from?: string | null
          escrow_checkout_session_id?: string | null
          escrow_payment_intent_id?: string | null
          escrow_status?: string | null
          estimated_creation_minutes?: number | null
          fixed_price?: number | null
          goals?: string | null
          id?: string
          open_for_sponsorship?: boolean | null
          org_id?: string | null
          org_unit_id?: string | null
          platforms?: string[] | null
          posting_preferences?: Json | null
          posting_schedule_status?: string | null
          pricing_type?: string | null
          status?: Database["public"]["Enums"]["campaign_status"]
          style?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_duplicated_from_fkey"
            columns: ["duplicated_from"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_briefs: {
        Row: {
          brief: Json
          context_snapshot: Json
          created_at: string
          creator_id: string
          id: string
          model: string | null
          organization_id: string
          social_post_log_id: string | null
          used_performance_data: boolean
        }
        Insert: {
          brief: Json
          context_snapshot?: Json
          created_at?: string
          creator_id: string
          id?: string
          model?: string | null
          organization_id: string
          social_post_log_id?: string | null
          used_performance_data?: boolean
        }
        Update: {
          brief?: Json
          context_snapshot?: Json
          created_at?: string
          creator_id?: string
          id?: string
          model?: string | null
          organization_id?: string
          social_post_log_id?: string | null
          used_performance_data?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "content_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_briefs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_briefs_social_post_log_id_fkey"
            columns: ["social_post_log_id"]
            isOneToOne: false
            referencedRelation: "social_post_log"
            referencedColumns: ["id"]
          },
        ]
      }
      content_performance: {
        Row: {
          campaign_id: string | null
          captured_at: string
          comments: number | null
          engagement_rate: number | null
          id: string
          is_settled: boolean
          likes: number | null
          milestone: string
          outstand_post_id: string
          platform: string
          post_type: string
          raw: Json
          reach: number | null
          saves: number | null
          shares: number | null
          social_post_log_id: string | null
          source_brief_id: string | null
          user_id: string
          views: number | null
        }
        Insert: {
          campaign_id?: string | null
          captured_at?: string
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          is_settled?: boolean
          likes?: number | null
          milestone: string
          outstand_post_id: string
          platform: string
          post_type: string
          raw?: Json
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_post_log_id?: string | null
          source_brief_id?: string | null
          user_id: string
          views?: number | null
        }
        Update: {
          campaign_id?: string | null
          captured_at?: string
          comments?: number | null
          engagement_rate?: number | null
          id?: string
          is_settled?: boolean
          likes?: number | null
          milestone?: string
          outstand_post_id?: string
          platform?: string
          post_type?: string
          raw?: Json
          reach?: number | null
          saves?: number | null
          shares?: number | null
          social_post_log_id?: string | null
          source_brief_id?: string | null
          user_id?: string
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "content_performance_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_performance_social_post_log_id_fkey"
            columns: ["social_post_log_id"]
            isOneToOne: false
            referencedRelation: "social_post_log"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          left_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          left_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          campaign_id: string | null
          created_at: string
          id: string
          is_archived: boolean | null
          last_message_at: string | null
          org_unit_id: string | null
          participant_type: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          org_unit_id?: string | null
          participant_type?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          org_unit_id?: string | null
          participant_type?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_automation_preferences: {
        Row: {
          auto_apply_criteria: Json | null
          automation_level: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto_apply_criteria?: Json | null
          automation_level?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto_apply_criteria?: Json | null
          automation_level?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_automation_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_automation_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_automation_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          allow_portfolio_in_feed: boolean
          availability: string | null
          avatar_url: string | null
          average_rating: number | null
          base_rate_per_hour: number | null
          bio: string | null
          city: string | null
          collaboration_preferences: string | null
          country: string | null
          created_at: string | null
          creator_name: string
          disconnected_stripe_account_id: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_completed: boolean | null
          languages_spoken: string[] | null
          linkedin_url: string | null
          location: string | null
          max_projects_per_month: number | null
          min_project_budget: number | null
          other_social_url: string | null
          pending_balance: number | null
          portfolio_urls: string[] | null
          postal_code: string | null
          preferred_project_duration: string | null
          profile_slug: string | null
          profile_visibility: string | null
          response_time: string | null
          skills: Database["public"]["Enums"]["creator_skill"][] | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean | null
          tiktok_url: string | null
          timezone: string | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string
          website_url: string | null
          x_url: string | null
          years_of_experience: number | null
          youtube_url: string | null
        }
        Insert: {
          allow_portfolio_in_feed?: boolean
          availability?: string | null
          avatar_url?: string | null
          average_rating?: number | null
          base_rate_per_hour?: number | null
          bio?: string | null
          city?: string | null
          collaboration_preferences?: string | null
          country?: string | null
          created_at?: string | null
          creator_name: string
          disconnected_stripe_account_id?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_completed?: boolean | null
          languages_spoken?: string[] | null
          linkedin_url?: string | null
          location?: string | null
          max_projects_per_month?: number | null
          min_project_budget?: number | null
          other_social_url?: string | null
          pending_balance?: number | null
          portfolio_urls?: string[] | null
          postal_code?: string | null
          preferred_project_duration?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          response_time?: string | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id: string
          website_url?: string | null
          x_url?: string | null
          years_of_experience?: number | null
          youtube_url?: string | null
        }
        Update: {
          allow_portfolio_in_feed?: boolean
          availability?: string | null
          avatar_url?: string | null
          average_rating?: number | null
          base_rate_per_hour?: number | null
          bio?: string | null
          city?: string | null
          collaboration_preferences?: string | null
          country?: string | null
          created_at?: string | null
          creator_name?: string
          disconnected_stripe_account_id?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_completed?: boolean | null
          languages_spoken?: string[] | null
          linkedin_url?: string | null
          location?: string | null
          max_projects_per_month?: number | null
          min_project_budget?: number | null
          other_social_url?: string | null
          pending_balance?: number | null
          portfolio_urls?: string[] | null
          postal_code?: string | null
          preferred_project_duration?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          response_time?: string | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string
          website_url?: string | null
          x_url?: string | null
          years_of_experience?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      delegated_posting_permissions: {
        Row: {
          campaign_id: string
          created_at: string | null
          expires_at: string | null
          grantee_id: string
          grantor_id: string
          id: string
          platforms: string[]
          status: string
        }
        Insert: {
          campaign_id: string
          created_at?: string | null
          expires_at?: string | null
          grantee_id: string
          grantor_id: string
          id?: string
          platforms: string[]
          status?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string | null
          expires_at?: string | null
          grantee_id?: string
          grantor_id?: string
          id?: string
          platforms?: string[]
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "delegated_posting_permissions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      discount_codes: {
        Row: {
          code: string
          created_at: string
          customer_email: string
          customer_phone: string | null
          email_sent: boolean | null
          expires_at: string | null
          id: string
          is_redeemed: boolean
          promotion_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          sms_sent: boolean | null
          submission_id: string
        }
        Insert: {
          code: string
          created_at?: string
          customer_email: string
          customer_phone?: string | null
          email_sent?: boolean | null
          expires_at?: string | null
          id?: string
          is_redeemed?: boolean
          promotion_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          sms_sent?: boolean | null
          submission_id: string
        }
        Update: {
          code?: string
          created_at?: string
          customer_email?: string
          customer_phone?: string | null
          email_sent?: boolean | null
          expires_at?: string | null
          id?: string
          is_redeemed?: boolean
          promotion_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          sms_sent?: boolean | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_codes_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_codes_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "promotion_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_actions: {
        Row: {
          action_payload: Json
          action_type: string
          conversation_id: string | null
          created_at: string | null
          id: string
          status: string | null
          user_id: string
        }
        Insert: {
          action_payload: Json
          action_type: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          user_id: string
        }
        Update: {
          action_payload?: Json
          action_type?: string
          conversation_id?: string | null
          created_at?: string | null
          id?: string
          status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_actions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "donny_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_campaign_previews: {
        Row: {
          ai_prompt_used: string | null
          campaign_id: string
          created_at: string | null
          description: string | null
          generation_model: string | null
          id: string
          is_approved: boolean | null
          media_url: string | null
          preview_data: Json
          preview_type: string
          sort_order: number | null
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_prompt_used?: string | null
          campaign_id: string
          created_at?: string | null
          description?: string | null
          generation_model?: string | null
          id?: string
          is_approved?: boolean | null
          media_url?: string | null
          preview_data?: Json
          preview_type: string
          sort_order?: number | null
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_prompt_used?: string | null
          campaign_id?: string
          created_at?: string | null
          description?: string | null
          generation_model?: string | null
          id?: string
          is_approved?: boolean | null
          media_url?: string | null
          preview_data?: Json
          preview_type?: string
          sort_order?: number | null
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_campaign_previews_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_campaign_previews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_campaign_previews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_campaign_previews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_conversations: {
        Row: {
          archived_at: string | null
          context_metadata: Json | null
          context_snapshot: Json | null
          context_url: string | null
          created_at: string
          id: string
          last_message_at: string
          surface: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          context_metadata?: Json | null
          context_snapshot?: Json | null
          context_url?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          surface?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          archived_at?: string | null
          context_metadata?: Json | null
          context_snapshot?: Json | null
          context_url?: string | null
          created_at?: string
          id?: string
          last_message_at?: string
          surface?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_conversations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_cost_ledger: {
        Row: {
          created_at: string
          edge_function: string
          estimated_cost_usd: number
          fallback: boolean
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          tier: string
          user_id: string
        }
        Insert: {
          created_at?: string
          edge_function: string
          estimated_cost_usd?: number
          fallback?: boolean
          id?: string
          input_tokens?: number
          model: string
          output_tokens?: number
          tier: string
          user_id: string
        }
        Update: {
          created_at?: string
          edge_function?: string
          estimated_cost_usd?: number
          fallback?: boolean
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          tier?: string
          user_id?: string
        }
        Relationships: []
      }
      donny_help_logs: {
        Row: {
          agent_used: string | null
          answer: string
          created_at: string
          id: string
          page_context: Json | null
          page_path: string
          query: string
          rating: number | null
          rating_comment: string | null
          suggested_actions: Json | null
          user_id: string
        }
        Insert: {
          agent_used?: string | null
          answer: string
          created_at?: string
          id?: string
          page_context?: Json | null
          page_path: string
          query: string
          rating?: number | null
          rating_comment?: string | null
          suggested_actions?: Json | null
          user_id: string
        }
        Update: {
          agent_used?: string | null
          answer?: string
          created_at?: string
          id?: string
          page_context?: Json | null
          page_path?: string
          query?: string
          rating?: number | null
          rating_comment?: string | null
          suggested_actions?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      donny_knowledge: {
        Row: {
          content: string
          created_at: string
          embedding: string | null
          id: string
          metadata: Json
          scope: string | null
          search_vector: unknown
          source_type: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          scope?: string | null
          search_vector?: unknown
          source_type: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          embedding?: string | null
          id?: string
          metadata?: Json
          scope?: string | null
          search_vector?: unknown
          source_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      donny_messages: {
        Row: {
          content: string | null
          conversation_id: string
          created_at: string
          expires_at: string | null
          id: string
          insight_type: string | null
          model: string | null
          quick_actions: Json | null
          rich_card: Json | null
          role: string
          tokens_used: number | null
          tool_calls: Json | null
          tool_result: Json | null
          user_id: string | null
        }
        Insert: {
          content?: string | null
          conversation_id: string
          created_at?: string
          expires_at?: string | null
          id?: string
          insight_type?: string | null
          model?: string | null
          quick_actions?: Json | null
          rich_card?: Json | null
          role: string
          tokens_used?: number | null
          tool_calls?: Json | null
          tool_result?: Json | null
          user_id?: string | null
        }
        Update: {
          content?: string | null
          conversation_id?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          insight_type?: string | null
          model?: string | null
          quick_actions?: Json | null
          rich_card?: Json | null
          role?: string
          tokens_used?: number | null
          tool_calls?: Json | null
          tool_result?: Json | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "donny_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "donny_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_nudges: {
        Row: {
          acted_at: string | null
          actions: Json
          created_at: string
          dismissed_at: string | null
          id: string
          priority: string
          raw_data: Json
          read_at: string | null
          source_id: string
          source_table: string
          summary: string
          type: string
          user_id: string
        }
        Insert: {
          acted_at?: string | null
          actions?: Json
          created_at?: string
          dismissed_at?: string | null
          id?: string
          priority?: string
          raw_data?: Json
          read_at?: string | null
          source_id: string
          source_table: string
          summary: string
          type: string
          user_id: string
        }
        Update: {
          acted_at?: string | null
          actions?: Json
          created_at?: string
          dismissed_at?: string | null
          id?: string
          priority?: string
          raw_data?: Json
          read_at?: string | null
          source_id?: string
          source_table?: string
          summary?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_nudges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_nudges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_nudges_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_oauth_clients: {
        Row: {
          client_id: string
          client_name: string
          client_secret_hash: string | null
          created_at: string | null
          id: string
          is_active: boolean | null
          redirect_uris: string[]
          scopes: string[] | null
        }
        Insert: {
          client_id: string
          client_name: string
          client_secret_hash?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          redirect_uris: string[]
          scopes?: string[] | null
        }
        Update: {
          client_id?: string
          client_name?: string
          client_secret_hash?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          redirect_uris?: string[]
          scopes?: string[] | null
        }
        Relationships: []
      }
      donny_oauth_codes: {
        Row: {
          client_id: string
          code_challenge: string
          code_challenge_method: string
          code_hash: string
          created_at: string | null
          expires_at: string
          id: string
          redirect_uri: string
          scopes: string[]
          used: boolean | null
          user_id: string
        }
        Insert: {
          client_id: string
          code_challenge: string
          code_challenge_method?: string
          code_hash: string
          created_at?: string | null
          expires_at: string
          id?: string
          redirect_uri: string
          scopes: string[]
          used?: boolean | null
          user_id: string
        }
        Update: {
          client_id?: string
          code_challenge?: string
          code_challenge_method?: string
          code_hash?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          redirect_uri?: string
          scopes?: string[]
          used?: boolean | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_oauth_codes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "donny_oauth_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_oauth_tokens: {
        Row: {
          access_token_hash: string
          client_id: string
          created_at: string | null
          expires_at: string
          id: string
          refresh_token_hash: string
          scopes: string[]
          user_id: string
        }
        Insert: {
          access_token_hash: string
          client_id: string
          created_at?: string | null
          expires_at: string
          id?: string
          refresh_token_hash: string
          scopes: string[]
          user_id: string
        }
        Update: {
          access_token_hash?: string
          client_id?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          refresh_token_hash?: string
          scopes?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_oauth_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "donny_oauth_clients"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_scheduled_posts: {
        Row: {
          ai_reasoning: string | null
          ai_suggested_time: boolean | null
          campaign_id: string | null
          caption: string | null
          content_type: string
          created_at: string | null
          deliverable_id: string | null
          hashtags: string[] | null
          id: string
          media_urls: string[] | null
          metadata: Json | null
          plan_group_id: string | null
          plan_order: number | null
          platform: string
          published_at: string | null
          scheduled_at: string
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          ai_reasoning?: string | null
          ai_suggested_time?: boolean | null
          campaign_id?: string | null
          caption?: string | null
          content_type: string
          created_at?: string | null
          deliverable_id?: string | null
          hashtags?: string[] | null
          id?: string
          media_urls?: string[] | null
          metadata?: Json | null
          plan_group_id?: string | null
          plan_order?: number | null
          platform: string
          published_at?: string | null
          scheduled_at: string
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          ai_reasoning?: string | null
          ai_suggested_time?: boolean | null
          campaign_id?: string | null
          caption?: string | null
          content_type?: string
          created_at?: string | null
          deliverable_id?: string | null
          hashtags?: string[] | null
          id?: string
          media_urls?: string[] | null
          metadata?: Json | null
          plan_group_id?: string | null
          plan_order?: number | null
          platform?: string
          published_at?: string | null
          scheduled_at?: string
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_scheduled_posts_deliverable_id_fkey"
            columns: ["deliverable_id"]
            isOneToOne: false
            referencedRelation: "campaign_deliverables"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_tool_executions: {
        Row: {
          created_at: string
          id: string
          input: Json
          message_id: string
          output: Json | null
          status: string
          tool_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          input?: Json
          message_id: string
          output?: Json | null
          status?: string
          tool_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          input?: Json
          message_id?: string
          output?: Json | null
          status?: string
          tool_name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "donny_tool_executions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "donny_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_tool_executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_tool_executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "donny_tool_executions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      donny_usage: {
        Row: {
          actions_budget: number
          actions_used: number
          current_stage: string
          id: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          actions_budget?: number
          actions_used?: number
          current_stage?: string
          id?: string
          period_start: string
          updated_at?: string
          user_id: string
        }
        Update: {
          actions_budget?: number
          actions_used?: number
          current_stage?: string
          id?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dragonshare_boosts: {
        Row: {
          amount_cents: number
          boosted_at: string
          boosting_org_id: string
          boosting_user_id: string
          captured_at: string | null
          creator_payout_cents: number
          id: string
          platform_fee_cents: number
          post_id: string
          status: string
          stripe_payment_intent_id: string | null
          stripe_transfer_id: string | null
          tier_label: string
          transferred_at: string | null
        }
        Insert: {
          amount_cents: number
          boosted_at?: string
          boosting_org_id: string
          boosting_user_id: string
          captured_at?: string | null
          creator_payout_cents: number
          id?: string
          platform_fee_cents: number
          post_id: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          tier_label: string
          transferred_at?: string | null
        }
        Update: {
          amount_cents?: number
          boosted_at?: string
          boosting_org_id?: string
          boosting_user_id?: string
          captured_at?: string | null
          creator_payout_cents?: number
          id?: string
          platform_fee_cents?: number
          post_id?: string
          status?: string
          stripe_payment_intent_id?: string | null
          stripe_transfer_id?: string | null
          tier_label?: string
          transferred_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dragonshare_boosts_boosting_org_id_fkey"
            columns: ["boosting_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_boosts_boosting_org_id_fkey"
            columns: ["boosting_org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_boosts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "dragonshare_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      dragonshare_engagement: {
        Row: {
          comment_count: number | null
          id: string
          impressions: number | null
          like_count: number | null
          measured_at: string
          post_id: string
          reach: number | null
          save_count: number | null
          share_count: number | null
          source: string
          view_count: number | null
        }
        Insert: {
          comment_count?: number | null
          id?: string
          impressions?: number | null
          like_count?: number | null
          measured_at?: string
          post_id: string
          reach?: number | null
          save_count?: number | null
          share_count?: number | null
          source: string
          view_count?: number | null
        }
        Update: {
          comment_count?: number | null
          id?: string
          impressions?: number | null
          like_count?: number | null
          measured_at?: string
          post_id?: string
          reach?: number | null
          save_count?: number | null
          share_count?: number | null
          source?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dragonshare_engagement_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "dragonshare_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      dragonshare_events: {
        Row: {
          actor_org_id: string | null
          actor_user_id: string | null
          boost_id: string | null
          created_at: string
          event_type: string
          id: string
          payload: Json | null
          post_id: string | null
        }
        Insert: {
          actor_org_id?: string | null
          actor_user_id?: string | null
          boost_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          payload?: Json | null
          post_id?: string | null
        }
        Update: {
          actor_org_id?: string | null
          actor_user_id?: string | null
          boost_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json | null
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dragonshare_events_boost_id_fkey"
            columns: ["boost_id"]
            isOneToOne: false
            referencedRelation: "dragonshare_boosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "dragonshare_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      dragonshare_payouts: {
        Row: {
          amount_cents: number
          boost_id: string
          creator_id: string
          failure_reason: string | null
          id: string
          processed_at: string | null
          status: string
          stripe_transfer_id: string | null
        }
        Insert: {
          amount_cents: number
          boost_id: string
          creator_id: string
          failure_reason?: string | null
          id?: string
          processed_at?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Update: {
          amount_cents?: number
          boost_id?: string
          creator_id?: string
          failure_reason?: string | null
          id?: string
          processed_at?: string | null
          status?: string
          stripe_transfer_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dragonshare_payouts_boost_id_fkey"
            columns: ["boost_id"]
            isOneToOne: true
            referencedRelation: "dragonshare_boosts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_payouts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dragonshare_posts: {
        Row: {
          boost_status: string
          caption: string | null
          content_file_path: string | null
          content_type: string
          created_at: string
          creator_id: string
          declined_at: string | null
          declined_by: string | null
          donny_reach_estimate: number | null
          donny_recommended_tier: number | null
          donny_score: number | null
          expires_at: string
          flagged_at: string | null
          flagged_by: string | null
          hashtags: string[] | null
          id: string
          mentions: string[] | null
          monetization_type: string
          platform: string | null
          post_url: string | null
          rejection_reason: string | null
          screenshot_url: string | null
          source_brief_id: string | null
          status: string
          submitted_at: string
          target_org_id: string
          target_org_unit_id: string | null
          updated_at: string
          verification_method: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          boost_status?: string
          caption?: string | null
          content_file_path?: string | null
          content_type: string
          created_at?: string
          creator_id: string
          declined_at?: string | null
          declined_by?: string | null
          donny_reach_estimate?: number | null
          donny_recommended_tier?: number | null
          donny_score?: number | null
          expires_at?: string
          flagged_at?: string | null
          flagged_by?: string | null
          hashtags?: string[] | null
          id?: string
          mentions?: string[] | null
          monetization_type?: string
          platform?: string | null
          post_url?: string | null
          rejection_reason?: string | null
          screenshot_url?: string | null
          source_brief_id?: string | null
          status?: string
          submitted_at?: string
          target_org_id: string
          target_org_unit_id?: string | null
          updated_at?: string
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          boost_status?: string
          caption?: string | null
          content_file_path?: string | null
          content_type?: string
          created_at?: string
          creator_id?: string
          declined_at?: string | null
          declined_by?: string | null
          donny_reach_estimate?: number | null
          donny_recommended_tier?: number | null
          donny_score?: number | null
          expires_at?: string
          flagged_at?: string | null
          flagged_by?: string | null
          hashtags?: string[] | null
          id?: string
          mentions?: string[] | null
          monetization_type?: string
          platform?: string | null
          post_url?: string | null
          rejection_reason?: string | null
          screenshot_url?: string | null
          source_brief_id?: string | null
          status?: string
          submitted_at?: string
          target_org_id?: string
          target_org_unit_id?: string | null
          updated_at?: string
          verification_method?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dragonshare_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_posts_creator_id_fkey"
            columns: ["creator_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_posts_source_brief_id_fkey"
            columns: ["source_brief_id"]
            isOneToOne: false
            referencedRelation: "content_briefs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_posts_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_posts_target_org_id_fkey"
            columns: ["target_org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dragonshare_posts_target_org_unit_id_fkey"
            columns: ["target_org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verification_tokens: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          token: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id?: string
          token: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          token?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          created_at: string
          description: string | null
          environment: string
          id: string
          is_enabled: boolean
          name: string
          rollout_percentage: number
          target_roles: string[] | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          environment?: string
          id?: string
          is_enabled?: boolean
          name: string
          rollout_percentage?: number
          target_roles?: string[] | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          environment?: string
          id?: string
          is_enabled?: boolean
          name?: string
          rollout_percentage?: number
          target_roles?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      file_comments: {
        Row: {
          annotation_data: Json | null
          comment_text: string
          created_at: string
          file_upload_id: string
          id: string
          parent_comment_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          annotation_data?: Json | null
          comment_text: string
          created_at?: string
          file_upload_id: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          annotation_data?: Json | null
          comment_text?: string
          created_at?: string
          file_upload_id?: string
          id?: string
          parent_comment_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_comments_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "file_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_permissions: {
        Row: {
          created_at: string
          expires_at: string | null
          file_upload_id: string
          granted_by: string
          id: string
          permission_type: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          file_upload_id: string
          granted_by: string
          id?: string
          permission_type: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          file_upload_id?: string
          granted_by?: string
          id?: string
          permission_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "file_permissions_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_tag_assignments: {
        Row: {
          assigned_at: string
          assigned_by: string
          file_upload_id: string
          id: string
          tag_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          file_upload_id: string
          id?: string
          tag_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          file_upload_id?: string
          id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_tag_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_tag_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_tag_assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_tag_assignments_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_tag_assignments_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "file_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      file_tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          id: string
          name: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by: string
          id?: string
          name: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_tags_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_uploads: {
        Row: {
          bucket_name: string
          campaign_id: string | null
          compression_ratio: number | null
          created_at: string
          file_category: string
          file_hash: string | null
          file_path: string
          file_size: number
          filename: string
          id: string
          is_compressed: boolean | null
          is_public: boolean | null
          metadata: Json | null
          mime_type: string
          org_unit_id: string | null
          original_filename: string
          updated_at: string
          upload_status: string
          uploaded_by: string
        }
        Insert: {
          bucket_name: string
          campaign_id?: string | null
          compression_ratio?: number | null
          created_at?: string
          file_category?: string
          file_hash?: string | null
          file_path: string
          file_size: number
          filename: string
          id?: string
          is_compressed?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          mime_type: string
          org_unit_id?: string | null
          original_filename: string
          updated_at?: string
          upload_status?: string
          uploaded_by: string
        }
        Update: {
          bucket_name?: string
          campaign_id?: string | null
          compression_ratio?: number | null
          created_at?: string
          file_category?: string
          file_hash?: string | null
          file_path?: string
          file_size?: number
          filename?: string
          id?: string
          is_compressed?: boolean | null
          is_public?: boolean | null
          metadata?: Json | null
          mime_type?: string
          org_unit_id?: string | null
          original_filename?: string
          updated_at?: string
          upload_status?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_uploads_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          changes_description: string | null
          created_at: string
          created_by: string
          file_path: string
          file_size: number
          file_upload_id: string
          id: string
          version_number: number
        }
        Insert: {
          changes_description?: string | null
          created_at?: string
          created_by: string
          file_path: string
          file_size: number
          file_upload_id: string
          id?: string
          version_number?: number
        }
        Update: {
          changes_description?: string | null
          created_at?: string
          created_by?: string
          file_path?: string
          file_size?: number
          file_upload_id?: string
          id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_file_upload_id_fkey"
            columns: ["file_upload_id"]
            isOneToOne: false
            referencedRelation: "file_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      help_article_feedback: {
        Row: {
          article_id: string
          created_at: string
          helpful: boolean
          id: string
          user_id: string
        }
        Insert: {
          article_id: string
          created_at?: string
          helpful: boolean
          id?: string
          user_id: string
        }
        Update: {
          article_id?: string
          created_at?: string
          helpful?: boolean
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "help_article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "help_articles"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          body: string
          category: string
          id: string
          roles: string[]
          search_terms: string[] | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          category: string
          id?: string
          roles?: string[]
          search_terms?: string[] | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          category?: string
          id?: string
          roles?: string[]
          search_terms?: string[] | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      internal_docs: {
        Row: {
          content_md: string
          created_at: string
          id: string
          path: string
          source_hash: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          content_md: string
          created_at?: string
          id?: string
          path: string
          source_hash?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          content_md?: string
          created_at?: string
          id?: string
          path?: string
          source_hash?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      message_reactions: {
        Row: {
          created_at: string
          emoji: string
          id: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji: string
          id?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          id?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages_with_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_url: string | null
          campaign_id: string | null
          category: string | null
          content: string
          conversation_id: string | null
          created_at: string
          delivery_status: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string
          is_archived: boolean | null
          is_starred: boolean | null
          parent_message_id: string | null
          read_at: string | null
          recipient_id: string
          sender_id: string
          thread_id: string | null
        }
        Insert: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_url?: string | null
          campaign_id?: string | null
          category?: string | null
          content: string
          conversation_id?: string | null
          created_at?: string
          delivery_status?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          parent_message_id?: string | null
          read_at?: string | null
          recipient_id: string
          sender_id: string
          thread_id?: string | null
        }
        Update: {
          attachment_name?: string | null
          attachment_size?: number | null
          attachment_url?: string | null
          campaign_id?: string | null
          category?: string | null
          content?: string
          conversation_id?: string | null
          created_at?: string
          delivery_status?: string | null
          edited_at?: string | null
          forwarded_from_message_id?: string | null
          id?: string
          is_archived?: boolean | null
          is_starred?: boolean | null
          parent_message_id?: string | null
          read_at?: string | null
          recipient_id?: string
          sender_id?: string
          thread_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          campaign_notifications: boolean | null
          created_at: string
          email_notifications: boolean | null
          id: string
          message_notifications: boolean | null
          preferences_matrix: Json | null
          push_notifications: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_notifications?: boolean | null
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          message_notifications?: boolean | null
          preferences_matrix?: Json | null
          push_notifications?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          campaign_notifications?: boolean | null
          created_at?: string
          email_notifications?: boolean | null
          id?: string
          message_notifications?: boolean | null
          preferences_matrix?: Json | null
          push_notifications?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      onboarding_steps: {
        Row: {
          component: string
          created_at: string
          description: string | null
          id: string
          is_optional: boolean
          order: number
          target_roles: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          component: string
          created_at?: string
          description?: string | null
          id?: string
          is_optional?: boolean
          order: number
          target_roles?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          component?: string
          created_at?: string
          description?: string | null
          id?: string
          is_optional?: boolean
          order?: number
          target_roles?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      operating_expenses: {
        Row: {
          active: boolean
          category: string
          created_at: string
          id: string
          monthly_amount_cents: number
          name: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          monthly_amount_cents: number
          name: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category?: string
          created_at?: string
          id?: string
          monthly_amount_cents?: number
          name?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      org_members: {
        Row: {
          id: string
          invitation_status: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          last_active_at: string | null
          org_id: string
          role: string
          user_id: string
        }
        Insert: {
          id?: string
          invitation_status?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          last_active_at?: string | null
          org_id: string
          role: string
          user_id: string
        }
        Update: {
          id?: string
          invitation_status?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          last_active_at?: string | null
          org_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_units: {
        Row: {
          address: string | null
          brand_category: string | null
          created_at: string
          deleted_at: string | null
          description: string | null
          disconnected_stripe_account_id: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          is_primary: boolean
          lat: number | null
          linkedin_url: string | null
          lng: number | null
          logo_url: string | null
          name: string
          org_id: string
          other_social_url: string | null
          pending_balance: number | null
          sample_content_urls: Json | null
          show_parent_brand: boolean | null
          stripe_account_id: string | null
          stripe_onboarding_complete: boolean
          tiktok_url: string | null
          unit_type: string
          updated_at: string
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          address?: string | null
          brand_category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          disconnected_stripe_account_id?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_primary?: boolean
          lat?: number | null
          linkedin_url?: string | null
          lng?: number | null
          logo_url?: string | null
          name: string
          org_id: string
          other_social_url?: string | null
          pending_balance?: number | null
          sample_content_urls?: Json | null
          show_parent_brand?: boolean | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          tiktok_url?: string | null
          unit_type: string
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          address?: string | null
          brand_category?: string | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          disconnected_stripe_account_id?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          is_primary?: boolean
          lat?: number | null
          linkedin_url?: string | null
          lng?: number | null
          logo_url?: string | null
          name?: string
          org_id?: string
          other_social_url?: string | null
          pending_balance?: number | null
          sample_content_urls?: Json | null
          show_parent_brand?: boolean | null
          stripe_account_id?: string | null
          stripe_onboarding_complete?: boolean
          tiktok_url?: string | null
          unit_type?: string
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "org_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_units_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          active_campaign_limit: number
          billing_email: string | null
          created_at: string
          deleted_at: string | null
          hard_purge_at: string | null
          id: string
          logo_url: string | null
          name: string
          org_type: string
          seat_count: number
          slug: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_tier: string
          take_rate: number
          updated_at: string
        }
        Insert: {
          active_campaign_limit?: number
          billing_email?: string | null
          created_at?: string
          deleted_at?: string | null
          hard_purge_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          org_type: string
          seat_count?: number
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?: string
          take_rate?: number
          updated_at?: string
        }
        Update: {
          active_campaign_limit?: number
          billing_email?: string | null
          created_at?: string
          deleted_at?: string | null
          hard_purge_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          org_type?: string
          seat_count?: number
          slug?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_tier?: string
          take_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      outstand_webhook_events: {
        Row: {
          account_id: string | null
          event: string
          id: string
          payload: Json | null
          post_id: string | null
          received_at: string
        }
        Insert: {
          account_id?: string | null
          event: string
          id: string
          payload?: Json | null
          post_id?: string | null
          received_at?: string
        }
        Update: {
          account_id?: string | null
          event?: string
          id?: string
          payload?: Json | null
          post_id?: string | null
          received_at?: string
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          actor_id: string | null
          actor_role: string
          amount_cents: number | null
          campaign_id: string | null
          created_at: string
          currency: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          metadata: Json | null
          stripe_id: string | null
        }
        Insert: {
          actor_id?: string | null
          actor_role: string
          amount_cents?: number | null
          campaign_id?: string | null
          created_at?: string
          currency?: string | null
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          metadata?: Json | null
          stripe_id?: string | null
        }
        Update: {
          actor_id?: string | null
          actor_role?: string
          amount_cents?: number | null
          campaign_id?: string | null
          created_at?: string
          currency?: string | null
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          stripe_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_weight: {
        Row: {
          captured_at: string
          db_bytes: number
          id: string
          row_counts: Json
          storage_bytes: number
          users_total: number
        }
        Insert: {
          captured_at?: string
          db_bytes: number
          id?: string
          row_counts?: Json
          storage_bytes: number
          users_total: number
        }
        Update: {
          captured_at?: string
          db_bytes?: number
          id?: string
          row_counts?: Json
          storage_bytes?: number
          users_total?: number
        }
        Relationships: []
      }
      pricing_funnel_events: {
        Row: {
          action: string
          created_at: string
          current_tier: string
          feature_key: string
          id: string
          org_id: string | null
          required_tier: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          current_tier: string
          feature_key: string
          id?: string
          org_id?: string | null
          required_tier: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          current_tier?: string
          feature_key?: string
          id?: string
          org_id?: string | null
          required_tier?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_funnel_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pricing_funnel_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_views: {
        Row: {
          id: string
          ip_address: unknown
          profile_id: string
          profile_type: string
          user_agent: string | null
          viewed_at: string | null
          viewer_id: string | null
        }
        Insert: {
          id?: string
          ip_address?: unknown
          profile_id: string
          profile_type: string
          user_agent?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Update: {
          id?: string
          ip_address?: unknown
          profile_id?: string
          profile_type?: string
          user_agent?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active_org_unit_id: string | null
          auto_pilot_enabled: boolean | null
          avatar_url: string | null
          created_at: string | null
          dismissed_coachmarks: string[] | null
          donny_system_conversation_id: string | null
          email: string
          email_verified: boolean | null
          first_run_missions: Json | null
          full_name: string | null
          id: string
          org_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
        }
        Insert: {
          active_org_unit_id?: string | null
          auto_pilot_enabled?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          dismissed_coachmarks?: string[] | null
          donny_system_conversation_id?: string | null
          email: string
          email_verified?: boolean | null
          first_run_missions?: Json | null
          full_name?: string | null
          id: string
          org_id?: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Update: {
          active_org_unit_id?: string | null
          auto_pilot_enabled?: boolean | null
          avatar_url?: string | null
          created_at?: string | null
          dismissed_coachmarks?: string[] | null
          donny_system_conversation_id?: string | null
          email?: string
          email_verified?: boolean | null
          first_run_missions?: Json | null
          full_name?: string | null
          id?: string
          org_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_active_org_unit_id_fkey"
            columns: ["active_org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_donny_system_conversation_id_fkey"
            columns: ["donny_system_conversation_id"]
            isOneToOne: false
            referencedRelation: "donny_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "public_organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_reviews: {
        Row: {
          collaboration_id: string | null
          communication_rating: number | null
          created_at: string | null
          id: string
          is_public: boolean | null
          professionalism_rating: number | null
          quality_rating: number | null
          rating: number
          reveal_at: string | null
          review_text: string | null
          review_type: string
          reviewee_id: string
          reviewer_id: string
          sponsorship_id: string | null
          timeliness_rating: number | null
          updated_at: string | null
        }
        Insert: {
          collaboration_id?: string | null
          communication_rating?: number | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating: number
          reveal_at?: string | null
          review_text?: string | null
          review_type: string
          reviewee_id: string
          reviewer_id: string
          sponsorship_id?: string | null
          timeliness_rating?: number | null
          updated_at?: string | null
        }
        Update: {
          collaboration_id?: string | null
          communication_rating?: number | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating?: number
          reveal_at?: string | null
          review_text?: string | null
          review_type?: string
          reviewee_id?: string
          reviewer_id?: string
          sponsorship_id?: string | null
          timeliness_rating?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_reviews_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "campaign_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reviews_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "campaign_sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_submissions: {
        Row: {
          created_at: string
          customer_email: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          marketing_rights_accepted: boolean
          promotion_id: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          social_handles: Json | null
          status: string
          updated_at: string
          video_duration: number | null
          video_url: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          marketing_rights_accepted?: boolean
          promotion_id: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_handles?: Json | null
          status?: string
          updated_at?: string
          video_duration?: number | null
          video_url: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          marketing_rights_accepted?: boolean
          promotion_id?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_handles?: Json | null
          status?: string
          updated_at?: string
          video_duration?: number | null
          video_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_submissions_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          accepted_content: string
          business_id: string
          created_at: string
          currency: string | null
          current_redemptions: number | null
          description: string | null
          discount_type: string
          discount_value: number
          end_date: string
          id: string
          max_redemptions: number | null
          qr_code_url: string | null
          start_date: string
          status: string
          terms_conditions: string | null
          title: string
          updated_at: string
          user_id: string
          video_max_duration: number | null
        }
        Insert: {
          accepted_content?: string
          business_id: string
          created_at?: string
          currency?: string | null
          current_redemptions?: number | null
          description?: string | null
          discount_type: string
          discount_value: number
          end_date: string
          id?: string
          max_redemptions?: number | null
          qr_code_url?: string | null
          start_date: string
          status?: string
          terms_conditions?: string | null
          title: string
          updated_at?: string
          user_id: string
          video_max_duration?: number | null
        }
        Update: {
          accepted_content?: string
          business_id?: string
          created_at?: string
          currency?: string | null
          current_redemptions?: number | null
          description?: string | null
          discount_type?: string
          discount_value?: number
          end_date?: string
          id?: string
          max_redemptions?: number | null
          qr_code_url?: string | null
          start_date?: string
          status?: string
          terms_conditions?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          video_max_duration?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "business_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "public_business_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      push_notifications: {
        Row: {
          action_url: string | null
          actor_id: string | null
          actor_name: string | null
          body: string
          category: string | null
          created_at: string
          data: Json | null
          icon: string | null
          id: string
          read_at: string | null
          sent_at: string | null
          title: string
          type: string | null
          user_id: string
        }
        Insert: {
          action_url?: string | null
          actor_id?: string | null
          actor_name?: string | null
          body: string
          category?: string | null
          created_at?: string
          data?: Json | null
          icon?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title: string
          type?: string | null
          user_id: string
        }
        Update: {
          action_url?: string | null
          actor_id?: string | null
          actor_name?: string | null
          body?: string
          category?: string | null
          created_at?: string
          data?: Json | null
          icon?: string | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title?: string
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      review_responses: {
        Row: {
          created_at: string | null
          id: string
          responder_id: string
          response_text: string
          review_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          responder_id: string
          response_text: string
          review_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          responder_id?: string
          response_text?: string
          review_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "project_reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_responses_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "public_project_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      rush_surcharge_log: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          id: string
          invoiced_at: string | null
          paid_at: string | null
          platform_count: number
          status: string
          stripe_invoice_item_id: string | null
          surcharge_cents: number
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          invoiced_at?: string | null
          paid_at?: string | null
          platform_count: number
          status?: string
          stripe_invoice_item_id?: string | null
          surcharge_cents?: number
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          id?: string
          invoiced_at?: string | null
          paid_at?: string | null
          platform_count?: number
          status?: string
          stripe_invoice_item_id?: string | null
          surcharge_cents?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rush_surcharge_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      social_analytics_cache: {
        Row: {
          fetched_at: string
          id: string
          metric_type: string
          metric_value: number
          outstand_account_id: string
          period_end: string
          period_start: string
          platform: string
          user_id: string
        }
        Insert: {
          fetched_at?: string
          id?: string
          metric_type: string
          metric_value: number
          outstand_account_id: string
          period_end: string
          period_start: string
          platform: string
          user_id: string
        }
        Update: {
          fetched_at?: string
          id?: string
          metric_type?: string
          metric_value?: number
          outstand_account_id?: string
          period_end?: string
          period_start?: string
          platform?: string
          user_id?: string
        }
        Relationships: []
      }
      social_post_log: {
        Row: {
          campaign_id: string | null
          created_at: string | null
          dragonshare_post_id: string | null
          id: string
          outstand_post_id: string
          platform: string
          post_type: string
          source_brief_id: string | null
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string | null
          dragonshare_post_id?: string | null
          id?: string
          outstand_post_id: string
          platform: string
          post_type: string
          source_brief_id?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string | null
          created_at?: string | null
          dragonshare_post_id?: string | null
          id?: string
          outstand_post_id?: string
          platform?: string
          post_type?: string
          source_brief_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_post_log_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          error_message: string | null
          event_id: string
          event_type: string
          processed_at: string
          status: string
        }
        Insert: {
          error_message?: string | null
          event_id: string
          event_type: string
          processed_at?: string
          status?: string
        }
        Update: {
          error_message?: string | null
          event_id?: string
          event_type?: string
          processed_at?: string
          status?: string
        }
        Relationships: []
      }
      triple_post_sessions: {
        Row: {
          brand_id: string | null
          brand_status: string
          campaign_id: string
          completed_at: string | null
          created_at: string | null
          creator_id: string
          creator_status: string
          id: string
          restaurant_id: string
          restaurant_status: string
          status: string
        }
        Insert: {
          brand_id?: string | null
          brand_status?: string
          campaign_id: string
          completed_at?: string | null
          created_at?: string | null
          creator_id: string
          creator_status?: string
          id?: string
          restaurant_id: string
          restaurant_status?: string
          status?: string
        }
        Update: {
          brand_id?: string | null
          brand_status?: string
          campaign_id?: string
          completed_at?: string | null
          created_at?: string | null
          creator_id?: string
          creator_status?: string
          id?: string
          restaurant_id?: string
          restaurant_status?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "triple_post_sessions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_onboarding_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          skipped_at: string | null
          step_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          skipped_at?: string | null
          step_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          skipped_at?: string | null
          step_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_onboarding_progress_step_id_fkey"
            columns: ["step_id"]
            isOneToOne: false
            referencedRelation: "onboarding_steps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_presence: {
        Row: {
          id: string
          last_seen: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          id?: string
          last_seen?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          id?: string
          last_seen?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_reports: {
        Row: {
          conversation_id: string | null
          created_at: string
          id: string
          reason: string | null
          reported_id: string
          reporter_id: string
        }
        Insert: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reported_id: string
          reporter_id: string
        }
        Update: {
          conversation_id?: string | null
          created_at?: string
          id?: string
          reason?: string | null
          reported_id?: string
          reporter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reported_id_fkey"
            columns: ["reported_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      message_participant_profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
        }
        Relationships: []
      }
      messages_with_profiles: {
        Row: {
          attachment_name: string | null
          attachment_size: number | null
          attachment_url: string | null
          campaign_id: string | null
          category: string | null
          content: string | null
          conversation_id: string | null
          created_at: string | null
          delivery_status: string | null
          edited_at: string | null
          forwarded_from_message_id: string | null
          id: string | null
          is_archived: boolean | null
          is_starred: boolean | null
          parent_message_id: string | null
          read_at: string | null
          recipient_id: string | null
          sender_avatar_url: string | null
          sender_full_name: string | null
          sender_id: string | null
          thread_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_forwarded_from_message_id_fkey"
            columns: ["forwarded_from_message_id"]
            isOneToOne: false
            referencedRelation: "messages_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "messages_with_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "message_participant_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "safe_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      public_business_profiles: {
        Row: {
          account_type: string | null
          average_rating: number | null
          brand_category: string | null
          budget_range: string | null
          business_name: string | null
          city: string | null
          company_size: string | null
          country: string | null
          created_at: string | null
          description: string | null
          employee_count_range: string | null
          facebook_url: string | null
          founded_year: number | null
          id: string | null
          industry: Database["public"]["Enums"]["industry_type"] | null
          instagram_url: string | null
          is_completed: boolean | null
          linkedin_url: string | null
          location: string | null
          logo_url: string | null
          marketing_objectives: string | null
          other_social_url: string | null
          postal_code: string | null
          preferred_collaboration_style: string | null
          profile_slug: string | null
          profile_visibility: string | null
          sample_content_urls: string[] | null
          sponsorship_budget: number | null
          tiktok_url: string | null
          timezone: string | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          account_type?: string | null
          average_rating?: number | null
          brand_category?: string | null
          budget_range?: string | null
          business_name?: string | null
          city?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          employee_count_range?: string | null
          facebook_url?: string | null
          founded_year?: number | null
          id?: string | null
          industry?: Database["public"]["Enums"]["industry_type"] | null
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          marketing_objectives?: string | null
          other_social_url?: string | null
          postal_code?: string | null
          preferred_collaboration_style?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          sample_content_urls?: string[] | null
          sponsorship_budget?: number | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          account_type?: string | null
          average_rating?: number | null
          brand_category?: string | null
          budget_range?: string | null
          business_name?: string | null
          city?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string | null
          description?: string | null
          employee_count_range?: string | null
          facebook_url?: string | null
          founded_year?: number | null
          id?: string | null
          industry?: Database["public"]["Enums"]["industry_type"] | null
          instagram_url?: string | null
          is_completed?: boolean | null
          linkedin_url?: string | null
          location?: string | null
          logo_url?: string | null
          marketing_objectives?: string | null
          other_social_url?: string | null
          postal_code?: string | null
          preferred_collaboration_style?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          sample_content_urls?: string[] | null
          sponsorship_budget?: number | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      public_creator_profiles: {
        Row: {
          allow_portfolio_in_feed: boolean | null
          availability: string | null
          avatar_url: string | null
          average_rating: number | null
          base_rate_per_hour: number | null
          bio: string | null
          city: string | null
          collaboration_preferences: string | null
          country: string | null
          created_at: string | null
          creator_name: string | null
          facebook_url: string | null
          id: string | null
          instagram_url: string | null
          is_completed: boolean | null
          languages_spoken: string[] | null
          linkedin_url: string | null
          location: string | null
          max_projects_per_month: number | null
          min_project_budget: number | null
          other_social_url: string | null
          portfolio_urls: string[] | null
          postal_code: string | null
          preferred_project_duration: string | null
          profile_slug: string | null
          profile_visibility: string | null
          response_time: string | null
          skills: Database["public"]["Enums"]["creator_skill"][] | null
          tiktok_url: string | null
          timezone: string | null
          total_reviews: number | null
          updated_at: string | null
          user_id: string | null
          website_url: string | null
          x_url: string | null
          years_of_experience: number | null
          youtube_url: string | null
        }
        Insert: {
          allow_portfolio_in_feed?: boolean | null
          availability?: string | null
          avatar_url?: string | null
          average_rating?: number | null
          base_rate_per_hour?: number | null
          bio?: string | null
          city?: string | null
          collaboration_preferences?: string | null
          country?: string | null
          created_at?: string | null
          creator_name?: string | null
          facebook_url?: string | null
          id?: string | null
          instagram_url?: string | null
          is_completed?: boolean | null
          languages_spoken?: string[] | null
          linkedin_url?: string | null
          location?: string | null
          max_projects_per_month?: number | null
          min_project_budget?: number | null
          other_social_url?: string | null
          portfolio_urls?: string[] | null
          postal_code?: string | null
          preferred_project_duration?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          response_time?: string | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
          x_url?: string | null
          years_of_experience?: number | null
          youtube_url?: string | null
        }
        Update: {
          allow_portfolio_in_feed?: boolean | null
          availability?: string | null
          avatar_url?: string | null
          average_rating?: number | null
          base_rate_per_hour?: number | null
          bio?: string | null
          city?: string | null
          collaboration_preferences?: string | null
          country?: string | null
          created_at?: string | null
          creator_name?: string | null
          facebook_url?: string | null
          id?: string | null
          instagram_url?: string | null
          is_completed?: boolean | null
          languages_spoken?: string[] | null
          linkedin_url?: string | null
          location?: string | null
          max_projects_per_month?: number | null
          min_project_budget?: number | null
          other_social_url?: string | null
          portfolio_urls?: string[] | null
          postal_code?: string | null
          preferred_project_duration?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          response_time?: string | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
          tiktok_url?: string | null
          timezone?: string | null
          total_reviews?: number | null
          updated_at?: string | null
          user_id?: string | null
          website_url?: string | null
          x_url?: string | null
          years_of_experience?: number | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      public_organizations: {
        Row: {
          created_at: string | null
          id: string | null
          logo_url: string | null
          name: string | null
          org_type: string | null
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          org_type?: string | null
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string | null
          logo_url?: string | null
          name?: string | null
          org_type?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      public_project_reviews: {
        Row: {
          collaboration_id: string | null
          communication_rating: number | null
          created_at: string | null
          id: string | null
          is_public: boolean | null
          professionalism_rating: number | null
          project_title: string | null
          quality_rating: number | null
          rating: number | null
          reveal_at: string | null
          review_text: string | null
          review_type: string | null
          reviewee_id: string | null
          reviewer_avatar_url: string | null
          reviewer_full_name: string | null
          reviewer_id: string | null
          sponsorship_id: string | null
          timeliness_rating: number | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_reviews_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "campaign_collaborations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_reviews_sponsorship_id_fkey"
            columns: ["sponsorship_id"]
            isOneToOne: false
            referencedRelation: "campaign_sponsorships"
            referencedColumns: ["id"]
          },
        ]
      }
      safe_profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: never
          full_name?: string | null
          id?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_application_with_collaboration: {
        Args: { p_application_id: string }
        Returns: Json
      }
      aios_cost_stats: { Args: never; Returns: Json }
      aios_platform_stats: { Args: never; Returns: Json }
      aios_revenue_stats: { Args: never; Returns: Json }
      apply_to_campaign:
        | {
            Args: {
              p_campaign_id: string
              p_creator_id: string
              p_intro_message: string
              p_is_counter_offer?: boolean
              p_proposed_rate: number
              p_proposed_timeline?: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_campaign_id: string
              p_creator_id: string
              p_intro_message: string
              p_is_counter_offer?: boolean
              p_portfolio_url?: string
              p_proposed_rate: number
              p_proposed_timeline?: string
            }
            Returns: Json
          }
      block_user: { Args: { p_blocked_id: string }; Returns: undefined }
      can_create_application: {
        Args: { p_campaign_id: string; p_creator_id: string }
        Returns: boolean
      }
      capture_platform_weight: { Args: never; Returns: undefined }
      check_prerequisite_status: { Args: { p_user_id: string }; Returns: Json }
      cleanup_expired_verification_tokens: { Args: never; Returns: undefined }
      create_boost: {
        Args: {
          p_amount_cents: number
          p_boosting_org_id: string
          p_post_id: string
          p_tier: string
        }
        Returns: string
      }
      create_counter_offer: {
        Args: {
          p_application_id: string
          p_message?: string
          p_proposed_rate?: number
          p_proposed_timeline?: string
          p_sender_id: string
          p_sender_role: string
        }
        Returns: Json
      }
      create_or_get_direct_conversation: {
        Args: { p_org_unit_id?: string; user1_uuid: string; user2_uuid: string }
        Returns: string
      }
      cron_hard_purge_expired: { Args: never; Returns: number }
      debug_user_upload_permissions: {
        Args: never
        Returns: {
          is_authenticated: boolean
          profile_exists: boolean
          profile_role: string
          user_id: string
        }[]
      }
      decline_dragonshare_post: {
        Args: { p_post_id: string }
        Returns: undefined
      }
      delete_promotion_cascade: {
        Args: { p_promotion_id: string }
        Returns: undefined
      }
      flag_dragonshare_post: { Args: { p_post_id: string }; Returns: undefined }
      force_gdpr_erasure: { Args: { p_user_id: string }; Returns: undefined }
      generate_profile_slug: {
        Args: { name: string; profile_type: string }
        Returns: string
      }
      get_available_creators: {
        Args: {
          campaign_platforms?: string[]
          required_skills?: Database["public"]["Enums"]["creator_skill"][]
        }
        Returns: {
          availability: string
          avatar_url: string
          base_rate_per_hour: number
          bio: string
          creator_name: string
          facebook_url: string
          id: string
          instagram_url: string
          linkedin_url: string
          location: string
          other_social_url: string
          portfolio_urls: string[]
          skills: Database["public"]["Enums"]["creator_skill"][]
          tiktok_url: string
          user_id: string
          website_url: string
          x_url: string
          youtube_url: string
        }[]
      }
      get_creator_connected_platforms: {
        Args: { p_creator_id: string }
        Returns: {
          platform: string
          platform_handle: string
        }[]
      }
      get_dashboard_summary: { Args: { p_user_id: string }; Returns: Json }
      get_org_connected_platforms: {
        Args: { p_org_id: string }
        Returns: {
          platform: string
          platform_handle: string
        }[]
      }
      get_org_unit_financials: {
        Args: { p_unit_id: string }
        Returns: {
          pending_balance: number
          stripe_account_id: string
          stripe_onboarding_complete: boolean
        }[]
      }
      get_recipient_email: {
        Args: { p_user_id: string }
        Returns: {
          email: string
          full_name: string
        }[]
      }
      get_restaurant_by_org_id: {
        Args: { target_org_id: string }
        Returns: {
          address: string
          brand_category: string
          id: string
          logo_url: string
          name: string
          org_type: string
        }[]
      }
      get_unavailable_campaign_ids: {
        Args: never
        Returns: {
          campaign_id: string
        }[]
      }
      get_unread_message_counts: {
        Args: { user_uuid: string }
        Returns: {
          campaign_id: string
          unread_count: number
        }[]
      }
      get_user_conversations: {
        Args: { p_org_unit_id?: string; user_uuid: string }
        Returns: {
          campaign_id: string
          campaign_status: string
          conversation_id: string
          conversation_title: string
          conversation_type: string
          last_message_at: string
          other_participant_avatar: string
          other_participant_name: string
          unread_count: number
        }[]
      }
      get_user_display_name: { Args: { user_uuid: string }; Returns: string }
      get_user_org_ids: { Args: never; Returns: string[] }
      has_collaboration_on_campaign: {
        Args: { p_campaign_id: string; p_user_id: string }
        Returns: boolean
      }
      has_counterpart_review: {
        Args: {
          p_collaboration: string
          p_reviewee: string
          p_reviewer: string
          p_sponsorship: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_pending_balance: {
        Args: { p_amount: number; p_profile_type: string; p_user_id: string }
        Returns: number
      }
      insert_payment_event: {
        Args: {
          p_campaign_id: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_metadata?: Json
        }
        Returns: undefined
      }
      is_blocked: { Args: { user_a: string; user_b: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { conversation_uuid: string; user_uuid: string }
        Returns: boolean
      }
      is_internal_user: { Args: never; Returns: boolean }
      is_org_owner_or_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_user_blocked: { Args: { p_other_id: string }; Returns: boolean }
      list_restaurant_cuisines: {
        Args: never
        Returns: {
          cuisine: string
        }[]
      }
      match_donny_knowledge: {
        Args: {
          match_count?: number
          query_embedding: string
          scope_filter?: string
        }
        Returns: {
          content: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      recompute_profile_rating: { Args: { p_user: string }; Returns: undefined }
      report_user: {
        Args: {
          p_conversation_id?: string
          p_reason?: string
          p_reported_id: string
        }
        Returns: undefined
      }
      request_org_deletion: { Args: { p_org_id: string }; Returns: undefined }
      resolve_dragonshare_orgs: {
        Args: { p_org_ids: string[] }
        Returns: {
          id: string
          logo_url: string
          name: string
          org_type: string
        }[]
      }
      restore_org: { Args: { p_org_id: string }; Returns: undefined }
      search_restaurants: {
        Args: {
          cuisine_filter?: string
          result_limit?: number
          search_term?: string
        }
        Returns: {
          address: string
          average_rating: number
          brand_category: string
          id: string
          logo_url: string
          name: string
          org_type: string
          total_reviews: number
        }[]
      }
      set_user_offline: { Args: { p_user_id: string }; Returns: undefined }
      unblock_user: { Args: { p_blocked_id: string }; Returns: undefined }
      user_in_conversation: {
        Args: { conversation_uuid: string; user_uuid: string }
        Returns: boolean
      }
      verify_dragonshare_post: {
        Args: {
          p_action: string
          p_post_id: string
          p_rejection_reason?: string
        }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "stakeholder"
      application_status:
        | "pending"
        | "accepted"
        | "rejected"
        | "counter_offered"
      campaign_status:
        | "draft"
        | "published"
        | "active"
        | "completed"
        | "cancelled"
      collaboration_status: "active" | "completed" | "cancelled"
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
      user_role: "business_client" | "content_creator" | "brand"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "moderator", "stakeholder"],
      application_status: [
        "pending",
        "accepted",
        "rejected",
        "counter_offered",
      ],
      campaign_status: [
        "draft",
        "published",
        "active",
        "completed",
        "cancelled",
      ],
      collaboration_status: ["active", "completed", "cancelled"],
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
      user_role: ["business_client", "content_creator", "brand"],
    },
  },
} as const
