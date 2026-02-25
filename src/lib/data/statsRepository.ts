import { normalizeSeasonType } from "../schema/canonical.ts";
import type {
  CanonicalGame,
  CanonicalPlayer,
  CanonicalPlayerStat,
  CanonicalSource,
  CanonicalTeam,
  CanonicalTeamStat,
  SeasonType,
} from "../schema/canonical.ts";
import type {
  Game,
  IDataSource,
  NflWeekQuery,
  Player,
  PlayerQuery,
  PlayerStat,
  PlayerStatsQuery,
  Team,
  TeamStat,
  TeamStatsQuery,
} from "./publicNflSource.ts";

export interface ICanonicalStatsService {
  getTeams(): Promise<CanonicalTeam[]>;
  getPlayers(query?: PlayerQuery): Promise<CanonicalPlayer[]>;
  getGames(query?: NflWeekQuery): Promise<CanonicalGame[]>;
  getTeamStats(query?: TeamStatsQuery): Promise<CanonicalTeamStat[]>;
  getPlayerStats(query?: PlayerStatsQuery): Promise<CanonicalPlayerStat[]>;
}

const SOURCE_NAME: CanonicalSource = "balldontlie";
const UNKNOWN_SEASON = 0 as const;

export class CanonicalStatsService implements ICanonicalStatsService {
  private readonly source: IDataSource;

  constructor(source: IDataSource) {
    this.source = source;
  }

  async getTeams(): Promise<CanonicalTeam[]> {
    const teams = await this.source.getTeams();
    return teams.map(this.toTeamRecord);
  }

  async getPlayers(query: PlayerQuery = {}): Promise<CanonicalPlayer[]> {
    const players = await this.source.getPlayers(query);
    return players.map(this.toPlayerRecord);
  }

  async getGames(query: NflWeekQuery = {}): Promise<CanonicalGame[]> {
    const games = await this.source.getGames(query);
    return games.map(this.toGameRecord);
  }

  async getTeamStats(query: TeamStatsQuery = {}): Promise<CanonicalTeamStat[]> {
    const teamStats = await this.source.getTeamStats(query);
    return teamStats.map(this.toTeamStatRecord);
  }

  async getPlayerStats(query: PlayerStatsQuery = {}): Promise<CanonicalPlayerStat[]> {
    const playerStats = await this.source.getPlayerStats(query);
    return playerStats.map(this.toPlayerStatRecord);
  }

  private toTeamRecord = (team: Team): CanonicalTeam => ({
    id: team.id,
    source: SOURCE_NAME,
    sourceId: team.id,
    name: team.name,
    abbreviation: team.abbreviation,
    city: team.city ?? null,
    conference: team.conference ?? null,
    division: team.division ?? null,
    conferenceRank: null,
    record: null,
  });

  private toPlayerRecord = (player: Player): CanonicalPlayer => ({
    id: player.id,
    source: SOURCE_NAME,
    sourceId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    fullName: `${player.firstName} ${player.lastName}`,
    position: player.position ?? null,
    jersey: null,
    teamId: player.teamId ?? null,
    teamName: player.team ?? null,
    height: null,
    weightLbs: null,
    birthDate: null,
    status: "unknown",
    experience: null,
  });

  private toGameRecord = (game: Game): CanonicalGame => ({
    id: game.id,
    source: SOURCE_NAME,
    sourceId: game.id,
    season: game.season ?? UNKNOWN_SEASON,
    week: game.week ?? null,
    seasonType: this.asSeasonType(game.seasonType),
    startTime: game.kickoffAt ?? null,
    status: game.status ?? "unknown",
    homeTeamId: null,
    awayTeamId: null,
    homeTeam: game.homeTeam ?? null,
    awayTeam: game.awayTeam ?? null,
    homeScore: game.homeScore ?? null,
    awayScore: game.awayScore ?? null,
    venue: null,
    weekStartDate: null,
  });

  private toTeamStatRecord = (stat: TeamStat): CanonicalTeamStat => ({
    id: stat.id,
    source: SOURCE_NAME,
    sourceId: stat.id,
    teamId: stat.teamId,
    scope: deriveScope(stat.season, stat.week),
    season: stat.season ?? UNKNOWN_SEASON,
    week: stat.week ?? null,
    opponentTeamId: null,
    gameId: null,
    pointsFor: stat.pointsFor ?? null,
    pointsAgainst: stat.pointsAgainst ?? null,
    totalYards: stat.totalYards ?? null,
    passYards: stat.passYards ?? null,
    rushYards: stat.rushYards ?? null,
    turnovers: stat.turnovers ?? null,
    timeOfPossessionSec: null,
    penalties: null,
    sacks: null,
    turnoverDifferential: null,
  });

  private toPlayerStatRecord = (stat: PlayerStat): CanonicalPlayerStat => ({
    id: stat.id,
    source: SOURCE_NAME,
    sourceId: stat.id,
    playerId: stat.playerId,
    teamId: stat.teamId ?? "unknown",
    gameId: stat.gameId ?? null,
    scope: deriveScope(stat.season, stat.week),
    season: stat.season ?? UNKNOWN_SEASON,
    week: stat.week ?? null,
    statType: "aggregate",
    passAttempts: asNullableNumber(stat.passingAttempts),
    passCompletions: asNullableNumber(stat.passingCompletions),
    passYards: asNullableNumber(stat.passingYards),
    passTd: asNullableNumber(stat.passingTd),
    interceptions: asNullableNumber(stat.interceptions),
    rushAttempts: asNullableNumber(stat.rushingAttempts),
    rushYards: asNullableNumber(stat.rushingYards),
    rushTd: asNullableNumber(stat.rushingTd),
    receptions: asNullableNumber(stat.receptions),
    targets: asNullableNumber(stat.targets),
    recYards: asNullableNumber(stat.receivingYards),
    recTd: asNullableNumber(stat.receivingTd),
    tackles: asNullableNumber(stat.tackles),
    sacks: asNullableNumber(stat.sacks),
    fumbles: asNullableNumber(stat.fumbles),
    fumblesLost: asNullableNumber(stat.fumblesLost),
    twoPointConv: asNullableNumber(stat.twoPointConv),
  });

  private asSeasonType(value?: string | null): SeasonType {
    return normalizeSeasonType(value);
  }
}

function deriveScope(
  season: number | null | undefined,
  week: number | null | undefined
): "game" | "week" | "season" {
  if (season === null || season === undefined) return "season";
  if (week === null || week === undefined) return "season";
  return "week";
}

function asNullableNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return value;
}
