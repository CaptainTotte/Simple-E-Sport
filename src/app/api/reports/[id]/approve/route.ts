import { NextResponse } from "next/server";
import { requireActor } from "@/lib/auth";
import { reviewMatchReport } from "@/lib/bracket";
import { errorResponse, parseJson } from "@/lib/http";
import { requireTournamentAdmin } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { approveReportSchema } from "@/lib/validation";

type RouteContext = {
  params: {
    id: string;
  };
};

export async function POST(req: Request, ctx: RouteContext) {
  try {
    const actor = await requireActor(prisma, req);
    const reportId = ctx.params.id;
    const body = await parseJson(req, approveReportSchema);

    const report = await prisma.matchReport.findUnique({
      where: { id: reportId },
      include: {
        match: {
          include: {
            bracket: true
          }
        }
      }
    });

    if (!report) {
      return NextResponse.json({ error: "Report not found." }, { status: 404 });
    }

    await requireTournamentAdmin(prisma, actor, report.match.bracket.tournamentId);

    const result = await reviewMatchReport({
      reportId,
      reviewerUserId: actor.id,
      approve: body.approve,
      decisionNote: body.decisionNote
    });

    return NextResponse.json(result);
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
