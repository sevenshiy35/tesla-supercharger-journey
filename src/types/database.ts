import type { MergeDeep } from "type-fest";

import type {
  Database as DatabaseGenerated,
  Json,
} from "./database.generated";

type RouteBasicsRpcArgs = {
  p_trip_type: string;
  p_origin_source: string;
  p_origin_label: string;
  p_origin_full_address: string | null;
  p_origin_latitude: number;
  p_origin_longitude: number;
  p_origin_station_id: string | null;
  p_origin_provider_id: string | null;
  p_destination_source: string;
  p_destination_label: string;
  p_destination_full_address: string | null;
  p_destination_latitude: number;
  p_destination_longitude: number;
  p_destination_station_id: string | null;
  p_destination_provider_id: string | null;
};

type DatabaseOverrides = {
  public: {
    Functions: {
      admin_create_trip_plan_route_draft: {
        Args: RouteBasicsRpcArgs;
        Returns: Array<{
          trip_plan_id: string;
          trip_type: string;
          route_input_revision: number;
          created_at: string;
          updated_at: string;
        }>;
      };
      admin_update_trip_plan_route_basics: {
        Args: RouteBasicsRpcArgs & {
          p_trip_plan_id: string;
          p_expected_revision: number;
        };
        Returns: Array<{
          trip_plan_id: string;
          trip_type: string;
          route_input_revision: number;
          changed: boolean;
          updated_at: string;
        }>;
      };
      import_receipt_charge: {
        Args: {
          p_session_started_at: string | null;
          p_energy_kwh: number | null;
          p_cost_usd: number | null;
          p_charging_minutes: number | null;
          p_price_per_kwh: number | null;
        };
      };
      admin_create_station_visit: {
        Args: {
          p_recorded_latitude?: number | null;
          p_recorded_longitude?: number | null;
          p_notes?: string | null;
        };
      };
      admin_update_station_visit: {
        Args: {
          p_notes: string | null;
        };
      };
      admin_create_visit_photo: {
        Args: {
          p_caption: string | null;
          p_taken_at: string | null;
        };
      };
      admin_update_visit_photo: {
        Args: {
          p_caption: string | null;
        };
      };
      admin_create_trip_plan_draft: {
        Args: {
          p_max_extra_miles: number | null;
          p_max_stops: number | null;
        };
      };
      admin_update_trip_plan_settings: {
        Args: {
          p_max_extra_miles: number | null;
          p_max_stops: number | null;
        };
      };
      admin_update_trip_plan_endpoints: {
        Args: {
          p_origin_source: string | null;
          p_origin_label: string | null;
          p_origin_full_address: string | null;
          p_origin_latitude: number | null;
          p_origin_longitude: number | null;
          p_origin_station_id: string | null;
          p_origin_provider_id: string | null;
          p_destination_source: string | null;
          p_destination_label: string | null;
          p_destination_full_address: string | null;
          p_destination_latitude: number | null;
          p_destination_longitude: number | null;
          p_destination_station_id: string | null;
          p_destination_provider_id: string | null;
        };
      };
      admin_save_trip_plan_suggestions: {
        Args: {
          p_technical_limit_reason: string | null;
        };
      };
      admin_save_regenerated_trip_plan: {
        Args: {
          p_technical_limit_reason: string | null;
        };
      };
      admin_save_reoptimized_trip_plan: {
        Args: {
          p_technical_limit_reason: string | null;
        };
      };
    };
  };
};

export type Database = MergeDeep<DatabaseGenerated, DatabaseOverrides>;

type PublicSchema = Database["public"];

export type Tables<TableName extends keyof (PublicSchema["Tables"] & PublicSchema["Views"] )> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[TableName] extends { Row: infer Row }
    ? Row
    : never;

export type { Json };
