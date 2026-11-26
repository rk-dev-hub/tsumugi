import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { isWorkday } from "@/lib/holidays";
import { err, ok, type Result } from "@/lib/result";
import type { SessionUser } from "@/features/auth/rbac";
import { projectAccess, projectListWhere } from "@/features/auth/scope";
import { companyHolidaySet } from "@/features/common/company";
import { d, ds, todayJst } from "@/features/common/dates";
import { isMonthClosed } from "@/features/common/locks";
import {
  summarizeCost,
  summarizeProject,
  type ProjectBudget,
} from "@/features/costing/domain/budget";
import { expenseTotals, laborCostRows } from "@/features/costing/usecase";
import {
  buildForecastFacts,
  type ForecastFacts,
} from "@/features/forecast/domain/risk";

const code = z
  .string()
  .trim()
  .min(1, "コードを入力してください")
  .max(30, "コードは 30 文字までです")
  .regex(
    /^[A-Za-z0-9_-]+$/,
    "コードは英数字・ハイフン・アンダースコアで入力してください",
  );

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .or(z.literal("").transform(() => null));

export const projectInputSchema = z
  .object({
    code,
    name: z
      .string()
      .trim()
      .min(1, "名前を入力してください")
      .max(100, "名前は 100 文字までです"),
    kind: z.enum(["WORK", "INTERNAL"]),
    status: z
      .enum(["PROSPECT", "ACTIVE", "COMPLETED", "CANCELED"])
      .default("ACTIVE"),
    clientId: z
      .string()
      .uuid()
      .nullish()
      .or(z.literal("").transform(() => null)),
    pmId: z
      .string()
      .uuid()
      .nullish()
      .or(z.literal("").transform(() => null)),
    startDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "開始日を入力してください"),
    endDate: optionalDate,
    revenueAmount: z
      .union([
        z.literal("").transform(() => null),
        z.coerce.number().int().min(0).max(2_000_000_000),
      ])
      .nullish(),
    colorIndex: z.coerce.number().int().min(0).max(11).default(0),
    note: z.string().max(1000).default(""),
    memberIds: z.array(z.string().uuid()).default([]),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, {
    path: ["endDate"],
    message: "終了日は開始日以降にしてください",
  });
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const phaseInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1, "工程名を入力してください").max(50),
  budgetMinutes: z.coerce.number().int().min(0).max(10_000_000),
  remainingMinutes: z.coerce.number().int().min(0).max(10_000_000).nullable(),
  active: z.boolean().default(true),
});

// ------------------------------------------------------------------
// 読み取り
// ------------------------------------------------------------------

async function actualsByPhase(projectIds: string[]) {
  const rows = await prisma.timeEntry.groupBy({
    by: ["phaseId"],
    where: { projectId: { in: projectIds } },
    _sum: { minutes: true },
  });
  return new Map(rows.map((r) => [r.phaseId, r._sum.minutes ?? 0]));
}

export type ProjectListItem = {
  id: string;
  code: string;
  name: string;
  kind: "WORK" | "INTERNAL";
  status: "PROSPECT" | "ACTIVE" | "COMPLETED" | "CANCELED";
  clientName: string | null;
  pmName: string | null;
  colorIndex: number;
  startDate: string;
  endDate: string | null;
  canViewBudget: boolean;
  budget: Pick<
    ProjectBudget,
    "budgetMinutes" | "actualMinutes" | "forecast" | "burnRate" | "level"
  > | null;
  actualMinutes: number;
};

