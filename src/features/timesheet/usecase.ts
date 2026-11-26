import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { addDaysStr, eachDateStr } from "@/lib/date-range";
import { err, ok, type Result } from "@/lib/result";
import { getCompany } from "@/features/common/company";
import { d, ds, todayJst } from "@/features/common/dates";
import {
  isMonthClosed,
  lockMonthShared,
  lockUserDay,
} from "@/features/common/locks";
import {
  isEditableStatus,
  type PeriodStatus,
} from "@/features/approval/domain/transitions";
import {
  checkProjectRules,
  checkSlotShape,
  findOverlap,
  isShrinkOrMoveOnly,
  isWithinFutureLimit,
  NOTE_MAX,
  PROJECT_RULE_MESSAGES,
} from "./domain/entry-rules";
import { periodOf, periodsOfWeek, weekStartOf } from "./domain/period";
import { splitTimer } from "./domain/timer";
import { ATTENDANCE_MESSAGES, checkAttendance } from "./domain/attendance";

type Tx = Prisma.TransactionClient;

// ------------------------------------------------------------------
// 入力スキーマ
// ------------------------------------------------------------------

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません");
const minute = z.coerce.number().int().min(0).max(1440);

export const entryInputSchema = z.object({
  date: dateStr,
  startMinute: minute,
  endMinute: minute,
  phaseId: z.string().uuid("工程を選んでください"),
  workCategoryId: z
    .union([z.literal("").transform(() => null), z.string().uuid(), z.null()])
    .optional()
    .transform((v) => v ?? null),
  note: z
    .string()
    .max(NOTE_MAX, `メモは ${NOTE_MAX} 文字までです`)
    .default("")
    .transform((s) => s.trim()),
});
export type EntryInput = z.infer<typeof entryInputSchema>;

export const attendanceInputSchema = z.object({
  date: dateStr,
  startMinute: z.coerce.number().int(),
  endMinute: z.coerce.number().int(),
  breakMinutes: z.coerce.number().int().min(0),
  gapReason: z
    .string()
    .max(200, "理由は 200 文字までです")
    .default("")
    .transform((s) => s.trim()),
});

// ------------------------------------------------------------------
// 編集できるかの判定
// ------------------------------------------------------------------

async function periodStatusOn(
  tx: Tx,
  userId: string,
  date: string,
): Promise<PeriodStatus> {
  const p = periodOf(date);
  const row = await tx.timesheetPeriod.findUnique({
    where: { userId_startDate: { userId, startDate: d(p.start) } },
    select: { status: true },
  });
  return row?.status ?? "NONE";
}

/** 本人がその日を編集できるか（締め・提出状態・未来の上限） */
async function assertDayEditable(
  tx: Tx,
  userId: string,
  date: string,
): Promise<Result<void>> {
  if (!isWithinFutureLimit(date, todayJst())) {
    return err("VALIDATION", "入力できるのは 7 日後までです。");
  }
  await lockMonthShared(tx, date.slice(0, 7));
  if (await isMonthClosed(tx, date.slice(0, 7))) return err("MONTH_CLOSED");
  const status = await periodStatusOn(tx, userId, date);
  if (!isEditableStatus(status)) return err("PERIOD_LOCKED");
  return ok(undefined);
}

type Target = {
  projectId: string;
  phaseId: string;
  workCategoryId: string | null;
};

/** 工程と業務分類から入力先を確かめる（新規入力の規則） */
async function resolveTarget(
  tx: Tx,
  userId: string,
  input: { phaseId: string; workCategoryId: string | null; date: string },
  enforceRules: boolean,
): Promise<Result<Target>> {
  const phase = await tx.phase.findUnique({
    where: { id: input.phaseId },
    select: {
      id: true,
      active: true,
      project: {
        select: {
          id: true,
          kind: true,
          status: true,
          startDate: true,
          endDate: true,
          members: { where: { userId }, select: { userId: true } },
        },
      },
    },
  });
  if (!phase) return err("NOT_FOUND", "工程が見つかりません。");
  let categoryActive = true;
  if (input.workCategoryId) {
    const c = await tx.workCategory.findUnique({
      where: { id: input.workCategoryId },
      select: { active: true },
    });
    if (!c) return err("NOT_FOUND", "業務分類が見つかりません。");
    categoryActive = c.active;
  }
  const p = phase.project;
  const isMember = p.members.length > 0;
  // 参加していない業務プロジェクトは、存在自体を伏せる
  if (p.kind === "WORK" && !isMember)
    return err("NOT_FOUND", "工程が見つかりません。");
  if (enforceRules) {
    const ruleErr = checkProjectRules(
      {
        kind: p.kind,
        status: p.status,
        startDate: ds(p.startDate),
        endDate: p.endDate ? ds(p.endDate) : null,
        isMember,
        phaseActive: phase.active,
        categoryActive,
      },
      input.date,
    );
    if (ruleErr) return err("VALIDATION", PROJECT_RULE_MESSAGES[ruleErr]);
  }
  return ok({
    projectId: p.id,
    phaseId: phase.id,
    workCategoryId: input.workCategoryId,
  });
}

