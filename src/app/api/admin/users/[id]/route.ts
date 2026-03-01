import { GlobalRole, TeamMemberRole } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { deleteLocalUpload } from "@/lib/image-upload";
import { errorResponse, parseJson } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { adminUserActionSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

function isAdminRole(role: GlobalRole) {
  return role === GlobalRole.PLATFORM_ADMIN || role === GlobalRole.TOURNAMENT_ADMIN;
}

function isSuperuser(role: GlobalRole) {
  return role === GlobalRole.PLATFORM_ADMIN;
}

function timeoutDate(days: 3 | 14 | 30): Date {
  const now = new Date();
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

export async function PATCH(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    if (!isAdminRole(actor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const userId = ctx.params.id;
    const action = await parseJson(req, adminUserActionSchema);

    const target = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        globalRole: true,
        profileImageUrl: true
      }
    });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const modifyingSelf = target.id === actor.id;
    const protectedUser = isSuperuser(target.globalRole);

    if (action.action === "set_timeout") {
      if (modifyingSelf) {
        return NextResponse.json({ error: "You cannot timeout yourself." }, { status: 409 });
      }
      if (protectedUser) {
        return NextResponse.json({ error: "Cannot timeout superusers." }, { status: 409 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          timeoutUntil: timeoutDate(action.days)
        },
        select: {
          id: true,
          timeoutUntil: true
        }
      });
      return NextResponse.json({ user });
    }

    if (action.action === "clear_timeout") {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          timeoutUntil: null
        },
        select: {
          id: true,
          timeoutUntil: true
        }
      });
      return NextResponse.json({ user });
    }

    if (action.action === "ban") {
      if (modifyingSelf) {
        return NextResponse.json({ error: "You cannot ban yourself." }, { status: 409 });
      }
      if (protectedUser) {
        return NextResponse.json({ error: "Cannot ban superusers." }, { status: 409 });
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          bannedAt: new Date(),
          timeoutUntil: null
        },
        select: {
          id: true,
          bannedAt: true
        }
      });
      return NextResponse.json({ user });
    }

    if (action.action === "unban") {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          bannedAt: null
        },
        select: {
          id: true,
          bannedAt: true
        }
      });
      return NextResponse.json({ user });
    }

    if (action.action === "remove_avatar") {
      const previous = target.profileImageUrl;
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          profileImageUrl: null
        },
        select: {
          id: true,
          profileImageUrl: true
        }
      });
      await deleteLocalUpload(previous);
      return NextResponse.json({ user });
    }

    if (action.action === "set_admin") {
      if (target.globalRole === GlobalRole.PLATFORM_ADMIN && !action.enabled) {
        return NextResponse.json({ error: "Superusers cannot be demoted." }, { status: 409 });
      }

      let nextRole = target.globalRole;
      if (action.enabled) {
        if (target.globalRole !== GlobalRole.PLATFORM_ADMIN) {
          nextRole = GlobalRole.TOURNAMENT_ADMIN;
        }
      } else if (target.globalRole === GlobalRole.TOURNAMENT_ADMIN) {
        const captainMembership = await prisma.teamMember.findFirst({
          where: {
            userId,
            role: TeamMemberRole.CAPTAIN
          },
          select: {
            id: true
          }
        });
        nextRole = captainMembership ? GlobalRole.TEAM_CAPTAIN : GlobalRole.PLAYER;
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          globalRole: nextRole
        },
        select: {
          id: true,
          globalRole: true
        }
      });
      return NextResponse.json({ user });
    }

    const nextUsername = action.username.trim().toLowerCase();
    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        username: nextUsername
      },
      select: {
        id: true,
        username: true
      }
    });
    return NextResponse.json({ user });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if ((error as { code?: string })?.code === "P2002") {
      return NextResponse.json({ error: "Username is already taken." }, { status: 409 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    if (!isAdminRole(actor.role)) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const userId = ctx.params.id;
    const target = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        id: true,
        globalRole: true,
        profileImageUrl: true
      }
    });

    if (!target) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    if (target.id === actor.id) {
      return NextResponse.json({ error: "You cannot delete yourself." }, { status: 409 });
    }

    if (isSuperuser(target.globalRole)) {
      return NextResponse.json({ error: "Cannot delete superusers." }, { status: 409 });
    }

    const previousAvatar = target.profileImageUrl;

    await prisma.$transaction(async (tx) => {
      const affectedMemberships = await tx.teamMember.findMany({
        where: {
          userId
        },
        select: {
          teamId: true
        }
      });
      const affectedTeamIds = [...new Set(affectedMemberships.map((membership) => membership.teamId))];

      await tx.matchReport.updateMany({
        where: {
          submittedById: userId
        },
        data: {
          submittedById: actor.id
        }
      });

      await tx.teamMember.deleteMany({
        where: {
          userId
        }
      });

      for (const teamId of affectedTeamIds) {
        const captainExists = await tx.teamMember.findFirst({
          where: {
            teamId,
            role: TeamMemberRole.CAPTAIN
          },
          select: {
            id: true
          }
        });
        if (captainExists) {
          continue;
        }
        const fallbackCaptain = await tx.teamMember.findFirst({
          where: {
            teamId
          },
          orderBy: {
            createdAt: "asc"
          },
          select: {
            id: true
          }
        });
        if (!fallbackCaptain) {
          continue;
        }
        await tx.teamMember.update({
          where: {
            id: fallbackCaptain.id
          },
          data: {
            role: TeamMemberRole.CAPTAIN
          }
        });
      }

      await tx.user.delete({
        where: {
          id: userId
        }
      });
    });

    await deleteLocalUpload(previousAvatar);

    return NextResponse.json({ deleted: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    return errorResponse(error);
  }
}
