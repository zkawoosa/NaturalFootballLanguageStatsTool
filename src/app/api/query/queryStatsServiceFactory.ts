import { createCanonicalStatsService } from "../../../lib/app/canonicalServiceFactory.ts";
import type { ICanonicalStatsService } from "../../../lib/data/statsRepository.ts";

let statsServiceFactory: () => ICanonicalStatsService = createCanonicalStatsService;

export function getQueryStatsService(): ICanonicalStatsService {
  return statsServiceFactory();
}

export function setQueryStatsServiceFactoryForTests(
  factory: (() => ICanonicalStatsService) | null
): void {
  statsServiceFactory = factory ?? createCanonicalStatsService;
}
