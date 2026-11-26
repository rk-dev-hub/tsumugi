import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

export type CompanySettings = {
  name: string;
  timeStepMinutes: number;
  gapThresholdMinutes: number;
  submissionGraceDays: number;
  requireTotpForManagers: boolean;
};

const DEFAULTS: CompanySettings = {
  name: "Tsumugi",
  timeStepMinutes: 15,
  gapThresholdMinutes: 15,
  submissionGraceDays: 3,
  requireTotpForManagers: true,
};

export async function getCompany(
  db: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<CompanySettings> {
  const c = await db.company.findUnique({ where: { id: 1 } });
  if (!c) return DEFAULTS;
  return {
    name: c.name,
    timeStepMinutes: c.timeStepMinutes,
    gapThresholdMinutes: c.gapThresholdMinutes,
    submissionGraceDays: c.submissionGraceDays,
    requireTotpForManagers: c.requireTotpForManagers,
  };
}

export async function companyHolidaySet(
  from: string,
  to: string,
): Promise<Set<string>> {
  const rows = await prisma.holiday.findMany({
    where: {
      date: {
        gte: new Date(`${from}T00:00:00Z`),
        lte: new Date(`${to}T00:00:00Z`),
      },
    },
    select: { date: true },
  });
  return new Set(rows.map((r) => r.date.toISOString().slice(0, 10)));
}
