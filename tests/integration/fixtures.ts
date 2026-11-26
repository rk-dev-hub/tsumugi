import { prisma } from "@/lib/prisma";
import type { SessionUser } from "@/features/auth/rbac";

export async function resetDb() {
  await prisma.$executeRawUnsafe(`
    TRUNCATE "AiUsageLog", "AiCache", "AuditLog", "ApprovalEvent", "TimesheetPeriod", "MonthlyLaborCost", "ClosingMonth",
      "RunningTimer", "Attendance", "TimeEntry", "Expense", "ProjectMember", "Phase", "Project", "Client", "WorkCategory",
      "CostRate", "RecoveryCode", "User", "Department", "Holiday", "Company" CASCADE`);
}

const asSession = (u: {
  id: string;
  name: string;
  email: string;
  role: SessionUser["role"];
}): SessionUser => ({
  ...u,
  status: "ACTIVE",
  mustChangePassword: false,
});

/** 管理者・マネージャー 2 名・メンバー 2 名と、業務プロジェクト 1 件・社内 1 件 */
export async function seedBasic() {
  await resetDb();
  await prisma.company.create({
    data: { id: 1, name: "テスト社", requireTotpForManagers: false },
  });
  const mk = (
    email: string,
    name: string,
    role: SessionUser["role"],
    extra: object = {},
  ) =>
    prisma.user.create({
      data: { email, name, role, passwordHash: "x", ...extra },
    });
  const admin = await mk("admin@test.local", "管理者", "ADMIN");
  const pm = await mk("pm@test.local", "PM", "MANAGER", {
    approverId: admin.id,
    canViewCost: true,
  });
  const mgr = await mk("mgr@test.local", "別マネージャー", "MANAGER", {
    approverId: admin.id,
  });
  const alice = await mk("alice@test.local", "アリス", "MEMBER", {
    approverId: pm.id,
  });
  const bob = await mk("bob@test.local", "ボブ", "MEMBER", {
    approverId: mgr.id,
  });
  for (const u of [pm, mgr, alice, bob]) {
    await prisma.costRate.create({
      data: {
        userId: u.id,
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
        hourlyRate: 3000,
      },
    });
  }
  const work = await prisma.project.create({
    data: {
      code: "W1",
      name: "業務A",
      kind: "WORK",
      pmId: pm.id,
      startDate: new Date("2026-01-01T00:00:00Z"),
      revenueAmount: 1_000_000,
      members: { create: [{ userId: alice.id }, { userId: pm.id }] },
      phases: { create: [{ name: "設計", budgetMinutes: 600 }] },
    },
    include: { phases: true },
  });
  const internal = await prisma.project.create({
    data: {
      code: "IN",
      name: "社内",
      kind: "INTERNAL",
      startDate: new Date("2026-01-01T00:00:00Z"),
      phases: { create: [{ name: "全体" }] },
    },
    include: { phases: true },
  });
  return {
    admin: asSession(admin),
    pm: asSession(pm),
    mgr: asSession(mgr),
    alice: asSession(alice),
    bob: asSession(bob),
    work: { id: work.id, phaseId: work.phases[0].id },
    internal: { id: internal.id, phaseId: internal.phases[0].id },
  };
}

export type Fx = Awaited<ReturnType<typeof seedBasic>>;