export async function listProjects(
  actor: SessionUser,
  filter: { status?: string; q?: string } = {},
): Promise<ProjectListItem[]> {
  // projectListWhere も OR を使うため AND で合成する
  const scopeOr = (projectListWhere(actor) as { OR?: unknown[] }).OR;
  const projects = await prisma.project.findMany({
    where: {
      AND: [
        scopeOr ? { OR: scopeOr as never } : {},
        filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: "insensitive" } },
                { code: { contains: filter.q, mode: "insensitive" } },
              ],
            }
          : {},
        filter.status === "ALL"
          ? {}
          : filter.status
            ? { status: filter.status as "ACTIVE" }
            : { status: { in: ["PROSPECT", "ACTIVE"] } },
      ],
    },
    orderBy: [{ kind: "asc" }, { code: "asc" }],
    include: {
      client: { select: { name: true } },
      pm: { select: { name: true } },
      phases: {
        select: {
          id: true,
          name: true,
          budgetMinutes: true,
          remainingMinutes: true,
        },
      },
    },
  });
  const actuals = await actualsByPhase(projects.map((p) => p.id));
  return projects.map((p) => {
    const canViewBudget = actor.role === "ADMIN" || p.pmId === actor.id;
    const phases = p.phases.map((ph) => ({
      ...ph,
      actualMinutes: actuals.get(ph.id) ?? 0,
    }));
    const b = summarizeProject(phases);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      kind: p.kind,
      status: p.status,
      clientName: p.client?.name ?? null,
      pmName: p.pm?.name ?? null,
      colorIndex: p.colorIndex,
      startDate: ds(p.startDate),
      endDate: p.endDate ? ds(p.endDate) : null,
      canViewBudget,
      budget: canViewBudget
        ? {
            budgetMinutes: b.budgetMinutes,
            actualMinutes: b.actualMinutes,
            forecast: b.forecast,
            burnRate: b.burnRate,
            level: b.level,
          }
        : null,
      actualMinutes: b.actualMinutes,
    };
  });
}

/** 予算超過・注意のプロジェクト（PM・ADMIN のホーム） */
export async function budgetAlerts(actor: SessionUser) {
  if (actor.role === "MEMBER") return [];
  const list = await listProjects(actor);
  return list
    .filter(
      (p) =>
        p.budget && (p.budget.level === "OVER" || p.budget.level === "CAUTION"),
    )
    .sort((a, b) => (b.budget!.burnRate ?? 0) - (a.budget!.burnRate ?? 0));
}

export async function weeklyPace(
  projectId: string,
  today: string,
): Promise<number> {
  const from = addDaysStr(today, -28);
  const agg = await prisma.timeEntry.aggregate({
    where: { projectId, date: { gt: d(from), lte: d(today) } },
    _sum: { minutes: true },
  });
  return Math.round((agg._sum.minutes ?? 0) / 4);
}

export async function remainingWorkdays(
  today: string,
  endDate: string | null,
): Promise<number | null> {
  if (!endDate) return null;
  if (endDate < today) return 0;
  const holidays = await companyHolidaySet(today, endDate);
  return eachDateStr(addDaysStr(today, 1), endDate).filter((x) =>
    isWorkday(x, holidays),
  ).length;
}

