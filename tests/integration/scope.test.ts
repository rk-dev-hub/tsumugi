import { beforeEach, describe, expect, it } from "vitest";
import { createEntry, saveAttendance } from "@/features/timesheet/usecase";
import {
  getProjectDetail,
  listProjects,
  updateProject,
} from "@/features/project/usecase";
import { buildReport } from "@/features/report/usecase";
import {
  getPeriodForApprover,
  submitPeriod,
} from "@/features/approval/usecase";
import { prisma } from "@/lib/prisma";
import { seedBasic, type Fx } from "./fixtures";

let fx: Fx;
beforeEach(async () => {
  fx = await seedBasic();
  for (const [u, phase] of [
    [fx.alice.id, fx.work.phaseId],
    [fx.bob.id, fx.internal.phaseId],
  ] as const) {
    await createEntry(u, {
      date: "2026-11-24",
      startMinute: 540,
      endMinute: 660,
      phaseId: phase,
      workCategoryId: null,
      note: "",
    });
    await saveAttendance(u, {
      date: "2026-11-24",
      startMinute: 540,
      endMinute: 660,
      breakMinutes: 0,
      gapReason: "",
    });
  }
});

describe("見える範囲", () => {
  it("メンバーは参加中の業務と社内だけ。予算・原価は見えない", async () => {
    const alice = await listProjects(fx.alice);
    expect(alice.map((p) => p.code).sort()).toEqual(["IN", "W1"]);
    expect(alice.every((p) => p.budget === null)).toBe(true);
    expect((await listProjects(fx.bob)).map((p) => p.code)).toEqual(["IN"]);
    expect(await getProjectDetail(fx.bob, fx.work.id)).toBeNull();
    const d = await getProjectDetail(fx.alice, fx.work.id);
    expect(d?.budget).toBeNull();
    expect(d?.cost).toBeNull();
    expect(d?.project.revenueAmount).toBeNull();
  });

  it("原価は管理者と、許可された PM だけ", async () => {
    expect(
      (await getProjectDetail(fx.admin, fx.work.id))?.cost?.laborCost,
    ).toBe(6000);
    expect((await getProjectDetail(fx.pm, fx.work.id))?.cost).not.toBeNull();
    await prisma.user.update({
      where: { id: fx.pm.id },
      data: { canViewCost: false },
    });
    const d = await getProjectDetail(fx.pm, fx.work.id);
    expect(d?.budget).not.toBeNull();
    expect(d?.cost).toBeNull();
  });

  it("PM 以外のマネージャーはプロジェクトを編集できない", async () => {
    const input = {
      code: "W1",
      name: "乗っ取り",
      kind: "WORK" as const,
      status: "ACTIVE" as const,
      startDate: "2026-01-01",
      colorIndex: 0,
      note: "",
      memberIds: [],
    };
    const r = await updateProject(fx.mgr, fx.work.id, input);
    expect(r.ok).toBe(false);
  });

  it("レポートはメンバーは自分だけ、人件費は管理者だけ", async () => {
    const mine = await buildReport(fx.alice, "user", "2026-11", "2026-11");
    expect(mine.rows.map((r) => r.label)).toEqual(["アリス"]);
    expect(mine.showCost).toBe(false);
    const pm = await buildReport(fx.pm, "user", "2026-11", "2026-11");
    expect(pm.rows.map((r) => r.label)).toEqual(["アリス"]);
    expect(pm.laborCost).toBeNull();
    const all = await buildReport(fx.admin, "user", "2026-11", "2026-11");
    expect(all.rows).toHaveLength(2);
    expect(all.laborCost).toBe(12_000);
  });

  it("承認者でない人は提出内容を見られない", async () => {
    await submitPeriod(fx.alice, "2026-11-24");
    const p = await prisma.timesheetPeriod.findFirstOrThrow();
    expect(await getPeriodForApprover(fx.mgr, p.id)).toBeNull();
    expect(await getPeriodForApprover(fx.bob, p.id)).toBeNull();
    expect(await getPeriodForApprover(fx.pm, p.id)).not.toBeNull();
  });
});
