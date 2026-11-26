import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ds } from "@/features/common/dates";
import {
  computeLaborCosts,
  type LaborCostRow,
  type Rate,
} from "./domain/labor";

type Db = Prisma.TransactionClient | typeof prisma;

export async function ratesByUser(
  db: Db,
  userIds?: string[],
): Promise<Map<string, Rate[]>> {
  const rows = await db.costRate.findMany({
    where: userIds ? { userId: { in: userIds } } : undefined,
    select: { userId: true, effectiveFrom: true, hourlyRate: true },
  });
  const map = new Map<string, Rate[]>();
  for (const r of rows) {
    const list = map.get(r.userId) ?? [];
    list.push({ effectiveFrom: ds(r.effectiveFrom), hourlyRate: r.hourlyRate });
    map.set(r.userId, list);
  }
  return map;
}

/**
 * 労務費（メンバー × プロジェクト × 月）。締めた月は確定値、締めていない月は現在の単価で計算する。
 */
export async function laborCostRows(
  db: Db,
  filter: {
    projectIds?: string[];
    userIds?: string[];
    from?: string;
    to?: string;
  },
): Promise<LaborCostRow[]> {
  const closed = await db.closingMonth.findMany({
    where: { closed: true },
    select: { yearMonth: true },
  });
  const closedSet = new Set(closed.map((c) => c.yearMonth));

  const dateWhere: Prisma.DateTimeFilter = {};
  if (filter.from) dateWhere.gte = new Date(`${filter.from}T00:00:00Z`);
  if (filter.to) dateWhere.lte = new Date(`${filter.to}T00:00:00Z`);

  const entries = await db.timeEntry.findMany({
    where: {
      projectId: filter.projectIds ? { in: filter.projectIds } : undefined,
      userId: filter.userIds ? { in: filter.userIds } : undefined,
      date: filter.from || filter.to ? dateWhere : undefined,
    },
    select: { userId: true, projectId: true, date: true, minutes: true },
  });
  const openEntries = entries
    .map((e) => ({ ...e, date: ds(e.date) }))
    .filter((e) => !closedSet.has(e.date.slice(0, 7)));
  const rates = await ratesByUser(db, [
    ...new Set(openEntries.map((e) => e.userId)),
  ]);
  const openRows = computeLaborCosts(openEntries, rates);

  const fixed = await db.monthlyLaborCost.findMany({
    where: {
      projectId: filter.projectIds ? { in: filter.projectIds } : undefined,
      userId: filter.userIds ? { in: filter.userIds } : undefined,
      yearMonth: {
        in: [...closedSet].filter(
          (ym) =>
            (!filter.from || ym >= filter.from.slice(0, 7)) &&
            (!filter.to || ym <= filter.to.slice(0, 7)),
        ),
      },
    },
  });
  return [
    ...openRows,
    ...fixed.map((f) => ({
      yearMonth: f.yearMonth,
      userId: f.userId,
      projectId: f.projectId,
      minutes: f.minutes,
      laborCost: f.laborCost,
      unratedMinutes: f.unratedMinutes,
    })),
  ];
}

export async function expenseTotals(db: Db, projectIds: string[]) {
  const rows = await db.expense.groupBy({
    by: ["projectId", "kind"],
    where: { projectId: { in: projectIds } },
    _sum: { amount: true },
  });
  const map = new Map<string, { outsourcing: number; expense: number }>();
  for (const r of rows) {
    const cur = map.get(r.projectId) ?? { outsourcing: 0, expense: 0 };
    if (r.kind === "OUTSOURCING") cur.outsourcing += r._sum.amount ?? 0;
    else cur.expense += r._sum.amount ?? 0;
    map.set(r.projectId, cur);
  }
  return map;
}
