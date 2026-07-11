import { z } from "zod";

export const stationStatusSchema = z.enum(["visited", "unvisited"]);
export const operationalStatusSchema = z.enum([
  "available",
  "planned",
  "temporarily-unavailable",
  "unknown",
]);

export type StationStatus = z.infer<typeof stationStatusSchema>;
export type OperationalStatus = z.infer<typeof operationalStatusSchema>;

export const superchargerStationSchema = z.object({
  id: z.string(),
  externalId: z.string(),
  name: z.string(),
  address: z.string(),
  city: z.string(),
  state: z.string(),
  postalCode: z.string().optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  status: stationStatusSchema,
  operationalStatus: operationalStatusSchema.optional(),
  stallCount: z.number().int().nonnegative().optional(),
  maxPowerKw: z.number().positive().optional(),
  openDate: z.string().optional(),
  visitDate: z.string().optional(),
  lastUpdated: z.string(),
});

export type SuperchargerStation = z.infer<typeof superchargerStationSchema>;
