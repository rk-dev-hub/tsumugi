import { beforeEach, describe, expect, it } from "vitest";
import { createEntry } from "@/features/timesheet/usecase";
import { forecastFactsOf, getProjectDetail } from "@/features/project/usecase";
import { explainForecast, monthlyReport } from "@/features/tsumugi/tasks";
import { prisma } from "@/lib/prisma";
import { seedBasic, type Fx } from "./fixtures";

let fx: Fx;
beforeEach(async () => {
  fx = await seedBasic();
});

describe("Tsumugi（API キーなし）", () => {
  it("見通しコメントはテンプレートで返り、DB は書き換えない", async () => {
    await createEntry(fx.alice.id, {
      date: "2026-11-24",
      startMinute: 0,
      endMinute: 660,
      phaseId: fx.work.phaseId,
      workCategoryId: null,
      note: "",
    });
    const detail = await getProjectDetail(fx.admin, fx.work.id);
    const facts = forecastFactsOf(detail!);
    const c = await explainForecast(fx.admin, facts!);
    expect(c.ai).toBe(false);
    expect(c.value.points.join("")).toContain("設計");
    expect(await prisma.aiUsageLog.count()).toBe(0);
  });

  it("月次レポートは管理者・締めた月だけ", async () => {
    expect(await monthlyReport(fx.pm, "2026-10")).toBeNull();
    expect(await monthlyReport(fx.admin, "2026-10")).toBeNull();
    await prisma.closingMonth.create({
      data: { yearMonth: "2026-10", closed: true, closedAt: new Date() },
    });
    const r = await monthlyReport(fx.admin, "2026-10");
    expect(r?.ai).toBe(false);
    expect(r?.value.title).toContain("2026 年 10 月");
  });
});
