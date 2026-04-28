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
      audit_reports: {
        Row: {
          blacklist_score: number | null
          content_score: number | null
          created_at: string
          details: Json | null
          dns_score: number | null
          domain: string
          engagement_score: number | null
          fixes: Json | null
          grade: string | null
          id: string
          infrastructure_score: number | null
          total_score: number | null
          user_id: string
        }
        Insert: {
          blacklist_score?: number | null
          content_score?: number | null
          created_at?: string
          details?: Json | null
          dns_score?: number | null
          domain: string
          engagement_score?: number | null
          fixes?: Json | null
          grade?: string | null
          id?: string
          infrastructure_score?: number | null
          total_score?: number | null
          user_id: string
        }
        Update: {
          blacklist_score?: number | null
          content_score?: number | null
          created_at?: string
          details?: Json | null
          dns_score?: number | null
          domain?: string
          engagement_score?: number | null
          fixes?: Json | null
          grade?: string | null
          id?: string
          infrastructure_score?: number | null
          total_score?: number | null
          user_id?: string
        }
        Relationships: []
      }
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
      campaign_sequences: {
        Row: {
          body: string
          campaign_id: string
          condition_type: Database["public"]["Enums"]["sequence_condition"]
          created_at: string
          delay_days: number
          id: string
          step_number: number
          subject: string
        }
        Insert: {
          body?: string
          campaign_id: string
          condition_type?: Database["public"]["Enums"]["sequence_condition"]
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject?: string
        }
        Update: {
          body?: string
          campaign_id?: string
          condition_type?: Database["public"]["Enums"]["sequence_condition"]
          created_at?: string
          delay_days?: number
          id?: string
          step_number?: number
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sequences_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
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
          paused_reason: string | null
          reply_count: number
          sent_count: number
          spam_complaint_count: number
          status: Database["public"]["Enums"]["campaign_status"]
          subject: string
          unsubscribe_count: number
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
          paused_reason?: string | null
          reply_count?: number
          sent_count?: number
          spam_complaint_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          unsubscribe_count?: number
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
          paused_reason?: string | null
          reply_count?: number
          sent_count?: number
          spam_complaint_count?: number
          status?: Database["public"]["Enums"]["campaign_status"]
          subject?: string
          unsubscribe_count?: number
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
      contact_custom_values: {
        Row: {
          contact_id: string
          field_id: string
          updated_at: string
          value_boolean: boolean | null
          value_date: string | null
          value_number: number | null
          value_text: string | null
        }
        Insert: {
          contact_id: string
          field_id: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Update: {
          contact_id?: string
          field_id?: string
          updated_at?: string
          value_boolean?: boolean | null
          value_date?: string | null
          value_number?: number | null
          value_text?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_custom_values_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_custom_values_field_fk"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "custom_field_definitions"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      contact_sequence_state: {
        Row: {
          campaign_id: string
          contact_id: string
          current_step: number
          id: string
          last_action: string | null
          last_action_at: string | null
          next_send_at: string | null
          scheduled_send_at: string | null
          status: Database["public"]["Enums"]["sequence_state_status"]
        }
        Insert: {
          campaign_id: string
          contact_id: string
          current_step?: number
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          next_send_at?: string | null
          scheduled_send_at?: string | null
          status?: Database["public"]["Enums"]["sequence_state_status"]
        }
        Update: {
          campaign_id?: string
          contact_id?: string
          current_step?: number
          id?: string
          last_action?: string | null
          last_action_at?: string | null
          next_send_at?: string | null
          scheduled_send_at?: string | null
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
      contact_tags: {
        Row: {
          added_at: string
          added_by_workflow_id: string | null
          contact_id: string
          tag_id: string
        }
        Insert: {
          added_at?: string
          added_by_workflow_id?: string | null
          contact_id: string
          tag_id: string
        }
        Update: {
          added_at?: string
          added_by_workflow_id?: string | null
          contact_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_tag_fk"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contact_tags_workflow_fk"
            columns: ["added_by_workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
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
          pipeline_entered_at: string | null
          pipeline_id: string | null
          pipeline_stage_entered_at: string | null
          pipeline_stage_id: string | null
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
          pipeline_entered_at?: string | null
          pipeline_id?: string | null
          pipeline_stage_entered_at?: string | null
          pipeline_stage_id?: string | null
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
          pipeline_entered_at?: string | null
          pipeline_id?: string | null
          pipeline_stage_entered_at?: string | null
          pipeline_stage_id?: string | null
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
          {
            foreignKeyName: "contacts_pipeline_fk"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_pipeline_stage_fk"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      copy_history: {
        Row: {
          audience: string | null
          created_at: string
          goal: string | null
          id: string
          pain_point: string | null
          product_context: string | null
          tone: string | null
          user_id: string
          variation_a: Json | null
          variation_b: Json | null
          variation_c: Json | null
        }
        Insert: {
          audience?: string | null
          created_at?: string
          goal?: string | null
          id?: string
          pain_point?: string | null
          product_context?: string | null
          tone?: string | null
          user_id: string
          variation_a?: Json | null
          variation_b?: Json | null
          variation_c?: Json | null
        }
        Update: {
          audience?: string | null
          created_at?: string
          goal?: string | null
          id?: string
          pain_point?: string | null
          product_context?: string | null
          tone?: string | null
          user_id?: string
          variation_a?: Json | null
          variation_b?: Json | null
          variation_c?: Json | null
        }
        Relationships: []
      }
      custom_field_definitions: {
        Row: {
          created_at: string
          field_type: string
          id: string
          key: string
          label: string
          options: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          field_type: string
          id?: string
          key: string
          label: string
          options?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          field_type?: string
          id?: string
          key?: string
          label?: string
          options?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      dns_health_log: {
        Row: {
          changed_from: Json | null
          changed_to: Json | null
          checked_at: string
          dkim_status: boolean
          dmarc_status: boolean
          domain: string
          id: string
          spf_status: boolean
        }
        Insert: {
          changed_from?: Json | null
          changed_to?: Json | null
          checked_at?: string
          dkim_status?: boolean
          dmarc_status?: boolean
          domain: string
          id?: string
          spf_status?: boolean
        }
        Update: {
          changed_from?: Json | null
          changed_to?: Json | null
          checked_at?: string
          dkim_status?: boolean
          dmarc_status?: boolean
          domain?: string
          id?: string
          spf_status?: boolean
        }
        Relationships: []
      }
      email_accounts: {
        Row: {
          created_at: string
          email: string
          id: string
          imap_host: string | null
          imap_port: number | null
          last_reply_length: string
          last_synced_uid: number
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
          warmup_status: string
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
          last_reply_length?: string
          last_synced_uid?: number
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
          warmup_status?: string
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
          last_reply_length?: string
          last_synced_uid?: number
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
          warmup_status?: string
          warmup_total_received?: number
          warmup_total_sent?: number
          warmup_weekdays_only?: boolean
        }
        Relationships: []
      }
      event_dlq: {
        Row: {
          created_at: string
          error: string
          event_type: string
          id: string
          original_event_id: string | null
          payload: Json | null
        }
        Insert: {
          created_at?: string
          error: string
          event_type: string
          id?: string
          original_event_id?: string | null
          payload?: Json | null
        }
        Update: {
          created_at?: string
          error?: string
          event_type?: string
          id?: string
          original_event_id?: string | null
          payload?: Json | null
        }
        Relationships: []
      }
      events: {
        Row: {
          contact_id: string | null
          error: string | null
          event_type: string
          id: string
          occurred_at: string
          payload: Json
          processed_at: string | null
          processing_status: string
          source: Json
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          error?: string | null
          event_type: string
          id?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          source?: Json
          user_id: string
        }
        Update: {
          contact_id?: string | null
          error?: string | null
          event_type?: string
          id?: string
          occurred_at?: string
          payload?: Json
          processed_at?: string | null
          processing_status?: string
          source?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
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
          message_uid: string | null
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
          message_uid?: string | null
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
          message_uid?: string | null
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
      list_cleaning_jobs: {
        Row: {
          created_at: string
          disposable_count: number
          filename: string
          id: string
          invalid_count: number
          risky_count: number
          status: string
          total_emails: number
          user_id: string
          valid_count: number
        }
        Insert: {
          created_at?: string
          disposable_count?: number
          filename?: string
          id?: string
          invalid_count?: number
          risky_count?: number
          status?: string
          total_emails?: number
          user_id: string
          valid_count?: number
        }
        Update: {
          created_at?: string
          disposable_count?: number
          filename?: string
          id?: string
          invalid_count?: number
          risky_count?: number
          status?: string
          total_emails?: number
          user_id?: string
          valid_count?: number
        }
        Relationships: []
      }
      list_cleaning_results: {
        Row: {
          created_at: string
          email: string
          id: string
          job_id: string
          reason: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          job_id: string
          reason?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          job_id?: string
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "list_cleaning_results_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "list_cleaning_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      list_contacts: {
        Row: {
          company: string | null
          created_at: string
          email: string
          id: string
          list_id: string
          name: string | null
          tags: string[]
        }
        Insert: {
          company?: string | null
          created_at?: string
          email: string
          id?: string
          list_id: string
          name?: string | null
          tags?: string[]
        }
        Update: {
          company?: string | null
          created_at?: string
          email?: string
          id?: string
          list_id?: string
          name?: string | null
          tags?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "list_contacts_list_id_fkey"
            columns: ["list_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stage_history: {
        Row: {
          changed_at: string
          changed_by: string
          contact_id: string
          from_stage_id: string | null
          id: string
          pipeline_id: string
          to_stage_id: string
          workflow_run_id: string | null
        }
        Insert: {
          changed_at?: string
          changed_by?: string
          contact_id: string
          from_stage_id?: string | null
          id?: string
          pipeline_id: string
          to_stage_id: string
          workflow_run_id?: string | null
        }
        Update: {
          changed_at?: string
          changed_by?: string
          contact_id?: string
          from_stage_id?: string | null
          id?: string
          pipeline_id?: string
          to_stage_id?: string
          workflow_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "psh_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psh_from_stage_fk"
            columns: ["from_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psh_pipeline_fk"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psh_run_fk"
            columns: ["workflow_run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "psh_to_stage_fk"
            columns: ["to_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          position?: number
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_fk"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          archived: boolean
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          name: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name: string
          user_id: string
        }
        Update: {
          archived?: boolean
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          name?: string
          user_id?: string
        }
        Relationships: []
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
      send_plans: {
        Row: {
          analysis: Json | null
          campaign_id: string | null
          created_at: string
          heatmap_data: Json | null
          id: string
          industry: string | null
          recommended_day: string | null
          recommended_time: string | null
          scheduled_at: string | null
          timezone: string | null
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          campaign_id?: string | null
          created_at?: string
          heatmap_data?: Json | null
          id?: string
          industry?: string | null
          recommended_day?: string | null
          recommended_time?: string | null
          scheduled_at?: string | null
          timezone?: string | null
          user_id: string
        }
        Update: {
          analysis?: Json | null
          campaign_id?: string | null
          created_at?: string
          heatmap_data?: Json | null
          id?: string
          industry?: string | null
          recommended_day?: string | null
          recommended_time?: string | null
          scheduled_at?: string | null
          timezone?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "send_plans_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
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
      spintax_templates: {
        Row: {
          created_at: string
          id: string
          name: string
          raw_content: string | null
          spintax_content: string | null
          user_id: string
          variation_count: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          raw_content?: string | null
          spintax_content?: string | null
          user_id: string
          variation_count?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          raw_content?: string | null
          spintax_content?: string | null
          user_id?: string
          variation_count?: number | null
        }
        Relationships: []
      }
      subject_tests: {
        Row: {
          created_at: string
          id: string
          predicted_open_rate: string | null
          spam_score: number | null
          subject_line: string
          suggestions: Json | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          predicted_open_rate?: string | null
          spam_score?: number | null
          subject_line: string
          suggestions?: Json | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          predicted_open_rate?: string | null
          spam_score?: number | null
          subject_line?: string
          suggestions?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      warmup_content_log: {
        Row: {
          account_id: string
          body_hash: string
          id: string
          sent_at: string
          subject_hash: string
        }
        Insert: {
          account_id: string
          body_hash: string
          id?: string
          sent_at?: string
          subject_hash: string
        }
        Update: {
          account_id?: string
          body_hash?: string
          id?: string
          sent_at?: string
          subject_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_content_log_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
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
      warmup_partnerships: {
        Row: {
          account_id: string
          assigned_at: string
          daily_interaction_count: number
          expires_at: string
          id: string
          last_interaction_date: string | null
          partner_account_id: string
          provider_type: string
        }
        Insert: {
          account_id: string
          assigned_at?: string
          daily_interaction_count?: number
          expires_at: string
          id?: string
          last_interaction_date?: string | null
          partner_account_id: string
          provider_type?: string
        }
        Update: {
          account_id?: string
          assigned_at?: string
          daily_interaction_count?: number
          expires_at?: string
          id?: string
          last_interaction_date?: string | null
          partner_account_id?: string
          provider_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_partnerships_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_partnerships_partner_account_id_fkey"
            columns: ["partner_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_rescues: {
        Row: {
          created_at: string
          id: string
          landed_in_spam_at: string | null
          message_id: string | null
          receiving_account_id: string
          rescue_success: boolean
          rescued_at: string | null
          sending_account_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          landed_in_spam_at?: string | null
          message_id?: string | null
          receiving_account_id: string
          rescue_success?: boolean
          rescued_at?: string | null
          sending_account_id: string
        }
        Update: {
          created_at?: string
          id?: string
          landed_in_spam_at?: string | null
          message_id?: string | null
          receiving_account_id?: string
          rescue_success?: boolean
          rescued_at?: string | null
          sending_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_rescues_receiving_account_id_fkey"
            columns: ["receiving_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_rescues_sending_account_id_fkey"
            columns: ["sending_account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_scores: {
        Row: {
          account_id: string
          age_score: number
          calculated_at: string
          dns_score: number
          gmail_score: number
          id: string
          outlook_score: number
          reply_score: number
          rescue_score: number
          score: number
        }
        Insert: {
          account_id: string
          age_score?: number
          calculated_at?: string
          dns_score?: number
          gmail_score?: number
          id?: string
          outlook_score?: number
          reply_score?: number
          rescue_score?: number
          score?: number
        }
        Update: {
          account_id?: string
          age_score?: number
          calculated_at?: string
          dns_score?: number
          gmail_score?: number
          id?: string
          outlook_score?: number
          reply_score?: number
          rescue_score?: number
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "warmup_scores_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      warmup_threads: {
        Row: {
          account_a: string
          account_b: string
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          next_reply_at: string | null
          next_reply_by: string | null
          previous_message_summary: string | null
          status: string
          thread_id: string
        }
        Insert: {
          account_a: string
          account_b: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          next_reply_at?: string | null
          next_reply_by?: string | null
          previous_message_summary?: string | null
          status?: string
          thread_id: string
        }
        Update: {
          account_a?: string
          account_b?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          next_reply_at?: string | null
          next_reply_by?: string | null
          previous_message_summary?: string | null
          status?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warmup_threads_account_a_fkey"
            columns: ["account_a"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_threads_account_b_fkey"
            columns: ["account_b"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warmup_threads_next_reply_by_fkey"
            columns: ["next_reply_by"]
            isOneToOne: false
            referencedRelation: "email_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempt: number
          created_at: string
          delivered_at: string | null
          direction: string
          endpoint_id: string
          id: string
          payload: Json
          response_body: string | null
          response_status: number | null
          status: string
        }
        Insert: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          direction: string
          endpoint_id: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
        }
        Update: {
          attempt?: number
          created_at?: string
          delivered_at?: string | null
          direction?: string
          endpoint_id?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_status?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_endpoint_fk"
            columns: ["endpoint_id"]
            isOneToOne: false
            referencedRelation: "webhook_endpoints"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_endpoints: {
        Row: {
          created_at: string
          direction: string
          events: Json
          id: string
          name: string
          secret: string
          status: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          direction: string
          events?: Json
          id?: string
          name: string
          secret: string
          status?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          direction?: string
          events?: Json
          id?: string
          name?: string
          secret?: string
          status?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      workflow_run_log: {
        Row: {
          duration_ms: number | null
          executed_at: string
          id: string
          node_id: string
          node_type: string
          result: Json | null
          run_id: string
          status: string
        }
        Insert: {
          duration_ms?: number | null
          executed_at?: string
          id?: string
          node_id: string
          node_type: string
          result?: Json | null
          run_id: string
          status: string
        }
        Update: {
          duration_ms?: number | null
          executed_at?: string
          id?: string
          node_id?: string
          node_type?: string
          result?: Json | null
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_run_log_run_fk"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "workflow_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_runs: {
        Row: {
          completed_at: string | null
          contact_id: string
          context: Json
          current_node_id: string | null
          error: string | null
          id: string
          next_action_at: string | null
          started_at: string
          status: string
          triggered_by: Json | null
          workflow_id: string
        }
        Insert: {
          completed_at?: string | null
          contact_id: string
          context?: Json
          current_node_id?: string | null
          error?: string | null
          id?: string
          next_action_at?: string | null
          started_at?: string
          status?: string
          triggered_by?: Json | null
          workflow_id: string
        }
        Update: {
          completed_at?: string | null
          contact_id?: string
          context?: Json
          current_node_id?: string | null
          error?: string | null
          id?: string
          next_action_at?: string | null
          started_at?: string
          status?: string
          triggered_by?: Json | null
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_runs_contact_fk"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_runs_workflow_fk"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflows: {
        Row: {
          created_at: string
          description: string | null
          exit_conditions: Json
          graph: Json
          id: string
          name: string
          stats: Json
          status: string
          trigger_config: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          exit_conditions?: Json
          graph?: Json
          id?: string
          name: string
          stats?: Json
          status?: string
          trigger_config?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          exit_conditions?: Json
          graph?: Json
          id?: string
          name?: string
          stats?: Json
          status?: string
          trigger_config?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      seed_workflow_defaults_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      campaign_status: "draft" | "sending" | "active" | "paused"
      contact_status: "pending" | "sent" | "opened" | "bounced" | "replied"
      sequence_condition: "no_open" | "open_no_reply" | "link_click" | "always"
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
      sequence_condition: ["no_open", "open_no_reply", "link_click", "always"],
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
