"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { getDrivingDirections } from "@/lib/mapbox/directions";
import { buildTripBaseRoute } from "@/lib/mapbox/route-builder";
import { isRouteGeometryPersistenceEnabled } from "@/lib/mapbox/server-client";
import { safeMapboxErrorMessage } from "@/lib/mapbox/errors";
import { createClient } from "@/lib/supabase/server";
import { endpointDistanceMeters } from "@/lib/trips/distance";
import { getAdminSuggestedTripStops, getAdminTripPlan, searchAdminTripStopStations } from "@/lib/trips/repository";
import { TripSuggestionError } from "@/lib/trips/suggestion-service";
import { recalculateTripRoute, summarizeEditableTrip } from "@/lib/trips/manual-editing-service";
import {
  optimizeAndSaveSelectedOutAndBackStations,
  SelectedRouteOptimizationError,
} from "@/lib/trips/selected-out-and-back-service";
import type {
  SelectedOutAndBackSummary,
  SuggestedTripStop,
  TripBaseRoute,
  TripEndpoint,
  TripPlanStopLeg,
  TripRouteSegment,
  TripStopSearchResult,
  TripSuggestionSummary,
} from "@/lib/trips/types";
import {
  selectedStationOptimizationSchema,
  tripPlanIdSchema,
  validateTripPlanEndpoints,
  validateTripPlanName,
  validateTripPlanSettings,
  validateTripRouteBasics,
} from "@/lib/trips/validation";
import type { Json } from "@/types/database";

export interface TripPlanMutationState {
  ok: boolean;
  tripPlanId?: string;
  error?: string;
}

export interface TripRouteMutationState extends TripPlanMutationState {
  route?: TripBaseRoute;
  routeInputRevision?: number;
}

export interface TripPlanRenameState extends TripPlanMutationState {
  name?: string;
}

export interface TripPlanConfirmationState extends TripPlanMutationState {
  status?: "confirmed";
  confirmedAt?: string;
}

export interface TripPublicationState extends TripPlanMutationState {
  isPublic?: boolean;
  showOnHomepage?: boolean;
}

export interface TripRouteBasicsMutationState extends TripPlanMutationState {
  routeInputRevision?: number;
  changed?: boolean;
}

export interface TripSuggestionMutationState extends TripPlanMutationState {
  stops?: SuggestedTripStop[];
  summary?: TripSuggestionSummary;
  segments?: TripRouteSegment[];
  geometryPersisted?: boolean;
  routeInputRevision?: number;
}

export interface SelectedOutAndBackMutationState extends TripPlanMutationState {
  stops?: SuggestedTripStop[];
  summary?: SelectedOutAndBackSummary;
  segments?: TripRouteSegment[];
  geometryPersisted?: boolean;
  routeInputRevision?: number;
  unreachableStationIds?: string[];
}

export interface TripStopMutationState extends TripPlanMutationState {
  stops?: SuggestedTripStop[];
  summary?: TripSuggestionSummary | null;
  routeInputRevision?: number;
  plannedRouteStale?: boolean;
}

export interface TripStopSearchState {
  ok: boolean;
  stations?: TripStopSearchResult[];
  error?: string;
}

function safeTripMutationError(message: string, fallback: string) {
  if (/schema cache|could not find the function|admin_set_trip_publication/i.test(message)) {
    return "Trip publishing is not installed yet. Apply the latest database migration and try again.";
  }
  if (/only draft/i.test(message)) return "Only Draft Trip Plans can be changed this way.";
  if (/trip name.*required/i.test(message)) return "Add a Trip name before confirming.";
  if (/planned route.*not ready|route.*not ready.*confirmation/i.test(message)) return "Finish and review the current route before confirming.";
  if (/stale route result/i.test(message)) return "The route inputs changed while Mapbox was calculating. Review the latest endpoints and calculate again.";
  if (/trip changed|stale|fixed manual/i.test(message)) return "The trip changed while this operation was running. Refresh and try again.";
  if (/coordinates do not match/i.test(message)) return "The selected Supercharger changed. Search for it again before saving.";
  if (/station.*does not exist/i.test(message)) return "The selected Supercharger is no longer available.";
  if (/not found|does not exist/i.test(message)) return "This Trip Plan Draft no longer exists.";
  if (/administrator|authentication/i.test(message)) return "Your administrator session has expired.";
  if (/trip type/i.test(message)) return "Choose One way or Round trip.";
  if (/corridor/i.test(message)) return "Route corridor must be greater than zero.";
  if (/negative|zero or more/i.test(message)) return "Planning limits cannot be negative.";
  return fallback;
}

