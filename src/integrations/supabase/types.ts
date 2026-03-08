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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      blacklist_checks: {
        Row: {
          account_id: string
          checked_at: string
          id: string
          is_clean: boolean
          listed_on: string[]
        }
        Insert: {
          account_id: string
          checked_at?: string
          id?: string
          is_clean?: boolean
          listed_on?: string[]
        }
        Update: {
          account_id?: string
          checked_at?: string
          id?: string
          is_clean?: boolean
          listed_on?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "blacklist_checks_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          account_id: string
          body: string
          bounce_count: number
          created_at: string
          daily_limit: number
          id: string
          is_sequence: boolean
          name: string
          open_count: number
          reply_count: number
          sent_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          subject: string
          user_id: string
        }
        Insert: {
          account_id: string
          body?: string
          bounce_count?: number
          created_at?: string
          daily_limit?: number
          id?: string
          is_sequence?: boolean
          name: string
          open_count?: number
          reply_count?: number
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          user_id: string
        }
        Update: {
          account_id?: string
          body?: string
          bounce_count?: number
          created_at?: string
          daily_limit?: number
          id?: string
          is_sequence?: boolean
          name?: string
          open_count?: number
          reply_count?: number
          sent_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_sequence_state: {
        Row: {
          campaign_id: string
          contact_id: string
          current_step: number
          id: string
          next_send_at: string | null
          status: Database["public"]["Enums"]["sequence_state_status"]
        }
        Insert: {
          campaign_id: string
          contact_id: string
          current_step?: number
          id?: string
          next_send_at?: string | null
          status?: Database["public"]["Enums"]["sequence_state_status"]
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          current_step?: number
          id?: string
          next_send_at?: string | null
          status?: Database["public"]["Enums"]["sequence_state_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contact_sequence_state_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_sequence_state_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          campaign_id: string
          email: string
          id: string
          name: string | null
          opened_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: Database["public"]["Enums"]["contact_status"]
        }
        Insert: {
          campaign_id: string
          email: string
          id?: string
          name?: string | null
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
        }
        Update: {
          campaign_id?: string
          email?: string
          id?: string
          name?: string | null
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: Database["public"]["Enums"]["contact_status"]
        }
        Relationships: [
          {
            foreignKeyName: "contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      email_accounts: {
        Row: {
          created_at: string
          email: string
          id: string
          imap_host: string | null
          imap_port: number | null
          mark_important_rate: number
          name: string
          password: string
          reputation_score: number
          smtp_host: string
          smtp_port: number
          smtp_secure: boolean
          spam_rescue_rate: number
          status: string
          user_id: string
          username: string
          warmup_daily_limit: number
          warmup_enabled: boolean
          warmup_ramp_day: number
          warmup_sent_today: number
          warmup_start_date: string | null
          warmup_total_received: number
          warmup_total_sent: number
          warmup_weekdays_only: boolean
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          mark_important_rate?: number
          name: string
          password: string
          reputation_score?: number
          smtp_host: string
          smtp_port?: number
          smtp_secure?: boolean
          spam_rescue_rate?: number
          status?: string
          user_id: string
          username: string
          warmup_daily_limit?: number
          warmup_enabled?: boolean
          warmup_ramp_day?: number
          warmup_sent_today?: number
          warmup_start_date?: string | null
          warmup_total_received?: number
          warmup_total_sent?: number
          warmup_weekdays_only?: boolean
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          imap_host?: string | null
          imap_port?: number | null
          mark_important_rate?: number
          name?: string
          password?: string
          reputation_score?: number
          smtp_host?: string
          smtp_port?: number
          smtp_secure?: boolean
          spam_rescue_rate?: number
          status?: string
          user_id?: string
          username?: string
          warmup_daily_limit?: number
          warmup_enabled?: boolean
          warmup_ramp_day?: number
          warmup_sent_today?: number
          warmup_start_date?: string | null
          warmup_total_received?: number
          warmup_total_sent?: number
          warmup_weekdays_only?: boolean
        }
        Relationships: []
      }
      inbox_messages: {
        Row: {
          account_id: string
          body: string | null
          from_email: string | null
          from_name: string | null
          id: string
          is_read: boolean
          is_warmup: boolean
          received_at: string
          subject: string | null
        }
        Insert: {
          account_id: string
          body?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_read?: boolean
          is_warmup?: boolean
          received_at?: string
          subject?: string | null
        }
        Update: {
          account_id?: string
          body?: string | null
          from_email?: string | null
          from_name?: string | null
          id?: string
          is_read?: boolean
          is_warmup?: boolean
          received_at?: string
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inbox_messages_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_results: {
        Row: {
          created_at: string
          id: string
          provider: string
          result: string
          seed_email: string
          test_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider: string
          result?: string
          seed_email: string
          test_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          result?: string
          seed_email?: string
          test_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_results_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "placement_tests"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_tests: {
        Row: {
          account_id: string
          body: string
          created_at: string
          id: string
          subject: string
          user_id: string
        }
        Insert: {
          account_id: string
          body?: string
          created_at?: string
          id?: string
          subject?: string
          user_id: string
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string
          id?: string
          subject?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_tests_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      sequence_steps: {
        Row: {
          body: string
          campaign_id: string
          delay_days: number
          delay_hours: number
          id: string
          step_number: number
          subject: string
        }
        Insert: {
          body?: string
          campaign_id: string
          delay_days?: number
          delay_hours?: number
          id?: string
          step_number?: number
          subject?: string
        }
        Update: {
          body?: string
          campaign_id?: string
          delay_days?: number
          delay_hours?: number
          id?: string
          step_number?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "sequence_steps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          ai_warmup_enabled: boolean
          created_at: string
          id: string
          seed_custom: string | null
          seed_gmail: string | null
          seed_outlook: string | null
          tracking_domain: string | null
          tracking_domain_verified: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          ai_warmup_enabled?: boolean
          created_at?: string
          id?: string
          seed_custom?: string | null
          seed_gmail?: string | null
          seed_outlook?: string | null
          tracking_domain?: string | null
          tracking_domain_verified?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          ai_warmup_enabled?: boolean
          created_at?: string
          id?: string
          seed_custom?: string | null
          seed_gmail?: string | null
          seed_outlook?: string | null
          tracking_domain?: string | null
          tracking_domain_verified?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_logs: {
        Row: {
          account_id: string
          created_at: string
          id: string
          partner_email: string | null
          status: string
          subject: string | null
          type: Database["public"]["Enums"]["warmup_log_type"]
        }
        Insert: {
          account_id: string
          created_at?: string
          id?: string
          partner_email?: string | null
          status?: string
          subject?: string | null
          type?: Database["public"]["Enums"]["warmup_log_type"]
        }
        Update: {
          account_id?: string
          created_at?: string
          id?: string
          partner_email?: string | null
          status?: string
          subject?: string | null
          type?: Database["public"]["Enums"]["warmup_log_type"]
        }
        Relationships: [
          {
            foreignKeyName: "warmup_logs_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      campaign_status: "draft" | "sending" | "active" | "paused"
      contact_status: "pending" | "sent" | "opened" | "bounced" | "replied"
      sequence_state_status: "active" | "completed" | "paused"
      warmup_log_type:
        | "sent"
        | "received"
        | "marked_important"
        | "rescued_from_spam"
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
      campaign_status: ["draft", "sending", "active", "paused"],
      contact_status: ["pending", "sent", "opened", "bounced", "replied"],
      sequence_state_status: ["active", "completed", "paused"],
      warmup_log_type: [
        "sent",
        "received",
        "marked_important",
        "rescued_from_spam",
      ],
    },
  },
} as const
