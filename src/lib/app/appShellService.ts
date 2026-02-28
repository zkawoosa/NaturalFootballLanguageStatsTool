import type { StatusResponse } from "../contracts/api.ts";
import type { IDataSource } from "../data/publicNflSource.ts";

const SAMPLE_PROMPTS = [
  "Who has the most passing yards in week 7?",
  "Team stats for Chiefs this season",
  "Compare Bills and Dolphins rushing yards this week",
];

export type AppShellViewModel = {
  status: StatusResponse;
  samplePrompts: string[];
};

export async function getSourceHealth(source: IDataSource): Promise<StatusResponse> {
  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();

  try {
    await source.getTeams();
    return {
      source: "balldontlie",
      healthy: true,
      latencyMs: Date.now() - startedAt,
      checkedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown source failure";
    return {
      source: "balldontlie",
      healthy: false,
      latencyMs: Date.now() - startedAt,
      checkedAt,
      error: message,
    };
  }
}

export async function getAppShellViewModel(source: IDataSource): Promise<AppShellViewModel> {
  const status = await getSourceHealth(source);

  return {
    status,
    samplePrompts: [...SAMPLE_PROMPTS],
  };
}
