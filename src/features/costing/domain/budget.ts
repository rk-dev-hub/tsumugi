/** 予実・着地見込み・原価・粗利 */

export type PhaseInput = {
  id: string;
  name: string;
  budgetMinutes: number;
  remainingMinutes: number | null;
  actualMinutes: number;
};

export type PhaseSummary = PhaseInput & {
  /** 消化率（%、小数第 1 位）。予算 0 なら null */
  burnRate: number | null;
  /** 残り見込み（未入力なら max(予算 − 実績, 0)） */
  remaining: number;
  remainingIsEstimate: boolean;
  forecast: number;
  /** 着地見込み − 予算（正なら超過） */
  variance: number;
  level: BudgetLevel;
};

export type BudgetLevel = "OK" | "CAUTION" | "OVER" | "NONE";

/** 割合（%）を小数第 1 位で四捨五入。分母 0 は null */
export function percent(num: number, den: number): number | null {
  if (den <= 0) return null;
  return Math.round((num * 1000) / den) / 10;
}

export function budgetLevel(
  budget: number,
  actual: number,
  forecast: number,
): BudgetLevel {
  if (budget <= 0) return "NONE";
  if (actual >= budget || forecast > budget) return "OVER";
  if (actual * 10 >= budget * 8) return "CAUTION";
  return "OK";
}

export function summarizePhase(p: PhaseInput): PhaseSummary {
  const remainingIsEstimate = p.remainingMinutes === null;
  const remaining =
    p.remainingMinutes ?? Math.max(p.budgetMinutes - p.actualMinutes, 0);
  const forecast = p.actualMinutes + remaining;
  return {
    ...p,
    burnRate: percent(p.actualMinutes, p.budgetMinutes),
    remaining,
    remainingIsEstimate,
    forecast,
    variance: forecast - p.budgetMinutes,
    level: budgetLevel(p.budgetMinutes, p.actualMinutes, forecast),
  };
}

export type ProjectBudget = {
  phases: PhaseSummary[];
  budgetMinutes: number;
  actualMinutes: number;
  remaining: number;
  forecast: number;
  variance: number;
  burnRate: number | null;
  level: BudgetLevel;
};

export function summarizeProject(phases: readonly PhaseInput[]): ProjectBudget {
  const ps = phases.map(summarizePhase);
  const budgetMinutes = ps.reduce((s, p) => s + p.budgetMinutes, 0);
  const actualMinutes = ps.reduce((s, p) => s + p.actualMinutes, 0);
  const remaining = ps.reduce((s, p) => s + p.remaining, 0);
  const forecast = actualMinutes + remaining;
  return {
    phases: ps,
    budgetMinutes,
    actualMinutes,
    remaining,
    forecast,
    variance: forecast - budgetMinutes,
    burnRate: percent(actualMinutes, budgetMinutes),
    level: budgetLevel(budgetMinutes, actualMinutes, forecast),
  };
}

export type CostInput = {
  revenueAmount: number | null;
  laborCost: number;
  /** 単価のある実績の分（平均単価の計算用） */
  ratedMinutes: number;
  outsourcing: number;
  expense: number;
  remainingMinutes: number;
};

export type CostSummary = {
  laborCost: number;
  outsourcing: number;
  expense: number;
  cost: number;
  grossProfit: number | null;
  grossMargin: number | null;
  /** 実績の平均単価（円/時、整数に切り捨て）。実績がなければ null */
  averageRate: number | null;
  forecastCost: number | null;
  forecastProfit: number | null;
};

export function summarizeCost(c: CostInput): CostSummary {
  const cost = c.laborCost + c.outsourcing + c.expense;
  const hasRevenue = c.revenueAmount !== null && c.revenueAmount > 0;
  const grossProfit = hasRevenue ? c.revenueAmount! - cost : null;
  const grossMargin = hasRevenue
    ? percent(grossProfit!, c.revenueAmount!)
    : null;
  const averageRate =
    c.ratedMinutes > 0 ? Math.floor((c.laborCost * 60) / c.ratedMinutes) : null;
  const forecastCost =
    c.ratedMinutes > 0
      ? cost + Math.floor((c.remainingMinutes * c.laborCost) / c.ratedMinutes)
      : null;
  const forecastProfit =
    hasRevenue && forecastCost !== null
      ? c.revenueAmount! - forecastCost
      : null;
  return {
    laborCost: c.laborCost,
    outsourcing: c.outsourcing,
    expense: c.expense,
    cost,
    grossProfit,
    grossMargin,
    averageRate,
    forecastCost,
    forecastProfit,
  };
}
