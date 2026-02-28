import { GlobalRole, NotificationType, TournamentRole, type Prisma } from "@prisma/client";

type Tx = Prisma.TransactionClient;

export type NotificationDraft = {
  type: NotificationType;
  title: string;
  body: string;
  actionUrl?: string | null;
  metadata?: Prisma.InputJsonValue | null;
  teamInvitationId?: string | null;
  matchReportId?: string | null;
};

export async function createNotificationsForUsers(tx: Tx, userIds: string[], draft: NotificationDraft) {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueUserIds.length === 0) {
    return;
  }

  await tx.notification.createMany({
    data: uniqueUserIds.map((userId) => ({
      userId,
      type: draft.type,
      title: draft.title,
      body: draft.body,
      actionUrl: draft.actionUrl ?? null,
      metadata: draft.metadata ?? undefined,
      teamInvitationId: draft.teamInvitationId ?? null,
      matchReportId: draft.matchReportId ?? null
    }))
  });
}

export async function getTournamentAdminRecipientIds(tx: Tx, tournamentId: string): Promise<string[]> {
  const [globalAdmins, tournamentAdmins] = await Promise.all([
    tx.user.findMany({
      where: {
        globalRole: {
          in: [GlobalRole.PLATFORM_ADMIN, GlobalRole.TOURNAMENT_ADMIN]
        }
      },
      select: {
        id: true
      }
    }),
    tx.tournamentRoleAssignment.findMany({
      where: {
        tournamentId,
        role: TournamentRole.ADMIN
      },
      select: {
        userId: true
      }
    })
  ]);

  return [...new Set([...globalAdmins.map((item) => item.id), ...tournamentAdmins.map((item) => item.userId)])];
}

export async function markPendingReviewNotificationsResolved(tx: Tx, reportId: string) {
  await tx.notification.updateMany({
    where: {
      type: NotificationType.REPORT_PENDING_REVIEW,
      matchReportId: reportId,
      isRead: false
    },
    data: {
      isRead: true,
      readAt: new Date()
    }
  });
}
