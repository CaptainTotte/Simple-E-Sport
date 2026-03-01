import { GlobalRole, TeamMemberRole, TournamentRole, type PrismaClient } from "@prisma/client";
import type { RequestActor } from "@/lib/auth";

export function isPlatformAdmin(actor: RequestActor): boolean {
  return actor.role === GlobalRole.PLATFORM_ADMIN;
}

export async function requireTournamentAdmin(prisma: PrismaClient, actor: RequestActor, tournamentId: string) {
  if (isPlatformAdmin(actor) || actor.role === GlobalRole.TOURNAMENT_ADMIN) {
    return;
  }

  const assignment = await prisma.tournamentRoleAssignment.findFirst({
    where: {
      tournamentId,
      userId: actor.id,
      role: TournamentRole.ADMIN
    }
  });

  if (!assignment) {
    throw new Error("Forbidden: tournament admin required.");
  }
}

export async function requireTeamCaptainOrAdmin(
  prisma: PrismaClient,
  actor: RequestActor,
  teamId: string
) {
  if (isPlatformAdmin(actor) || actor.role === GlobalRole.TOURNAMENT_ADMIN) {
    return;
  }

  const membership = await prisma.teamMember.findFirst({
    where: {
      teamId,
      userId: actor.id,
      role: TeamMemberRole.CAPTAIN
    }
  });

  if (!membership) {
    throw new Error("Forbidden: team captain role required.");
  }
}
