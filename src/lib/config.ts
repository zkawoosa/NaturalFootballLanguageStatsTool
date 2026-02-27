import { loadRuntimeEnv } from "./env/runtime.ts";

export const getBalldontlieApiKey = (): string => {
  const { balldontlieApiKey: apiKey } = loadRuntimeEnv();

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("BL_API_KEY is missing. Add BL_API_KEY to /Users/zainkawoosa/nfl-query/.env");
  }

  return apiKey;
};

export const getRuntimeConfig = () => loadRuntimeEnv();
