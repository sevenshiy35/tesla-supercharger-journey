import { z } from "zod";

export const stationDataSourceSchema = z.enum(["sample", "nlr", "supabase"]);

export type StationDataSource = z.infer<typeof stationDataSourceSchema>;

export interface StationDataErrorView {
  kind: "configuration" | "request" | "empty";
  title: string;
  message: string;
  canRetry: boolean;
}
