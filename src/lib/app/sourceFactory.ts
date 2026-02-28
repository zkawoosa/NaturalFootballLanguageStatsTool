import { getRuntimeConfig } from "../config.ts";
import { PublicNflSource, type IDataSource } from "../data/publicNflSource.ts";
import { CachedDataSource } from "./cachedDataSource.ts";

let dataSourceInstance: IDataSource | null = null;

export function createDataSource(): IDataSource {
  if (dataSourceInstance) {
    return dataSourceInstance;
  }

  const runtimeConfig = getRuntimeConfig();
  const source = new PublicNflSource({
    baseUrl: runtimeConfig.balldontlieBaseUrl,
    timeoutMs: runtimeConfig.requestTimeoutMs,
  });

  dataSourceInstance = new CachedDataSource(source, {
    enabled: runtimeConfig.cacheEnabled,
    ttlSeconds: runtimeConfig.cacheTtlSeconds,
  });

  return dataSourceInstance;
}
