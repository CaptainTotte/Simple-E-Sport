import { GlobalRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { isAccountBanned, isAccountTimedOut } from "@/lib/account-status";
import { errorResponse } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { getUserScoreSummaries } from "@/lib/scoring";

function isAdminRole(role: GlobalRole) {
  return role === GlobalRole.PLATFORM_ADMIN || role === GlobalRole.TOURNAMENT_ADMIN;
}

export async function GET(req: Request) {
  try {
    const actor = await requireActor(prisma, req);
    if (!isAdminRole(actor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const [users, scoreMap] = await Promise.all([
      prisma.user.findMany({
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          name: true,
          username: true,
          profileImageUrl: true,
          globalRole: true,
          createdAt: true,
          timeoutUntil: true,
          bannedAt: true,
          memberships: {
            orderBy: {
              createdAt: "asc"
            },
            select: {
              role: true,
              team: {
                select: {
                  id: true,
                  name: true,
                  tag: true,
                  logoUrl: true,
                  members: {
                    orderBy: {
                      createdAt: "asc"
                    },
                    select: {
                      id: true,
                      role: true,
                      displayName: true,
                      user: {
                        select: {
                          id: true,
                          name: true,
                          username: true
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }),
      getUserScoreSummaries(prisma)
    ]);

    return NextResponse.json({
      users: users.map((user) => {
        const membership = user.memberships[0] ?? null;
        const team = membership?.team ?? null;
        const score = scoreMap.get(user.id);

        return {
          id: user.id,
          name: user.name,
          username: user.username,
          profileImageUrl: user.profileImageUrl,
          globalRole: user.globalRole,
          createdAt: user.createdAt,
          timeoutUntil: user.timeoutUntil,
          bannedAt: user.bannedAt,
          isBanned: isAccountBanned(user),
          isTimedOut: isAccountTimedOut(user),
          team: team
            ? {
                id: team.id,
                name: team.name,
                tag: team.tag,
                logoUrl: team.logoUrl,
                myRole: membership?.role ?? null,
                members: team.members.map((member) => ({
                  id: member.id,
                  role: member.role,
                  name: member.user?.name ?? member.displayName ?? "Unnamed",
                  username: member.user?.username ?? null
                }))
              }
            : null,
          stats: {
            points: score?.points ?? 0,
            playedTournaments: score?.playedTournaments ?? 0,
            matchWins: score?.matchWins ?? 0,
            tournamentWins: score?.tournamentWins ?? 0
          },
          isSelf: user.id === actor.id
        };
      })
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}
