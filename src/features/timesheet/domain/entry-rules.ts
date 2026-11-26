import { addDaysStr } from "@/lib/date-range";

/** 工数 1 件の時間帯（その日の 0:00 からの分） */
export type Slot = { startMinute: number; endMinute: number };

export const MAX_FUTURE_DAYS = 7;
export const NOTE_MAX = 500;

export type ShapeError = "START_NOT_BEFORE_END" | "OUT_OF_DAY" | "NOT_INTEGER";

/** 時間帯の形の検査（0:00〜24:00、開始 < 終了、整数） */
export function checkSlotShape(s: Slot): ShapeError | null {
  if (!Number.isInteger(s.startMinute) || !Number.isInteger(s.endMinute))
    return "NOT_INTEGER";
  if (s.startMinute < 0 || s.endMinute > 1440) return "OUT_OF_DAY";
  if (s.startMinute >= s.endMinute) return "START_NOT_BEFORE_END";
  return null;
}

/** 2 つの時間帯が重なるか（端が接するのはよい） */
export function slotsOverlap(a: Slot, b: Slot): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/** 既存の時間帯（自分自身を除く）との重なりを探す */
export function findOverlap<T extends Slot & { id?: string }>(
  slot: Slot,
  others: readonly T[],
  selfId?: string,
): T | null {
  for (const o of others) {
    if (selfId && o.id === selfId) continue;
    if (slotsOverlap(slot, o)) return o;
  }
  return null;
}

/** 入力できる日付か（今日の 7 日後まで） */
export function isWithinFutureLimit(dateStr: string, today: string): boolean {
  return dateStr <= addDaysStr(today, MAX_FUTURE_DAYS);
}

/** 刻みに丸める（四捨五入）。0〜1440 に収める。 */
export function snapToStep(minute: number, step: number): number {
  const v = Math.round(minute / step) * step;
  return Math.min(1440, Math.max(0, v));
}

export type ProjectForEntry = {
  kind: "WORK" | "INTERNAL";
  status: "PROSPECT" | "ACTIVE" | "COMPLETED" | "CANCELED";
  startDate: string;
  endDate: string | null;
  isMember: boolean;
  phaseActive: boolean;
  categoryActive: boolean;
};

export type ProjectRuleError =
  | "PROJECT_NOT_OPEN"
  | "OUT_OF_PROJECT_PERIOD"
  | "NOT_A_MEMBER"
  | "PHASE_INACTIVE"
  | "CATEGORY_INACTIVE";

/** その日にそのプロジェクト・工程・業務分類へ新しく入力できるか */
export function checkProjectRules(
  p: ProjectForEntry,
  dateStr: string,
): ProjectRuleError | null {
  if (p.status !== "PROSPECT" && p.status !== "ACTIVE")
    return "PROJECT_NOT_OPEN";
  if (dateStr < p.startDate || (p.endDate !== null && dateStr > p.endDate))
    return "OUT_OF_PROJECT_PERIOD";
  if (p.kind === "WORK" && !p.isMember) return "NOT_A_MEMBER";
  if (!p.phaseActive) return "PHASE_INACTIVE";
  if (!p.categoryActive) return "CATEGORY_INACTIVE";
  return null;
}

export const PROJECT_RULE_MESSAGES: Record<ProjectRuleError, string> = {
  PROJECT_NOT_OPEN: "完了・中止したプロジェクトには入力できません。",
  OUT_OF_PROJECT_PERIOD: "プロジェクトの期間外の日付です。",
  NOT_A_MEMBER: "参加していないプロジェクトには入力できません。",
  PHASE_INACTIVE: "無効になった工程には入力できません。",
  CATEGORY_INACTIVE: "無効になった業務分類は選べません。",
};

/**
 * 既存の工数を変更するときの判定。
 * 対象（プロジェクト・工程・分類）を変えず、同じ日の中で縮める・動かすだけなら、
 * プロジェクトの規則に反していても許す（過去の入力を直せないまま残さないため）。
 */
export function isShrinkOrMoveOnly(
  before: {
    date: string;
    projectId: string;
    phaseId: string;
    workCategoryId: string | null;
  },
  after: {
    date: string;
    projectId: string;
    phaseId: string;
    workCategoryId: string | null;
  },
): boolean {
  return (
    before.date === after.date &&
    before.projectId === after.projectId &&
    before.phaseId === after.phaseId &&
    before.workCategoryId === after.workCategoryId
  );
}
