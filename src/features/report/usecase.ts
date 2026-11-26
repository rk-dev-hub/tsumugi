import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { SessionUser } from "@/features/auth/rbac";
import { d, ds } from "@/features/common/dates";
import { visibleUserIds } from "@/features/auth/scope";
import { percent } from "@/features/costing/domain/budget";
import { laborCostRows } from "@/features/costing/usecase";
import {
  firstDayOfMonth,
  lastDayOfMonth,
} from "@/features/timesheet/domain/period";

export type ReportAxis =
  "project" | "client" | "user" | "department" | "category";

export const AXIS_LABELS: Record<ReportAxis, string> = {
  project: "プロジェクト",
  client: "顧客",
  user: "メンバー",
  department: "部署",
  category: "業務分類",
};

/** レポートで見てよい工数の条件 */
async function scopeWhere(
  actor: SessionUser,
): Promise<Prisma.TimeEntryWhereInput> {
  if (actor.role === "ADMIN") return {};
  if (actor.role === "MEMBER") return { userId: actor.id };
  const ids = await visibleUserIds(actor);
  return {
    OR: [
      { userId: { in: ids === "ALL" ? [] : ids } },
      { project: { pmId: actor.id } },
    ],
  };
}

export type ReportRow = {
  key: string;
  label: string;
  sub: string | null;
  minutes: number;
  directMinutes: number;
  utilization: number | null;
  laborCost: number | null;
};

export async function buildReport(
  actor: SessionUser,
  axis: ReportAxis,
  fromYm: string,
  toYm: string,
) {
  const from = firstDayOfMonth(fromYm);
  const to = lastDayOfMonth(toYm);
  const scope = await scopeWhere(actor);
  const entries = await prisma.timeEntry.findMany({
    where: { AND: [scope, { date: { gte: d(from), lte: d(to) } }] },
    select: {
      userId: true,
      projectId: true,
      date: true,
      minutes: true,
      project: {
        select: {
          code: true,
          name: true,
          kind: true,
          client: { select: { id: true, name: true } },
        },
      },
      user: {
        select: {
          name: true,
          department: { select: { id: true, name: true } },
        },
      },
      workCategory: { select: { id: true, name: true } },
    },
  });

  const showCost = actor.role === "ADMIN";
  // 労務費は（メンバー × プロジェクト × 月）で計算してから軸に配る
  const costByUserProjectMonth = new Map<
    string,
    { cost: number; minutes: number }
  >();
  if (showCost) {
    const rows = await laborCostRows(prisma, { from, to });
    for (const r of rows)
      costByUserProjectMonth.set(`${r.userId}|${r.projectId}|${r.yearMonth}`, {
        cost: r.laborCost,
        minutes: r.minutes,
      });
  }

  const keyOf = (
    e: (typeof entries)[number],
  ): { key: string; label: string; sub: string | null } => {
    switch (axis) {
      case "project":
        return { key: e.projectId, label: e.project.name, sub: e.project.code };
      case "client":
        return e.project.client
          ? {
              key: e.project.client.id,
              label: e.project.client.name,
              sub: null,
            }
          : {
              key: e.project.kind === "INTERNAL" ? "internal" : "none",
              label: e.project.kind === "INTERNAL" ? "社内業務" : "顧客なし",
              sub: null,
            };
      case "user":
        return {
          key: e.userId,
          label: e.user.name,
          sub: e.user.department?.name ?? null,
        };
      case "department":
        return e.user.department
          ? {
              key: e.user.department.id,
              label: e.user.department.name,
              sub: null,
            }
          : { key: "none", label: "部署なし", sub: null };
      case "category":
        return e.workCategory
          ? { key: e.workCategory.id, label: e.workCategory.name, sub: null }
          : { key: "none", label: "分類なし", sub: null };
    }
  };

  const groups = new Map<string, ReportRow & { _costShare: number }>();
  for (const e of entries) {
    const k = keyOf(e);
    const g = groups.get(k.key) ?? {
      ...k,
      minutes: 0,
      directMinutes: 0,
      utilization: null,
      laborCost: showCost ? 0 : null,
      _costShare: 0,
    };
    g.minutes += e.minutes;
    if (e.project.kind === "WORK") g.directMinutes += e.minutes;
    if (showCost) {
      const c = costByUserProjectMonth.get(
        `${e.userId}|${e.projectId}|${ds(e.date).slice(0, 7)}`,
      );
      // 按分の端数は最後にまとめず、分の比で配る（表示用。合計は労務費の合計と数円ずれることがある）
      if (c && c.minutes > 0) g._costShare += (c.cost * e.minutes) / c.minutes;
    }
    groups.set(k.key, g);
  }
  const rows: ReportRow[] = [...groups.values()]
    .map(({ _costShare, ...g }) => ({
      ...g,
      utilization: percent(g.directMinutes, g.minutes),
      laborCost: showCost ? Math.round(_costShare) : null,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const direct = rows.reduce((s, r) => s + r.directMinutes, 0);

  // 月次の推移
  const monthly = new Map<string, { minutes: number; direct: number }>();
  for (const e of entries) {
    const ym = ds(e.date).slice(0, 7);
    const m = monthly.get(ym) ?? { minutes: 0, direct: 0 };
    m.minutes += e.minutes;
    if (e.project.kind === "WORK") m.direct += e.minutes;
    monthly.set(ym, m);
  }

  return {
    rows,
    total,
    direct,
    utilization: percent(direct, total),
    laborCost: showCost
      ? rows.reduce((s, r) => s + (r.laborCost ?? 0), 0)
      : null,
    showCost,
    monthly: [...monthly.entries()].sort().map(([ym, v]) => ({
      yearMonth: ym,
      minutes: v.minutes,
      utilization: percent(v.direct, v.minutes),
    })),
  };
}

/** 明細（CSV 用） */
export async function reportDetail(
  actor: SessionUser,
  fromYm: string,
  toYm: string,
) {
  const scope = await scopeWhere(actor);
  return prisma.timeEntry.findMany({
    where: {
      AND: [
        scope,
        {
          date: {
            gte: d(firstDayOfMonth(fromYm)),
            lte: d(lastDayOfMonth(toYm)),
          },
        },
      ],
    },
    orderBy: [{ date: "asc" }, { userId: "asc" }, { startMinute: "asc" }],
    take: 200_000,
    select: {
      date: true,
      startMinute: true,
      endMinute: true,
      minutes: true,
      note: true,
      user: {
        select: {
          name: true,
          email: true,
          department: { select: { name: true } },
        },
      },
      project: {
        select: { code: true, name: true, client: { select: { name: true } } },
      },
      phase: { select: { name: true } },
      workCategory: { select: { name: true } },
    },
  });
}
