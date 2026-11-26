import { addDaysStr } from "@/lib/date-range";

/**
 * 提出期間: 月曜〜日曜の週を、月の境目で分けたもの。
 */
export type PeriodRange = { start: string; end: string };

function weekday(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

/** その日を含む週の月曜日 */
export function weekStartOf(dateStr: string): string {
  const dow = weekday(dateStr);
  return addDaysStr(dateStr, dow === 0 ? -6 : 1 - dow);
}

export function monthOf(dateStr: string): string {
  return dateStr.slice(0, 7);
}

export function firstDayOfMonth(ym: string): string {
  return `${ym}-01`;
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m, 0));
  return d.toISOString().slice(0, 10);
}

export function addMonths(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** 日付 d の提出期間 */
export function periodOf(dateStr: string): PeriodRange {
  const ws = weekStartOf(dateStr);
  const we = addDaysStr(ws, 6);
  const ym = monthOf(dateStr);
  const ms = firstDayOfMonth(ym);
  const me = lastDayOfMonth(ym);
  return { start: ws > ms ? ws : ms, end: we < me ? we : me };
}

/** 週（月曜始まり）に含まれる提出期間（1 つか 2 つ） */
export function periodsOfWeek(weekStart: string): PeriodRange[] {
  const first = periodOf(weekStart);
  const weekEnd = addDaysStr(weekStart, 6);
  if (first.end >= weekEnd) return [first];
  return [first, periodOf(addDaysStr(first.end, 1))];
}

/** 月に含まれる提出期間（時系列順） */
export function periodsOfMonth(ym: string): PeriodRange[] {
  const out: PeriodRange[] = [];
  let d = firstDayOfMonth(ym);
  const last = lastDayOfMonth(ym);
  while (d <= last) {
    const p = periodOf(d);
    out.push(p);
    d = addDaysStr(p.end, 1);
  }
  return out;
}
