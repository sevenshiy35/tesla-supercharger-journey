import { z } from "zod";
import { MAX_SELECTED_STATIONS_PER_OPTIMIZATION } from "./planning-config";
import { endpointDistanceMeters } from "./distance";

function emptyStringToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function emptyStringToNull(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

const positiveNumber = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().finite().positive("Enter a value greater than zero."),
);

const nonNegativeInteger = z.preprocess(
  emptyStringToUndefined,
  z.coerce.number().finite().int("Enter a whole number.").nonnegative("Enter zero or more."),
);

const optionalNonNegativeNumber = z.preprocess(
  emptyStringToNull,
  z.union([
    z.null(),
    z.coerce.number().finite().nonnegative("Enter zero or more."),
  ]),
);

export const tripPlanSettingsSchema = z.object({
  tripType: z.enum(["one_way", "round_trip"], {
    error: "Choose One way or Round trip.",
  }),
  corridorMiles: positiveNumber,
  maxExtraMinutes: nonNegativeInteger,
  maxExtraMiles: optionalNonNegativeNumber,
  stopDurationMinutes: nonNegativeInteger,
});

export const tripPlanIdSchema = z.string().uuid("The Trip Plan ID is invalid.");

export const tripPlanNameSchema = z
  .string({ error: "Enter a Trip name." })
  .trim()
  .min(1, "Enter a Trip name.")
  .max(120, "Trip name must be 120 characters or fewer.");

export const stationPayToParkSchema = z.object({
  stationId: z.string().uuid("The Station ID is invalid."),
  payToPark: z.boolean({ error: "Choose whether this Station is pay to park." }),
}).strict();

export const selectedStationOptimizationSchema = z.object({
  tripPlanId: tripPlanIdSchema,
  expectedRevision: z.number().int().nonnegative(),
  selectedStationIds: z.array(tripPlanIdSchema).max(MAX_SELECTED_STATIONS_PER_OPTIMIZATION * 4),
}).strict();

const coordinateSchema = z.number().finite();
const endpointSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("mapbox"),
    label: z.string().trim().min(1).max(300),
    fullAddress: z.string().trim().min(1).max(500),
    latitude: coordinateSchema.min(-90).max(90),
    longitude: coordinateSchema.min(-180).max(180),
    stationId: z.null(),
    providerId: z.string().trim().min(1).max(300),
  }).strict(),
  z.object({
    source: z.literal("current_location"),
    label: z.string().trim().min(1).max(300),
    fullAddress: z.null(),
    latitude: coordinateSchema.min(-90).max(90),
    longitude: coordinateSchema.min(-180).max(180),
    stationId: z.null(),
    providerId: z.null(),
  }).strict(),
  z.object({
    source: z.literal("station"),
    label: z.string().trim().min(1).max(300),
    fullAddress: z.string().trim().min(1).max(500),
    latitude: coordinateSchema.min(-90).max(90),
    longitude: coordinateSchema.min(-180).max(180),
    stationId: z.string().uuid(),
    providerId: z.null(),
  }).strict(),
]);

export const tripPlanEndpointsSchema = z.object({
  origin: endpointSchema.nullable(),
  destination: endpointSchema.nullable(),
});

export const tripRouteBasicsSchema = z.object({
  tripType: z.enum(["one_way", "round_trip"], {
    error: "Choose One way or Round trip.",
  }),
  origin: endpointSchema,
  destination: endpointSchema,
}).strict().superRefine((value, context) => {
  if (value.destination.source === "current_location") {
    context.addIssue({
      code: "custom",
      path: ["destination"],
      message: "Choose a Supercharger or address for the destination.",
    });
  }
  if (endpointDistanceMeters(value.origin, value.destination) < 100) {
    context.addIssue({
      code: "custom",
      path: ["destination"],
      message: "Origin and destination are too close to calculate a useful trip.",
    });
  }
});

export type ValidatedTripPlanSettings = z.infer<typeof tripPlanSettingsSchema>;
export type ValidatedTripRouteBasics = z.infer<typeof tripRouteBasicsSchema>;

export function validateTripPlanSettings(input: unknown) {
  return tripPlanSettingsSchema.safeParse(input);
}

export function validateTripPlanEndpoints(input: unknown) {
  return tripPlanEndpointsSchema.safeParse(input);
}

export function validateTripRouteBasics(input: unknown) {
  return tripRouteBasicsSchema.safeParse(input);
}

export function validateTripPlanName(input: unknown) {
  return tripPlanNameSchema.safeParse(input);
}

export function validateStationPayToPark(input: unknown) {
  return stationPayToParkSchema.safeParse(input);
}
