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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      analytics_events: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
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
          page_url?: string | null
          session_id?: string | null
          updated_at?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
      business_profiles: {
        Row: {
          account_type: string | null
          average_rating: number | null
          brand_category: string | null
          budget_range: string | null
          business_name: string
          company_size: string | null
          created_at: string | null
          description: string | null
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
          preferred_collaboration_style: string | null
          profile_slug: string | null
          profile_visibility: string | null
          sample_content_urls: string[] | null
          sponsorship_budget: number | null
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
          budget_range?: string | null
          business_name: string
          company_size?: string | null
          created_at?: string | null
          description?: string | null
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
          preferred_collaboration_style?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          sample_content_urls?: string[] | null
          sponsorship_budget?: number | null
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
          budget_range?: string | null
          business_name?: string
          company_size?: string | null
          created_at?: string | null
          description?: string | null
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
          preferred_collaboration_style?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          sample_content_urls?: string[] | null
          sponsorship_budget?: number | null
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
          campaign_id: string
          created_at: string
          creator_id: string
          id: string
          intro_message: string | null
          proposed_rate: number | null
          proposed_timeline: string | null
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          creator_id: string
          id?: string
          intro_message?: string | null
          proposed_rate?: number | null
          proposed_timeline?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          creator_id?: string
          id?: string
          intro_message?: string | null
          proposed_rate?: number | null
          proposed_timeline?: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_collaborations: {
        Row: {
          application_id: string | null
          campaign_id: string
          contract_details: Json | null
          created_at: string
          creator_id: string
          deliverables_status: Json | null
          id: string
          milestones: Json | null
          review_status: string | null
          status: Database["public"]["Enums"]["collaboration_status"]
          updated_at: string
        }
        Insert: {
          application_id?: string | null
          campaign_id: string
          contract_details?: Json | null
          created_at?: string
          creator_id: string
          deliverables_status?: Json | null
          id?: string
          milestones?: Json | null
          review_status?: string | null
          status?: Database["public"]["Enums"]["collaboration_status"]
          updated_at?: string
        }
        Update: {
          application_id?: string | null
          campaign_id?: string
          contract_details?: Json | null
          created_at?: string
          creator_id?: string
          deliverables_status?: Json | null
          id?: string
          milestones?: Json | null
          review_status?: string | null
          status?: Database["public"]["Enums"]["collaboration_status"]
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_invitations: {
        Row: {
          campaign_id: string
          created_at: string
          creator_id: string
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          budget_max: number | null
          budget_min: number | null
          created_at: string
          deadline: string | null
          deliverables: string[] | null
          description: string | null
          goals: string | null
          id: string
          platforms: string[] | null
          status: Database["public"]["Enums"]["campaign_status"]
          style: string | null
          title: string
          tone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          deadline?: string | null
          deliverables?: string[] | null
          description?: string | null
          goals?: string | null
          id?: string
          platforms?: string[] | null
          status?: Database["public"]["Enums"]["campaign_status"]
          style?: string | null
          title: string
          tone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          budget_max?: number | null
          budget_min?: number | null
          created_at?: string
          deadline?: string | null
          deliverables?: string[] | null
          description?: string | null
          goals?: string | null
          id?: string
          platforms?: string[] | null
          status?: Database["public"]["Enums"]["campaign_status"]
          style?: string | null
          title?: string
          tone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          created_at: string
          id: string
          is_archived: boolean | null
          last_message_at: string | null
          title: string | null
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_archived?: boolean | null
          last_message_at?: string | null
          title?: string | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      creator_profiles: {
        Row: {
          allow_portfolio_in_feed: boolean
          availability: string | null
          avatar_url: string | null
          average_rating: number | null
          base_rate_per_hour: number | null
          bio: string | null
          collaboration_preferences: string | null
          created_at: string | null
          creator_name: string
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
          portfolio_urls: string[] | null
          preferred_project_duration: string | null
          profile_slug: string | null
          profile_visibility: string | null
          response_time: string | null
          skills: Database["public"]["Enums"]["creator_skill"][] | null
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
          collaboration_preferences?: string | null
          created_at?: string | null
          creator_name: string
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
          portfolio_urls?: string[] | null
          preferred_project_duration?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          response_time?: string | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
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
          collaboration_preferences?: string | null
          created_at?: string | null
          creator_name?: string
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
          portfolio_urls?: string[] | null
          preferred_project_duration?: string | null
          profile_slug?: string | null
          profile_visibility?: string | null
          response_time?: string | null
          skills?: Database["public"]["Enums"]["creator_skill"][] | null
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_permissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            foreignKeyName: "file_uploads_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      profile_views: {
        Row: {
          id: string
          ip_address: unknown | null
          profile_id: string
          profile_type: string
          user_agent: string | null
          viewed_at: string | null
          viewer_id: string | null
        }
        Insert: {
          id?: string
          ip_address?: unknown | null
          profile_id: string
          profile_type: string
          user_agent?: string | null
          viewed_at?: string | null
          viewer_id?: string | null
        }
        Update: {
          id?: string
          ip_address?: unknown | null
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
      project_reviews: {
        Row: {
          collaboration_id: string
          communication_rating: number | null
          created_at: string | null
          id: string
          is_public: boolean | null
          professionalism_rating: number | null
          quality_rating: number | null
          rating: number
          review_text: string | null
          review_type: string
          reviewee_id: string
          reviewer_id: string
          timeliness_rating: number | null
          updated_at: string | null
        }
        Insert: {
          collaboration_id: string
          communication_rating?: number | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating: number
          review_text?: string | null
          review_type: string
          reviewee_id: string
          reviewer_id: string
          timeliness_rating?: number | null
          updated_at?: string | null
        }
        Update: {
          collaboration_id?: string
          communication_rating?: number | null
          created_at?: string | null
          id?: string
          is_public?: boolean | null
          professionalism_rating?: number | null
          quality_rating?: number | null
          rating?: number
          review_text?: string | null
          review_type?: string
          reviewee_id?: string
          reviewer_id?: string
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
        ]
      }
      push_notifications: {
        Row: {
          body: string
          created_at: string
          data: Json | null
          id: string
          read_at: string | null
          sent_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          data?: Json | null
          id?: string
          read_at?: string | null
          sent_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
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
    }
    Views: {
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
          sender_email: string | null
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
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      create_or_get_direct_conversation: {
        Args: { user1_uuid: string; user2_uuid: string }
        Returns: string
      }
      debug_user_upload_permissions: {
        Args: Record<PropertyKey, never>
        Returns: {
          is_authenticated: boolean
          profile_exists: boolean
          profile_role: string
          user_id: string
        }[]
      }
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
      get_unread_message_counts: {
        Args: { user_uuid: string }
        Returns: {
          campaign_id: string
          unread_count: number
        }[]
      }
      get_user_conversations: {
        Args: { user_uuid: string }
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
      get_user_display_name: {
        Args: { user_uuid: string }
        Returns: string
      }
      is_conversation_participant: {
        Args: { conversation_uuid: string; user_uuid: string }
        Returns: boolean
      }
      user_in_conversation: {
        Args: { conversation_uuid: string; user_uuid: string }
        Returns: boolean
      }
    }
    Enums: {
      application_status: "pending" | "accepted" | "rejected"
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
  public: {
    Enums: {
      application_status: ["pending", "accepted", "rejected"],
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
