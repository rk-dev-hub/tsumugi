import type { Prisma } from "@/generated/prisma/client";

/**
 * 同じユーザー × 日への書き込みを直列にする（トランザクション終了で解放）。
 * 重なりは DB の排他制約でも防ぐが、提出・締めとの競合をここで避ける。
 */
export async function lockUserDay(
  tx: Prisma.TransactionClient,
  userId: string,
  date: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`day:${userId}:${date}`}))`;
}

/** 月単位の操作（締め・再オープン）と、その月の書き込みを直列にする */
export async function lockMonthShared(
  tx: Prisma.TransactionClient,
  ym: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtext(${`month:${ym}`}))`;
}

export async function lockMonthExclusive(
  tx: Prisma.TransactionClient,
  ym: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`month:${ym}`}))`;
}

export async function isMonthClosed(
  tx: Prisma.TransactionClient,
  ym: string,
): Promise<boolean> {
  const row = await tx.closingMonth.findUnique({ where: { yearMonth: ym } });
  return Boolean(row?.closed);
}
