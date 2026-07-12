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
      app_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      charging_sessions: {
        Row: {
          charging_minutes: number | null
          cost_usd: number | null
          created_at: string
          energy_kwh: number | null
          id: string
          price_per_kwh: number | null
          started_at: string | null
          updated_at: string
          visit_id: string
        }
        Insert: {
          charging_minutes?: number | null
          cost_usd?: number | null
          created_at?: string
          energy_kwh?: number | null
          id?: string
          price_per_kwh?: number | null
          started_at?: string | null
          updated_at?: string
          visit_id: string
        }
        Update: {
          charging_minutes?: number | null
          cost_usd?: number | null
          created_at?: string
          energy_kwh?: number | null
          id?: string
          price_per_kwh?: number | null
          started_at?: string | null
          updated_at?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "charging_sessions_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: true
            referencedRelation: "station_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      station_visits: {
        Row: {
          checked_in_at: string
          checked_in_time_precision: string
          checked_in_timezone: string
          created_at: string
          id: string
          is_public: boolean
          notes: string | null
          recorded_latitude: number | null
          recorded_longitude: number | null
          station_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          checked_in_at?: string
          checked_in_time_precision?: string
          checked_in_timezone?: string
          created_at?: string
          id?: string
          is_public?: boolean
          notes?: string | null
          recorded_latitude?: number | null
          recorded_longitude?: number | null
          station_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          checked_in_at?: string
          checked_in_time_precision?: string
          checked_in_timezone?: string
          created_at?: string
          id?: string
          is_public?: boolean
          notes?: string | null
          recorded_latitude?: number | null
          recorded_longitude?: number | null
          station_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_visits_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "public_station_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_visits_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          address: string
          city: string
          country: string
          created_at: string
          external_id: string
          id: string
          latitude: number
          longitude: number
          max_power_kw: number | null
          name: string
          operational_status: string
          postal_code: string | null
          source: string
          source_updated_at: string | null
          stall_count: number | null
          state: string
          updated_at: string
        }
        Insert: {
          address: string
          city: string
          country?: string
          created_at?: string
          external_id: string
          id?: string
          latitude: number
          longitude: number
          max_power_kw?: number | null
          name: string
          operational_status?: string
          postal_code?: string | null
          source?: string
          source_updated_at?: string | null
          stall_count?: number | null
          state: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          country?: string
          created_at?: string
          external_id?: string
          id?: string
          latitude?: number
          longitude?: number
          max_power_kw?: number | null
          name?: string
          operational_status?: string
          postal_code?: string | null
          source?: string
          source_updated_at?: string | null
          stall_count?: number | null
          state?: string
          updated_at?: string
        }
        Relationships: []
      }
      visit_photos: {
        Row: {
          bucket_name: string
          caption: string | null
          created_at: string
          id: string
          is_public: boolean
          photo_type: string
          storage_path: string
          taken_at: string | null
          updated_at: string
          user_id: string
          visit_id: string
        }
        Insert: {
          bucket_name: string
          caption?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          photo_type?: string
          storage_path: string
          taken_at?: string | null
          updated_at?: string
          user_id: string
          visit_id: string
        }
        Update: {
          bucket_name?: string
          caption?: string | null
          created_at?: string
          id?: string
          is_public?: boolean
          photo_type?: string
          storage_path?: string
          taken_at?: string | null
          updated_at?: string
          user_id?: string
          visit_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visit_photos_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "station_visits"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_station_status: {
        Row: {
          address: string | null
          city: string | null
          external_id: string | null
          id: string | null
          latest_visit_at: string | null
          latitude: number | null
          longitude: number | null
          max_power_kw: number | null
          name: string | null
          operational_status: string | null
          postal_code: string | null
          source_updated_at: string | null
          stall_count: number | null
          state: string | null
          visited: boolean | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          external_id?: string | null
          id?: string | null
          latest_visit_at?: never
          latitude?: number | null
          longitude?: number | null
          max_power_kw?: number | null
          name?: string | null
          operational_status?: string | null
          postal_code?: string | null
          source_updated_at?: string | null
          stall_count?: number | null
          state?: string | null
          visited?: never
        }
        Update: {
          address?: string | null
          city?: string | null
          external_id?: string | null
          id?: string | null
          latest_visit_at?: never
          latitude?: number | null
          longitude?: number | null
          max_power_kw?: number | null
          name?: string | null
          operational_status?: string | null
          postal_code?: string | null
          source_updated_at?: string | null
          stall_count?: number | null
          state?: string | null
          visited?: never
        }
        Relationships: []
      }
    }
    Functions: {
      import_receipt_charge: {
        Args: {
          p_charging_minutes: number | null
          p_checked_in_at: string
          p_checked_in_time_precision: string
          p_checked_in_timezone: string
          p_cost_usd: number | null
          p_energy_kwh: number | null
          p_is_public: boolean
          p_price_per_kwh: number | null
          p_session_started_at: string | null
          p_station_id: string
          p_user_id: string
          p_visit_id: string
        }
        Returns: {
          charging_session_created: boolean
          visit_created: boolean
          visit_id: string
        }[]
      }
      is_app_admin: { Args: never; Returns: boolean }
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
