import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { eachDateStr } from "@/lib/date-range";
import { formatDateJa } from "@/lib/date-range";
import { formatHm } from "@/lib/minutes";
import { recordAudit } from "@/lib/audit";
import { err, ok, type Result } from "@/lib/result";
import type { SessionUser } from "@/features/auth/rbac";
import { getCompany } from "@/features/common/company";
import { d, ds, todayJst } from "@/features/common/dates";
import {
  isMonthClosed,
  lockMonthShared,
  lockUserDay,
} from "@/features/common/locks";
import { periodOf } from "@/features/timesheet/domain/period";
import { checkDaysForSubmit } from "@/features/timesheet/domain/attendance";
import {
  canDecide,
  nextStatus,
  type PeriodStatus,
  type Transition,
} from "./domain/transitions";

type Tx = Prisma.TransactionClient;

const AUDIT_ACTION = {
  SUBMIT: "TIMESHEET_SUBMIT",
  WITHDRAW: "TIMESHEET_WITHDRAW",
  APPROVE: "TIMESHEET_APPROVE",
  REJECT: "TIMESHEET_REJECT",
  CANCEL_APPROVAL: "TIMESHEET_APPROVAL_CANCEL",
} as const;

async function lockPeriodDays(
  tx: Tx,
  userId: string,
  start: string,
  end: string,
) {
  await lockMonthShared(tx, start.slice(0, 7));
  for (const day of eachDateStr(start, end)) await lockUserDay(tx, userId, day);
}

/** 提出（本人） */
export async function submitPeriod(
  actor: SessionUser,
  anyDate: string,
): Promise<Result<void>> {
  const p = periodOf(anyDate);
  if (p.start > todayJst())
    return err("VALIDATION", "まだ始まっていない期間は提出できません。");
  const company = await getCompany();

  return prisma.$transaction(async (tx) => {
    await lockPeriodDays(tx, actor.id, p.start, p.end);
    if (await isMonthClosed(tx, p.start.slice(0, 7)))
      return err("MONTH_CLOSED");

    const existing = await tx.timesheetPeriod.findUnique({
      where: { userId_startDate: { userId: actor.id, startDate: d(p.start) } },
    });
    const current: PeriodStatus = existing?.status ?? "NONE";
    const next = nextStatus(current, "SUBMIT");
    if (!next) return err("CONFLICT", "この期間はすでに提出済みです。");

    const timer = await tx.runningTimer.findUnique({
      where: { userId: actor.id },
    });
    if (timer) {
      const started = ds(new Date(timer.startedAt.getTime() + 9 * 3600_000));
      if (started >= p.start && started <= p.end) {
        return err(
          "CONFLICT",
          "タイマーが動いています。停止するか破棄してから提出してください。",
        );
      }
    }

    const [entries, attendances] = await Promise.all([
      tx.timeEntry.findMany({
        where: { userId: actor.id, date: { gte: d(p.start), lte: d(p.end) } },
        select: { date: true, minutes: true },
      }),
      tx.attendance.findMany({
        where: { userId: actor.id, date: { gte: d(p.start), lte: d(p.end) } },
      }),
    ]);
    const days = eachDateStr(p.start, p.end).map((date) => {
      const a = attendances.find((x) => ds(x.date) === date);
      return {
        date,
        entryMinutes: entries
          .filter((e) => ds(e.date) === date)
          .reduce((s, e) => s + e.minutes, 0),
        attendance: a
          ? {
              startMinute: a.startMinute,
              endMinute: a.endMinute,
              breakMinutes: a.breakMinutes,
              gapReason: a.gapReason,
            }
          : null,
      };
    });
    const problems = checkDaysForSubmit(days, company.gapThresholdMinutes);
    if (problems.length > 0) {
      const lines = problems.map((x) =>
        x.kind === "NO_ATTENDANCE"
          ? `${formatDateJa(x.date)}: 勤務時間（始業・終業）を入力してください`
          : `${formatDateJa(x.date)}: 勤務時間と工数の差が ${formatHm(x.gap)} あります。理由を入力してください`,
      );
      return err("VALIDATION", lines.join("\n"));
    }

    const total = entries.reduce((s, e) => s + e.minutes, 0);
    const period = existing
      ? await tx.timesheetPeriod.update({
          where: { id: existing.id },
          data: {
            status: next,
            totalMinutes: total,
            submittedAt: new Date(),
            decidedAt: null,
            deciderId: null,
            comment: "",
          },
        })
      : await tx.timesheetPeriod.create({
          data: {
            userId: actor.id,
            startDate: d(p.start),
            endDate: d(p.end),
            status: next,
            totalMinutes: total,
            submittedAt: new Date(),
          },
        });
    await tx.approvalEvent.create({
      data: { periodId: period.id, type: "SUBMIT", actorId: actor.id },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "TIMESHEET_SUBMIT",
      targetType: "TimesheetPeriod",
      targetId: period.id,
      detail: { start: p.start, end: p.end, totalMinutes: total },
    });
    return ok(undefined);
  });
}

