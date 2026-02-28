import { GlobalRole, RegistrationStatus, TournamentStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    const isAdmin = actor.role === GlobalRole.PLATFORM_ADMIN || actor.role === GlobalRole.TOURNAMENT_ADMIN;

    const tournaments = await prisma.tournament.findMany({
      where: {
        status: TournamentStatus.LIVE,
        bracket: {
          isNot: null
        },
        ...(isAdmin
          ? {}
          : {
              registrations: {
                some: {
                  status: RegistrationStatus.APPROVED,
                  team: {
                    members: {
                      some: {
                        userId: actor.id
                      }
                    }
                  }
                }
              }
            })
      },
      select: {
        id: true,
        name: true,
        bracket: {
          select: {
            matches: {
              orderBy: [{ round: "asc" }, { position: "asc" }],
              select: {
                id: true,
                round: true,
                position: true,
                status: true,
                participantATeam: {
                  select: {
                    id: true,
                    name: true,
                    members: {
                      where: {
                        userId: actor.id
                      },
                      select: {
                        id: true
                      }
                    }
                  }
                },
                participantBTeam: {
                  select: {
                    id: true,
                    name: true,
                    members: {
                      where: {
                        userId: actor.id
                      },
                      select: {
                        id: true
                      }
                    }
                  }
                },
                reports: {
                  orderBy: {
                    createdAt: "desc"
                  },
                  select: {
                    id: true,
                    status: true,
                    scoreA: true,
                    scoreB: true,
                    claimedWinnerTeamId: true,
                    proofAssets: {
                      select: {
                        publicUrl: true
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    const data = tournaments.map((tournament) => {
      const rawMatches = tournament.bracket?.matches ?? [];
      const matches = rawMatches
        .filter((match) => {
          if (isAdmin) {
            return true;
          }
          const inTeamA = (match.participantATeam?.members.length ?? 0) > 0;
          const inTeamB = (match.participantBTeam?.members.length ?? 0) > 0;
          return inTeamA || inTeamB;
        })
        .map((match) => ({
          id: match.id,
          round: match.round,
          position: match.position,
          status: match.status,
          participantATeam: match.participantATeam
            ? {
                id: match.participantATeam.id,
                name: match.participantATeam.name
              }
            : null,
          participantBTeam: match.participantBTeam
            ? {
                id: match.participantBTeam.id,
                name: match.participantBTeam.name
              }
            : null,
          reports: match.reports
        }));

      return {
        id: tournament.id,
        name: tournament.name,
        matches
      };
    });

    return NextResponse.json({
      isAdmin,
      tournaments: data
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}
