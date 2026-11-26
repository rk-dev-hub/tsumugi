import { jstDateStr } from "@/lib/datetime";

/** 今日（JST）。テストで固定できるよう TSUMUGI_TODAY を優先する（本番では未設定）。 */
export function todayJst(): string {
  const fixed = process.env.TSUMUGI_TODAY;
  if (
    fixed &&
    /^\d{4}-\d{2}-\d{2}$/.test(fixed) &&
    process.env.NODE_ENV !== "production"
  )
    return fixed;
  return jstDateStr(new Date());
}

export function d(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function ds(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 現在の時（JST、0〜23） */
export function jstHourNow(): number {
  return new Date(Date.now() + 9 * 3600_000).getUTCHours();
}