/** 取り下げ（本人） */
export async function withdrawPeriod(
  actor: SessionUser,
  anyDate: string,
): Promise<Result<void>> {
  const p = periodOf(anyDate);
  return prisma.$transaction(async (tx) => {
    await lockPeriodDays(tx, actor.id, p.start, p.end);
    if (await isMonthClosed(tx, p.start.slice(0, 7)))
      return err("MONTH_CLOSED");
    const row = await tx.timesheetPeriod.findUnique({
      where: { userId_startDate: { userId: actor.id, startDate: d(p.start) } },
    });
    if (!row) return err("NOT_FOUND");
    const next = nextStatus(row.status, "WITHDRAW");
    if (!next)
      return err("CONFLICT", "承認者の判断が済んだ期間は取り下げられません。");
    await tx.timesheetPeriod.update({
      where: { id: row.id },
      data: { status: next },
    });
    await tx.approvalEvent.create({
      data: { periodId: row.id, type: "WITHDRAW", actorId: actor.id },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "TIMESHEET_WITHDRAW",
      targetType: "TimesheetPeriod",
      targetId: row.id,
    });
    return ok(undefined);
  });
}

/** 承認・差戻し・承認の取消（承認者・ADMIN） */
export async function decidePeriod(
  actor: SessionUser,
  periodId: string,
  t: Extract<Transition, "APPROVE" | "REJECT" | "CANCEL_APPROVAL">,
  comment: string,
): Promise<Result<void>> {
  const text = comment.trim();
  if ((t === "REJECT" || t === "CANCEL_APPROVAL") && text === "") {
    return err("VALIDATION", "コメントを入力してください。");
  }
  if (text.length > 500)
    return err("VALIDATION", "コメントは 500 文字までです。");

  return prisma.$transaction(async (tx) => {
    const row = await tx.timesheetPeriod.findUnique({
      where: { id: periodId },
      include: {
        user: {
          select: {
            id: true,
            approverId: true,
            approver: { select: { role: true, status: true } },
          },
        },
      },
    });
    if (!row) return err("NOT_FOUND");
    const approverIsValid =
      row.user.approver !== null &&
      row.user.approver.status === "ACTIVE" &&
      row.user.approver.role !== "MEMBER";
    const check = canDecide({
      actor: { id: actor.id, role: actor.role },
      owner: { id: row.user.id, approverId: row.user.approverId },
      approverIsValid,
    });
    // 見る権限のない期間は存在を伏せる
    if (check === "NOT_APPROVER") return err("NOT_FOUND");
    if (check === "SELF") return err("SELF_APPROVAL");

    const start = ds(row.startDate);
    await lockPeriodDays(tx, row.userId, start, ds(row.endDate));
    if (await isMonthClosed(tx, start.slice(0, 7))) return err("MONTH_CLOSED");

    const fresh = await tx.timesheetPeriod.findUniqueOrThrow({
      where: { id: periodId },
    });
    const next = nextStatus(fresh.status, t);
    if (!next) return err("CONFLICT");

    await tx.timesheetPeriod.update({
      where: { id: periodId },
      data:
        t === "CANCEL_APPROVAL"
          ? { status: next, decidedAt: null, deciderId: null, comment: text }
          : {
              status: next,
              decidedAt: new Date(),
              deciderId: actor.id,
              comment: text,
            },
    });
    await tx.approvalEvent.create({
      data: { periodId, type: t, actorId: actor.id, comment: text },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: AUDIT_ACTION[t],
      targetType: "TimesheetPeriod",
      targetId: periodId,
      detail: { userId: row.userId, start, comment: text || null },
    });
    return ok(undefined);
  });
}

