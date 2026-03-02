import type { TeamSummary, TeamsResponse } from "../contracts/api.ts";
import type { ICanonicalStatsService } from "../data/statsRepository.ts";
import type { CanonicalTeam } from "../schema/canonical.ts";

function toTeamSummary(team: CanonicalTeam): TeamSummary {
  return {
    id: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    city: team.city ?? null,
  };
}

export async function getTeamsResponse(service: ICanonicalStatsService): Promise<TeamsResponse> {
  try {
    const teams = await service.getTeams();
    return {
      teams: teams.map((team) => toTeamSummary(team)),
    };
  } catch (error) {
    return {
      teams: [],
      error: error instanceof Error ? error.message : "Unknown teams lookup error",
    };
  }
}
