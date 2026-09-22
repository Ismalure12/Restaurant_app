// Append-only audit trail (AuditLog): who changed money, accounts, settings or
// a recorded sale, and what it was. Written inside the same transaction as the
// change it describes, so a rolled-back change leaves no trace either.
import type { Prisma } from '@prisma/client';

type Writer = { auditLog: { create: (args: { data: Prisma.AuditLogCreateInput }) => Promise<unknown> } };

export function audit(db: Writer, actorId: number | null | undefined, action: string, entity: string, entityId: string | number | null, meta?: Prisma.InputJsonValue) {
  return db.auditLog.create({
    data: { actorId: actorId ?? null, action, entity, entityId: entityId == null ? null : String(entityId), ...(meta !== undefined ? { meta } : {}) },
  });
}
