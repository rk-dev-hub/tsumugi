/** 勤務時間（始業・終業・休憩）と工数の差 */

export type AttendanceInput = {
  startMinute: number;
  endMinute: number;
  breakMinutes: number;
};

export type AttendanceError =
  "START_RANGE" | "END_NOT_AFTER_START" | "TOO_LONG" | "BREAK_RANGE";

export function checkAttendance(a: AttendanceInput): AttendanceError | null {
  if (
    !Number.isInteger(a.startMinute) ||
    a.startMinute < 0 ||
    a.startMinute >= 1440
  )
    return "START_RANGE";
  if (!Number.isInteger(a.endMinute) || a.endMinute <= a.startMinute)
    return "END_NOT_AFTER_START";
  if (a.endMinute > a.startMinute + 1440) return "TOO_LONG";
  if (
    !Number.isInteger(a.breakMinutes) ||
    a.breakMinutes < 0 ||
    a.breakMinutes >= a.endMinute - a.startMinute
  )
    return "BREAK_RANGE";
  return null;
}

export const ATTENDANCE_MESSAGES: Record<AttendanceError, string> = {
  START_RANGE: "始業は 0:00〜23:59 で入力してください。",
  END_NOT_AFTER_START: "終業は始業より後にしてください。",
  TOO_LONG: "勤務は 24 時間以内にしてください。",
  BREAK_RANGE: "休憩は勤務時間より短くしてください。",
};

export function workMinutes(a: AttendanceInput): number {
  return a.endMinute - a.startMinute - a.breakMinutes;
}

/** 差 = 勤務時間 − 工数合計（正: 工数の入力漏れ、負: 勤務時間の記録漏れの疑い） */
export function gapMinutes(
  a: AttendanceInput | null,
  entryTotal: number,
): number | null {
  if (!a) return null;
  return workMinutes(a) - entryTotal;
}

export function gapExceeds(gap: number | null, threshold: number): boolean {
  return gap !== null && Math.abs(gap) > threshold;
}

export type DayForSubmit = {
  date: string;
  entryMinutes: number;
  attendance: (AttendanceInput & { gapReason: string }) | null;
};

export type SubmitProblem =
  | { date: string; kind: "NO_ATTENDANCE" }
  | { date: string; kind: "GAP_REASON_REQUIRED"; gap: number };

/** 提出前の確認（工数がある日は勤務時間が必要、差が閾値を超える日は理由が必要） */
export function checkDaysForSubmit(
  days: readonly DayForSubmit[],
  threshold: number,
): SubmitProblem[] {
  const out: SubmitProblem[] = [];
  for (const d of days) {
    if (d.entryMinutes > 0 && !d.attendance) {
      out.push({ date: d.date, kind: "NO_ATTENDANCE" });
      continue;
    }
    if (!d.attendance) continue;
    const gap = gapMinutes(d.attendance, d.entryMinutes);
    if (gapExceeds(gap, threshold) && d.attendance.gapReason.trim() === "") {
      out.push({ date: d.date, kind: "GAP_REASON_REQUIRED", gap: gap! });
    }
  }
  return out;
}
