import { formatHm } from "@/lib/minutes";
import type { ForecastFacts, PhaseRisk, RiskCode } from "./domain/risk";

/** AI を使わないときの見通しコメント（テンプレート） */

export type ForecastComment = {
  headline: string;
  points: string[];
  actions: string[];
};

function phaseLine(r: PhaseRisk): string {
  const rate = r.burnRate === null ? "" : `（消化率 ${r.burnRate}%）`;
  switch (r.code) {
    case "OVER_BUDGET":
      return `${r.phase} は実績 ${formatHm(r.actualMinutes)} で予算 ${formatHm(r.budgetMinutes)} を超えています${rate}。`;
    case "FORECAST_OVER":
      return `${r.phase} は着地見込み ${formatHm(r.forecastMinutes)} が予算 ${formatHm(r.budgetMinutes)} を上回ります${rate}。`;
    case "NEAR_BUDGET":
      return `${r.phase} の消化率が 80% を超えました${rate}。`;
    case "REMAINING_NOT_UPDATED":
      return `${r.phase} の消化率が 80% を超えましたが、残り見込みが未入力です${rate}。`;
    default:
      return `${r.phase} を確認してください${rate}。`;
  }
}

const ACTIONS: Partial<Record<RiskCode, string>> = {
  OVER_BUDGET: "超過分の扱い（追加見積・範囲の調整）を関係者と相談する",
  FORECAST_OVER: "残り作業を洗い出し、残り見込みと人員配置を見直す",
  NEAR_BUDGET: "残り見込みが妥当か、今週中に確認する",
  REMAINING_NOT_UPDATED: "工程ごとの残り見込みを入力して、着地を確かめる",
  PACE_OVER: "直近のペースが速いため、作業の優先度を見直す",
  PERIOD_ENDING: "終了日までに残り作業が収まるか確認する",
};

export function forecastTemplate(f: ForecastFacts): ForecastComment {
  const points: string[] = f.risks.slice(0, 3).map(phaseLine);
  if (
    f.projectRisks.includes("PACE_OVER") &&
    f.paceProjectionMinutes !== null &&
    points.length < 3
  ) {
    points.push(
      `直近 4 週のペース（週 ${formatHm(f.weeklyPaceMinutes)}）が続くと、実績は ${formatHm(f.paceProjectionMinutes)} になり予算を超えます。`,
    );
  }
  if (
    f.projectRisks.includes("PERIOD_ENDING") &&
    f.remainingWorkdays !== null &&
    points.length < 3
  ) {
    points.push(`終了日まで残り ${f.remainingWorkdays} 営業日です。`);
  }
  const codes = [
    ...new Set([...f.risks.map((r) => r.code), ...f.projectRisks]),
  ];
  const actions = codes
    .map((c) => ACTIONS[c])
    .filter((a): a is string => Boolean(a))
    .slice(0, 3);

  let headline: string;
  if (codes.includes("OVER_BUDGET") || codes.includes("FORECAST_OVER"))
    headline = "予算超過の見込みがあります";
  else if (codes.length > 0) headline = "予算の消化に注意が必要です";
  else headline = "予算内で順調に進んでいます";

  if (points.length === 0) {
    points.push(
      f.burnRate === null
        ? "予算工数が未設定のため、消化率は計算していません。"
        : `全体の消化率は ${f.burnRate}%、着地見込みは ${formatHm(f.forecastMinutes)} です。`,
    );
  }
  return { headline, points, actions };
}
