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
      accounts: {
        Row: {
          color: string | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          icon: string | null
          id: number
          include_in_net_worth: boolean
          institution_code: string | null
          is_archived: boolean
          name: string
          notes: string | null
          opening_balance: number
          sort_order: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          icon?: string | null
          id?: never
          include_in_net_worth?: boolean
          institution_code?: string | null
          is_archived?: boolean
          name: string
          notes?: string | null
          opening_balance?: number
          sort_order?: number
          type: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          icon?: string | null
          id?: never
          include_in_net_worth?: boolean
          institution_code?: string | null
          is_archived?: boolean
          name?: string
          notes?: string | null
          opening_balance?: number
          sort_order?: number
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          description: string
          entity_id: number | null
          entity_type: string
          id: number
          payload: Json
          workspace_id: number
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          description: string
          entity_id?: number | null
          entity_type: string
          id?: never
          payload?: Json
          workspace_id: number
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          description?: string
          entity_id?: number | null
          entity_type?: string
          id?: never
          payload?: Json
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "activity_log_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feature_daily_usage: {
        Row: {
          created_at: string
          feature_key: string
          id: number
          model: string | null
          tone: string | null
          usage_date: string
          user_id: string
          workspace_id: number | null
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: number
          model?: string | null
          tone?: string | null
          usage_date: string
          user_id: string
          workspace_id?: number | null
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: number
          model?: string | null
          tone?: string | null
          usage_date?: string
          user_id?: string
          workspace_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feature_daily_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_feature_daily_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_feature_daily_usage_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feature_snapshots: {
        Row: {
          computed_at: string
          created_at: string
          engine_version: string
          id: number
          period_key: string
          signals: Json
          snapshot_kind: string
          source_metrics: Json
          user_id: string
          workspace_id: number
        }
        Insert: {
          computed_at?: string
          created_at?: string
          engine_version?: string
          id?: number
          period_key: string
          signals?: Json
          snapshot_kind?: string
          source_metrics?: Json
          user_id: string
          workspace_id: number
        }
        Update: {
          computed_at?: string
          created_at?: string
          engine_version?: string
          id?: number
          period_key?: string
          signals?: Json
          snapshot_kind?: string
          source_metrics?: Json
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_feature_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_feature_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_feature_snapshots_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_feature_usage_events: {
        Row: {
          created_at: string
          feature_key: string
          id: number
          latency_ms: number | null
          model: string
          status: string
          surface: string | null
          usage_date: string
          user_id: string
          workspace_id: number | null
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: number
          latency_ms?: number | null
          model: string
          status?: string
          surface?: string | null
          usage_date: string
          user_id: string
          workspace_id?: number | null
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: number
          latency_ms?: number | null
          model?: string
          status?: string
          surface?: string | null
          usage_date?: string
          user_id?: string
          workspace_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_feature_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_feature_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_feature_usage_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_narrative_briefings: {
        Row: {
          confidence_score: number | null
          created_at: string
          expires_at: string | null
          feature_snapshot_id: number | null
          generated_at: string
          id: number
          input_payload: Json
          language_code: string
          model: string | null
          narrative_kind: string
          output_payload: Json
          period_key: string
          prompt_version: string
          provider: string
          recommendations: Json
          summary: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string
          expires_at?: string | null
          feature_snapshot_id?: number | null
          generated_at?: string
          id?: number
          input_payload?: Json
          language_code?: string
          model?: string | null
          narrative_kind?: string
          output_payload?: Json
          period_key: string
          prompt_version?: string
          provider?: string
          recommendations?: Json
          summary: string
          user_id: string
          workspace_id: number
        }
        Update: {
          confidence_score?: number | null
          created_at?: string
          expires_at?: string | null
          feature_snapshot_id?: number | null
          generated_at?: string
          id?: number
          input_payload?: Json
          language_code?: string
          model?: string | null
          narrative_kind?: string
          output_payload?: Json
          period_key?: string
          prompt_version?: string
          provider?: string
          recommendations?: Json
          summary?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_narrative_briefings_feature_snapshot_id_fkey"
            columns: ["feature_snapshot_id"]
            isOneToOne: false
            referencedRelation: "ai_feature_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_narrative_briefings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_narrative_briefings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "ai_narrative_briefings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_user_preferences: {
        Row: {
          allow_third_party_processing: boolean
          consent_granted_at: string | null
          created_at: string
          insights_enabled: boolean
          max_months_context: number
          provider: string
          share_aggregated_financial_context: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          allow_third_party_processing?: boolean
          consent_granted_at?: string | null
          created_at?: string
          insights_enabled?: boolean
          max_months_context?: number
          provider?: string
          share_aggregated_financial_context?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          allow_third_party_processing?: boolean
          consent_granted_at?: string | null
          created_at?: string
          insights_enabled?: boolean
          max_months_context?: number
          provider?: string
          share_aggregated_financial_context?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      app_error_logs: {
        Row: {
          app_version: string | null
          context: Json | null
          created_at: string
          id: string
          level: string
          message: string
          platform: string | null
          source: string
          user_id: string | null
        }
        Insert: {
          app_version?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          level: string
          message: string
          platform?: string | null
          source: string
          user_id?: string | null
        }
        Update: {
          app_version?: string | null
          context?: Json | null
          created_at?: string
          id?: string
          level?: string
          message?: string
          platform?: string | null
          source?: string
          user_id?: string | null
        }
        Relationships: []
      }
      attachments: {
        Row: {
          bucket_name: string
          created_at: string
          entity_id: number
          entity_type: string
          file_name: string
          file_path: string
          height: number | null
          id: number
          mime_type: string
          size_bytes: number
          uploaded_by_user_id: string
          width: number | null
          workspace_id: number
        }
        Insert: {
          bucket_name?: string
          created_at?: string
          entity_id: number
          entity_type: string
          file_name: string
          file_path: string
          height?: number | null
          id?: never
          mime_type: string
          size_bytes: number
          uploaded_by_user_id: string
          width?: number | null
          workspace_id: number
        }
        Update: {
          bucket_name?: string
          created_at?: string
          entity_id?: number
          entity_type?: string
          file_name?: string
          file_path?: string
          height?: number | null
          id?: never
          mime_type?: string
          size_bytes?: number
          uploaded_by_user_id?: string
          width?: number | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          created_at: string
          external_reference: string | null
          id: number
          payload: Json
          processed: boolean
          processed_at: string | null
          processing_error: string | null
          provider: string
          provider_event_id: string | null
          provider_event_type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          external_reference?: string | null
          id?: number
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          provider: string
          provider_event_id?: string | null
          provider_event_type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          external_reference?: string | null
          id?: number
          payload?: Json
          processed?: boolean
          processed_at?: string | null
          processing_error?: string | null
          provider?: string
          provider_event_id?: string | null
          provider_event_type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      budgets: {
        Row: {
          account_id: number | null
          alert_percent: number
          category_id: number | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          id: number
          is_active: boolean
          is_pinned: boolean
          limit_amount: number
          name: string
          notes: string | null
          period_end: string
          period_start: string
          rollover_enabled: boolean
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          account_id?: number | null
          alert_percent?: number
          category_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          id?: never
          is_active?: boolean
          is_pinned?: boolean
          limit_amount: number
          name: string
          notes?: string | null
          period_end: string
          period_start: string
          rollover_enabled?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          account_id?: number | null
          alert_percent?: number
          category_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          id?: never
          is_active?: boolean
          is_pinned?: boolean
          limit_amount?: number
          name?: string
          notes?: string | null
          period_end?: string
          period_start?: string
          rollover_enabled?: boolean
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          created_by_user_id: string | null
          icon: string | null
          id: number
          is_active: boolean
          is_pinned: boolean
          is_system: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id: number | null
          sort_order: number
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string | null
          icon?: string | null
          id?: never
          is_active?: boolean
          is_pinned?: boolean
          is_system?: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_user_id?: string | null
          icon?: string | null
          id?: never
          is_active?: boolean
          is_pinned?: boolean
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          parent_id?: number | null
          sort_order?: number
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "categories_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparties: {
        Row: {
          created_at: string
          created_by_user_id: string | null
          document_number: string | null
          email: string | null
          id: number
          is_archived: boolean
          is_pinned: boolean
          name: string
          notes: string | null
          phone: string | null
          type: Database["public"]["Enums"]["party_type"]
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          created_at?: string
          created_by_user_id?: string | null
          document_number?: string | null
          email?: string | null
          id?: never
          is_archived?: boolean
          is_pinned?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          created_at?: string
          created_by_user_id?: string | null
          document_number?: string | null
          email?: string | null
          id?: never
          is_archived?: boolean
          is_pinned?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          type?: Database["public"]["Enums"]["party_type"]
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      counterparty_roles: {
        Row: {
          counterparty_id: number
          created_at: string
          id: number
          notes: string | null
          role_type: Database["public"]["Enums"]["counterparty_role_type"]
          updated_at: string
          workspace_id: number
        }
        Insert: {
          counterparty_id: number
          created_at?: string
          id?: number
          notes?: string | null
          role_type: Database["public"]["Enums"]["counterparty_role_type"]
          updated_at?: string
          workspace_id: number
        }
        Update: {
          counterparty_id?: number
          created_at?: string
          id?: number
          notes?: string | null
          role_type?: Database["public"]["Enums"]["counterparty_role_type"]
          updated_at?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "counterparty_roles_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "counterparty_roles_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "counterparty_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "counterparty_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "counterparty_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          decimals: number
          is_active: boolean
          name: string
          symbol: string
        }
        Insert: {
          code: string
          created_at?: string
          decimals?: number
          is_active?: boolean
          name: string
          symbol: string
        }
        Update: {
          code?: string
          created_at?: string
          decimals?: number
          is_active?: boolean
          name?: string
          symbol?: string
        }
        Relationships: []
      }
      dashboard_ai_cache: {
        Row: {
          created_at: string
          feature_key: string
          id: number
          model: string | null
          response: Json
          summary_hash: string | null
          tone: string | null
          usage_date: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          feature_key: string
          id?: number
          model?: string | null
          response: Json
          summary_hash?: string | null
          tone?: string | null
          usage_date: string
          user_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          feature_key?: string
          id?: number
          model?: string | null
          response?: Json
          summary_hash?: string | null
          tone?: string | null
          usage_date?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_ai_cache_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "dashboard_ai_cache_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "dashboard_ai_cache_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string
          effective_at: string
          from_currency_code: string
          id: number
          is_pinned: boolean
          notes: string | null
          rate: number
          source: string | null
          to_currency_code: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          effective_at?: string
          from_currency_code: string
          id?: number
          is_pinned?: boolean
          notes?: string | null
          rate: number
          source?: string | null
          to_currency_code: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          effective_at?: string
          from_currency_code?: string
          id?: number
          is_pinned?: boolean
          notes?: string | null
          rate?: number
          source?: string | null
          to_currency_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      movement_learning_feedback: {
        Row: {
          accepted_category_id: number | null
          confidence: number | null
          created_at: string
          feedback_kind: string
          id: number
          metadata: Json
          movement_id: number
          normalized_description: string | null
          previous_category_id: number | null
          source: string
          user_id: string | null
          workspace_id: number
        }
        Insert: {
          accepted_category_id?: number | null
          confidence?: number | null
          created_at?: string
          feedback_kind: string
          id?: number
          metadata?: Json
          movement_id: number
          normalized_description?: string | null
          previous_category_id?: number | null
          source?: string
          user_id?: string | null
          workspace_id: number
        }
        Update: {
          accepted_category_id?: number | null
          confidence?: number | null
          created_at?: string
          feedback_kind?: string
          id?: number
          metadata?: Json
          movement_id?: number
          normalized_description?: string | null
          previous_category_id?: number | null
          source?: string
          user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "movement_learning_feedback_accepted_category_id_fkey"
            columns: ["accepted_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_learning_feedback_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_learning_feedback_previous_category_id_fkey"
            columns: ["previous_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_learning_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "movement_learning_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "movement_learning_feedback_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      movement_templates: {
        Row: {
          category_id: number | null
          counterparty_id: number | null
          created_at: string
          created_by_user_id: string
          description: string
          destination_account_id: number | null
          destination_amount: number | null
          id: number
          movement_type: string
          name: string
          notes: string | null
          sort_order: number
          source_account_id: number | null
          source_amount: number | null
          updated_at: string
          workspace_id: number
        }
        Insert: {
          category_id?: number | null
          counterparty_id?: number | null
          created_at?: string
          created_by_user_id: string
          description?: string
          destination_account_id?: number | null
          destination_amount?: number | null
          id?: number
          movement_type: string
          name: string
          notes?: string | null
          sort_order?: number
          source_account_id?: number | null
          source_amount?: number | null
          updated_at?: string
          workspace_id: number
        }
        Update: {
          category_id?: number | null
          counterparty_id?: number | null
          created_at?: string
          created_by_user_id?: string
          description?: string
          destination_account_id?: number | null
          destination_amount?: number | null
          id?: number
          movement_type?: string
          name?: string
          notes?: string | null
          sort_order?: number
          source_account_id?: number | null
          source_amount?: number | null
          updated_at?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "movement_templates_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_templates_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_templates_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "movement_templates_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_templates_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "movement_templates_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movement_templates_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "movement_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "movement_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "movement_templates_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      movements: {
        Row: {
          category_id: number | null
          client_dedupe_key: string | null
          counterparty_id: number | null
          created_at: string
          created_by_user_id: string | null
          description: string
          destination_account_id: number | null
          destination_amount: number | null
          fx_rate: number | null
          id: number
          metadata: Json
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes: string | null
          obligation_id: number | null
          occurred_at: string
          source_account_id: number | null
          source_amount: number | null
          status: Database["public"]["Enums"]["movement_status"]
          subscription_id: number | null
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          category_id?: number | null
          client_dedupe_key?: string | null
          counterparty_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          description: string
          destination_account_id?: number | null
          destination_amount?: number | null
          fx_rate?: number | null
          id?: never
          metadata?: Json
          movement_type: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          obligation_id?: number | null
          occurred_at?: string
          source_account_id?: number | null
          source_amount?: number | null
          status?: Database["public"]["Enums"]["movement_status"]
          subscription_id?: number | null
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          category_id?: number | null
          client_dedupe_key?: string | null
          counterparty_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          description?: string
          destination_account_id?: number | null
          destination_amount?: number | null
          fx_rate?: number | null
          id?: never
          metadata?: Json
          movement_type?: Database["public"]["Enums"]["movement_type"]
          notes?: string | null
          obligation_id?: number | null
          occurred_at?: string
          source_account_id?: number | null
          source_amount?: number | null
          status?: Database["public"]["Enums"]["movement_status"]
          subscription_id?: number | null
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "movements_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "movements_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_destination_account_id_fkey"
            columns: ["destination_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "movements_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "v_obligation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_source_account_id_fkey"
            columns: ["source_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "movements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "movements_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_upcoming"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "movements_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_detected_movement_suggestions: {
        Row: {
          amount: number
          app_label: string
          confidence: string
          created_at: string
          currency_code: string
          dedupe_key: string
          description: string
          financial_app_key: string
          id: number
          metadata: Json
          movement_id: number | null
          movement_type: string
          notification_key: string | null
          occurred_at: string
          package_name: string
          status: string
          updated_at: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          amount: number
          app_label: string
          confidence: string
          created_at?: string
          currency_code: string
          dedupe_key: string
          description: string
          financial_app_key: string
          id?: number
          metadata?: Json
          movement_id?: number | null
          movement_type: string
          notification_key?: string | null
          occurred_at: string
          package_name: string
          status?: string
          updated_at?: string
          user_id: string
          workspace_id: number
        }
        Update: {
          amount?: number
          app_label?: string
          confidence?: string
          created_at?: string
          currency_code?: string
          dedupe_key?: string
          description?: string
          financial_app_key?: string
          id?: number
          metadata?: Json
          movement_id?: number | null
          movement_type?: string
          notification_key?: string | null
          occurred_at?: string
          package_name?: string
          status?: string
          updated_at?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_detected_movement_suggestions_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_detected_movement_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_detected_movement_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_detected_movement_suggestions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_detection_app_settings: {
        Row: {
          created_at: string
          default_account_id: number | null
          enabled: boolean
          financial_app_key: string
          id: number
          updated_at: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          default_account_id?: number | null
          enabled?: boolean
          financial_app_key: string
          id?: number
          updated_at?: string
          user_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          default_account_id?: number | null
          enabled?: boolean
          financial_app_key?: string
          id?: number
          updated_at?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_detection_app_settings_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_detection_app_settings_default_account_id_fkey"
            columns: ["default_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "notification_detection_app_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_detection_app_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_detection_app_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_detection_telemetry: {
        Row: {
          created_at: string
          event: string
          financial_app_key: string | null
          id: number
          metadata: Json
          native_suggestion_id: string | null
          suggestion_id: number | null
          surface: string | null
          user_id: string | null
          workspace_id: number | null
        }
        Insert: {
          created_at?: string
          event: string
          financial_app_key?: string | null
          id?: number
          metadata?: Json
          native_suggestion_id?: string | null
          suggestion_id?: number | null
          surface?: string | null
          user_id?: string | null
          workspace_id?: number | null
        }
        Update: {
          created_at?: string
          event?: string
          financial_app_key?: string | null
          id?: number
          metadata?: Json
          native_suggestion_id?: string | null
          suggestion_id?: number | null
          surface?: string | null
          user_id?: string | null
          workspace_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_detection_telemetry_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "notification_detected_movement_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_detection_telemetry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_detection_telemetry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_detection_telemetry_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_digest_daily_log: {
        Row: {
          created_at: string
          digest_date: string
          id: number
          notification_count: number
          top_kinds: string[]
          user_id: string
        }
        Insert: {
          created_at?: string
          digest_date: string
          id?: number
          notification_count?: number
          top_kinds?: string[]
          user_id: string
        }
        Update: {
          created_at?: string
          digest_date?: string
          id?: number
          notification_count?: number
          top_kinds?: string[]
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          created_at: string
          daily_digest_enabled: boolean
          email_enabled: boolean
          in_app_enabled: boolean
          is_active: boolean
          muted_kinds: Json
          platform: string | null
          predictive_alerts_enabled: boolean
          push_enabled: boolean
          push_token: string | null
          smart_alerts_enabled: boolean
          smart_celebrations_enabled: boolean
          smart_insights_enabled: boolean
          smart_reads: Json
          ui_prefs: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          daily_digest_enabled?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          is_active?: boolean
          muted_kinds?: Json
          platform?: string | null
          predictive_alerts_enabled?: boolean
          push_enabled?: boolean
          push_token?: string | null
          smart_alerts_enabled?: boolean
          smart_celebrations_enabled?: boolean
          smart_insights_enabled?: boolean
          smart_reads?: Json
          ui_prefs?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          daily_digest_enabled?: boolean
          email_enabled?: boolean
          in_app_enabled?: boolean
          is_active?: boolean
          muted_kinds?: Json
          platform?: string | null
          predictive_alerts_enabled?: boolean
          push_enabled?: boolean
          push_token?: string | null
          smart_alerts_enabled?: boolean
          smart_celebrations_enabled?: boolean
          smart_insights_enabled?: boolean
          smart_reads?: Json
          ui_prefs?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_push_delivery_log: {
        Row: {
          bypass_daily_limit: boolean
          created_at: string
          decision: string
          id: number
          kind: string
          notification_id: number
          priority: string
          usage_date: string
          user_id: string
        }
        Insert: {
          bypass_daily_limit?: boolean
          created_at?: string
          decision: string
          id?: number
          kind: string
          notification_id: number
          priority: string
          usage_date: string
          user_id: string
        }
        Update: {
          bypass_daily_limit?: boolean
          created_at?: string
          decision?: string
          id?: number
          kind?: string
          notification_id?: number
          priority?: string
          usage_date?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_push_delivery_log_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_suggestion_actions: {
        Row: {
          action: string
          confidence_at_decision: string | null
          created_at: string
          dedupe_key: string | null
          final_value: string | null
          id: number
          metadata: Json
          model_at_decision: string | null
          suggested_value: string | null
          suggestion_id: number | null
          surface: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          action: string
          confidence_at_decision?: string | null
          created_at?: string
          dedupe_key?: string | null
          final_value?: string | null
          id?: number
          metadata?: Json
          model_at_decision?: string | null
          suggested_value?: string | null
          suggestion_id?: number | null
          surface: string
          user_id: string
          workspace_id: number
        }
        Update: {
          action?: string
          confidence_at_decision?: string | null
          created_at?: string
          dedupe_key?: string | null
          final_value?: string | null
          id?: number
          metadata?: Json
          model_at_decision?: string | null
          suggested_value?: string | null
          suggestion_id?: number | null
          surface?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "notification_suggestion_actions_suggestion_id_fkey"
            columns: ["suggestion_id"]
            isOneToOne: false
            referencedRelation: "notification_detected_movement_suggestions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_suggestion_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_suggestion_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "notification_suggestion_actions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          archived_at: string | null
          body: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          id: number
          kind: string | null
          payload: Json
          read_at: string | null
          related_entity_id: number | null
          related_entity_type: string | null
          scheduled_for: string
          sent_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          archived_at?: string | null
          body: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: never
          kind?: string | null
          payload?: Json
          read_at?: string | null
          related_entity_id?: number | null
          related_entity_type?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          archived_at?: string | null
          body?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          id?: never
          kind?: string | null
          payload?: Json
          read_at?: string | null
          related_entity_id?: number | null
          related_entity_type?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      obligation_change_history: {
        Row: {
          after_data: Json
          before_data: Json
          change_type: string
          changed_by_user_id: string | null
          created_at: string
          id: number
          metadata: Json
          obligation_id: number
          reason: string | null
          workspace_id: number
        }
        Insert: {
          after_data?: Json
          before_data?: Json
          change_type: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          obligation_id: number
          reason?: string | null
          workspace_id: number
        }
        Update: {
          after_data?: Json
          before_data?: Json
          change_type?: string
          changed_by_user_id?: string | null
          created_at?: string
          id?: number
          metadata?: Json
          obligation_id?: number
          reason?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "obligation_change_history_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_change_history_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "v_obligation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_change_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_change_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_change_history_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      obligation_event_viewer_links: {
        Row: {
          account_id: number | null
          created_at: string
          event_id: number
          id: number
          linked_by_user_id: string
          movement_id: number | null
          obligation_id: number
          share_id: number
          viewer_workspace_id: number | null
        }
        Insert: {
          account_id?: number | null
          created_at?: string
          event_id: number
          id?: number
          linked_by_user_id: string
          movement_id?: number | null
          obligation_id: number
          share_id: number
          viewer_workspace_id?: number | null
        }
        Update: {
          account_id?: number | null
          created_at?: string
          event_id?: number
          id?: number
          linked_by_user_id?: string
          movement_id?: number | null
          obligation_id?: number
          share_id?: number
          viewer_workspace_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "obligation_event_viewer_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "obligation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "v_obligation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "obligation_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_viewer_workspace_id_fkey"
            columns: ["viewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_viewer_workspace_id_fkey"
            columns: ["viewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_event_viewer_links_viewer_workspace_id_fkey"
            columns: ["viewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      obligation_events: {
        Row: {
          amount: number
          created_at: string
          created_by_user_id: string | null
          description: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["obligation_event_type"]
          id: number
          installment_no: number | null
          metadata: Json
          movement_id: number | null
          notes: string | null
          obligation_id: number
          reason: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          event_date: string
          event_type: Database["public"]["Enums"]["obligation_event_type"]
          id?: never
          installment_no?: number | null
          metadata?: Json
          movement_id?: number | null
          notes?: string | null
          obligation_id: number
          reason?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by_user_id?: string | null
          description?: string | null
          event_date?: string
          event_type?: Database["public"]["Enums"]["obligation_event_type"]
          id?: never
          installment_no?: number | null
          metadata?: Json
          movement_id?: number | null
          notes?: string | null
          obligation_id?: number
          reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "obligation_events_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_events_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_events_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "v_obligation_summary"
            referencedColumns: ["id"]
          },
        ]
      }
      obligation_payment_requests: {
        Row: {
          accepted_event_id: number | null
          amount: number
          created_at: string
          description: string | null
          id: number
          installment_no: number | null
          notes: string | null
          obligation_id: number
          payment_date: string
          rejection_reason: string | null
          requested_by_display_name: string | null
          requested_by_user_id: string
          share_id: number
          status: string
          updated_at: string
          viewer_account_id: number | null
          viewer_workspace_id: number | null
          workspace_id: number
        }
        Insert: {
          accepted_event_id?: number | null
          amount: number
          created_at?: string
          description?: string | null
          id?: number
          installment_no?: number | null
          notes?: string | null
          obligation_id: number
          payment_date: string
          rejection_reason?: string | null
          requested_by_display_name?: string | null
          requested_by_user_id: string
          share_id: number
          status?: string
          updated_at?: string
          viewer_account_id?: number | null
          viewer_workspace_id?: number | null
          workspace_id: number
        }
        Update: {
          accepted_event_id?: number | null
          amount?: number
          created_at?: string
          description?: string | null
          id?: number
          installment_no?: number | null
          notes?: string | null
          obligation_id?: number
          payment_date?: string
          rejection_reason?: string | null
          requested_by_display_name?: string | null
          requested_by_user_id?: string
          share_id?: number
          status?: string
          updated_at?: string
          viewer_account_id?: number | null
          viewer_workspace_id?: number | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "obligation_payment_requests_accepted_event_id_fkey"
            columns: ["accepted_event_id"]
            isOneToOne: false
            referencedRelation: "obligation_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "v_obligation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_share_id_fkey"
            columns: ["share_id"]
            isOneToOne: false
            referencedRelation: "obligation_shares"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_viewer_account_id_fkey"
            columns: ["viewer_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_viewer_account_id_fkey"
            columns: ["viewer_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_viewer_workspace_id_fkey"
            columns: ["viewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_viewer_workspace_id_fkey"
            columns: ["viewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_viewer_workspace_id_fkey"
            columns: ["viewer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_payment_requests_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      obligation_shares: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: number
          invited_by_user_id: string
          invited_display_name: string | null
          invited_email: string
          invited_user_id: string
          last_sent_at: string | null
          message: string | null
          metadata: Json
          obligation_id: number
          owner_display_name: string | null
          owner_user_id: string
          responded_at: string | null
          status: string
          token: string
          updated_at: string
          workspace_id: number
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: number
          invited_by_user_id: string
          invited_display_name?: string | null
          invited_email: string
          invited_user_id: string
          last_sent_at?: string | null
          message?: string | null
          metadata?: Json
          obligation_id: number
          owner_display_name?: string | null
          owner_user_id: string
          responded_at?: string | null
          status?: string
          token?: string
          updated_at?: string
          workspace_id: number
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: number
          invited_by_user_id?: string
          invited_display_name?: string | null
          invited_email?: string
          invited_user_id?: string
          last_sent_at?: string | null
          message?: string | null
          metadata?: Json
          obligation_id?: number
          owner_display_name?: string | null
          owner_user_id?: string
          responded_at?: string | null
          status?: string
          token?: string
          updated_at?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "obligation_shares_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "obligations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_shares_obligation_id_fkey"
            columns: ["obligation_id"]
            isOneToOne: false
            referencedRelation: "v_obligation_summary"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligation_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligation_shares_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      obligations: {
        Row: {
          counterparty_id: number
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          description: string | null
          direction: Database["public"]["Enums"]["obligation_direction"]
          due_date: string | null
          id: number
          installment_amount: number | null
          installment_count: number | null
          interest_rate: number | null
          notes: string | null
          origin_type: Database["public"]["Enums"]["obligation_origin_type"]
          principal_amount: number
          settlement_account_id: number | null
          start_date: string
          status: Database["public"]["Enums"]["obligation_status"]
          title: string
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          counterparty_id: number
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          description?: string | null
          direction: Database["public"]["Enums"]["obligation_direction"]
          due_date?: string | null
          id?: never
          installment_amount?: number | null
          installment_count?: number | null
          interest_rate?: number | null
          notes?: string | null
          origin_type: Database["public"]["Enums"]["obligation_origin_type"]
          principal_amount: number
          settlement_account_id?: number | null
          start_date: string
          status?: Database["public"]["Enums"]["obligation_status"]
          title: string
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          counterparty_id?: number
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          description?: string | null
          direction?: Database["public"]["Enums"]["obligation_direction"]
          due_date?: string | null
          id?: never
          installment_amount?: number | null
          installment_count?: number | null
          interest_rate?: number | null
          notes?: string | null
          origin_type?: Database["public"]["Enums"]["obligation_origin_type"]
          principal_amount?: number
          settlement_account_id?: number | null
          start_date?: string
          status?: Database["public"]["Enums"]["obligation_status"]
          title?: string
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "obligations_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "obligations_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "obligations_settlement_account_id_fkey"
            columns: ["settlement_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_settlement_account_id_fkey"
            columns: ["settlement_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          base_currency_code: string
          created_at: string
          full_name: string | null
          id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          base_currency_code?: string
          created_at?: string
          full_name?: string | null
          id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          base_currency_code?: string
          created_at?: string
          full_name?: string | null
          id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      recurring_income: {
        Row: {
          account_id: number | null
          amount: number
          category_id: number | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          day_of_month: number | null
          day_of_week: number | null
          description: string | null
          end_date: string | null
          frequency: string
          id: number
          interval_count: number
          is_pinned: boolean
          name: string
          next_expected_date: string
          notes: string | null
          payer_party_id: number | null
          remind_days_before: number
          start_date: string
          status: string
          updated_at: string
          updated_by_user_id: string | null
          workspace_id: number
        }
        Insert: {
          account_id?: number | null
          amount: number
          category_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: number
          interval_count?: number
          is_pinned?: boolean
          name: string
          next_expected_date: string
          notes?: string | null
          payer_party_id?: number | null
          remind_days_before?: number
          start_date: string
          status?: string
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id: number
        }
        Update: {
          account_id?: number | null
          amount?: number
          category_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          frequency?: string
          id?: number
          interval_count?: number
          is_pinned?: boolean
          name?: string
          next_expected_date?: string
          notes?: string | null
          payer_party_id?: number | null
          remind_days_before?: number
          start_date?: string
          status?: string
          updated_at?: string
          updated_by_user_id?: string | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_income_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_income_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "recurring_income_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_income_payer_party_id_fkey"
            columns: ["payer_party_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_income_payer_party_id_fkey"
            columns: ["payer_party_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "recurring_income_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "recurring_income_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "recurring_income_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      recurring_income_occurrences: {
        Row: {
          actual_date: string | null
          amount: number
          created_at: string
          currency_code: string
          expected_date: string
          id: number
          movement_id: number | null
          notes: string | null
          recurring_income_id: number
          status: string
          workspace_id: number
        }
        Insert: {
          actual_date?: string | null
          amount: number
          created_at?: string
          currency_code?: string
          expected_date: string
          id?: never
          movement_id?: number | null
          notes?: string | null
          recurring_income_id: number
          status?: string
          workspace_id: number
        }
        Update: {
          actual_date?: string | null
          amount?: number
          created_at?: string
          currency_code?: string
          expected_date?: string
          id?: never
          movement_id?: number | null
          notes?: string | null
          recurring_income_id?: number
          status?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "recurring_income_occurrences_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_income_occurrences_recurring_income_id_fkey"
            columns: ["recurring_income_id"]
            isOneToOne: false
            referencedRelation: "recurring_income"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_income_occurrences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "recurring_income_occurrences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "recurring_income_occurrences_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_occurrences: {
        Row: {
          created_at: string
          due_date: string
          expected_amount: number
          id: number
          movement_id: number | null
          notes: string | null
          paid_at: string | null
          status: Database["public"]["Enums"]["subscription_occurrence_status"]
          subscription_id: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          due_date: string
          expected_amount: number
          id?: never
          movement_id?: number | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["subscription_occurrence_status"]
          subscription_id: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          due_date?: string
          expected_amount?: number
          id?: never
          movement_id?: number | null
          notes?: string | null
          paid_at?: string | null
          status?: Database["public"]["Enums"]["subscription_occurrence_status"]
          subscription_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_occurrences_movement_id_fkey"
            columns: ["movement_id"]
            isOneToOne: false
            referencedRelation: "movements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_occurrences_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_occurrences_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "v_subscription_upcoming"
            referencedColumns: ["subscription_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: number | null
          amount: number
          auto_create_movement: boolean
          category_id: number | null
          created_at: string
          created_by_user_id: string | null
          currency_code: string
          day_of_month: number | null
          day_of_week: number | null
          description: string | null
          end_date: string | null
          frequency: Database["public"]["Enums"]["subscription_frequency"]
          id: number
          interval_count: number
          is_pinned: boolean
          name: string
          next_due_date: string
          notes: string | null
          remind_days_before: number
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          updated_by_user_id: string | null
          vendor_party_id: number | null
          workspace_id: number
        }
        Insert: {
          account_id?: number | null
          amount: number
          auto_create_movement?: boolean
          category_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: never
          interval_count?: number
          is_pinned?: boolean
          name: string
          next_due_date: string
          notes?: string | null
          remind_days_before?: number
          start_date: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          updated_by_user_id?: string | null
          vendor_party_id?: number | null
          workspace_id: number
        }
        Update: {
          account_id?: number | null
          amount?: number
          auto_create_movement?: boolean
          category_id?: number | null
          created_at?: string
          created_by_user_id?: string | null
          currency_code?: string
          day_of_month?: number | null
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          frequency?: Database["public"]["Enums"]["subscription_frequency"]
          id?: never
          interval_count?: number
          is_pinned?: boolean
          name?: string
          next_due_date?: string
          notes?: string | null
          remind_days_before?: number
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          updated_by_user_id?: string | null
          vendor_party_id?: number | null
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscriptions_vendor_party_id_fkey"
            columns: ["vendor_party_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_vendor_party_id_fkey"
            columns: ["vendor_party_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_entitlements: {
        Row: {
          billing_provider: string | null
          billing_status: string | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          manual_override: boolean
          metadata: Json
          plan_code: string
          pro_access_enabled: boolean
          provider_customer_id: string | null
          provider_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          billing_provider?: string | null
          billing_status?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          manual_override?: boolean
          metadata?: Json
          plan_code?: string
          pro_access_enabled?: boolean
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          billing_provider?: string | null
          billing_status?: string | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          manual_override?: boolean
          metadata?: Json
          plan_code?: string
          pro_access_enabled?: boolean
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      workspace_financial_goals: {
        Row: {
          created_at: string
          id: number
          monthly_savings_target: number
          updated_at: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          id?: number
          monthly_savings_target: number
          updated_at?: string
          user_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          id?: number
          monthly_savings_target?: number
          updated_at?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_financial_goals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_financial_goals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_financial_goals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          id: number
          invited_by_display_name: string | null
          invited_by_user_id: string
          invited_display_name: string | null
          invited_email: string
          invited_user_id: string | null
          last_sent_at: string | null
          note: string | null
          responded_at: string | null
          role: Database["public"]["Enums"]["workspace_role"]
          status: Database["public"]["Enums"]["workspace_invitation_status"]
          token: string
          updated_at: string
          workspace_id: number
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          id?: never
          invited_by_display_name?: string | null
          invited_by_user_id: string
          invited_display_name?: string | null
          invited_email: string
          invited_user_id?: string | null
          last_sent_at?: string | null
          note?: string | null
          responded_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["workspace_invitation_status"]
          token: string
          updated_at?: string
          workspace_id: number
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          id?: never
          invited_by_display_name?: string | null
          invited_by_user_id?: string
          invited_display_name?: string | null
          invited_email?: string
          invited_user_id?: string | null
          last_sent_at?: string | null
          note?: string | null
          responded_at?: string | null
          role?: Database["public"]["Enums"]["workspace_role"]
          status?: Database["public"]["Enums"]["workspace_invitation_status"]
          token?: string
          updated_at?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          is_default_workspace: boolean
          joined_at: string
          role: Database["public"]["Enums"]["workspace_role"]
          updated_at: string
          user_id: string
          workspace_id: number
        }
        Insert: {
          created_at?: string
          is_default_workspace?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id: string
          workspace_id: number
        }
        Update: {
          created_at?: string
          is_default_workspace?: boolean
          joined_at?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          updated_at?: string
          user_id?: string
          workspace_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          base_currency_code: string | null
          created_at: string
          description: string | null
          id: number
          is_archived: boolean
          kind: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          base_currency_code?: string | null
          created_at?: string
          description?: string | null
          id?: never
          is_archived?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          base_currency_code?: string | null
          created_at?: string
          description?: string | null
          id?: never
          is_archived?: boolean
          kind?: Database["public"]["Enums"]["workspace_kind"]
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_base_currency_code_fkey"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Views: {
      v_account_balances: {
        Row: {
          account_id: number | null
          currency_code: string | null
          current_balance: number | null
          name: string | null
          opening_balance: number | null
          total_in: number | null
          total_out: number | null
          type: Database["public"]["Enums"]["account_type"] | null
          workspace_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_budget_progress: {
        Row: {
          account_id: number | null
          account_name: string | null
          alert_percent: number | null
          category_id: number | null
          category_name: string | null
          created_at: string | null
          created_by_user_id: string | null
          currency_code: string | null
          id: number | null
          is_active: boolean | null
          is_near_limit: boolean | null
          is_over_limit: boolean | null
          is_pinned: boolean | null
          limit_amount: number | null
          movement_count: number | null
          name: string | null
          notes: string | null
          period_end: string | null
          period_start: string | null
          remaining_amount: number | null
          rollover_enabled: boolean | null
          scope_kind: string | null
          scope_label: string | null
          spent_amount: number | null
          updated_at: string | null
          updated_by_user_id: string | null
          used_percent: number | null
          workspace_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "budgets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_counterparty_summary: {
        Row: {
          counterparty_id: number | null
          created_at: string | null
          document_number: string | null
          email: string | null
          inflow_total: number | null
          is_archived: boolean | null
          last_activity_at: string | null
          movement_count: number | null
          name: string | null
          net_flow_amount: number | null
          net_pending_amount: number | null
          notes: string | null
          outflow_total: number | null
          payable_count: number | null
          payable_pending_total: number | null
          payable_principal_total: number | null
          phone: string | null
          receivable_count: number | null
          receivable_pending_total: number | null
          receivable_principal_total: number | null
          roles: string[] | null
          type: Database["public"]["Enums"]["party_type"] | null
          updated_at: string | null
          workspace_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "counterparties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_latest_exchange_rates: {
        Row: {
          created_at: string | null
          effective_at: string | null
          from_currency_code: string | null
          id: number | null
          notes: string | null
          rate: number | null
          source: string | null
          to_currency_code: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      v_obligation_summary: {
        Row: {
          adjustment_total: number | null
          counterparty_id: number | null
          created_at: string | null
          currency_code: string | null
          description: string | null
          direction: Database["public"]["Enums"]["obligation_direction"] | null
          discount_total: number | null
          due_date: string | null
          fee_total: number | null
          id: number | null
          installment_amount: number | null
          installment_count: number | null
          interest_rate: number | null
          interest_total: number | null
          last_event_date: string | null
          last_payment_date: string | null
          notes: string | null
          origin_type:
            | Database["public"]["Enums"]["obligation_origin_type"]
            | null
          payment_count: number | null
          payment_total: number | null
          pending_amount: number | null
          principal_current_amount: number | null
          principal_decrease_total: number | null
          principal_increase_total: number | null
          principal_initial_amount: number | null
          progress_percent: number | null
          settlement_account_id: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["obligation_status"] | null
          title: string | null
          updated_at: string | null
          workspace_id: number | null
          writeoff_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "obligations_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_counterparty_id_fkey"
            columns: ["counterparty_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "obligations_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "obligations_settlement_account_id_fkey"
            columns: ["settlement_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "obligations_settlement_account_id_fkey"
            columns: ["settlement_account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "obligations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_subscription_upcoming: {
        Row: {
          account_id: number | null
          account_name: string | null
          category_id: number | null
          category_name: string | null
          currency_code: string | null
          due_date: string | null
          expected_amount: number | null
          name: string | null
          occurrence_id: number | null
          occurrence_status:
            | Database["public"]["Enums"]["subscription_occurrence_status"]
            | null
          subscription_id: number | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          vendor_name: string | null
          vendor_party_id: number | null
          workspace_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_account_balances"
            referencedColumns: ["account_id"]
          },
          {
            foreignKeyName: "subscriptions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "subscriptions_vendor_party_id_fkey"
            columns: ["vendor_party_id"]
            isOneToOne: false
            referencedRelation: "counterparties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_vendor_party_id_fkey"
            columns: ["vendor_party_id"]
            isOneToOne: false
            referencedRelation: "v_counterparty_summary"
            referencedColumns: ["counterparty_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_user_workspaces"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "v_workspace_balances"
            referencedColumns: ["workspace_id"]
          },
          {
            foreignKeyName: "subscriptions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      v_user_workspaces: {
        Row: {
          base_currency_code: string | null
          created_at: string | null
          is_archived: boolean | null
          is_default_workspace: boolean | null
          role: Database["public"]["Enums"]["workspace_role"] | null
          updated_at: string | null
          user_id: string | null
          workspace_id: number | null
          workspace_kind: Database["public"]["Enums"]["workspace_kind"] | null
          workspace_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workspaces_base_currency_code_fkey"
            columns: ["base_currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
      v_workspace_balances: {
        Row: {
          currency_code: string | null
          total_balance: number | null
          workspace_id: number | null
          workspace_kind: Database["public"]["Enums"]["workspace_kind"] | null
          workspace_name: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_currency_code_fkey"
            columns: ["currency_code"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["code"]
          },
        ]
      }
    }
    Functions: {
      find_darkmoney_user_by_email: {
        Args: { lookup_email: string }
        Returns: {
          email: string
          full_name: string
          user_id: string
        }[]
      }
      is_workspace_member: { Args: { ws_id: number }; Returns: boolean }
      shares_workspace_with: {
        Args: { other_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      account_type:
        | "cash"
        | "bank"
        | "savings"
        | "credit_card"
        | "investment"
        | "loan_wallet"
        | "other"
      category_kind: "expense" | "income" | "both"
      counterparty_role_type:
        | "client"
        | "supplier"
        | "lender"
        | "borrower"
        | "bank"
        | "service_provider"
        | "other"
      movement_status: "planned" | "pending" | "posted" | "voided"
      movement_type:
        | "expense"
        | "income"
        | "transfer"
        | "subscription_payment"
        | "obligation_opening"
        | "obligation_payment"
        | "refund"
        | "adjustment"
      notification_channel: "in_app" | "push" | "email"
      notification_status: "pending" | "sent" | "read" | "failed" | "archived"
      obligation_direction: "receivable" | "payable"
      obligation_event_type:
        | "opening"
        | "payment"
        | "interest"
        | "fee"
        | "discount"
        | "adjustment"
        | "writeoff"
        | "principal_increase"
        | "principal_decrease"
      obligation_origin_type:
        | "cash_loan"
        | "sale_financed"
        | "purchase_financed"
        | "manual"
      obligation_status: "draft" | "active" | "paid" | "cancelled" | "defaulted"
      party_type:
        | "person"
        | "company"
        | "merchant"
        | "service"
        | "bank"
        | "other"
      subscription_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "quarterly"
        | "yearly"
        | "custom"
      subscription_occurrence_status:
        | "scheduled"
        | "paid"
        | "skipped"
        | "cancelled"
        | "overdue"
      subscription_status: "active" | "paused" | "cancelled"
      workspace_invitation_status:
        | "pending"
        | "accepted"
        | "declined"
        | "expired"
        | "revoked"
      workspace_kind: "personal" | "shared"
      workspace_role: "owner" | "admin" | "member" | "viewer"
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
      account_type: [
        "cash",
        "bank",
        "savings",
        "credit_card",
        "investment",
        "loan_wallet",
        "other",
      ],
      category_kind: ["expense", "income", "both"],
      counterparty_role_type: [
        "client",
        "supplier",
        "lender",
        "borrower",
        "bank",
        "service_provider",
        "other",
      ],
      movement_status: ["planned", "pending", "posted", "voided"],
      movement_type: [
        "expense",
        "income",
        "transfer",
        "subscription_payment",
        "obligation_opening",
        "obligation_payment",
        "refund",
        "adjustment",
      ],
      notification_channel: ["in_app", "push", "email"],
      notification_status: ["pending", "sent", "read", "failed", "archived"],
      obligation_direction: ["receivable", "payable"],
      obligation_event_type: [
        "opening",
        "payment",
        "interest",
        "fee",
        "discount",
        "adjustment",
        "writeoff",
        "principal_increase",
        "principal_decrease",
      ],
      obligation_origin_type: [
        "cash_loan",
        "sale_financed",
        "purchase_financed",
        "manual",
      ],
      obligation_status: ["draft", "active", "paid", "cancelled", "defaulted"],
      party_type: ["person", "company", "merchant", "service", "bank", "other"],
      subscription_frequency: [
        "daily",
        "weekly",
        "monthly",
        "quarterly",
        "yearly",
        "custom",
      ],
      subscription_occurrence_status: [
        "scheduled",
        "paid",
        "skipped",
        "cancelled",
        "overdue",
      ],
      subscription_status: ["active", "paused", "cancelled"],
      workspace_invitation_status: [
        "pending",
        "accepted",
        "declined",
        "expired",
        "revoked",
      ],
      workspace_kind: ["personal", "shared"],
      workspace_role: ["owner", "admin", "member", "viewer"],
    },
  },
} as const
