/**
 * 国民の祝日を規則から計算する（2022〜2099 年）。
 * 固定日・ハッピーマンデー・春分/秋分・振替休日・国民の休日に対応する。
 */

function ymd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** m 月の第 n 月曜日 */
function nthMonday(y: number, m: number, n: number): number {
  const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const firstMonday = 1 + ((8 - firstDow) % 7);
  return firstMonday + (n - 1) * 7;
}

function vernalEquinox(y: number): number {
  return Math.floor(
    20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4),
  );
}

function autumnalEquinox(y: number): number {
  return Math.floor(
    23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4),
  );
}

const cache = new Map<number, Map<string, string>>();

/** その年の祝日（'YYYY-MM-DD' → 名前） */
export function nationalHolidays(year: number): Map<string, string> {
  const hit = cache.get(year);
  if (hit) return hit;

  const base = new Map<string, string>([
    [ymd(year, 1, 1), "元日"],
    [ymd(year, 1, nthMonday(year, 1, 2)), "成人の日"],
    [ymd(year, 2, 11), "建国記念の日"],
    [ymd(year, 2, 23), "天皇誕生日"],
    [ymd(year, 3, vernalEquinox(year)), "春分の日"],
    [ymd(year, 4, 29), "昭和の日"],
    [ymd(year, 5, 3), "憲法記念日"],
    [ymd(year, 5, 4), "みどりの日"],
    [ymd(year, 5, 5), "こどもの日"],
    [ymd(year, 7, nthMonday(year, 7, 3)), "海の日"],
    [ymd(year, 8, 11), "山の日"],
    [ymd(year, 9, nthMonday(year, 9, 3)), "敬老の日"],
    [ymd(year, 9, autumnalEquinox(year)), "秋分の日"],
    [ymd(year, 10, nthMonday(year, 10, 2)), "スポーツの日"],
    [ymd(year, 11, 3), "文化の日"],
    [ymd(year, 11, 23), "勤労感謝の日"],
  ]);

  const result = new Map(base);
  const sorted = [...base.keys()].sort();

  // 振替休日: 祝日が日曜なら、その後の最初の祝日でない日
  for (const d of sorted) {
    const date = new Date(`${d}T00:00:00Z`);
    if (date.getUTCDay() !== 0) continue;
    const next = new Date(date);
    do {
      next.setUTCDate(next.getUTCDate() + 1);
    } while (result.has(next.toISOString().slice(0, 10)));
    result.set(next.toISOString().slice(0, 10), "振替休日");
  }

  // 国民の休日: 前日と翌日が祝日で、その日が祝日でない日（日曜は除く）
  for (const d of sorted) {
    const date = new Date(`${d}T00:00:00Z`);
    const mid = new Date(date);
    mid.setUTCDate(mid.getUTCDate() + 1);
    const after = new Date(date);
    after.setUTCDate(after.getUTCDate() + 2);
    const midStr = mid.toISOString().slice(0, 10);
    if (
      base.has(after.toISOString().slice(0, 10)) &&
      !result.has(midStr) &&
      mid.getUTCDay() !== 0
    ) {
      result.set(midStr, "国民の休日");
    }
  }

  cache.set(year, result);
  return result;
}

export function nationalHolidayName(dateStr: string): string | null {
  const y = Number(dateStr.slice(0, 4));
  return nationalHolidays(y).get(dateStr) ?? null;
}

/** 所定労働日か（土日・祝日・会社の休日以外） */
export function isWorkday(
  dateStr: string,
  companyHolidays: ReadonlySet<string> = new Set(),
): boolean {
  const dow = new Date(`${dateStr}T00:00:00Z`).getUTCDay();
  if (dow === 0 || dow === 6) return false;
  if (companyHolidays.has(dateStr)) return false;
  return nationalHolidayName(dateStr) === null;
}