function refreshTripPaths(tripPlanId?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/trips");
  if (tripPlanId) revalidatePath(`/admin/trips/${tripPlanId}`);
}

export async function setTripPublicationAction(
  tripPlanId: string,
  showOnHomepage: boolean,
): Promise<TripPublicationState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_set_trip_publication", {
    p_trip_plan_id: idValidation.data,
    p_is_public: showOnHomepage,
    p_show_on_homepage: showOnHomepage,
  });
  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeTripMutationError(error?.message ?? "", "The Trip publication setting could not be saved."),
    };
  }

  refreshTripPaths(tripPlanId);
  revalidatePath("/");
  return {
    ok: true,
    tripPlanId,
    isPublic: data[0].is_public,
    showOnHomepage: data[0].show_on_homepage,
  };
}

export async function renameTripPlanAction(
  tripPlanId: string,
  input: unknown,
): Promise<TripPlanRenameState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };

  const nameValidation = validateTripPlanName(input);
  if (!nameValidation.success) {
    return { ok: false, error: nameValidation.error.issues[0]?.message ?? "Enter a Trip name." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_rename_trip_plan", {
    p_trip_plan_id: idValidation.data,
    p_name: nameValidation.data,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeTripMutationError(error?.message ?? "", "The Trip name could not be saved. Please try again."),
    };
  }

  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId, name: data[0].name };
}

export async function createTripPlanDraftAction(
  input: unknown,
): Promise<TripPlanMutationState> {
  await requireAdmin();
  const validation = validateTripRouteBasics(input);
  if (!validation.success) {
    return { ok: false, error: validation.error.issues[0]?.message ?? "Choose a complete route." };
  }

  const { tripType, origin, destination } = validation.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_create_trip_plan_route_draft", {
    p_trip_type: tripType,
    p_origin_source: origin.source,
    p_origin_label: origin.label,
    p_origin_full_address: origin.fullAddress,
    p_origin_latitude: origin.latitude,
    p_origin_longitude: origin.longitude,
    p_origin_station_id: origin.stationId,
    p_origin_provider_id: origin.providerId,
    p_destination_source: destination.source,
    p_destination_label: destination.label,
    p_destination_full_address: destination.fullAddress,
    p_destination_latitude: destination.latitude,
    p_destination_longitude: destination.longitude,
    p_destination_station_id: destination.stationId,
    p_destination_provider_id: destination.providerId,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeTripMutationError(error?.message ?? "", "The Draft could not be created. Your route was kept; please try again."),
    };
  }

  const tripPlanId = data[0].trip_plan_id;
  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId };
}

export async function saveTripPlanRouteBasicsAction(
  tripPlanId: string,
  expectedRevision: number,
  input: unknown,
): Promise<TripRouteBasicsMutationState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, error: "The route revision is invalid." };
  }
  const validation = validateTripRouteBasics(input);
  if (!validation.success) {
    return { ok: false, error: validation.error.issues[0]?.message ?? "Choose a complete route." };
  }
  const { tripType, origin, destination } = validation.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_trip_plan_route_basics", {
    p_trip_plan_id: idValidation.data,
    p_expected_revision: expectedRevision,
    p_trip_type: tripType,
    p_origin_source: origin.source,
    p_origin_label: origin.label,
    p_origin_full_address: origin.fullAddress,
    p_origin_latitude: origin.latitude,
    p_origin_longitude: origin.longitude,
    p_origin_station_id: origin.stationId,
    p_origin_provider_id: origin.providerId,
    p_destination_source: destination.source,
    p_destination_label: destination.label,
    p_destination_full_address: destination.fullAddress,
    p_destination_latitude: destination.latitude,
    p_destination_longitude: destination.longitude,
    p_destination_station_id: destination.stationId,
    p_destination_provider_id: destination.providerId,
  });
  if (error || !data?.[0]) {
    return { ok: false, error: safeTripMutationError(error?.message ?? "", "Route basics could not be saved. Please try again.") };
  }
  refreshTripPaths(tripPlanId);
  return {
    ok: true,
    tripPlanId,
    routeInputRevision: data[0].route_input_revision,
    changed: data[0].changed,
  };
}

export async function updateTripPlanSettingsAction(
  tripPlanId: string,
  input: unknown,
): Promise<TripPlanMutationState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };

  const validation = validateTripPlanSettings(input);
  if (!validation.success) {
    return { ok: false, error: validation.error.issues[0]?.message ?? "Review the planning limits." };
  }

  const settings = validation.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_trip_plan_settings", {
    p_trip_plan_id: idValidation.data,
    p_trip_type: settings.tripType,
    p_corridor_miles: settings.corridorMiles,
    p_max_extra_minutes: settings.maxExtraMinutes,
    p_max_extra_miles: settings.maxExtraMiles,
    p_max_stops: null,
    p_stop_duration_minutes: settings.stopDurationMinutes,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeTripMutationError(error?.message ?? "", "Trip settings could not be saved. Please try again."),
    };
  }

  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId };
}

