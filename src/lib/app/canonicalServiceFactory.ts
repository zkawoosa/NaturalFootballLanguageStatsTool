import { CanonicalStatsService, type ICanonicalStatsService } from "../data/statsRepository.ts";
import { createDataSource } from "./sourceFactory.ts";

let canonicalServiceInstance: ICanonicalStatsService | null = null;

export function createCanonicalStatsService(): ICanonicalStatsService {
  if (canonicalServiceInstance) {
    return canonicalServiceInstance;
  }

  canonicalServiceInstance = new CanonicalStatsService(createDataSource());
  return canonicalServiceInstance;
}