async function assertNoOverlap(
  tx: Tx,
  userId: string,
  date: string,
  slot: { startMinute: number; endMinute: number },
  selfId?: string,
): Promise<Result<void>> {
  const others = await tx.timeEntry.findMany({
    where: { userId, date: d(date) },
    select: { id: true, startMinute: true, endMinute: true },
  });
  if (findOverlap(slot, others, selfId)) return err("OVERLAP");
  return ok(undefined);
}

function shapeError(s: {
  startMinute: number;
  endMinute: number;
}): Result<void> {
  const e = checkSlotShape(s);
  if (e)
    return err(
      "VALIDATION",
      "開始は終了より前、0:00〜24:00 の範囲で指定してください。",
    );
  return ok(undefined);
}

/** 排他制約違反（同時の書き込みで重なった場合）を OVERLAP に変換する */
function mapDbError(e: unknown): Result<never> | null {
  if (
    e instanceof Prisma.PrismaClientKnownRequestError ||
    e instanceof Prisma.PrismaClientUnknownRequestError
  ) {
    if (String(e.message).includes("TimeEntry_no_overlap"))
      return err("OVERLAP");
  }
  return null;
}

// ------------------------------------------------------------------
// 工数の作成・変更・削除
// ------------------------------------------------------------------

async function createEntryTx(
  tx: Tx,
  userId: string,
  input: EntryInput,
): Promise<Result<{ id: string }>> {
  const shape = shapeError(input);
  if (!shape.ok) return shape;
  await lockUserDay(tx, userId, input.date);
  const editable = await assertDayEditable(tx, userId, input.date);
  if (!editable.ok) return editable;
  const target = await resolveTarget(tx, userId, input, true);
  if (!target.ok) return target;
  const overlap = await assertNoOverlap(tx, userId, input.date, input);
  if (!overlap.ok) return overlap;
  const row = await tx.timeEntry.create({
    data: {
      userId,
      ...target.value,
      date: d(input.date),
      startMinute: input.startMinute,
      endMinute: input.endMinute,
      minutes: input.endMinute - input.startMinute,
      note: input.note,
    },
    select: { id: true },
  });
  return ok(row);
}

export async function createEntry(
  userId: string,
  input: EntryInput,
): Promise<Result<{ id: string }>> {
  try {
    return await prisma.$transaction((tx) => createEntryTx(tx, userId, input));
  } catch (e) {
    const mapped = mapDbError(e);
    if (mapped) return mapped;
    throw e;
  }
}

