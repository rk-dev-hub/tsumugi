/** 分 ⇔ 「1:30」の変換。 */

export function formatHm(min: number): string {
  const sign = min < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(min));
  return `${sign}${Math.floor(abs / 60)}:${String(abs % 60).padStart(2, "0")}`;
}

/** その日の 0:00 からの分 → 「09:30」（1440 は「24:00」、それ以上は翌日表記なしの時刻） */
export function formatClock(minuteOfDay: number): string {
  const h = Math.floor(minuteOfDay / 60);
  const m = minuteOfDay % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/**
 * 時間の入力を分に変換する。「1:30」「1.5」「90m」「2h」「1h30m」を受け付ける。
 * 解釈できない・負の値は null。
 */
export function parseDuration(input: string): number | null {
  const s = input.trim().toLowerCase().replace(/\s+/g, "");
  if (s === "") return null;
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{1,2}):(\d{2})$/))) {
    const min = Number(m[2]);
    if (min >= 60) return null;
    return Number(m[1]) * 60 + min;
  }
  if ((m = s.match(/^(\d+(?:\.\d+)?)h?$/))) {
    const v = Number(m[1]);
    // 「90」のような整数で h が付かないものは分とみなさず時間とみなす（1.5 と同じ扱い）
    return Math.round(v * 60);
  }
  if ((m = s.match(/^(\d+)m$/))) return Number(m[1]);
  if ((m = s.match(/^(\d+)h(\d+)m$/))) {
    const min = Number(m[2]);
    if (min >= 60) return null;
    return Number(m[1]) * 60 + min;
  }
  return null;
}

/** 「09:30」→ 570。「24:00」まで、翌日の時刻は「25:30」のように 24 以上で表す。 */
export function parseClock(hm: string, max = 1440): number | null {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min >= 60) return null;
  const v = h * 60 + min;
  return v <= max ? v : null;
}