/** 承認者が判断できる提出の条件 */
function decidableWhere(actor: SessionUser): Prisma.TimesheetPeriodWhereInput {
  if (actor.role === "ADMIN") return { userId: { not: actor.id } };
  return {
    userId: { not: actor.id },
    user: { approverId: actor.id },
  };
}

export async function countPendingApprovals(
  actor: SessionUser,
): Promise<number> {
  if (actor.role === "MEMBER") return 0;
  return prisma.timesheetPeriod.count({
    where: { status: "SUBMITTED", ...decidableWhere(actor) },
  });
}

export async function listApprovals(
  actor: SessionUser,
  status: "SUBMITTED" | "APPROVED" | "REJECTED",
) {
  if (actor.role === "MEMBER") return [];
  const rows = await prisma.timesheetPeriod.findMany({
    where: { status, ...decidableWhere(actor) },
    orderBy: [{ startDate: "desc" }, { submittedAt: "asc" }],
    take: 100,
    include: {
      user: { select: { name: true, department: { select: { name: true } } } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    userName: r.user.name,
    departmentName: r.user.department?.name ?? null,
    start: ds(r.startDate),
    end: ds(r.endDate),
    totalMinutes: r.totalMinutes,
    submittedAt: r.submittedAt,
    status: r.status,
  }));
}

/** 承認の詳細（承認者・ADMIN だけ） */
export async function getPeriodForApprover(
  actor: SessionUser,
  periodId: string,
) {
  if (actor.role === "MEMBER") return null;
  const row = await prisma.timesheetPeriod.findFirst({
    where: { id: periodId, ...decidableWhere(actor) },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          department: { select: { name: true } },
        },
      },
      events: {
        orderBy: { at: "asc" },
        include: { actor: { select: { name: true } } },
      },
    },
  });
  if (!row) return null;
  const start = ds(row.startDate);
  const end = ds(row.endDate);
  const closed = await prisma.closingMonth.findUnique({
    where: { yearMonth: start.slice(0, 7) },
  });
  return {
    id: row.id,
    userId: row.user.id,
    userName: row.user.name,
    departmentName: row.user.department?.name ?? null,
    start,
    end,
    status: row.status,
    totalMinutes: row.totalMinutes,
    submittedAt: row.submittedAt,
    comment: row.comment,
    closed: Boolean(closed?.closed),
    events: row.events.map((e) => ({
      type: e.type,
      actorName: e.actor.name,
      comment: e.comment,
      at: e.at,
    })),
  };
}

/** 提出期限（期間の終了日 ＋ 猶予）を過ぎた未提出・差戻しの期間（本人） */
export async function overduePeriods(
  userId: string,
  today: string,
  graceDays: number,
) {
  const since = d(`${today.slice(0, 7)}-01`);
  since.setUTCMonth(since.getUTCMonth() - 2);
  const [entries, periods] = await Promise.all([
    prisma.timeEntry.findMany({
      where: { userId, date: { gte: since, lt: d(today) } },
      select: { date: true },
      distinct: ["date"],
    }),
    prisma.timesheetPeriod.findMany({
      where: { userId, startDate: { gte: since } },
      select: { startDate: true, status: true },
    }),
  ]);
  const seen = new Map<string, { start: string; end: string }>();
  for (const e of entries) {
    const p = periodOf(ds(e.date));
    seen.set(p.start, p);
  }
  const out: { start: string; end: string; status: PeriodStatus }[] = [];
  for (const p of [...seen.values()].sort((a, b) =>
    a.start.localeCompare(b.start),
  )) {
    const due = new Date(`${p.end}T00:00:00Z`);
    due.setUTCDate(due.getUTCDate() + graceDays);
    if (ds(due) >= today) continue;
    const row = periods.find((x) => ds(x.startDate) === p.start);
    const status: PeriodStatus = row?.status ?? "NONE";
    if (status === "NONE" || status === "REJECTED" || status === "WITHDRAWN")
      out.push({ ...p, status });
  }
  return out;
}
