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
  public: {
    Tables: {
      content_pillars: {
        Row: {
          created_at: string
          description: string | null
          example_themes: string[]
          id: string
          name: string
          project_id: string
          user_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          example_themes?: string[]
          id?: string
          name: string
          project_id: string
          user_id: string
          weight?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          example_themes?: string[]
          id?: string
          name?: string
          project_id?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "content_pillars_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_pillars_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          created_at: string
          duration_ms: number | null
          id: number
          payload: Json | null
          status: string
          step: string
          video_id: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          id?: number
          payload?: Json | null
          status: string
          step: string
          video_id: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          id?: number
          payload?: Json | null
          status?: string
          step?: string
          video_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      pillar_templates: {
        Row: {
          description: string | null
          example_themes: string[]
          id: string
          name: string
          sort_order: number
          weight: number
        }
        Insert: {
          description?: string | null
          example_themes?: string[]
          id?: string
          name: string
          sort_order?: number
          weight: number
        }
        Update: {
          description?: string | null
          example_themes?: string[]
          id?: string
          name?: string
          sort_order?: number
          weight?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          brand_voice: Json
          created_at: string
          default_language: string
          default_voice_clone_id: string | null
          handle: string | null
          id: string
          onboarding_completed_at: string | null
          onboarding_voice_skipped: boolean
          schedule_config: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          brand_voice?: Json
          created_at?: string
          default_language?: string
          default_voice_clone_id?: string | null
          handle?: string | null
          id: string
          onboarding_completed_at?: string | null
          onboarding_voice_skipped?: boolean
          schedule_config?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          brand_voice?: Json
          created_at?: string
          default_language?: string
          default_voice_clone_id?: string | null
          handle?: string | null
          id?: string
          onboarding_completed_at?: string | null
          onboarding_voice_skipped?: boolean
          schedule_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      project_brand: {
        Row: {
          audience: Json | null
          brand_name: string | null
          case_studies: Json | null
          ctas: Json | null
          do_not_say: Json | null
          features: Json | null
          id: string
          is_current: boolean
          one_liner: string | null
          parsed_at: string
          project_id: string
          raw: Json | null
          source_file_id: string
          value_props: Json | null
          voice_tone: string | null
        }
        Insert: {
          audience?: Json | null
          brand_name?: string | null
          case_studies?: Json | null
          ctas?: Json | null
          do_not_say?: Json | null
          features?: Json | null
          id?: string
          is_current?: boolean
          one_liner?: string | null
          parsed_at?: string
          project_id: string
          raw?: Json | null
          source_file_id: string
          value_props?: Json | null
          voice_tone?: string | null
        }
        Update: {
          audience?: Json | null
          brand_name?: string | null
          case_studies?: Json | null
          ctas?: Json | null
          do_not_say?: Json | null
          features?: Json | null
          id?: string
          is_current?: boolean
          one_liner?: string | null
          parsed_at?: string
          project_id?: string
          raw?: Json | null
          source_file_id?: string
          value_props?: Json | null
          voice_tone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_brand_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_brand_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          id: string
          kind: string
          mime_type: string
          parse_error: string | null
          parse_status: string
          parsed_at: string | null
          project_id: string
          size_bytes: number | null
          storage_path: string
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          mime_type: string
          parse_error?: string | null
          parse_status?: string
          parsed_at?: string | null
          project_id: string
          size_bytes?: number | null
          storage_path: string
          version: number
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          mime_type?: string
          parse_error?: string | null
          parse_status?: string
          parsed_at?: string | null
          project_id?: string
          size_bytes?: number | null
          storage_path?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_patterns: {
        Row: {
          cta_templates: Json | null
          formats: Json | null
          hashtags: Json | null
          hooks: Json | null
          id: string
          is_current: boolean
          pacing: Json | null
          parsed_at: string
          project_id: string
          raw: Json | null
          source_file_id: string
          visual_elements: Json | null
        }
        Insert: {
          cta_templates?: Json | null
          formats?: Json | null
          hashtags?: Json | null
          hooks?: Json | null
          id?: string
          is_current?: boolean
          pacing?: Json | null
          parsed_at?: string
          project_id: string
          raw?: Json | null
          source_file_id: string
          visual_elements?: Json | null
        }
        Update: {
          cta_templates?: Json | null
          formats?: Json | null
          hashtags?: Json | null
          hooks?: Json | null
          id?: string
          is_current?: boolean
          pacing?: Json | null
          parsed_at?: string
          project_id?: string
          raw?: Json | null
          source_file_id?: string
          visual_elements?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "project_patterns_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_patterns_source_file_id_fkey"
            columns: ["source_file_id"]
            isOneToOne: false
            referencedRelation: "project_files"
            referencedColumns: ["id"]
          },
        ]
      }
      project_used_signatures: {
        Row: {
          angle_hash: string | null
          format: string | null
          hook_hash: string
          hook_text: string | null
          id: string
          project_id: string
          similarity_window_days: number
          topic_hash: string | null
          topic_name: string | null
          used_at: string
          user_id: string
          video_id: string | null
        }
        Insert: {
          angle_hash?: string | null
          format?: string | null
          hook_hash: string
          hook_text?: string | null
          id?: string
          project_id: string
          similarity_window_days?: number
          topic_hash?: string | null
          topic_name?: string | null
          used_at?: string
          user_id: string
          video_id?: string | null
        }
        Update: {
          angle_hash?: string | null
          format?: string | null
          hook_hash?: string
          hook_text?: string | null
          id?: string
          project_id?: string
          similarity_window_days?: number
          topic_hash?: string | null
          topic_name?: string | null
          used_at?: string
          user_id?: string
          video_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_used_signatures_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_used_signatures_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_used_signatures_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: string
          language: string
          metadata: Json
          name: string
          niche: string
          slug: string
          status: string
          theme_color: string
          updated_at: string
          user_id: string
          voice_clone_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          language?: string
          metadata?: Json
          name: string
          niche?: string
          slug: string
          status?: string
          theme_color?: string
          updated_at?: string
          user_id: string
          voice_clone_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: string
          language?: string
          metadata?: Json
          name?: string
          niche?: string
          slug?: string
          status?: string
          theme_color?: string
          updated_at?: string
          user_id?: string
          voice_clone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      trends: {
        Row: {
          category: string
          detected_at: string
          expires_at: string
          id: number
          keywords: string[]
          score: number
          source: string
          title: string
          url: string
        }
        Insert: {
          category: string
          detected_at: string
          expires_at?: string
          id?: number
          keywords?: string[]
          score: number
          source: string
          title: string
          url: string
        }
        Update: {
          category?: string
          detected_at?: string
          expires_at?: string
          id?: number
          keywords?: string[]
          score?: number
          source?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      usage_records: {
        Row: {
          cost_usd: number
          created_at: string | null
          id: number
          metadata: Json | null
          service: string
          units: number
          user_id: string | null
        }
        Insert: {
          cost_usd: number
          created_at?: string | null
          id?: number
          metadata?: Json | null
          service: string
          units: number
          user_id?: string | null
        }
        Update: {
          cost_usd?: number
          created_at?: string | null
          id?: number
          metadata?: Json | null
          service?: string
          units?: number
          user_id?: string | null
        }
        Relationships: []
      }
      video_ideas: {
        Row: {
          angle: string | null
          created_at: string
          deleted_at: string | null
          estimated_duration: number | null
          format: string | null
          hook: string | null
          id: string
          metadata: Json | null
          pillar_id: string | null
          project_id: string
          signature_hash: string | null
          status: string
          user_id: string
        }
        Insert: {
          angle?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_duration?: number | null
          format?: string | null
          hook?: string | null
          id?: string
          metadata?: Json | null
          pillar_id?: string | null
          project_id: string
          signature_hash?: string | null
          status?: string
          user_id: string
        }
        Update: {
          angle?: string | null
          created_at?: string
          deleted_at?: string | null
          estimated_duration?: number | null
          format?: string | null
          hook?: string | null
          id?: string
          metadata?: Json | null
          pillar_id?: string | null
          project_id?: string
          signature_hash?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "video_ideas_pillar_id_fkey"
            columns: ["pillar_id"]
            isOneToOne: false
            referencedRelation: "content_pillars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_ideas_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "video_ideas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      video_performance: {
        Row: {
          avg_watch_time: number | null
          comments: number
          hook_retention: number | null
          id: string
          likes: number
          measured_at: string
          platform: string
          saves: number
          shares: number
          video_id: string
          views: number
        }
        Insert: {
          avg_watch_time?: number | null
          comments?: number
          hook_retention?: number | null
          id?: string
          likes?: number
          measured_at?: string
          platform: string
          saves?: number
          shares?: number
          video_id: string
          views?: number
        }
        Update: {
          avg_watch_time?: number | null
          comments?: number
          hook_retention?: number | null
          id?: string
          likes?: number
          measured_at?: string
          platform?: string
          saves?: number
          shares?: number
          video_id?: string
          views?: number
        }
        Relationships: [
          {
            foreignKeyName: "video_performance_video_id_fkey"
            columns: ["video_id"]
            isOneToOne: false
            referencedRelation: "videos"
            referencedColumns: ["id"]
          },
        ]
      }
      videos: {
        Row: {
          audio_url: string | null
          caption_instagram: string | null
          caption_shorts: string | null
          caption_tiktok: string | null
          captions: Json | null
          created_at: string
          deleted_at: string | null
          duration_seconds: number | null
          error: string | null
          hashtags: string[] | null
          id: string
          idea_id: string | null
          inngest_run_id: string | null
          language: string | null
          project_id: string
          published_at: string | null
          scheduled_for: string | null
          script: Json | null
          status: string
          template: string | null
          theme_color: string | null
          updated_at: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          caption_instagram?: string | null
          caption_shorts?: string | null
          caption_tiktok?: string | null
          captions?: Json | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          error?: string | null
          hashtags?: string[] | null
          id?: string
          idea_id?: string | null
          inngest_run_id?: string | null
          language?: string | null
          project_id: string
          published_at?: string | null
          scheduled_for?: string | null
          script?: Json | null
          status?: string
          template?: string | null
          theme_color?: string | null
          updated_at?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          caption_instagram?: string | null
          caption_shorts?: string | null
          caption_tiktok?: string | null
          captions?: Json | null
          created_at?: string
          deleted_at?: string | null
          duration_seconds?: number | null
          error?: string | null
          hashtags?: string[] | null
          id?: string
          idea_id?: string | null
          inngest_run_id?: string | null
          language?: string | null
          project_id?: string
          published_at?: string | null
          scheduled_for?: string | null
          script?: Json | null
          status?: string
          template?: string | null
          theme_color?: string | null
          updated_at?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "videos_idea_id_fkey"
            columns: ["idea_id"]
            isOneToOne: false
            referencedRelation: "video_ideas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "videos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      viral_hooks_seed: {
        Row: {
          best_platforms: string[]
          created_at: string
          estimated_engagement: string
          example_topics: string[]
          hook: string
          hook_type: string
          id: string
          language: string
          niche: string
        }
        Insert: {
          best_platforms?: string[]
          created_at?: string
          estimated_engagement: string
          example_topics?: string[]
          hook: string
          hook_type: string
          id?: string
          language?: string
          niche?: string
        }
        Update: {
          best_platforms?: string[]
          created_at?: string
          estimated_engagement?: string
          example_topics?: string[]
          hook?: string
          hook_type?: string
          id?: string
          language?: string
          niche?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sum_usage_last_30d: {
        Args: { p_service: string; p_user_id: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