export async function getProjectDetail(actor: SessionUser, projectId: string) {
  const access = await projectAccess(actor, projectId);
  if (!access.canView) return null;
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      client: { select: { id: true, name: true } },
      pm: { select: { id: true, name: true } },
      phases: { orderBy: { sortOrder: "asc" } },
      members: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              department: { select: { name: true } },
            },
          },
        },
      },
    },
  });
  if (!p) return null;
  const actuals = await actualsByPhase([p.id]);
  const budget = summarizeProject(
    p.phases.map((ph) => ({
      id: ph.id,
      name: ph.name,
      budgetMinutes: ph.budgetMinutes,
      remainingMinutes: ph.remainingMinutes,
      actualMinutes: actuals.get(ph.id) ?? 0,
    })),
  );

  // メンバー別の実績
  const byUser = await prisma.timeEntry.groupBy({
    by: ["userId"],
    where: { projectId },
    _sum: { minutes: true },
  });
  const userNames = await prisma.user.findMany({
    where: { id: { in: byUser.map((u) => u.userId) } },
    select: { id: true, name: true },
  });

  let cost:
    | (ReturnType<typeof summarizeCost> & {
        unratedMinutes: number;
        monthly: { yearMonth: string; laborCost: number }[];
      })
    | null = null;
  let expenses: {
    id: string;
    date: string;
    kind: "OUTSOURCING" | "EXPENSE";
    amount: number;
    description: string;
  }[] = [];
  if (access.canViewCost) {
    const rows = await laborCostRows(prisma, { projectIds: [projectId] });
    const totals = (await expenseTotals(prisma, [projectId])).get(
      projectId,
    ) ?? { outsourcing: 0, expense: 0 };
    const laborCost = rows.reduce((s, r) => s + r.laborCost, 0);
    const unratedMinutes = rows.reduce((s, r) => s + r.unratedMinutes, 0);
    const ratedMinutes = rows.reduce(
      (s, r) => s + r.minutes - r.unratedMinutes,
      0,
    );
    const monthlyMap = new Map<string, number>();
    for (const r of rows)
      monthlyMap.set(
        r.yearMonth,
        (monthlyMap.get(r.yearMonth) ?? 0) + r.laborCost,
      );
    cost = {
      ...summarizeCost({
        revenueAmount: p.revenueAmount,
        laborCost,
        ratedMinutes,
        outsourcing: totals.outsourcing,
        expense: totals.expense,
        remainingMinutes: budget.remaining,
      }),
      unratedMinutes,
      monthly: [...monthlyMap.entries()]
        .sort()
        .map(([yearMonth, v]) => ({ yearMonth, laborCost: v })),
    };
    const ex = await prisma.expense.findMany({
      where: { projectId },
      orderBy: { date: "desc" },
    });
    expenses = ex.map((e) => ({
      id: e.id,
      date: ds(e.date),
      kind: e.kind,
      amount: e.amount,
      description: e.description,
    }));
  }

  const today = todayJst();
  const [pace, workdays] = await Promise.all([
    weeklyPace(projectId, today),
    remainingWorkdays(today, p.endDate ? ds(p.endDate) : null),
  ]);

  return {
    access,
    project: {
      id: p.id,
      code: p.code,
      name: p.name,
      kind: p.kind,
      status: p.status,
      client: p.client,
      pm: p.pm,
      startDate: ds(p.startDate),
      endDate: p.endDate ? ds(p.endDate) : null,
      revenueAmount:
        access.canViewCost || access.canEditRevenue ? p.revenueAmount : null,
      colorIndex: p.colorIndex,
      note: p.note,
    },
    phases: p.phases.map((ph) => ({
      id: ph.id,
      name: ph.name,
      sortOrder: ph.sortOrder,
      active: ph.active,
    })),
    members: p.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      departmentName: m.user.department?.name ?? null,
    })),
    budget: access.canViewBudget ? budget : null,
    myTotal: budget.actualMinutes,
    byUser: access.canViewBudget
      ? byUser
          .map((u) => ({
            userId: u.userId,
            name: userNames.find((x) => x.id === u.userId)?.name ?? "",
            minutes: u._sum.minutes ?? 0,
          }))
          .sort((a, b) => b.minutes - a.minutes)
      : [],
    cost,
    expenses,
    pace,
    remainingWorkdays: workdays,
  };
}

export type ProjectDetail = NonNullable<
  Awaited<ReturnType<typeof getProjectDetail>>
>;

export function forecastFactsOf(detail: ProjectDetail): ForecastFacts | null {
  if (!detail.budget) return null;
  return buildForecastFacts({
    projectCode: detail.project.code,
    budget: detail.budget,
    weeklyPaceMinutes: detail.pace,
    remainingWorkdays: detail.remainingWorkdays,
    cost: detail.cost
      ? {
          grossMargin: detail.cost.grossMargin,
          forecastProfit: detail.cost.forecastProfit,
        }
      : undefined,
  });
}

// ------------------------------------------------------------------
// 書き込み
// ------------------------------------------------------------------