/** 複数の工数をまとめて登録する（Tsumugi の下書きの確定）。どれかが失敗したら全件戻す。 */
export async function createEntries(
  userId: string,
  inputs: EntryInput[],
): Promise<Result<{ count: number }> & { index?: number }> {
  class Abort extends Error {
    constructor(
      public result: Result<never>,
      public index: number,
    ) {
      super("abort");
    }
  }
  try {
    const count = await prisma.$transaction(async (tx) => {
      for (const [i, input] of inputs.entries()) {
        const r = await createEntryTx(tx, userId, input);
        if (!r.ok) throw new Abort(r, i);
      }
      return inputs.length;
    });
    return ok({ count });
  } catch (e) {
    if (e instanceof Abort) return { ...e.result, index: e.index };
    const mapped = mapDbError(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function updateEntry(
  userId: string,
  id: string,
  input: EntryInput,
): Promise<Result<{ id: string }>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.timeEntry.findUnique({ where: { id } });
      // 他人の工数は存在を伏せる
      if (!before || before.userId !== userId) return err("NOT_FOUND");
      const shape = shapeError(input);
      if (!shape.ok) return shape;

      const beforeDate = ds(before.date);
      for (const day of [...new Set([beforeDate, input.date])].sort()) {
        await lockUserDay(tx, userId, day);
      }
      const editableBefore = await assertDayEditable(tx, userId, beforeDate);
      if (!editableBefore.ok) return editableBefore;
      if (input.date !== beforeDate) {
        const editableAfter = await assertDayEditable(tx, userId, input.date);
        if (!editableAfter.ok) return editableAfter;
      }

      const phase = await tx.phase.findUnique({
        where: { id: input.phaseId },
        select: { projectId: true },
      });
      const relaxed =
        phase !== null &&
        isShrinkOrMoveOnly(
          {
            date: beforeDate,
            projectId: before.projectId,
            phaseId: before.phaseId,
            workCategoryId: before.workCategoryId,
          },
          {
            date: input.date,
            projectId: phase.projectId,
            phaseId: input.phaseId,
            workCategoryId: input.workCategoryId ?? null,
          },
        );
      const target = await resolveTarget(tx, userId, input, !relaxed);
      if (!target.ok) return target;
      const overlap = await assertNoOverlap(tx, userId, input.date, input, id);
      if (!overlap.ok) return overlap;

      await tx.timeEntry.update({
        where: { id },
        data: {
          ...target.value,
          date: d(input.date),
          startMinute: input.startMinute,
          endMinute: input.endMinute,
          minutes: input.endMinute - input.startMinute,
          note: input.note,
        },
      });
      return ok({ id });
    });
  } catch (e) {
    const mapped = mapDbError(e);
    if (mapped) return mapped;
    throw e;
  }
}

