import type { PrismaClient } from "@prisma/client";

export const POINTS_PER_WIN = 10;

const TOURNAMENT_WIN_BONUS_BY_TEAM_LIMIT: Record<number, number> = {
  4: 10,
  8: 20,
  16: 30
};

export type UserScoreSummary = {
  userId: string;
  points: number;
  matchWins: number;
  tournamentWins: number;
  playedTournaments: number;
};

type TeamScoreState = {
  wins: number;
  tournamentWins: number;
  tournamentBonusPoints: number;
  playedTournamentIds: Set<string>;
};

function getChampionBonus(teamLimit: number): number {
  return TOURNAMENT_WIN_BONUS_BY_TEAM_LIMIT[teamLimit] ?? 0;
}

export async function getUserScoreSummaries(prisma: PrismaClient): Promise<Map<string, UserScoreSummary>> {
  const approvedMatches = await prisma.match.findMany({
    where: {
      approvedReportId: {
        not: null
      }
    },
    select: {
      winnerTeamId: true,
      participantATeamId: true,
      participantBTeamId: true,
      nextMatchId: true,
      bracket: {
        select: {
          tournamentId: true,
          tournament: {
            select: {
              teamLimit: true
            }
          }
        }
      }
    }
  });

  const teamState = new Map<string, TeamScoreState>();

  function ensureTeam(teamId: string): TeamScoreState {
    const existing = teamState.get(teamId);
    if (existing) {
      return existing;
    }
    const created: TeamScoreState = {
      wins: 0,
      tournamentWins: 0,
      tournamentBonusPoints: 0,
      playedTournamentIds: new Set<string>()
    };
    teamState.set(teamId, created);
    return created;
  }

  for (const match of approvedMatches) {
    const tournamentId = match.bracket.tournamentId;

    if (match.participantATeamId) {
      ensureTeam(match.participantATeamId).playedTournamentIds.add(tournamentId);
    }
    if (match.participantBTeamId) {
      ensureTeam(match.participantBTeamId).playedTournamentIds.add(tournamentId);
    }

    if (!match.winnerTeamId) {
      continue;
    }

    const winnerState = ensureTeam(match.winnerTeamId);
    winnerState.wins += 1;

    if (!match.nextMatchId) {
      winnerState.tournamentWins += 1;
      winnerState.tournamentBonusPoints += getChampionBonus(match.bracket.tournament.teamLimit);
    }
  }

  const teamIds = [...teamState.keys()];
  if (teamIds.length === 0) {
    return new Map();
  }

  const memberships = await prisma.teamMember.findMany({
    where: {
      teamId: {
        in: teamIds
      },
      userId: {
        not: null
      }
    },
    select: {
      teamId: true,
      userId: true
    }
  });

  const userState = new Map<string, UserScoreSummary & { playedTournamentIds: Set<string> }>();

  function ensureUser(userId: string) {
    const existing = userState.get(userId);
    if (existing) {
      return existing;
    }
    const created = {
      userId,
      points: 0,
      matchWins: 0,
      tournamentWins: 0,
      playedTournaments: 0,
      playedTournamentIds: new Set<string>()
    };
    userState.set(userId, created);
    return created;
  }

  for (const membership of memberships) {
    if (!membership.userId) {
      continue;
    }
    const stats = teamState.get(membership.teamId);
    if (!stats) {
      continue;
    }

    const user = ensureUser(membership.userId);
    user.matchWins += stats.wins;
    user.tournamentWins += stats.tournamentWins;
    user.points += stats.wins * POINTS_PER_WIN + stats.tournamentBonusPoints;
    for (const tournamentId of stats.playedTournamentIds) {
      user.playedTournamentIds.add(tournamentId);
    }
  }

  const out = new Map<string, UserScoreSummary>();
  for (const [userId, value] of userState.entries()) {
    out.set(userId, {
      userId,
      points: value.points,
      matchWins: value.matchWins,
      tournamentWins: value.tournamentWins,
      playedTournaments: value.playedTournamentIds.size
    });
  }

  return out;
}

