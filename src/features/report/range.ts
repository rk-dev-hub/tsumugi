import { addMonths } from "@/features/timesheet/domain/period";

const YM = /^\d{4}-(0[1-9]|1[0-2])$/;
export const MAX_MONTHS = 12;

/** クエリの期間を検証する。不正なら直近 3 か月。最大 12 か月。 */
export function reportRange(
  fromRaw: string | undefined,
  toRaw: string | undefined,
  today: string,
) {
  const thisMonth = today.slice(0, 7);
  let to = toRaw && YM.test(toRaw) ? toRaw : thisMonth;
  let from = fromRaw && YM.test(fromRaw) ? fromRaw : addMonths(to, -2);
  if (from > to) [from, to] = [to, from];
  if (addMonths(from, MAX_MONTHS - 1) < to)
    from = addMonths(to, -(MAX_MONTHS - 1));
  return { from, to };
}

export const AXES = [
  "project",
  "client",
  "user",
  "department",
  "category",
] as const;
