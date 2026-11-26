import { addDaysStr } from "@/lib/date-range";
import { jstDateStr, jstMinutesOfDay } from "@/lib/datetime";

export type TimerSegment = {
  date: string;
  startMinute: number;
  endMinute: number;
};

export type TimerSplitResult =
  | { ok: true; segments: TimerSegment[] }
  | { ok: false; reason: "TOO_SHORT" | "TOO_LONG" | "NEGATIVE" };

/**
 * タイマーの開始〜停止を業務日（JST）ごとの時間帯に分ける。
 * 開始・停止とも分未満を切り捨てた時刻を使い、日付をまたぐ場合は 24:00 と 0:00 で分ける。
 * 長さが 0 分になる日は含めない。
 */
export function splitTimer(startedAt: Date, stoppedAt: Date): TimerSplitResult {
  const ms = stoppedAt.getTime() - startedAt.getTime();
  if (ms < 0) return { ok: false, reason: "NEGATIVE" };
  if (ms > 24 * 60 * 60_000) return { ok: false, reason: "TOO_LONG" };

  const startDate = jstDateStr(startedAt);
  const stopDate = jstDateStr(stoppedAt);
  const startMin = jstMinutesOfDay(startedAt);
  const stopMin = jstMinutesOfDay(stoppedAt);

  const segments: TimerSegment[] = [];
  if (startDate === stopDate) {
    if (stopMin > startMin)
      segments.push({
        date: startDate,
        startMinute: startMin,
        endMinute: stopMin,
      });
  } else {
    if (startMin < 1440)
      segments.push({
        date: startDate,
        startMinute: startMin,
        endMinute: 1440,
      });
    let d = addDaysStr(startDate, 1);
    while (d < stopDate) {
      segments.push({ date: d, startMinute: 0, endMinute: 1440 });
      d = addDaysStr(d, 1);
    }
    if (stopMin > 0)
      segments.push({ date: stopDate, startMinute: 0, endMinute: stopMin });
  }
  if (segments.length === 0) return { ok: false, reason: "TOO_SHORT" };
  return { ok: true, segments };
}