export async function confirmTripPlanAction(
  tripPlanId: string,
  expectedRevision: number,
): Promise<TripPlanConfirmationState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    return { ok: false, error: "The route revision is invalid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_confirm_trip_plan", {
    p_trip_plan_id: idValidation.data,
    p_expected_revision: expectedRevision,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeTripMutationError(error?.message ?? "", "The Trip could not be confirmed. Please try again."),
    };
  }

  refreshTripPaths(tripPlanId);
  return {
    ok: true,
    tripPlanId,
    status: "confirmed",
    confirmedAt: data[0].confirmed_at,
  };
}

export async function deleteTripPlanDraftAction(
  tripPlanId: string,
): Promise<TripPlanMutationState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_delete_trip_plan_draft", {
    p_trip_plan_id: idValidation.data,
  });

  if (error || !data?.[0]) {
    return {
      ok: false,
      error: safeTripMutationError(error?.message ?? "", "The Draft could not be deleted."),
    };
  }

  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId };
}

export async function saveTripPlanEndpointsAction(
  tripPlanId: string,
  input: unknown,
): Promise<TripPlanMutationState> {
  await requireAdmin();
  const idValidation = tripPlanIdSchema.safeParse(tripPlanId);
  if (!idValidation.success) return { ok: false, error: idValidation.error.issues[0]?.message };
  const validation = validateTripPlanEndpoints(input);
  if (!validation.success) {
    return { ok: false, error: validation.error.issues[0]?.message ?? "Choose a complete endpoint result." };
  }
  const { origin, destination } = validation.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_update_trip_plan_endpoints", {
    p_trip_plan_id: idValidation.data,
    p_origin_source: origin?.source ?? null,
    p_origin_label: origin?.label ?? null,
    p_origin_full_address: origin?.fullAddress ?? null,
    p_origin_latitude: origin?.latitude ?? null,
    p_origin_longitude: origin?.longitude ?? null,
    p_origin_station_id: origin?.stationId ?? null,
    p_origin_provider_id: origin?.providerId ?? null,
    p_destination_source: destination?.source ?? null,
    p_destination_label: destination?.label ?? null,
    p_destination_full_address: destination?.fullAddress ?? null,
    p_destination_latitude: destination?.latitude ?? null,
    p_destination_longitude: destination?.longitude ?? null,
    p_destination_station_id: destination?.stationId ?? null,
    p_destination_provider_id: destination?.providerId ?? null,
  });
  if (error || !data?.[0]) {
    return { ok: false, error: safeTripMutationError(error?.message ?? "", "Endpoints could not be saved. Please try again.") };
  }
  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId };
}

export async function swapTripPlanEndpointsAction(tripPlanId: string): Promise<TripPlanMutationState> {
  await requireAdmin();
  const parsed = tripPlanIdSchema.safeParse(tripPlanId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_swap_trip_plan_endpoints", { p_trip_plan_id: parsed.data });
  if (error || !data?.[0]) {
    return { ok: false, error: safeTripMutationError(error?.message ?? "", "Endpoints could not be swapped.") };
  }
  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId };
}

