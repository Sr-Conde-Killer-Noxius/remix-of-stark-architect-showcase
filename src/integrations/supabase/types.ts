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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      acerto_certo_webhook_history: {
        Row: {
          event_type: string
          id: string
          payload: Json | null
          request_headers: Json | null
          response_body: string | null
          response_status_code: number | null
          revenda_user_id: string | null
          sent_at: string
          target_url: string
        }
        Insert: {
          event_type: string
          id?: string
          payload?: Json | null
          request_headers?: Json | null
          response_body?: string | null
          response_status_code?: number | null
          revenda_user_id?: string | null
          sent_at?: string
          target_url: string
        }
        Update: {
          event_type?: string
          id?: string
          payload?: Json | null
          request_headers?: Json | null
          response_body?: string | null
          response_status_code?: number | null
          revenda_user_id?: string | null
          sent_at?: string
          target_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "acerto_certo_webhook_history_revenda_user_id_fkey"
            columns: ["revenda_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          balance_after: number
          created_at: string
          description: string
          id: string
          performed_by: string | null
          related_user_id: string | null
          transaction_type: string
          user_id: string
        }
        Insert: {
          amount: number
          balance_after: number
          created_at?: string
          description: string
          id?: string
          performed_by?: string | null
          related_user_id?: string | null
          transaction_type: string
          user_id: string
        }
        Update: {
          amount?: number
          balance_after?: number
          created_at?: string
          description?: string
          id?: string
          performed_by?: string | null
          related_user_id?: string | null
          transaction_type?: string
          user_id?: string
        }
        Relationships: []
      }
      evolution_api_history: {
        Row: {
          created_at: string
          event_type: string
          id: string
          instance_name: string
          payload: Json | null
          status_code: number | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          instance_name: string
          payload?: Json | null
          status_code?: number | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          instance_name?: string
          payload?: Json | null
          status_code?: number | null
        }
        Relationships: []
      }
      evolution_logout_history: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          request_payload: Json | null
          response_status: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          request_payload?: Json | null
          response_status?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          request_payload?: Json | null
          response_status?: number | null
          user_id?: string
        }
        Relationships: []
      }
      n8n_message_sender_history: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          message_text: string
          recipient_phone: string
          request_payload: Json | null
          response_status: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          message_text: string
          recipient_phone: string
          request_payload?: Json | null
          response_status?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          message_text?: string
          recipient_phone?: string
          request_payload?: Json | null
          response_status?: number | null
          user_id?: string
        }
        Relationships: []
      }
      n8n_qr_code_history: {
        Row: {
          created_at: string
          id: string
          instance_name: string
          request_payload: Json | null
          response_data: Json | null
          response_status: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          instance_name: string
          request_payload?: Json | null
          response_data?: Json | null
          response_status?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          instance_name?: string
          request_payload?: Json | null
          response_data?: Json | null
          response_status?: number | null
          user_id?: string
        }
        Relationships: []
      }
      page_access_control: {
        Row: {
          created_at: string
          id: string
          is_enabled: boolean
          page_key: string
          page_title: string
          page_url: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          page_key: string
          page_title: string
          page_url: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_enabled?: boolean
          page_key?: string
          page_title?: string
          page_url?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: []
      }
      planos: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
          user_id: string | null
          valor: number
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string | null
          valor?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string
          created_at: string
          created_by: string | null
          credit_expiry_date: string | null
          email: string | null
          expiry_date: string | null
          full_name: string | null
          id: string
          phone: string
          pix_key: string | null
          plan_id: string | null
          status: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cpf?: string
          created_at?: string
          created_by?: string | null
          credit_expiry_date?: string | null
          email?: string | null
          expiry_date?: string | null
          full_name?: string | null
          id?: string
          phone?: string
          pix_key?: string | null
          plan_id?: string | null
          status?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cpf?: string
          created_at?: string
          created_by?: string | null
          credit_expiry_date?: string | null
          email?: string | null
          expiry_date?: string | null
          full_name?: string | null
          id?: string
          phone?: string
          pix_key?: string | null
          plan_id?: string | null
          status?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_profiles_plan_id"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "planos"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          assunto: string | null
          corpo: string
          created_at: string
          id: string
          nome: string
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assunto?: string | null
          corpo: string
          created_at?: string
          id?: string
          nome: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          assunto?: string | null
          corpo?: string
          created_at?: string
          id?: string
          nome?: string
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_credits: {
        Row: {
          balance: number
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_instances: {
        Row: {
          connection_status: string
          created_at: string
          id: string
          instance_name: string
          last_connected_at: string | null
          qr_code_base64: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_status?: string
          created_at?: string
          id?: string
          instance_name: string
          last_connected_at?: string | null
          qr_code_base64?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_status?: string
          created_at?: string
          id?: string
          instance_name?: string
          last_connected_at?: string | null
          qr_code_base64?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      webhook_configs: {
        Row: {
          config_key: string
          created_at: string
          description: string | null
          id: string
          updated_at: string
          webhook_url: string
        }
        Insert: {
          config_key: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          webhook_url: string
        }
        Update: {
          config_key?: string
          created_at?: string
          description?: string | null
          id?: string
          updated_at?: string
          webhook_url?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "master" | "reseller" | "admin"
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
      app_role: ["master", "reseller", "admin"],
    },
  },
} as const
