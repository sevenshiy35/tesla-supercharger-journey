import type {
  NearbyCheckInCandidate,
  QuickCheckInDraft,
  RoutePlanningRequest,
  RoutePlanningResult,
} from "@/types/journey";

export interface QuickCheckInService {
  findNearbySuperchargers(latitude: number, longitude: number): Promise<NearbyCheckInCandidate[]>;
  createCheckIn(draft: QuickCheckInDraft): Promise<{ checkInId: string }>;
}

export interface RoutePlanningService {
  planRoute(request: RoutePlanningRequest): Promise<RoutePlanningResult>;
}

export interface VisitPhotoStorage {
  createUploadUrl(checkInId: string, fileName: string): Promise<{ uploadUrl: string; fileId: string }>;
}