export async function clearTripPlanRouteAction(tripPlanId: string): Promise<TripPlanMutationState> {
  await requireAdmin();
  const parsed = tripPlanIdSchema.safeParse(tripPlanId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_clear_trip_plan_route", { p_trip_plan_id: parsed.data });
  if (error || !data?.[0]) {
    return { ok: false, error: safeTripMutationError(error?.message ?? "", "The calculated route could not be cleared.") };
  }
  refreshTripPaths(tripPlanId);
  return { ok: true, tripPlanId };
}

function endpointFromPlan(plan: Awaited<ReturnType<typeof getAdminTripPlan>>, kind: "origin" | "destination"): TripEndpoint | null {
  if (!plan) return null;
  const source = kind === "origin" ? plan.originSource : plan.destinationSource;
  const label = kind === "origin" ? plan.originLabel : plan.destinationLabel;
  const fullAddress = kind === "origin" ? plan.originFullAddress : plan.destinationFullAddress;
  const latitude = kind === "origin" ? plan.originLatitude : plan.destinationLatitude;
  const longitude = kind === "origin" ? plan.originLongitude : plan.destinationLongitude;
  const stationId = kind === "origin" ? plan.originStationId : plan.destinationStationId;
  const providerId = kind === "origin" ? plan.originProviderId : plan.destinationProviderId;
  if (!source || !label || latitude === null || longitude === null) return null;
  return { source, label, fullAddress, latitude, longitude, stationId, providerId };
}

export async function calculateTripBaseRouteAction(tripPlanId: string): Promise<TripRouteMutationState> {
  await requireAdmin();
  const parsed = tripPlanIdSchema.safeParse(tripPlanId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  let plan: Awaited<ReturnType<typeof getAdminTripPlan>>;
  try {
    plan = await getAdminTripPlan(parsed.data);
  } catch {
    return { ok: false, error: "The Trip Plan could not be loaded. Please try again." };
  }
  if (!plan) return { ok: false, error: "This Trip Plan Draft no longer exists." };
  if (plan.status !== "draft") return { ok: false, error: "Only Draft Trip Plans can calculate a route." };
  const origin = endpointFromPlan(plan, "origin");
  const destination = endpointFromPlan(plan, "destination");
  if (!origin) return { ok: false, error: "Choose and save an Origin before calculating." };
  if (!destination) return { ok: false, error: "Choose and save a Destination before calculating." };
  if ((origin.source === "station" && !origin.stationId) || (destination.source === "station" && !destination.stationId)) {
    return { ok: false, error: "A selected Supercharger is no longer available. Choose that endpoint again." };
  }
  if (endpointDistanceMeters(origin, destination) < 100) {
    return { ok: false, error: "Origin and destination are too close to calculate a useful trip." };
  }

  try {
    const built = await buildTripBaseRoute(
      plan.tripType,
      { longitude: origin.longitude, latitude: origin.latitude },
      { longitude: destination.longitude, latitude: destination.latitude },
      getDrivingDirections,
    );
    const persistGeometry = isRouteGeometryPersistenceEnabled();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_save_trip_base_route", {
      p_trip_plan_id: plan.id,
      p_expected_revision: plan.routeInputRevision,
      p_route_provider: built.provider,
      p_algorithm_version: built.algorithmVersion,
      p_base_distance_meters: built.distanceMeters,
      p_base_duration_seconds: built.durationSeconds,
      p_segments: built.segments as unknown as Json,
      p_persist_geometry: persistGeometry,
    });
    if (error || !data?.[0]) {
      return { ok: false, error: safeTripMutationError(error?.message ?? "", "The route was calculated but could not be saved.") };
    }
    const saved = data[0];
    refreshTripPaths(plan.id);
    return {
      ok: true,
      tripPlanId: plan.id,
      route: {
        provider: "mapbox",
        algorithmVersion: "base-route-v1",
        calculatedAt: saved.route_calculated_at,
        geometryPersisted: saved.geometry_persisted,
        metrics: {
          baseDistanceMeters: saved.base_distance_meters,
          baseDurationSeconds: saved.base_duration_seconds,
          plannedDistanceMeters: saved.base_distance_meters,
          plannedDriveSeconds: saved.base_duration_seconds,
          plannedStopSeconds: 0,
          extraDistanceMeters: 0,
          extraDurationSeconds: 0,
        },
        segments: built.segments,
      },
      routeInputRevision: saved.route_input_revision,
    };
  } catch (error) {
    return { ok: false, error: safeMapboxErrorMessage(error) };
  }
}

export async function optimizeSelectedOutAndBackStationsAction(
  input: unknown,
): Promise<SelectedOutAndBackMutationState> {
  await requireAdmin();
  const parsed = selectedStationOptimizationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "The selected Station request is invalid or exceeds the internal safety guard." };
  }
  try {
    const generated = await optimizeAndSaveSelectedOutAndBackStations(parsed.data);
    refreshTripPaths(parsed.data.tripPlanId);
    return { ok: true, tripPlanId: parsed.data.tripPlanId, ...generated };
  } catch (error) {
    if (error instanceof SelectedRouteOptimizationError) {
      return {
        ok: false,
        error: error.safeMessage,
        unreachableStationIds: error.stationIds,
      };
    }
    return { ok: false, error: safeMapboxErrorMessage(error) };
  }
}

function validRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

async function refreshedStopState(tripPlanId: string, revision: number, stale: boolean): Promise<TripStopMutationState> {
  const [plan, stops] = await Promise.all([getAdminTripPlan(tripPlanId), getAdminSuggestedTripStops(tripPlanId)]);
  return { ok: true, tripPlanId, stops, summary: plan ? summarizeEditableTrip({ ...plan, routeInputRevision: revision, plannedRouteStale: stale }, stops) : null, routeInputRevision: revision, plannedRouteStale: stale };
}

