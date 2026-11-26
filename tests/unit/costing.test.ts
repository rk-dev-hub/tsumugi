import { describe, expect, it } from "vitest";
import {
  computeLaborCosts,
  floorCost,
  rateOn,
} from "@/features/costing/domain/labor";
import {
  budgetLevel,
  percent,
  summarizeCost,
  summarizePhase,
  summarizeProject,
} from "@/features/costing/domain/budget";
import { buildForecastFacts } from "@/features/forecast/domain/risk";
import { forecastTemplate } from "@/features/forecast/templates";

describe("労務費", () => {
  const rates = new Map([
    [
      "u1",
      [
        { effectiveFrom: "2026-01-01", hourlyRate: 4000 },
        { effectiveFrom: "2026-11-16", hourlyRate: 4500 },
      ],
    ],
  ]);
  it("その日に適用される単価", () => {
    expect(rateOn(rates.get("u1")!, "2025-12-31")).toBeNull();
    expect(rateOn(rates.get("u1")!, "2026-11-15")).toBe(4000);
    expect(rateOn(rates.get("u1")!, "2026-11-16")).toBe(4500);
  });
  it("単価ごとに分を合計してから切り捨てる", () => {
    // 10 分 × 3 件 = 30 分 → 2,000 円（1 件ずつ切り捨てると 666×3=1,998 円になる）
    const rows = computeLaborCosts(
      [
        { userId: "u1", projectId: "p", date: "2026-11-02", minutes: 10 },
        { userId: "u1", projectId: "p", date: "2026-11-03", minutes: 10 },
        { userId: "u1", projectId: "p", date: "2026-11-04", minutes: 10 },
        { userId: "u1", projectId: "p", date: "2026-11-20", minutes: 7 },
        { userId: "u2", projectId: "p", date: "2026-11-20", minutes: 60 },
      ],
      rates,
    );
    expect(rows).toEqual([
      {
        yearMonth: "2026-11",
        userId: "u1",
        projectId: "p",
        minutes: 37,
        laborCost: 2000 + floorCost(7, 4500),
        unratedMinutes: 0,
      },
      {
        yearMonth: "2026-11",
        userId: "u2",
        projectId: "p",
        minutes: 60,
        laborCost: 0,
        unratedMinutes: 60,
      },
    ]);
    expect(floorCost(7, 4500)).toBe(525);
  });
});

describe("予実", () => {
  it("割合と状態", () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBeNull();
    expect(budgetLevel(0, 10, 10)).toBe("NONE");
    expect(budgetLevel(100, 50, 90)).toBe("OK");
    expect(budgetLevel(100, 80, 95)).toBe("CAUTION");
    expect(budgetLevel(100, 60, 101)).toBe("OVER");
    expect(budgetLevel(100, 100, 100)).toBe("OVER");
  });
  it("残り見込みが未入力なら 予算 − 実績", () => {
    const p = summarizePhase({
      id: "a",
      name: "設計",
      budgetMinutes: 600,
      remainingMinutes: null,
      actualMinutes: 450,
    });
    expect(p).toMatchObject({
      remaining: 150,
      remainingIsEstimate: true,
      forecast: 600,
      variance: 0,
      burnRate: 75,
      level: "OK",
    });
    const q = summarizePhase({
      id: "b",
      name: "開発",
      budgetMinutes: 600,
      remainingMinutes: 300,
      actualMinutes: 450,
    });
    expect(q).toMatchObject({ forecast: 750, variance: 150, level: "OVER" });
  });
  it("プロジェクト合計", () => {
    const b = summarizeProject([
      {
        id: "a",
        name: "設計",
        budgetMinutes: 600,
        remainingMinutes: 0,
        actualMinutes: 620,
      },
      {
        id: "b",
        name: "開発",
        budgetMinutes: 1200,
        remainingMinutes: null,
        actualMinutes: 300,
      },
    ]);
    expect(b).toMatchObject({
      budgetMinutes: 1800,
      actualMinutes: 920,
      remaining: 900,
      forecast: 1820,
      variance: 20,
      level: "OVER",
    });
  });
  it("原価と粗利（売上なしなら粗利は出さない）", () => {
    const c = summarizeCost({
      revenueAmount: 1_000_000,
      laborCost: 500_000,
      ratedMinutes: 6000,
      outsourcing: 100_000,
      expense: 10_000,
      remainingMinutes: 600,
    });
    expect(c).toMatchObject({
      cost: 610_000,
      grossProfit: 390_000,
      grossMargin: 39,
      averageRate: 5000,
      forecastCost: 660_000,
      forecastProfit: 340_000,
    });
    const n = summarizeCost({
      revenueAmount: null,
      laborCost: 1,
      ratedMinutes: 0,
      outsourcing: 0,
      expense: 0,
      remainingMinutes: 0,
    });
    expect(n).toMatchObject({
      grossProfit: null,
      grossMargin: null,
      averageRate: null,
      forecastCost: null,
    });
  });
});

describe("予算の見通し", () => {
  const budget = summarizeProject([
    {
      id: "a",
      name: "設計",
      budgetMinutes: 600,
      remainingMinutes: 0,
      actualMinutes: 650,
    },
    {
      id: "b",
      name: "開発",
      budgetMinutes: 1200,
      remainingMinutes: 500,
      actualMinutes: 800,
    },
    {
      id: "c",
      name: "テスト",
      budgetMinutes: 500,
      remainingMinutes: null,
      actualMinutes: 420,
    },
    {
      id: "d",
      name: "運用",
      budgetMinutes: 300,
      remainingMinutes: null,
      actualMinutes: 0,
    },
  ]);
  it("工程ごとのリスクを判定する", () => {
    const f = buildForecastFacts({
      projectCode: "X",
      budget,
      weeklyPaceMinutes: 600,
      remainingWorkdays: 8,
    });
    expect(f.risks.map((r) => [r.phase, r.code])).toEqual([
      ["設計", "OVER_BUDGET"],
      ["開発", "FORECAST_OVER"],
      ["テスト", "REMAINING_NOT_UPDATED"],
    ]);
    expect(f.projectRisks).toContain("PERIOD_ENDING");
    expect(f.paceProjectionMinutes).toBe(budget.actualMinutes + 960);
  });
  it("テンプレートの文面は事実の数値だけを使う", () => {
    const f = buildForecastFacts({
      projectCode: "X",
      budget,
      weeklyPaceMinutes: 600,
      remainingWorkdays: 8,
    });
    const t = forecastTemplate(f);
    expect(t.headline).toBeTruthy();
    expect(t.points.length).toBeGreaterThan(0);
    expect(t.points.join("")).toContain("設計");
  });
  it("問題がなければ順調", () => {
    const ok = summarizeProject([
      {
        id: "a",
        name: "全体",
        budgetMinutes: 6000,
        remainingMinutes: null,
        actualMinutes: 1000,
      },
    ]);
    const f = buildForecastFacts({
      projectCode: "X",
      budget: ok,
      weeklyPaceMinutes: 300,
      remainingWorkdays: 40,
    });
    expect(f.risks).toEqual([]);
    expect(f.projectRisks).toEqual([]);
  });
});
