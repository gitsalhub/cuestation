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
      activity_logs: {
        Row: {
          action: string
          cafe_id: string | null
          created_at: string
          details: Json | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          cafe_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          cafe_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          alert_enabled: boolean
          alert_minutes: number
          availability: string
          cafe_id: string
          category: string
          created_at: string
          height: number
          id: string
          is_hidden: boolean
          name: string
          position_x: number | null
          position_y: number | null
          rate_profile_id: string | null
          status: string
          tuya_device_id: string | null
          tuya_device_name: string | null
          tuya_enabled: boolean
          tuya_server_url: string | null
          tuya_state: string | null
          width: number
        }
        Insert: {
          alert_enabled?: boolean
          alert_minutes?: number
          availability?: string
          cafe_id: string
          category?: string
          created_at?: string
          height?: number
          id?: string
          is_hidden?: boolean
          name: string
          position_x?: number | null
          position_y?: number | null
          rate_profile_id?: string | null
          status?: string
          tuya_device_id?: string | null
          tuya_device_name?: string | null
          tuya_enabled?: boolean
          tuya_server_url?: string | null
          tuya_state?: string | null
          width?: number
        }
        Update: {
          alert_enabled?: boolean
          alert_minutes?: number
          availability?: string
          cafe_id?: string
          category?: string
          created_at?: string
          height?: number
          id?: string
          is_hidden?: boolean
          name?: string
          position_x?: number | null
          position_y?: number | null
          rate_profile_id?: string | null
          status?: string
          tuya_device_id?: string | null
          tuya_device_name?: string | null
          tuya_enabled?: boolean
          tuya_server_url?: string | null
          tuya_state?: string | null
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "assets_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_rate_profile_id_fkey"
            columns: ["rate_profile_id"]
            isOneToOne: false
            referencedRelation: "rate_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_items: {
        Row: {
          bill_id: string
          id: string
          price: number
          product_id: string | null
          product_name: string
          qty: number
        }
        Insert: {
          bill_id: string
          id?: string
          price?: number
          product_id?: string | null
          product_name: string
          qty?: number
        }
        Update: {
          bill_id?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          qty?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_items_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          bill_type: string
          cafe_id: string
          cash_amount: number | null
          created_at: string
          created_by: string | null
          customer_name: string | null
          discount: number
          id: string
          offer_id: string | null
          override_amount: number | null
          override_reason: string | null
          payment_method: string | null
          session_id: string | null
          subtotal: number
          total: number
          upi_amount: number | null
        }
        Insert: {
          bill_type?: string
          cafe_id: string
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          offer_id?: string | null
          override_amount?: number | null
          override_reason?: string | null
          payment_method?: string | null
          session_id?: string | null
          subtotal?: number
          total?: number
          upi_amount?: number | null
        }
        Update: {
          bill_type?: string
          cafe_id?: string
          cash_amount?: number | null
          created_at?: string
          created_by?: string | null
          customer_name?: string | null
          discount?: number
          id?: string
          offer_id?: string | null
          override_amount?: number | null
          override_reason?: string | null
          payment_method?: string | null
          session_id?: string | null
          subtotal?: number
          total?: number
          upi_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "bills_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bills_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      bookings: {
        Row: {
          asset_id: string | null
          booking_time: string
          cafe_id: string
          created_at: string
          created_by: string | null
          customer_name: string
          customer_phone: string | null
          duration_minutes: number | null
          id: string
          notes: string | null
          status: string
        }
        Insert: {
          asset_id?: string | null
          booking_time: string
          cafe_id: string
          created_at?: string
          created_by?: string | null
          customer_name: string
          customer_phone?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          status?: string
        }
        Update: {
          asset_id?: string | null
          booking_time?: string
          cafe_id?: string
          created_at?: string
          created_by?: string | null
          customer_name?: string
          customer_phone?: string | null
          duration_minutes?: number | null
          id?: string
          notes?: string | null
          status?: string
        }
        Relationships: []
      }
      cafes: {
        Row: {
          active: boolean
          created_at: string
          id: string
          logo_url: string | null
          name: string
          owner_id: string | null
          subscription_expires_at: string | null
          tuya_server_url: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name: string
          owner_id?: string | null
          subscription_expires_at?: string | null
          tuya_server_url?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          logo_url?: string | null
          name?: string
          owner_id?: string | null
          subscription_expires_at?: string | null
          tuya_server_url?: string | null
        }
        Relationships: []
      }
      cash_drawer_shifts: {
        Row: {
          cafe_id: string
          closed_at: string | null
          closing_cash: number | null
          closing_notes: string | null
          created_at: string
          id: string
          opened_at: string
          opening_cash: number
          opening_notes: string | null
          status: string
          updated_at: string
          user_id: string
          user_name: string | null
          user_role: string | null
        }
        Insert: {
          cafe_id: string
          closed_at?: string | null
          closing_cash?: number | null
          closing_notes?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opening_cash?: number
          opening_notes?: string | null
          status?: string
          updated_at?: string
          user_id: string
          user_name?: string | null
          user_role?: string | null
        }
        Update: {
          cafe_id?: string
          closed_at?: string | null
          closing_cash?: number | null
          closing_notes?: string | null
          created_at?: string
          id?: string
          opened_at?: string
          opening_cash?: number
          opening_notes?: string | null
          status?: string
          updated_at?: string
          user_id?: string
          user_name?: string | null
          user_role?: string | null
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          cafe_id: string
          category: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          note: string | null
        }
        Insert: {
          amount?: number
          cafe_id: string
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
        }
        Update: {
          amount?: number
          cafe_id?: string
          category?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          active: boolean
          cafe_id: string
          conditions: Json | null
          created_at: string
          free_minutes: number | null
          id: string
          min_minutes: number | null
          name: string
          offer_type: string
          value: number
        }
        Insert: {
          active?: boolean
          cafe_id: string
          conditions?: Json | null
          created_at?: string
          free_minutes?: number | null
          id?: string
          min_minutes?: number | null
          name: string
          offer_type?: string
          value?: number
        }
        Update: {
          active?: boolean
          cafe_id?: string
          conditions?: Json | null
          created_at?: string
          free_minutes?: number | null
          id?: string
          min_minutes?: number | null
          name?: string
          offer_type?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "offers_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          cafe_id: string
          category: string | null
          created_at: string
          id: string
          name: string
          price: number
          stock: number
          stock_threshold: number
        }
        Insert: {
          cafe_id: string
          category?: string | null
          created_at?: string
          id?: string
          name: string
          price?: number
          stock?: number
          stock_threshold?: number
        }
        Update: {
          cafe_id?: string
          category?: string | null
          created_at?: string
          id?: string
          name?: string
          price?: number
          stock?: number
          stock_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          cafe_id: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          theme: string | null
        }
        Insert: {
          cafe_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          theme?: string | null
        }
        Update: {
          cafe_id?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          theme?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_profiles: {
        Row: {
          cafe_id: string
          config: Json | null
          cooling_amount: number
          cooling_minutes: number
          created_at: string
          grace_minutes: number
          hourly_rate: number | null
          id: string
          name: string
          pricing_type: string
          slabs: Json
          weekend_rate: number | null
        }
        Insert: {
          cafe_id: string
          config?: Json | null
          cooling_amount?: number
          cooling_minutes?: number
          created_at?: string
          grace_minutes?: number
          hourly_rate?: number | null
          id?: string
          name: string
          pricing_type?: string
          slabs?: Json
          weekend_rate?: number | null
        }
        Update: {
          cafe_id?: string
          config?: Json | null
          cooling_amount?: number
          cooling_minutes?: number
          created_at?: string
          grace_minutes?: number
          hourly_rate?: number | null
          id?: string
          name?: string
          pricing_type?: string
          slabs?: Json
          weekend_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "rate_profiles_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
        ]
      }
      session_advances: {
        Row: {
          amount: number
          cafe_id: string
          cash_amount: number
          created_at: string
          created_by: string | null
          id: string
          payment_method: string
          session_id: string
          upi_amount: number
        }
        Insert: {
          amount?: number
          cafe_id: string
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          payment_method?: string
          session_id: string
          upi_amount?: number
        }
        Update: {
          amount?: number
          cafe_id?: string
          cash_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          payment_method?: string
          session_id?: string
          upi_amount?: number
        }
        Relationships: []
      }
      session_items: {
        Row: {
          created_at: string
          id: string
          price: number
          product_id: string | null
          product_name: string
          qty: number
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name: string
          qty?: number
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          price?: number
          product_id?: string | null
          product_name?: string
          qty?: number
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "session_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "session_items_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          applied_offer_id: string | null
          asset_id: string
          cafe_id: string
          cash_amount: number | null
          created_at: string
          customer_name: string | null
          discount_amount: number | null
          ended_at: string | null
          game_amount: number | null
          id: string
          items_amount: number | null
          offer_id: string | null
          override_amount: number | null
          override_reason: string | null
          parent_session_id: string | null
          payment_collected_at: string | null
          payment_collected_by: string | null
          payment_method: string | null
          planned_minutes: number | null
          player_count: number
          player_segments: Json | null
          rate_profile_id: string | null
          session_notes: string | null
          started_at: string
          started_by: string | null
          status: string
          total_amount: number | null
          transfer_history: Json
          transferred_in_amount: number | null
          upi_amount: number | null
        }
        Insert: {
          applied_offer_id?: string | null
          asset_id: string
          cafe_id: string
          cash_amount?: number | null
          created_at?: string
          customer_name?: string | null
          discount_amount?: number | null
          ended_at?: string | null
          game_amount?: number | null
          id?: string
          items_amount?: number | null
          offer_id?: string | null
          override_amount?: number | null
          override_reason?: string | null
          parent_session_id?: string | null
          payment_collected_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string | null
          planned_minutes?: number | null
          player_count?: number
          player_segments?: Json | null
          rate_profile_id?: string | null
          session_notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          total_amount?: number | null
          transfer_history?: Json
          transferred_in_amount?: number | null
          upi_amount?: number | null
        }
        Update: {
          applied_offer_id?: string | null
          asset_id?: string
          cafe_id?: string
          cash_amount?: number | null
          created_at?: string
          customer_name?: string | null
          discount_amount?: number | null
          ended_at?: string | null
          game_amount?: number | null
          id?: string
          items_amount?: number | null
          offer_id?: string | null
          override_amount?: number | null
          override_reason?: string | null
          parent_session_id?: string | null
          payment_collected_at?: string | null
          payment_collected_by?: string | null
          payment_method?: string | null
          planned_minutes?: number | null
          player_count?: number
          player_segments?: Json | null
          rate_profile_id?: string | null
          session_notes?: string | null
          started_at?: string
          started_by?: string | null
          status?: string
          total_amount?: number | null
          transfer_history?: Json
          transferred_in_amount?: number | null
          upi_amount?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sessions_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
        ]
      }
      transfer_logs: {
        Row: {
          cafe_id: string
          created_at: string
          from_asset_id: string | null
          id: string
          session_id: string
          to_asset_id: string | null
          transferred_by: string | null
        }
        Insert: {
          cafe_id: string
          created_at?: string
          from_asset_id?: string | null
          id?: string
          session_id: string
          to_asset_id?: string | null
          transferred_by?: string | null
        }
        Update: {
          cafe_id?: string
          created_at?: string
          from_asset_id?: string | null
          id?: string
          session_id?: string
          to_asset_id?: string | null
          transferred_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transfer_logs_cafe_id_fkey"
            columns: ["cafe_id"]
            isOneToOne: false
            referencedRelation: "cafes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_from_asset_id_fkey"
            columns: ["from_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transfer_logs_to_asset_id_fkey"
            columns: ["to_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          permissions: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          permissions?: Json
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          permissions?: Json
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      force_delete_asset: { Args: { _asset_id: string }; Returns: undefined }
      force_delete_cafe: { Args: { _cafe_id: string }; Returns: undefined }
      force_reset_session: {
        Args: { _reason?: string; _session_id: string }
        Returns: undefined
      }
      get_user_cafe: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      staff_permission: {
        Args: { _perm: string; _user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "super_admin" | "admin" | "staff"
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
      app_role: ["super_admin", "admin", "staff"],
    },
  },
} as const
