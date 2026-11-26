/**
 * 労務費: 工数 × その日に適用される時間単価。
 * （メンバー × プロジェクト × 月）の単位で、単価ごとに分を合計してから
 * ⌊分 × 単価 ÷ 60⌋ を足し合わせる。整数演算だけで計算する。
 */

export type Rate = { effectiveFrom: string; hourlyRate: number };

/** 日付に適用する単価（effectiveFrom ≤ d のうち最新）。なければ null。 */
export function rateOn(rates: readonly Rate[], dateStr: string): number | null {
  let best: Rate | null = null;
  for (const r of rates) {
    if (
      r.effectiveFrom <= dateStr &&
      (!best || r.effectiveFrom > best.effectiveFrom)
    ) {
      best = r;
    }
  }
  return best ? best.hourlyRate : null;
}

export type EntryForCost = {
  userId: string;
  projectId: string;
  date: string;
  minutes: number;
};

export type LaborCostRow = {
  yearMonth: string;
  userId: string;
  projectId: string;
  minutes: number;
  laborCost: number;
  unratedMinutes: number;
};

export function floorCost(minutes: number, hourlyRate: number): number {
  // minutes × rate は 1,440 × 100,000 × 31 程度までなので安全な整数に収まる
  return Math.floor((minutes * hourlyRate) / 60);
}

/** 工数の一覧から（月 × メンバー × プロジェクト）ごとの労務費を計算する */
export function computeLaborCosts(
  entries: readonly EntryForCost[],
  ratesByUser: ReadonlyMap<string, readonly Rate[]>,
): LaborCostRow[] {
  // key → rate(or "none") → minutes
  const groups = new Map<string, Map<string, number>>();
  for (const e of entries) {
    const key = `${e.date.slice(0, 7)}|${e.userId}|${e.projectId}`;
    const rate = rateOn(ratesByUser.get(e.userId) ?? [], e.date);
    const rk = rate === null ? "none" : String(rate);
    let g = groups.get(key);
    if (!g) groups.set(key, (g = new Map()));
    g.set(rk, (g.get(rk) ?? 0) + e.minutes);
  }
  const out: LaborCostRow[] = [];
  for (const [key, g] of groups) {
    const [yearMonth, userId, projectId] = key.split("|");
    let minutes = 0;
    let laborCost = 0;
    let unratedMinutes = 0;
    for (const [rk, m] of g) {
      minutes += m;
      if (rk === "none") unratedMinutes += m;
      else laborCost += floorCost(m, Number(rk));
    }
    out.push({
      yearMonth,
      userId,
      projectId,
      minutes,
      laborCost,
      unratedMinutes,
    });
  }
  return out.sort((a, b) =>
    `${a.yearMonth}${a.userId}${a.projectId}`.localeCompare(
      `${b.yearMonth}${b.userId}${b.projectId}`,
    ),
  );
}
