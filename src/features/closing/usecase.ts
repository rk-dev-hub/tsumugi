import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { err, ok, type Result } from "@/lib/result";
import type { SessionUser } from "@/features/auth/rbac";
import { d, ds, todayJst } from "@/features/common/dates";
import { lockMonthExclusive } from "@/features/common/locks";
import {
  firstDayOfMonth,
  lastDayOfMonth,
  periodOf,
} from "@/features/timesheet/domain/period";
import { computeLaborCosts } from "@/features/costing/domain/labor";
import { ratesByUser } from "@/features/costing/usecase";

export type Blocker = {
  userId: string;
  userName: string;
  start: string;
  end: string;
  status: "NONE" | "SUBMITTED" | "REJECTED" | "WITHDRAWN";
};

/** 締めの条件を満たさない（ユーザー × 期間）の一覧 */
export async function closingBlockers(ym: string): Promise<Blocker[]> {
  const from = d(firstDayOfMonth(ym));
  const to = d(lastDayOfMonth(ym));
  const [entries, attendances, periods, users] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { date: { gte: from, lte: to } },
      select: { userId: true, date: true },
      distinct: ["userId", "date"],
    }),
    prisma.attendance.findMany({
      where: { date: { gte: from, lte: to } },
      select: { userId: true, date: true },
    }),
    prisma.timesheetPeriod.findMany({
      where: { startDate: { gte: from, lte: to } },
      select: { userId: true, startDate: true, status: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);
  const need = new Map<
    string,
    { userId: string; start: string; end: string }
  >();
  for (const x of [...entries, ...attendances]) {
    const p = periodOf(ds(x.date));
    need.set(`${x.userId}|${p.start}`, { userId: x.userId, ...p });
  }
  const out: Blocker[] = [];
  for (const n of need.values()) {
    const row = periods.find(
      (p) => p.userId === n.userId && ds(p.startDate) === n.start,
    );
    const status = row?.status ?? "NONE";
    if (status !== "APPROVED") {
      out.push({
        ...n,
        userName: users.find((u) => u.id === n.userId)?.name ?? "",
        status,
      });
    }
  }
  return out.sort(
    (a, b) =>
      a.userName.localeCompare(b.userName, "ja") ||
      a.start.localeCompare(b.start),
  );
}

export async function closeMonth(
  actor: SessionUser,
  ym: string,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  if (!/^\d{4}-\d{2}$/.test(ym)) return err("VALIDATION");
  if (lastDayOfMonth(ym) >= todayJst())
    return err("VALIDATION", "終わっていない月は締められません。");

  return prisma.$transaction(
    async (tx) => {
      await lockMonthExclusive(tx, ym);
      const existing = await tx.closingMonth.findUnique({
        where: { yearMonth: ym },
      });
      if (existing?.closed)
        return err("CONFLICT", "この月はすでに締めています。");
      const blockers = await closingBlockers(ym);
      if (blockers.length > 0) {
        return err(
          "CONFLICT",
          `承認が済んでいない期間が ${blockers.length} 件あります。`,
        );
      }
      const entries = await tx.timeEntry.findMany({
        where: {
          date: { gte: d(firstDayOfMonth(ym)), lte: d(lastDayOfMonth(ym)) },
        },
        select: { userId: true, projectId: true, date: true, minutes: true },
      });
      const rows = computeLaborCosts(
        entries.map((e) => ({ ...e, date: ds(e.date) })),
        await ratesByUser(tx),
      );
      await tx.monthlyLaborCost.deleteMany({ where: { yearMonth: ym } });
      if (rows.length > 0) await tx.monthlyLaborCost.createMany({ data: rows });
      await tx.closingMonth.upsert({
        where: { yearMonth: ym },
        create: {
          yearMonth: ym,
          closed: true,
          closedAt: new Date(),
          closedById: actor.id,
        },
        update: { closed: true, closedAt: new Date(), closedById: actor.id },
      });
      await recordAudit(tx, {
        actorId: actor.id,
        action: "MONTH_CLOSE",
        targetType: "ClosingMonth",
        targetId: ym,
        detail: {
          rows: rows.length,
          laborCost: rows.reduce((s, r) => s + r.laborCost, 0),
        },
      });
      return ok(undefined);
    },
    { timeout: 30_000 },
  );
}

export async function reopenMonth(
  actor: SessionUser,
  ym: string,
  reason: string,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  const text = reason.trim();
  if (text.length < 1 || text.length > 500)
    return err("VALIDATION", "理由を 1〜500 文字で入力してください。");
  return prisma.$transaction(async (tx) => {
    await lockMonthExclusive(tx, ym);
    const row = await tx.closingMonth.findUnique({ where: { yearMonth: ym } });
    if (!row?.closed) return err("CONFLICT", "この月は締めていません。");
    await tx.monthlyLaborCost.deleteMany({ where: { yearMonth: ym } });
    await tx.closingMonth.update({
      where: { yearMonth: ym },
      data: { closed: false, reopenedAt: new Date(), reopenReason: text },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "MONTH_REOPEN",
      targetType: "ClosingMonth",
      targetId: ym,
      detail: { reason: text },
    });
    return ok(undefined);
  });
}

export async function closingOverview(months: string[]) {
  const rows = await prisma.closingMonth.findMany({
    where: { yearMonth: { in: months } },
  });
  return months.map((ym) => {
    const r = rows.find((x) => x.yearMonth === ym);
    return {
      yearMonth: ym,
      closed: Boolean(r?.closed),
      closedAt: r?.closedAt ?? null,
      reopenReason: r?.reopenReason ?? "",
    };
  });
}