export async function deleteEntry(
  userId: string,
  id: string,
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.timeEntry.findUnique({ where: { id } });
    if (!before || before.userId !== userId) return err("NOT_FOUND");
    const date = ds(before.date);
    await lockUserDay(tx, userId, date);
    const editable = await assertDayEditable(tx, userId, date);
    if (!editable.ok) return editable;
    await tx.timeEntry.delete({ where: { id } });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------
// 勤務時間
// ------------------------------------------------------------------

export async function saveAttendance(
  userId: string,
  input: z.infer<typeof attendanceInputSchema>,
): Promise<Result<void>> {
  const e = checkAttendance(input);
  if (e) return err("VALIDATION", ATTENDANCE_MESSAGES[e]);
  return prisma.$transaction(async (tx) => {
    await lockUserDay(tx, userId, input.date);
    const editable = await assertDayEditable(tx, userId, input.date);
    if (!editable.ok) return editable;
    await tx.attendance.upsert({
      where: { userId_date: { userId, date: d(input.date) } },
      create: {
        userId,
        date: d(input.date),
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        breakMinutes: input.breakMinutes,
        gapReason: input.gapReason,
      },
      update: {
        startMinute: input.startMinute,
        endMinute: input.endMinute,
        breakMinutes: input.breakMinutes,
        gapReason: input.gapReason,
      },
    });
    return ok(undefined);
  });
}

export async function clearAttendance(
  userId: string,
  date: string,
): Promise<Result<void>> {
  return prisma.$transaction(async (tx) => {
    await lockUserDay(tx, userId, date);
    const editable = await assertDayEditable(tx, userId, date);
    if (!editable.ok) return editable;
    await tx.attendance.deleteMany({ where: { userId, date: d(date) } });
    return ok(undefined);
  });
}

// ------------------------------------------------------------------
// タイマー
// ------------------------------------------------------------------

export async function startTimer(
  userId: string,
  input: { phaseId: string; workCategoryId: string | null; note: string },
  now = new Date(),
): Promise<Result<void>> {
  const today = todayJst();
  return prisma.$transaction(async (tx) => {
    const existing = await tx.runningTimer.findUnique({ where: { userId } });
    if (existing) return err("CONFLICT", "タイマーはすでに動いています。");
    const target = await resolveTarget(
      tx,
      userId,
      { ...input, date: today },
      true,
    );
    if (!target.ok) return target;
    const editable = await assertDayEditable(tx, userId, today);
    if (!editable.ok) return editable;
    await tx.runningTimer.create({
      data: {
        userId,
        ...target.value,
        note: input.note.trim().slice(0, NOTE_MAX),
        startedAt: now,
      },
    });
    return ok(undefined);
  });
}

export async function stopTimer(
  userId: string,
  now = new Date(),
): Promise<Result<{ minutes: number }>> {
  try {
    return await prisma.$transaction(async (tx) => {
      const t = await tx.runningTimer.findUnique({ where: { userId } });
      if (!t) return err("NOT_FOUND", "動いているタイマーがありません。");
      const split = splitTimer(t.startedAt, now);
      if (!split.ok) {
        if (split.reason === "TOO_SHORT") {
          await tx.runningTimer.delete({ where: { userId } });
          return ok({ minutes: 0 });
        }
        return err(
          "VALIDATION",
          "24 時間を超えたタイマーは記録できません。破棄して手入力してください。",
        );
      }
      let minutes = 0;
      for (const seg of split.segments) {
        const r = await createEntryTx(tx, userId, {
          date: seg.date,
          startMinute: seg.startMinute,
          endMinute: seg.endMinute,
          phaseId: t.phaseId,
          workCategoryId: t.workCategoryId,
          note: t.note,
        });
        if (!r.ok) {
          // どの日も記録せずに停止を取りやめる（トランザクションごと戻す）
          throw new TimerAbort(r);
        }
        minutes += seg.endMinute - seg.startMinute;
      }
      await tx.runningTimer.delete({ where: { userId } });
      return ok({ minutes });
    });
  } catch (e) {
    if (e instanceof TimerAbort) {
      const msg =
        e.result.error.code === "OVERLAP"
          ? "タイマーの時間帯がほかの工数と重なっています。重なる工数を動かすか、タイマーを破棄してください。"
          : e.result.error.message;
      return err(e.result.error.code, msg);
    }
    const mapped = mapDbError(e);
    if (mapped) return mapped;
    throw e;
  }
}

class TimerAbort extends Error {
  constructor(
    public result: {
      ok: false;
      error: { code: Parameters<typeof err>[0]; message: string };
    },
  ) {
    super("timer-abort");
  }
}

export async function discardTimer(userId: string): Promise<Result<void>> {
  await prisma.runningTimer.deleteMany({ where: { userId } });
  return ok(undefined);
}

// ------------------------------------------------------------------
// 読み取り
// ------------------------------------------------------------------

export type EntryView = {
  id: string;
  date: string;
  startMinute: number;
  endMinute: number;
  minutes: number;
  note: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  projectKind: "WORK" | "INTERNAL";
  colorIndex: number;
  phaseId: string;
  phaseName: string;
  workCategoryId: string | null;
  workCategoryName: string | null;
};

export async function listEntries(
  userId: string,
  from: string,
  to: string,
): Promise<EntryView[]> {
  const rows = await prisma.timeEntry.findMany({
    where: { userId, date: { gte: d(from), lte: d(to) } },
    orderBy: [{ date: "asc" }, { startMinute: "asc" }],
    include: {
      project: {
        select: { code: true, name: true, kind: true, colorIndex: true },
      },
      phase: { select: { name: true } },
      workCategory: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    date: ds(r.date),
    startMinute: r.startMinute,
    endMinute: r.endMinute,
    minutes: r.minutes,
    note: r.note,
    projectId: r.projectId,
    projectCode: r.project.code,
    projectName: r.project.name,
    projectKind: r.project.kind,
    colorIndex: r.project.colorIndex,
    phaseId: r.phaseId,
    phaseName: r.phase.name,
    workCategoryId: r.workCategoryId,
    workCategoryName: r.workCategory?.name ?? null,
  }));
}

export type TargetOption = {
  projectId: string;
  projectCode: string;
  projectName: string;
  projectKind: "WORK" | "INTERNAL";
  colorIndex: number;
  clientName: string | null;
  startDate: string;
  endDate: string | null;
  phases: { id: string; name: string }[];
};

/** 本人が入力できるプロジェクトと工程（期間内かは日付ごとに画面とサーバで確かめる） */
export async function listTargetOptions(
  userId: string,
): Promise<TargetOption[]> {
  const projects = await prisma.project.findMany({
    where: {
      status: { in: ["PROSPECT", "ACTIVE"] },
      OR: [{ kind: "INTERNAL" }, { members: { some: { userId } } }],
    },
    orderBy: [{ kind: "asc" }, { code: "asc" }],
    include: {
      client: { select: { name: true } },
      phases: {
        where: { active: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      },
    },
  });
  return projects
    .filter((p) => p.phases.length > 0)
    .map((p) => ({
      projectId: p.id,
      projectCode: p.code,
      projectName: p.name,
      projectKind: p.kind,
      colorIndex: p.colorIndex,
      clientName: p.client?.name ?? null,
      startDate: ds(p.startDate),
      endDate: p.endDate ? ds(p.endDate) : null,
      phases: p.phases,
    }));
}

export async function listCategories() {
  return prisma.workCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, code: true },
  });
}

