import { CanonicalStatsService, type ICanonicalStatsService } from "../data/statsRepository.ts";
import { createDataSource } from "./sourceFactory.ts";

export function createCanonicalStatsService(): ICanonicalStatsService {
  return new CanonicalStatsService(createDataSource());
}
