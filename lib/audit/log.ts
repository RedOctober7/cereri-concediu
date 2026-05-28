import { prisma } from "@/lib/db";

type AuditInput = {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
};

export async function createAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      details: input.details,
      ipAddress: input.ipAddress,
    },
  });
}
