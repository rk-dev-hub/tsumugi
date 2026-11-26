import { prisma } from "@/lib/prisma";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { isWorkday } from "@/lib/holidays";
import type { SessionUser } from "@/features/auth/rbac";
import { companyHolidaySet, getCompany } from "@/features/common/company";
import { d, ds } from "@/features/common/dates";
import { overduePeriods } from "@/features/approval/usecase";
import { closingBlockers } from "@/features/closing/usecase";
import { addMonths, weekStartOf } from "@/features/timesheet/domain/period";

/** ホームに出す「今日やること」 */
export async function homeSummary(user: SessionUser, today: string) {
  const company = await getCompany();
  const weekStart = weekStartOf(today);
  const from14 = addDaysStr(today, -14);
  const [todayAgg, weekAgg, recent, recentAtt, holidays, overdue] =
    await Promise.all([
      prisma.timeEntry.aggregate({
        where: { userId: user.id, date: d(today) },
        _sum: { minutes: true },
      }),
      prisma.timeEntry.aggregate({
        where: {
          userId: user.id,
          date: { gte: d(weekStart), lte: d(addDaysStr(weekStart, 6)) },
        },
        _sum: { minutes: true },
      }),
      prisma.timeEntry.findMany({
        where: { userId: user.id, date: { gte: d(from14), lt: d(today) } },
        select: { date: true },
        distinct: ["date"],
      }),
      prisma.attendance.findMany({
        where: { userId: user.id, date: { gte: d(from14), lt: d(today) } },
        select: { date: true },
      }),
      companyHolidaySet(from14, today),
      overduePeriods(user.id, today, company.submissionGraceDays),
    ]);
  const filled = new Set([...recent, ...recentAtt].map((x) => ds(x.date)));
  const missingDays = eachDateStr(from14, addDaysStr(today, -1)).filter(
    (x) => isWorkday(x, holidays) && !filled.has(x),
  );

  // 今日の内訳（プロジェクト別）
  const todayByProject = await prisma.timeEntry.groupBy({
    by: ["projectId"],
    where: { userId: user.id, date: d(today) },
    _sum: { minutes: true },
  });
  const projects = await prisma.project.findMany({
    where: { id: { in: todayByProject.map((x) => x.projectId) } },
    select: { id: true, name: true, colorIndex: true },
  });

  let closing: { yearMonth: string; blockers: number } | null = null;
  if (user.role === "ADMIN") {
    const lastMonth = addMonths(today.slice(0, 7), -1);
    const row = await prisma.closingMonth.findUnique({
      where: { yearMonth: lastMonth },
    });
    if (!row?.closed)
      closing = {
        yearMonth: lastMonth,
        blockers: (await closingBlockers(lastMonth)).length,
      };
  }

  return {
    todayMinutes: todayAgg._sum.minutes ?? 0,
    weekMinutes: weekAgg._sum.minutes ?? 0,
    missingDays,
    overdue,
    todayByProject: todayByProject
      .map((x) => ({
        ...projects.find((p) => p.id === x.projectId)!,
        minutes: x._sum.minutes ?? 0,
      }))
      .sort((a, b) => b.minutes - a.minutes),
    closing,
  };
}
