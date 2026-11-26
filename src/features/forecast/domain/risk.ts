import type { ProjectBudget } from "@/features/costing/domain/budget";

/**
 * 予算の見通し（Tsumugi に渡す事実）。計算はすべてここで行い、AI には言葉だけを作らせる。
 */

export type RiskCode =
  | "OVER_BUDGET"
  | "FORECAST_OVER"
  | "NEAR_BUDGET"
  | "PACE_OVER"
  | "REMAINING_NOT_UPDATED"
  | "PERIOD_ENDING";

export type PhaseRisk = {
  phase: string;
  code: RiskCode;
  budgetMinutes: number;
  actualMinutes: number;
  forecastMinutes: number;
  burnRate: number | null;
};

export type ForecastFacts = {
  projectCode: string;
  budgetMinutes: number;
  actualMinutes: number;
  forecastMinutes: number;
  burnRate: number | null;
  /** 直近 4 週の週平均工数（分） */
  weeklyPaceMinutes: number;
  /** 期間の残り営業日（終了日がなければ null） */
  remainingWorkdays: number | null;
  /** 直近ペースのまま終了日まで進んだ場合の実績（参考値） */
  paceProjectionMinutes: number | null;
  risks: PhaseRisk[];
  projectRisks: RiskCode[];
  cost?: { grossMargin: number | null; forecastProfit: number | null };
};

export function buildForecastFacts(input: {
  projectCode: string;
  budget: ProjectBudget;
  weeklyPaceMinutes: number;
  remainingWorkdays: number | null;
  cost?: ForecastFacts["cost"];
}): ForecastFacts {
  const { budget } = input;
  const risks: PhaseRisk[] = [];
  for (const p of budget.phases) {
    const base = {
      phase: p.name,
      budgetMinutes: p.budgetMinutes,
      actualMinutes: p.actualMinutes,
      forecastMinutes: p.forecast,
      burnRate: p.burnRate,
    };
    if (p.budgetMinutes <= 0) continue;
    if (p.actualMinutes >= p.budgetMinutes)
      risks.push({ ...base, code: "OVER_BUDGET" });
    else if (p.forecast > p.budgetMinutes)
      risks.push({ ...base, code: "FORECAST_OVER" });
    else if (p.actualMinutes * 10 >= p.budgetMinutes * 8) {
      risks.push({
        ...base,
        code: p.remainingIsEstimate ? "REMAINING_NOT_UPDATED" : "NEAR_BUDGET",
      });
    }
  }

  const paceProjectionMinutes =
    input.remainingWorkdays === null
      ? null
      : budget.actualMinutes +
        Math.round((input.weeklyPaceMinutes * input.remainingWorkdays) / 5);

  const projectRisks: RiskCode[] = [];
  if (
    paceProjectionMinutes !== null &&
    budget.budgetMinutes > 0 &&
    paceProjectionMinutes > budget.budgetMinutes &&
    budget.forecast <= budget.budgetMinutes
  ) {
    projectRisks.push("PACE_OVER");
  }
  if (
    input.remainingWorkdays !== null &&
    input.remainingWorkdays <= 10 &&
    budget.remaining > 0
  ) {
    projectRisks.push("PERIOD_ENDING");
  }

  return {
    projectCode: input.projectCode,
    budgetMinutes: budget.budgetMinutes,
    actualMinutes: budget.actualMinutes,
    forecastMinutes: budget.forecast,
    burnRate: budget.burnRate,
    weeklyPaceMinutes: input.weeklyPaceMinutes,
    remainingWorkdays: input.remainingWorkdays,
    paceProjectionMinutes,
    risks,
    projectRisks,
    cost: input.cost,
  };
}
