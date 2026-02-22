import test from "node:test";
import assert from "node:assert/strict";

import { CanonicalStatsService } from "./statsRepository.ts";
import type { IDataSource } from "./publicNflSource.ts";

const fakeSource: IDataSource = {
  getTeams: async () => [
    {
      id: "1",
      name: "Falcons",
      abbreviation: "ATL",
      city: "Atlanta",
      conference: "NFC",
      division: "South",
    },
  ],
  getPlayers: async () => [
    {
      id: "22",
      firstName: "Tom",
      lastName: "Brady",
      position: null,
      teamId: "1",
      team: "Falcons",
    },
  ],
  getGames: async () => [
    {
      id: "g1",
      week: 1,
      season: 2025,
      seasonType: "REG",
      kickoffAt: "2025-09-10T20:00:00Z",
      weekDay: null,
      status: "Final",
      homeTeam: "Falcons",
      awayTeam: "Bears",
      homeScore: 27,
      awayScore: 13,
    },
  ],
  getPlayerStats: async () => [
    {
      id: "ps1",
      playerId: "22",
      playerName: "Tom Brady",
      teamId: "1",
      teamName: "Falcons",
      gameId: "g1",
      season: 2025,
      week: 1,
      seasonType: "REG",
      passingYards: 320,
      passingTd: 3,
      interceptions: 1,
      rushingYards: 12,
      fumbles: 0,
    },
  ],
  getTeamStats: async () => [
    {
      id: "ts1",
      teamId: "1",
      season: 2025,
      week: 1,
      seasonType: "REG",
      pointsFor: 27,
      pointsAgainst: 13,
      totalYards: 410,
      passYards: 320,
      rushYards: 90,
      turnovers: 1,
    },
  ],
};

test("canonical service wraps source and maps entities", async () => {
  const service = new CanonicalStatsService(fakeSource);
  const teams = await service.getTeams();
  const players = await service.getPlayers();
  const games = await service.getGames();
  const teamStats = await service.getTeamStats();
  const playerStats = await service.getPlayerStats();

  assert.equal(teams.length, 1);
  assert.equal(teams[0].source, "balldontlie");
  assert.equal(teams[0].id, "1");
  assert.equal(teams[0].city, "Atlanta");

  assert.equal(players[0].fullName, "Tom Brady");
  assert.equal(players[0].source, "balldontlie");

  assert.equal(games[0].seasonType, "REG");
  assert.equal(games[0].status, "Final");

  assert.equal(teamStats[0].scope, "week");
  assert.equal(teamStats[0].pointsFor, 27);

  assert.equal(playerStats[0].scope, "week");
  assert.equal(playerStats[0].recYards, null);
  assert.equal(playerStats[0].passYards, 320);
});
