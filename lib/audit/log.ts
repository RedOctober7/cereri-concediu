import { prisma } from "@/lib/db";

type AuditInput = {
  userId?: string;
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
};

/**
 * Scrie un rând în jurnal după ce acțiunea a fost salvată. Nu aruncă: o eroare la
 * jurnal nu trebuie să transforme o acțiune reușită într-un 500 (clientul ar reîncerca
 * și ar da peste un duplicat) și nici să oprească emailurile programate după ea.
 */
export async function createAuditLog(input: AuditInput) {
  try {
    await writeAuditLog(input);
  } catch (error) {
    console.error(`[Audit] Rândul ${input.action} nu a putut fi scris:`, error);
  }
}

async function writeAuditLog(input: AuditInput) {
  await prisma.auditLog.create({
    data: {
      userId: input.userId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      details: input.details as any,
      ipAddress: input.ipAddress,
    },
  });
}