export async function searchTripStopStationsAction(tripPlanId: string, query: string): Promise<TripStopSearchState> {
  await requireAdmin();
  const parsed = tripPlanIdSchema.safeParse(tripPlanId);
  if (!parsed.success) return { ok: false, error: "Trip Plan not found." };
  if (typeof query !== "string" || query.trim().length < 2) return { ok: true, stations: [] };
  try { return { ok: true, stations: await searchAdminTripStopStations(parsed.data, query) }; }
  catch { return { ok: false, error: "Station search is temporarily unavailable." }; }
}

export async function addTripPlanStopAction(tripPlanId: string, stationId: string, leg: TripPlanStopLeg, expectedRevision: number, insertPosition?: number): Promise<TripStopMutationState> {
  await requireAdmin();
  const trip = tripPlanIdSchema.safeParse(tripPlanId); const station = tripPlanIdSchema.safeParse(stationId);
  if (!trip.success || !station.success || !validRevision(expectedRevision) || !["outbound", "return"].includes(leg) || (insertPosition !== undefined && (!Number.isInteger(insertPosition) || insertPosition < 0))) return { ok: false, error: "The requested Stop change is invalid." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_add_trip_plan_stop", { p_trip_plan_id: trip.data, p_station_id: station.data, p_leg: leg, p_expected_revision: expectedRevision, ...(insertPosition === undefined ? {} : { p_insert_position: insertPosition }) });
  if (error || !data?.[0]) return { ok: false, error: safeTripMutationError(error?.message ?? "", "The Stop could not be added.") };
  refreshTripPaths(trip.data);
  return refreshedStopState(trip.data, data[0].route_input_revision, data[0].planned_route_stale);
}

export async function removeTripPlanStopAction(tripPlanId: string, stopId: string, expectedRevision: number): Promise<TripStopMutationState> {
  await requireAdmin(); const trip = tripPlanIdSchema.safeParse(tripPlanId); const stop = tripPlanIdSchema.safeParse(stopId);
  if (!trip.success || !stop.success || !validRevision(expectedRevision)) return { ok: false, error: "The requested Stop change is invalid." };
  const supabase = await createClient(); const { data, error } = await supabase.rpc("admin_remove_trip_plan_stop", { p_trip_plan_id: trip.data, p_trip_plan_stop_id: stop.data, p_expected_revision: expectedRevision });
  if (error || !data?.[0]) return { ok: false, error: safeTripMutationError(error?.message ?? "", "The Stop could not be removed.") };
  refreshTripPaths(trip.data); return refreshedStopState(trip.data, data[0].route_input_revision, data[0].planned_route_stale);
}

export async function reorderTripPlanStopsAction(tripPlanId: string, expectedRevision: number, stops: Array<{ stopId: string; sequence: number; leg: TripPlanStopLeg }>): Promise<TripStopMutationState> {
  await requireAdmin(); const trip = tripPlanIdSchema.safeParse(tripPlanId);
  if (!trip.success || !validRevision(expectedRevision) || !Array.isArray(stops) || stops.some((stop, index) => !tripPlanIdSchema.safeParse(stop.stopId).success || stop.sequence !== index || !["outbound", "return"].includes(stop.leg))) return { ok: false, error: "The requested Stop order is invalid." };
  const supabase = await createClient(); const { data, error } = await supabase.rpc("admin_reorder_trip_plan_stops", { p_trip_plan_id: trip.data, p_expected_revision: expectedRevision, p_stops: stops as unknown as Json });
  if (error || !data?.[0]) return { ok: false, error: safeTripMutationError(error?.message ?? "", "The Stop order could not be saved.") };
  refreshTripPaths(trip.data); return refreshedStopState(trip.data, data[0].route_input_revision, data[0].planned_route_stale);
}

async function runRouteOperation(tripPlanId: string, operation: typeof recalculateTripRoute): Promise<TripSuggestionMutationState> {
  await requireAdmin(); const parsed = tripPlanIdSchema.safeParse(tripPlanId);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  try { const result = await operation(parsed.data); refreshTripPaths(parsed.data); return { ok: true, tripPlanId: parsed.data, ...result }; }
  catch (error) { if (error instanceof TripSuggestionError) return { ok: false, error: error.safeMessage }; return { ok: false, error: safeMapboxErrorMessage(error) }; }
}

export async function recalculateTripRouteAction(tripPlanId: string) { return runRouteOperation(tripPlanId, recalculateTripRoute); }