export async function createProject(
  actor: SessionUser,
  input: ProjectInput,
): Promise<Result<{ id: string }>> {
  if (actor.role === "MEMBER") return err("FORBIDDEN");
  const isAdmin = actor.role === "ADMIN";
  const data = {
    code: input.code,
    name: input.name,
    kind: input.kind,
    status: input.status,
    clientId: input.kind === "WORK" ? (input.clientId ?? null) : null,
    // マネージャーが作ると PM は自分、売上額は未設定
    pmId: isAdmin ? (input.pmId ?? null) : actor.id,
    startDate: d(input.startDate),
    endDate: input.endDate ? d(input.endDate) : null,
    revenueAmount:
      isAdmin && input.kind === "WORK" ? (input.revenueAmount ?? null) : null,
    colorIndex: input.colorIndex,
    note: input.note,
  };
  const exists = await prisma.project.findUnique({
    where: { code: input.code },
  });
  if (exists)
    return err("VALIDATION", "このコードはすでに使われています。", {
      code: "このコードはすでに使われています",
    });
  return prisma.$transaction(async (tx) => {
    const p = await tx.project.create({ data });
    await tx.phase.create({
      data: { projectId: p.id, name: "全体", sortOrder: 0 },
    });
    const memberIds = [...new Set(input.memberIds)];
    if (memberIds.length > 0) {
      await tx.projectMember.createMany({
        data: memberIds.map((userId) => ({ projectId: p.id, userId })),
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "PROJECT_CHANGE",
      targetType: "Project",
      targetId: p.id,
      detail: { op: "create", code: p.code },
    });
    return ok({ id: p.id });
  });
}

export async function updateProject(
  actor: SessionUser,
  projectId: string,
  input: ProjectInput,
): Promise<Result<void>> {
  const access = await projectAccess(actor, projectId);
  if (!access.canView) return err("NOT_FOUND");
  if (!access.canEdit) return err("FORBIDDEN");
  const before = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
  });
  const dup = await prisma.project.findFirst({
    where: { code: input.code, id: { not: projectId } },
  });
  if (dup)
    return err("VALIDATION", "このコードはすでに使われています。", {
      code: "このコードはすでに使われています",
    });
  const isAdmin = access.canEditRevenue;
  return prisma.$transaction(async (tx) => {
    await tx.project.update({
      where: { id: projectId },
      data: {
        code: input.code,
        name: input.name,
        kind: input.kind,
        status: input.status,
        clientId: input.kind === "WORK" ? (input.clientId ?? null) : null,
        pmId: isAdmin ? (input.pmId ?? null) : before.pmId,
        startDate: d(input.startDate),
        endDate: input.endDate ? d(input.endDate) : null,
        revenueAmount:
          input.kind === "WORK"
            ? isAdmin
              ? (input.revenueAmount ?? null)
              : before.revenueAmount
            : null,
        colorIndex: input.colorIndex,
        note: input.note,
      },
    });
    const memberIds = [...new Set(input.memberIds)];
    await tx.projectMember.deleteMany({
      where: { projectId, userId: { notIn: memberIds } },
    });
    const existing = await tx.projectMember.findMany({
      where: { projectId },
      select: { userId: true },
    });
    const add = memberIds.filter(
      (id) => !existing.some((e) => e.userId === id),
    );
    if (add.length > 0)
      await tx.projectMember.createMany({
        data: add.map((userId) => ({ projectId, userId })),
      });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "PROJECT_CHANGE",
      targetType: "Project",
      targetId: projectId,
      detail: {
        op: "update",
        before: {
          code: before.code,
          status: before.status,
          pmId: before.pmId,
          revenueAmount: access.canViewCost ? before.revenueAmount : undefined,
        },
        after: { code: input.code, status: input.status },
      },
    });
    return ok(undefined);
  });
}