export type DayView = {
  date: string;
  attendance: {
    startMinute: number;
    endMinute: number;
    breakMinutes: number;
    gapReason: string;
  } | null;
  entryMinutes: number;
};

export type PeriodView = {
  start: string;
  end: string;
  status: PeriodStatus;
  comment: string;
  submittedAt: Date | null;
  closed: boolean;
};

export type WeekView = {
  weekStart: string;
  days: string[];
  entries: EntryView[];
  dayViews: DayView[];
  periods: PeriodView[];
  timer: Awaited<ReturnType<typeof getTimer>>;
  step: number;
  gapThreshold: number;
};

export async function getTimer(userId: string) {
  const t = await prisma.runningTimer.findUnique({
    where: { userId },
    include: {
      project: { select: { name: true, colorIndex: true } },
      phase: { select: { name: true } },
    },
  });
  if (!t) return null;
  return {
    startedAt: t.startedAt.toISOString(),
    projectName: t.project.name,
    phaseName: t.phase.name,
    colorIndex: t.project.colorIndex,
    note: t.note,
  };
}

export async function getWeek(
  userId: string,
  anyDate: string,
): Promise<WeekView> {
  const weekStart = weekStartOf(anyDate);
  const days = eachDateStr(weekStart, addDaysStr(weekStart, 6));
  const from = days[0];
  const to = days[6];
  const [entries, attendances, periodRows, timer, company, closings] =
    await Promise.all([
      listEntries(userId, from, to),
      prisma.attendance.findMany({
        where: { userId, date: { gte: d(from), lte: d(to) } },
      }),
      prisma.timesheetPeriod.findMany({
        where: { userId, startDate: { gte: d(from), lte: d(to) } },
      }),
      getTimer(userId),
      getCompany(),
      prisma.closingMonth.findMany({
        where: {
          yearMonth: { in: [from.slice(0, 7), to.slice(0, 7)] },
          closed: true,
        },
      }),
    ]);
  const closedMonths = new Set(closings.map((c) => c.yearMonth));
  const dayViews: DayView[] = days.map((date) => {
    const a = attendances.find((x) => ds(x.date) === date);
    return {
      date,
      attendance: a
        ? {
            startMinute: a.startMinute,
            endMinute: a.endMinute,
            breakMinutes: a.breakMinutes,
            gapReason: a.gapReason,
          }
        : null,
      entryMinutes: entries
        .filter((e) => e.date === date)
        .reduce((s, e) => s + e.minutes, 0),
    };
  });
  const periods: PeriodView[] = periodsOfWeek(weekStart).map((p) => {
    const row = periodRows.find((r) => ds(r.startDate) === p.start);
    return {
      start: p.start,
      end: p.end,
      status: row?.status ?? "NONE",
      comment: row?.comment ?? "",
      submittedAt: row?.submittedAt ?? null,
      closed: closedMonths.has(p.start.slice(0, 7)),
    };
  });
  return {
    weekStart,
    days,
    entries,
    dayViews,
    periods,
    timer,
    step: company.timeStepMinutes,
    gapThreshold: company.gapThresholdMinutes,
  };
}

/** 直近 14 日によく使った組み合わせ（Tsumugi に渡す・画面の候補） */
export async function frequentTargets(
  userId: string,
  today: string,
  limit = 10,
) {
  const rows = await prisma.timeEntry.groupBy({
    by: ["phaseId", "workCategoryId"],
    where: { userId, date: { gte: d(addDaysStr(today, -14)), lte: d(today) } },
    _sum: { minutes: true },
    orderBy: { _sum: { minutes: "desc" } },
    take: limit,
  });
  return rows.map((r) => ({
    phaseId: r.phaseId,
    workCategoryId: r.workCategoryId,
    minutes: r._sum.minutes ?? 0,
  }));
}
