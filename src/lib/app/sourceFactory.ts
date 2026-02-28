import { getRuntimeConfig } from "../config.ts";
import { PublicNflSource, type IDataSource } from "../data/publicNflSource.ts";

export function createDataSource(): IDataSource {
  const runtimeConfig = getRuntimeConfig();

  return new PublicNflSource({
    baseUrl: runtimeConfig.balldontlieBaseUrl,
    timeoutMs: runtimeConfig.requestTimeoutMs,
  });
}
