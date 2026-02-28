import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { errorResponse } from "@/lib/http";
import { deleteLocalUpload, saveUploadImage, validateUploadImage } from "@/lib/image-upload";
import { requireTeamCaptainOrAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";

type RouteContext = {
  params: {
    id: string;
  };
};

export const runtime = "nodejs";

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const teamId = ctx.params.id;
    await requireTeamCaptainOrAdmin(prisma, actor, teamId);

    const formData = await req.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json({ error: "Image file is required." }, { status: 400 });
    }

    const validation = validateUploadImage(image);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const team = await prisma.team.findUnique({
      where: {
        id: teamId
      },
      select: {
        id: true,
        name: true,
        logoUrl: true
      }
    });

    if (!team) {
      return NextResponse.json({ error: "Team not found." }, { status: 404 });
    }

    const uploadedUrl = await saveUploadImage(image, "teams", validation.ext);

    await prisma.$transaction(async (tx) => {
      await tx.team.update({
        where: {
          id: teamId
        },
        data: {
          logoUrl: uploadedUrl
        }
      });

      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "TEAM_LOGO_UPDATED",
        entityType: "Team",
        entityId: team.id,
        metadata: {
          teamName: team.name
        }
      });
    });

    await deleteLocalUpload(team.logoUrl);

    return NextResponse.json({ logoUrl: uploadedUrl });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith("Forbidden")) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    return errorResponse(error);
  }
}
