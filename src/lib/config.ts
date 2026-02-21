export const getBalldontlieApiKey = (): string => {
  const apiKey = process.env.BL_API_KEY;

  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("BL_API_KEY is missing. Add BL_API_KEY to /Users/zainkawoosa/nfl-query/.env");
  }

  return apiKey;
};
