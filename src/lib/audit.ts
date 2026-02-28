import type { Prisma, PrismaClient } from "@prisma/client";

type AuditInput = {
  actorUserId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  tournamentId?: string | null;
  beforeState?: Prisma.InputJsonValue;
  afterState?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
};

type TxLike = PrismaClient | Prisma.TransactionClient;

export async function writeAuditLog(tx: TxLike, input: AuditInput) {
  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      tournamentId: input.tournamentId ?? null,
      beforeState: input.beforeState,
      afterState: input.afterState,
      metadata: input.metadata,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null
    }
  });
}