export async function savePhases(
  actor: SessionUser,
  projectId: string,
  phases: z.infer<typeof phaseInputSchema>[],
): Promise<Result<void>> {
  const access = await projectAccess(actor, projectId);
  if (!access.canView) return err("NOT_FOUND");
  if (!access.canEdit) return err("FORBIDDEN");
  const names = phases.map((p) => p.name);
  if (new Set(names).size !== names.length)
    return err("VALIDATION", "工程名が重複しています。");
  if (phases.length === 0)
    return err("VALIDATION", "工程は 1 つ以上必要です。");
  return prisma.$transaction(async (tx) => {
    const existing = await tx.phase.findMany({ where: { projectId } });
    // 一時的な名前の衝突を避けるため、先に既存の名前を退避する
    for (const ex of existing) {
      await tx.phase.update({
        where: { id: ex.id },
        data: { name: `__tmp_${ex.id}` },
      });
    }
    for (const [i, ph] of phases.entries()) {
      if (ph.id) {
        if (!existing.some((e) => e.id === ph.id)) return err("NOT_FOUND");
        await tx.phase.update({
          where: { id: ph.id },
          data: {
            name: ph.name,
            sortOrder: i,
            budgetMinutes: ph.budgetMinutes,
            remainingMinutes: ph.remainingMinutes,
            active: ph.active,
          },
        });
      } else {
        await tx.phase.create({
          data: {
            projectId,
            name: ph.name,
            sortOrder: i,
            budgetMinutes: ph.budgetMinutes,
            remainingMinutes: ph.remainingMinutes,
            active: ph.active,
          },
        });
      }
    }
    // 送られてこなかった既存の工程は、工数がなければ削除、あれば無効にする
    for (const ex of existing) {
      if (phases.some((p) => p.id === ex.id)) continue;
      const used = await tx.timeEntry.count({ where: { phaseId: ex.id } });
      const timers = await tx.runningTimer.count({ where: { phaseId: ex.id } });
      if (used === 0 && timers === 0)
        await tx.phase.delete({ where: { id: ex.id } });
      else
        await tx.phase.update({
          where: { id: ex.id },
          data: {
            name: `${ex.name}（無効）`.slice(0, 60),
            active: false,
            sortOrder: 999,
          },
        });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "PROJECT_CHANGE",
      targetType: "Project",
      targetId: projectId,
      detail: { op: "phases", phases: names },
    });
    return ok(undefined);
  });
}

export const expenseInputSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付を入力してください"),
  kind: z.enum(["OUTSOURCING", "EXPENSE"]),
  amount: z.coerce
    .number()
    .int()
    .min(1, "金額は 1 円以上にしてください")
    .max(2_000_000_000),
  description: z.string().trim().min(1, "内容を入力してください").max(200),
});

export async function addExpense(
  actor: SessionUser,
  projectId: string,
  input: z.infer<typeof expenseInputSchema>,
): Promise<Result<void>> {
  const access = await projectAccess(actor, projectId);
  if (!access.canView) return err("NOT_FOUND");
  if (!access.canEdit || !access.canViewCost) return err("FORBIDDEN");
  return prisma.$transaction(async (tx) => {
    if (await isMonthClosed(tx, input.date.slice(0, 7)))
      return err("MONTH_CLOSED");
    const e = await tx.expense.create({
      data: { projectId, ...input, date: d(input.date), createdById: actor.id },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "EXPENSE_CHANGE",
      targetType: "Expense",
      targetId: e.id,
      detail: { op: "create", ...input },
    });
    return ok(undefined);
  });
}

export async function deleteExpense(
  actor: SessionUser,
  expenseId: string,
): Promise<Result<void>> {
  const e = await prisma.expense.findUnique({ where: { id: expenseId } });
  if (!e) return err("NOT_FOUND");
  const access = await projectAccess(actor, e.projectId);
  if (!access.canView || !access.canViewCost) return err("NOT_FOUND");
  if (!access.canEdit) return err("FORBIDDEN");
  return prisma.$transaction(async (tx) => {
    if (await isMonthClosed(tx, ds(e.date).slice(0, 7)))
      return err("MONTH_CLOSED");
    await tx.expense.delete({ where: { id: expenseId } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "EXPENSE_CHANGE",
      targetType: "Expense",
      targetId: expenseId,
      detail: {
        op: "delete",
        date: ds(e.date),
        kind: e.kind,
        amount: e.amount,
        description: e.description,
      },
    });
    return ok(undefined);
  });
}

/** プロジェクト編集で選べるユーザー・顧客 */
export async function projectFormOptions() {
  const [users, clients] = await Promise.all([
    prisma.user.findMany({
      where: { status: "ACTIVE" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, role: true },
    }),
    prisma.client.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return { users, clients };
}
