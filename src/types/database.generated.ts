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
      station_user_preferences: {
        Row: {
          created_at: string
          pay_to_park: boolean
          station_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          pay_to_park?: boolean
          station_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          pay_to_park?: boolean
          station_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "station_user_preferences_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "public_station_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "station_user_preferences_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
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
      trip_plan_segments: {
        Row: {
          created_at: string
          distance_meters: number
          duration_seconds: number
          end_sequence: number | null
          geometry: Json
          id: string
          leg: string
          provider: string
          route_kind: string
          segment_index: number
          start_sequence: number | null
          trip_plan_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distance_meters: number
          duration_seconds: number
          end_sequence?: number | null
          geometry: Json
          id?: string
          leg: string
          provider?: string
          route_kind?: string
          segment_index: number
          start_sequence?: number | null
          trip_plan_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distance_meters?: number
          duration_seconds?: number
          end_sequence?: number | null
          geometry?: Json
          id?: string
          leg?: string
          provider?: string
          route_kind?: string
          segment_index?: number
          start_sequence?: number | null
          trip_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_plan_segments_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plan_stops: {
        Row: {
          corridor_distance_meters: number | null
          created_at: string
          estimated_arrival_at: string | null
          estimated_detour_meters: number | null
          estimated_detour_seconds: number | null
          id: string
          is_locked: boolean
          leg: string
          route_progress: number | null
          selection_rank: number | null
          sequence: number
          source: string
          station_id: string
          status: string
          trip_plan_id: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          corridor_distance_meters?: number | null
          created_at?: string
          estimated_arrival_at?: string | null
          estimated_detour_meters?: number | null
          estimated_detour_seconds?: number | null
          id?: string
          is_locked?: boolean
          leg?: string
          route_progress?: number | null
          selection_rank?: number | null
          sequence: number
          source: string
          station_id: string
          status?: string
          trip_plan_id: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          corridor_distance_meters?: number | null
          created_at?: string
          estimated_arrival_at?: string | null
          estimated_detour_meters?: number | null
          estimated_detour_seconds?: number | null
          id?: string
          is_locked?: boolean
          leg?: string
          route_progress?: number | null
          selection_rank?: number | null
          sequence?: number
          source?: string
          station_id?: string
          status?: string
          trip_plan_id?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_plan_stops_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "public_station_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_stops_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_stops_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plan_stops_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "station_visits"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_plans: {
        Row: {
          activated_at: string | null
          algorithm_version: string | null
          base_distance_meters: number | null
          base_duration_seconds: number | null
          completed_at: string | null
          confirmed_at: string | null
          corridor_candidate_count: number | null
          corridor_miles: number
          created_at: string
          destination_full_address: string | null
          destination_label: string | null
          destination_latitude: number | null
          destination_longitude: number | null
          destination_provider_id: string | null
          destination_source: string | null
          destination_station_id: string | null
          evaluated_candidate_count: number | null
          extra_distance_meters: number | null
          extra_duration_seconds: number | null
          id: string
          is_public: boolean
          max_extra_miles: number | null
          max_extra_minutes: number
          max_stops: number | null
          name: string | null
          origin_full_address: string | null
          origin_label: string | null
          origin_latitude: number | null
          origin_longitude: number | null
          origin_provider_id: string | null
          origin_source: string | null
          origin_station_id: string | null
          planned_distance_meters: number | null
          planned_drive_seconds: number | null
          planned_route_stale: boolean
          planned_stop_seconds: number | null
          route_calculated_at: string | null
          route_input_revision: number
          route_provider: string | null
          show_on_homepage: boolean
          status: string
          stop_duration_minutes: number
          technical_limit_reached: boolean
          technical_limit_reason: string | null
          trip_type: string
          unreachable_candidate_count: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          activated_at?: string | null
          algorithm_version?: string | null
          base_distance_meters?: number | null
          base_duration_seconds?: number | null
          completed_at?: string | null
          confirmed_at?: string | null
          corridor_candidate_count?: number | null
          corridor_miles?: number
          created_at?: string
          destination_full_address?: string | null
          destination_label?: string | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          destination_provider_id?: string | null
          destination_source?: string | null
          destination_station_id?: string | null
          evaluated_candidate_count?: number | null
          extra_distance_meters?: number | null
          extra_duration_seconds?: number | null
          id?: string
          is_public?: boolean
          max_extra_miles?: number | null
          max_extra_minutes?: number
          max_stops?: number | null
          name?: string | null
          origin_full_address?: string | null
          origin_label?: string | null
          origin_latitude?: number | null
          origin_longitude?: number | null
          origin_provider_id?: string | null
          origin_source?: string | null
          origin_station_id?: string | null
          planned_distance_meters?: number | null
          planned_drive_seconds?: number | null
          planned_route_stale?: boolean
          planned_stop_seconds?: number | null
          route_calculated_at?: string | null
          route_input_revision?: number
          route_provider?: string | null
          show_on_homepage?: boolean
          status?: string
          stop_duration_minutes?: number
          technical_limit_reached?: boolean
          technical_limit_reason?: string | null
          trip_type: string
          unreachable_candidate_count?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          activated_at?: string | null
          algorithm_version?: string | null
          base_distance_meters?: number | null
          base_duration_seconds?: number | null
          completed_at?: string | null
          confirmed_at?: string | null
          corridor_candidate_count?: number | null
          corridor_miles?: number
          created_at?: string
          destination_full_address?: string | null
          destination_label?: string | null
          destination_latitude?: number | null
          destination_longitude?: number | null
          destination_provider_id?: string | null
          destination_source?: string | null
          destination_station_id?: string | null
          evaluated_candidate_count?: number | null
          extra_distance_meters?: number | null
          extra_duration_seconds?: number | null
          id?: string
          is_public?: boolean
          max_extra_miles?: number | null
          max_extra_minutes?: number
          max_stops?: number | null
          name?: string | null
          origin_full_address?: string | null
          origin_label?: string | null
          origin_latitude?: number | null
          origin_longitude?: number | null
          origin_provider_id?: string | null
          origin_source?: string | null
          origin_station_id?: string | null
          planned_distance_meters?: number | null
          planned_drive_seconds?: number | null
          planned_route_stale?: boolean
          planned_stop_seconds?: number | null
          route_calculated_at?: string | null
          route_input_revision?: number
          route_provider?: string | null
          show_on_homepage?: boolean
          status?: string
          stop_duration_minutes?: number
          technical_limit_reached?: boolean
          technical_limit_reason?: string | null
          trip_type?: string
          unreachable_candidate_count?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_plans_destination_station_id_fkey"
            columns: ["destination_station_id"]
            isOneToOne: false
            referencedRelation: "public_station_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plans_destination_station_id_fkey"
            columns: ["destination_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plans_origin_station_id_fkey"
            columns: ["origin_station_id"]
            isOneToOne: false
            referencedRelation: "public_station_status"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_plans_origin_station_id_fkey"
            columns: ["origin_station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_photos: {
        Row: {
          bucket_name: string
          caption: string | null
          created_at: string
          display_order: number
          file_size_bytes: number
          height: number
          id: string
          is_cover: boolean
          is_public: boolean
          mime_type: string
          storage_path: string
          taken_at: string | null
          trip_plan_id: string
          updated_at: string
          user_id: string
          width: number
        }
        Insert: {
          bucket_name?: string
          caption?: string | null
          created_at?: string
          display_order?: number
          file_size_bytes: number
          height: number
          id?: string
          is_cover?: boolean
          is_public?: boolean
          mime_type: string
          storage_path: string
          taken_at?: string | null
          trip_plan_id: string
          updated_at?: string
          user_id: string
          width: number
        }
        Update: {
          bucket_name?: string
          caption?: string | null
          created_at?: string
          display_order?: number
          file_size_bytes?: number
          height?: number
          id?: string
          is_cover?: boolean
          is_public?: boolean
          mime_type?: string
          storage_path?: string
          taken_at?: string | null
          trip_plan_id?: string
          updated_at?: string
          user_id?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "trip_photos_trip_plan_id_fkey"
            columns: ["trip_plan_id"]
            isOneToOne: false
            referencedRelation: "trip_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      visit_photos: {
        Row: {
          bucket_name: string
          caption: string | null
          created_at: string
          display_order: number
          file_size_bytes: number
          height: number
          id: string
          is_cover: boolean
          is_public: boolean
          mime_type: string
          photo_type: string
          storage_path: string
          taken_at: string | null
          updated_at: string
          user_id: string
          visit_id: string
          width: number
        }
        Insert: {
          bucket_name: string
          caption?: string | null
          created_at?: string
          display_order?: number
          file_size_bytes: number
          height: number
          id?: string
          is_cover?: boolean
          is_public?: boolean
          mime_type: string
          photo_type?: string
          storage_path: string
          taken_at?: string | null
          updated_at?: string
          user_id: string
          visit_id: string
          width: number
        }
        Update: {
          bucket_name?: string
          caption?: string | null
          created_at?: string
          display_order?: number
          file_size_bytes?: number
          height?: number
          id?: string
          is_cover?: boolean
          is_public?: boolean
          mime_type?: string
          photo_type?: string
          storage_path?: string
          taken_at?: string | null
          updated_at?: string
          user_id?: string
          visit_id?: string
          width?: number
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
      public_visit_photos: {
        Row: {
          caption: string | null
          created_at: string | null
          display_order: number | null
          height: number | null
          id: string | null
          is_cover: boolean | null
          taken_at: string | null
          visit_id: string | null
          width: number | null
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
    Functions: {
      admin_add_trip_plan_stop: {
        Args: {
          p_expected_revision?: number
          p_insert_position?: number
          p_leg: string
          p_station_id: string
          p_trip_plan_id: string
        }
        Returns: {
          planned_route_stale: boolean
          route_input_revision: number
          trip_plan_stop_id: string
        }[]
      }
      admin_clear_trip_plan_route: {
        Args: { p_trip_plan_id: string }
        Returns: {
          route_input_revision: number
          trip_plan_id: string
          updated_at: string
        }[]
      }
      admin_clear_trip_plan_suggestions: {
        Args: { p_trip_plan_id: string }
        Returns: {
          extra_distance_meters: number
          extra_duration_seconds: number
          planned_distance_meters: number
          planned_drive_seconds: number
          planned_stop_seconds: number
          route_input_revision: number
          trip_plan_id: string
          updated_at: string
        }[]
      }
      admin_create_station_visit: {
        Args: {
          p_checked_in_timezone: string
          p_is_public?: boolean
          p_notes?: string
          p_recorded_latitude?: number
          p_recorded_longitude?: number
          p_station_id: string
          p_visit_id: string
        }
        Returns: {
          checked_in_at: string
          checked_in_timezone: string
          is_public: boolean
          station_id: string
          visit_id: string
        }[]
      }
      admin_check_in_station: {
        Args: {
          p_checked_in_timezone: string
          p_is_public?: boolean
          p_notes?: string
          p_recorded_latitude?: number
          p_recorded_longitude?: number
          p_station_id: string
          p_visit_id: string
        }
        Returns: {
          checked_in_at: string
          checked_in_timezone: string
          is_public: boolean
          station_id: string
          trip_activated: boolean
          trip_plan_id: string
          trip_plan_stop_id: string
          visit_id: string
        }[]
      }
      admin_create_trip_plan_draft: {
        Args: {
          p_corridor_miles: number
          p_max_extra_miles: number
          p_max_extra_minutes: number
          p_max_stops: number
          p_stop_duration_minutes: number
          p_trip_type: string
        }
        Returns: {
          corridor_miles: number
          created_at: string
          max_extra_miles: number
          max_extra_minutes: number
          max_stops: number
          status: string
          stop_duration_minutes: number
          trip_plan_id: string
          trip_type: string
          updated_at: string
        }[]
      }
      admin_create_trip_plan_route_draft: {
        Args: {
          p_destination_full_address: string
          p_destination_label: string
          p_destination_latitude: number
          p_destination_longitude: number
          p_destination_provider_id: string
          p_destination_source: string
          p_destination_station_id: string
          p_origin_full_address: string
          p_origin_label: string
          p_origin_latitude: number
          p_origin_longitude: number
          p_origin_provider_id: string
          p_origin_source: string
          p_origin_station_id: string
          p_trip_type: string
        }
        Returns: {
          created_at: string
          route_input_revision: number
          trip_plan_id: string
          trip_type: string
          updated_at: string
        }[]
      }
      admin_create_visit_photo: {
        Args: {
          p_bucket_name: string
          p_caption: string
          p_file_size_bytes: number
          p_height: number
          p_is_public: boolean
          p_mime_type: string
          p_photo_id: string
          p_photo_type: string
          p_storage_path: string
          p_taken_at: string
          p_visit_id: string
          p_width: number
        }
        Returns: {
          caption: string
          created_at: string
          display_order: number
          file_size_bytes: number
          height: number
          is_cover: boolean
          is_public: boolean
          mime_type: string
          photo_id: string
          photo_type: string
          taken_at: string
          updated_at: string
          visit_id: string
          width: number
        }[]
      }
      admin_delete_station_visit: {
        Args: { p_deleted_photo_ids: string[]; p_visit_id: string }
        Returns: {
          station_id: string
          visit_id: string
        }[]
      }
      admin_confirm_trip_plan: {
        Args: { p_expected_revision: number; p_trip_plan_id: string }
        Returns: {
          confirmed_at: string
          status: string
          trip_plan_id: string
          updated_at: string
        }[]
      }
      admin_delete_trip_plan_draft: {
        Args: { p_trip_plan_id: string }
        Returns: {
          trip_plan_id: string
        }[]
      }
      admin_delete_visit_photo: {
        Args: { p_photo_id: string }
        Returns: {
          new_cover_photo_id: string
          photo_id: string
          visit_id: string
        }[]
      }
      admin_remove_trip_plan_stop: {
        Args: {
          p_expected_revision: number
          p_trip_plan_id: string
          p_trip_plan_stop_id: string
        }
        Returns: {
          planned_route_stale: boolean
          route_input_revision: number
        }[]
      }
      admin_rename_trip_plan: {
        Args: { p_name: string; p_trip_plan_id: string }
        Returns: {
          name: string
          trip_plan_id: string
          updated_at: string
        }[]
      }
      admin_reorder_trip_plan_stops: {
        Args: {
          p_expected_revision: number
          p_stops: Json
          p_trip_plan_id: string
        }
        Returns: {
          planned_route_stale: boolean
          route_input_revision: number
        }[]
      }
      admin_reorder_visit_photos: {
        Args: { p_photo_ids: string[]; p_visit_id: string }
        Returns: {
          display_order: number
          photo_id: string
        }[]
      }
      admin_save_recalculated_trip_route: {
        Args: {
          p_expected_revision: number
          p_extra_distance_meters: number
          p_extra_duration_seconds: number
          p_persist_geometry: boolean
          p_planned_distance_meters: number
          p_planned_drive_seconds: number
          p_planned_stop_seconds: number
          p_segments: Json
          p_trip_plan_id: string
        }
        Returns: {
          geometry_persisted: boolean
          route_calculated_at: string
          route_input_revision: number
        }[]
      }
      admin_save_regenerated_trip_plan: {
        Args: {
          p_corridor_candidate_count: number
          p_evaluated_candidate_count: number
          p_expected_revision: number
          p_extra_distance_meters: number
          p_extra_duration_seconds: number
          p_persist_geometry: boolean
          p_planned_distance_meters: number
          p_planned_drive_seconds: number
          p_planned_stop_seconds: number
          p_segments: Json
          p_stops: Json
          p_technical_limit_reached: boolean
          p_technical_limit_reason: string
          p_trip_plan_id: string
          p_unreachable_candidate_count: number
        }
        Returns: {
          geometry_persisted: boolean
          route_calculated_at: string
          route_input_revision: number
          stop_count: number
        }[]
      }
      admin_save_reoptimized_trip_plan: {
        Args: {
          p_corridor_candidate_count: number
          p_evaluated_candidate_count: number
          p_expected_revision: number
          p_extra_distance_meters: number
          p_extra_duration_seconds: number
          p_persist_geometry: boolean
          p_planned_distance_meters: number
          p_planned_drive_seconds: number
          p_planned_stop_seconds: number
          p_segments: Json
          p_stops: Json
          p_technical_limit_reached: boolean
          p_technical_limit_reason: string
          p_trip_plan_id: string
          p_unreachable_candidate_count: number
        }
        Returns: {
          geometry_persisted: boolean
          route_calculated_at: string
          route_input_revision: number
          stop_count: number
        }[]
      }
      admin_save_selected_out_and_back_route: {
        Args: {
          p_algorithm_version: string
          p_expected_revision: number
          p_extra_distance_meters: number
          p_extra_duration_seconds: number
          p_persist_geometry: boolean
          p_planned_distance_meters: number
          p_planned_drive_seconds: number
          p_planned_stop_seconds: number
          p_segments: Json
          p_selected_station_ids: string[]
          p_stops: Json
          p_trip_plan_id: string
        }
        Returns: {
          geometry_persisted: boolean
          route_calculated_at: string
          route_input_revision: number
          stop_count: number
        }[]
      }
      admin_save_trip_base_route: {
        Args: {
          p_algorithm_version: string
          p_base_distance_meters: number
          p_base_duration_seconds: number
          p_expected_revision: number
          p_persist_geometry: boolean
          p_route_provider: string
          p_segments: Json
          p_trip_plan_id: string
        }
        Returns: {
          base_distance_meters: number
          base_duration_seconds: number
          geometry_persisted: boolean
          route_calculated_at: string
          route_input_revision: number
          trip_plan_id: string
        }[]
      }
      admin_save_trip_plan_suggestions: {
        Args: {
          p_algorithm_version: string
          p_corridor_candidate_count: number
          p_evaluated_candidate_count: number
          p_expected_revision: number
          p_extra_distance_meters: number
          p_extra_duration_seconds: number
          p_persist_geometry: boolean
          p_planned_distance_meters: number
          p_planned_drive_seconds: number
          p_planned_stop_seconds: number
          p_segments: Json
          p_stops: Json
          p_technical_limit_reached: boolean
          p_technical_limit_reason: string
          p_trip_plan_id: string
          p_unreachable_candidate_count: number
        }
        Returns: {
          extra_distance_meters: number
          extra_duration_seconds: number
          geometry_persisted: boolean
          planned_distance_meters: number
          planned_drive_seconds: number
          planned_stop_seconds: number
          route_calculated_at: string
          route_input_revision: number
          selected_stop_count: number
          trip_plan_id: string
        }[]
      }
      admin_set_station_pay_to_park: {
        Args: { p_pay_to_park: boolean; p_station_id: string }
        Returns: {
          pay_to_park: boolean
          station_id: string
          updated_at: string
        }[]
      }
      admin_set_trip_plan_stop_lock: {
        Args: {
          p_expected_revision: number
          p_is_locked: boolean
          p_trip_plan_id: string
          p_trip_plan_stop_id: string
        }
        Returns: {
          is_locked: boolean
          planned_route_stale: boolean
          route_input_revision: number
        }[]
      }
      admin_set_visit_cover_photo: {
        Args: { p_photo_id: string; p_visit_id: string }
        Returns: {
          is_cover: boolean
          photo_id: string
          updated_at: string
          visit_id: string
        }[]
      }
      admin_swap_trip_plan_endpoints: {
        Args: { p_trip_plan_id: string }
        Returns: {
          destination_full_address: string
          destination_label: string
          destination_latitude: number
          destination_longitude: number
          destination_provider_id: string
          destination_source: string
          destination_station_id: string
          origin_full_address: string
          origin_label: string
          origin_latitude: number
          origin_longitude: number
          origin_provider_id: string
          origin_source: string
          origin_station_id: string
          route_input_revision: number
          trip_plan_id: string
          updated_at: string
        }[]
      }
      admin_update_station_visit: {
        Args: { p_is_public: boolean; p_notes: string; p_visit_id: string }
        Returns: {
          is_public: boolean
          notes: string
          updated_at: string
          visit_id: string
        }[]
      }
      admin_update_trip_plan_endpoints: {
        Args: {
          p_destination_full_address: string
          p_destination_label: string
          p_destination_latitude: number
          p_destination_longitude: number
          p_destination_provider_id: string
          p_destination_source: string
          p_destination_station_id: string
          p_origin_full_address: string
          p_origin_label: string
          p_origin_latitude: number
          p_origin_longitude: number
          p_origin_provider_id: string
          p_origin_source: string
          p_origin_station_id: string
          p_trip_plan_id: string
        }
        Returns: {
          destination_full_address: string
          destination_label: string
          destination_latitude: number
          destination_longitude: number
          destination_provider_id: string
          destination_source: string
          destination_station_id: string
          origin_full_address: string
          origin_label: string
          origin_latitude: number
          origin_longitude: number
          origin_provider_id: string
          origin_source: string
          origin_station_id: string
          route_input_revision: number
          trip_plan_id: string
          updated_at: string
        }[]
      }
      admin_update_trip_plan_route_basics: {
        Args: {
          p_destination_full_address: string
          p_destination_label: string
          p_destination_latitude: number
          p_destination_longitude: number
          p_destination_provider_id: string
          p_destination_source: string
          p_destination_station_id: string
          p_expected_revision: number
          p_origin_full_address: string
          p_origin_label: string
          p_origin_latitude: number
          p_origin_longitude: number
          p_origin_provider_id: string
          p_origin_source: string
          p_origin_station_id: string
          p_trip_plan_id: string
          p_trip_type: string
        }
        Returns: {
          changed: boolean
          route_input_revision: number
          trip_plan_id: string
          trip_type: string
          updated_at: string
        }[]
      }
      admin_update_trip_plan_settings: {
        Args: {
          p_corridor_miles: number
          p_max_extra_miles: number
          p_max_extra_minutes: number
          p_max_stops: number
          p_stop_duration_minutes: number
          p_trip_plan_id: string
          p_trip_type: string
        }
        Returns: {
          corridor_miles: number
          max_extra_miles: number
          max_extra_minutes: number
          max_stops: number
          status: string
          stop_duration_minutes: number
          trip_plan_id: string
          trip_type: string
          updated_at: string
        }[]
      }
      admin_update_visit_photo: {
        Args: {
          p_caption: string
          p_is_public: boolean
          p_photo_id: string
          p_photo_type: string
        }
        Returns: {
          caption: string
          is_public: boolean
          photo_id: string
          photo_type: string
          updated_at: string
          visit_id: string
        }[]
      }
      import_receipt_charge: {
        Args: {
          p_charging_minutes: number
          p_checked_in_at: string
          p_checked_in_time_precision: string
          p_checked_in_timezone: string
          p_cost_usd: number
          p_energy_kwh: number
          p_is_public: boolean
          p_price_per_kwh: number
          p_session_started_at: string
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
      visit_photo_storage_visit_id: {
        Args: { p_name: string }
        Returns: string
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
