import { z } from "zod";

export const stationDataSourceSchema = z.enum(["sample", "nlr"]);

export type StationDataSource = z.infer<typeof stationDataSourceSchema>;

export interface StationDataErrorView {
  title: string;
  message: string;
  canRetry: boolean;
}
