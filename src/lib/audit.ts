import type { Prisma, AuditAction } from "@/generated/prisma/client";

type AuditInput = {
  actorId: string | null;
  action: AuditAction;
  targetType: string;
  targetId?: string | null;
  ip?: string | null;
  detail?: Prisma.InputJsonValue | null;
};

/**
 * 監査ログを記録する。write 系の操作と同じトランザクションで呼ぶ。
 * パスワード・トークン・2 段階認証のシークレットは detail に入れないこと。
 */
export function recordAudit(
  tx: Prisma.TransactionClient,
  input: AuditInput,
): Promise<{ id: string }> {
  return tx.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      ip: input.ip ?? null,
      detail: input.detail ?? undefined,
    },
    select: { id: true },
  });
}
