import { loadRuntimeEnv } from "./env/runtime.ts";

export const getBalldontlieApiKey = (): string => {
  const { balldontlieApiKey: apiKey } = loadRuntimeEnv();

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("BL_API_KEY is missing. Add BL_API_KEY to /Users/zainkawoosa/nfl-query/.env");
  }

  return apiKey;
};

export const getBalldontlieApiKeys = (): string[] => {
  const { balldontlieApiKeys } = loadRuntimeEnv();

  if (balldontlieApiKeys.length === 0) {
    throw new Error("BL_API_KEY is missing. Add BL_API_KEY to /Users/zainkawoosa/nfl-query/.env");
  }

  return balldontlieApiKeys;
};

export const getRuntimeConfig = () => loadRuntimeEnv();
