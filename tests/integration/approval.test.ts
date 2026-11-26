import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createEntry,
  saveAttendance,
  updateEntry,
} from "@/features/timesheet/usecase";
import {
  decidePeriod,
  listApprovals,
  submitPeriod,
  withdrawPeriod,
} from "@/features/approval/usecase";
import {
  closeMonth,
  closingBlockers,
  reopenMonth,
} from "@/features/closing/usecase";
import { seedBasic, type Fx } from "./fixtures";

let fx: Fx;
beforeEach(async () => {
  fx = await seedBasic();
});

async function workDay(userId: string, phaseId: string, date: string) {
  const r = await createEntry(userId, {
    date,
    startMinute: 540,
    endMinute: 1020,
    phaseId,
    workCategoryId: null,
    note: "",
  });
  if (!r.ok) throw new Error(r.error.message);
  await saveAttendance(userId, {
    date,
    startMinute: 540,
    endMinute: 1080,
    breakMinutes: 60,
    gapReason: "",
  });
  return r.value.id;
}

describe("提出と承認", () => {
  it("提出すると編集できず、承認者だけが判断できる", async () => {
    const id = await workDay(fx.alice.id, fx.work.phaseId, "2026-11-16");
    expect((await submitPeriod(fx.alice, "2026-11-16")).ok).toBe(true);

    const locked = await updateEntry(fx.alice.id, id, {
      date: "2026-11-16",
      startMinute: 540,
      endMinute: 600,
      phaseId: fx.work.phaseId,
      workCategoryId: null,
      note: "",
    });
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error.code).toBe("PERIOD_LOCKED");

    const period = await prisma.timesheetPeriod.findFirstOrThrow({
      where: { userId: fx.alice.id },
    });
    expect(period.totalMinutes).toBe(480);

    // 承認者でないマネージャーには存在を伏せる
    const other = await decidePeriod(fx.mgr, period.id, "APPROVE", "");
    expect(!other.ok && other.error.code).toBe("NOT_FOUND");
    expect(await listApprovals(fx.mgr, "SUBMITTED")).toHaveLength(0);
    // 差戻しにはコメントが必要
    expect((await decidePeriod(fx.pm, period.id, "REJECT", " ")).ok).toBe(
      false,
    );

    expect(await listApprovals(fx.pm, "SUBMITTED")).toHaveLength(1);
    expect((await decidePeriod(fx.pm, period.id, "APPROVE", "")).ok).toBe(true);
    expect(
      (
        await prisma.timesheetPeriod.findUniqueOrThrow({
          where: { id: period.id },
        })
      ).status,
    ).toBe("APPROVED");
    // 承認済みは取り下げられない
    expect((await withdrawPeriod(fx.alice, "2026-11-16")).ok).toBe(false);
    // 履歴と監査ログが残る
    expect(
      await prisma.approvalEvent.count({ where: { periodId: period.id } }),
    ).toBe(2);
    expect(
      await prisma.auditLog.count({ where: { action: "TIMESHEET_APPROVE" } }),
    ).toBe(1);
  });

  it("自分の提出は管理者でも承認できない", async () => {
    await workDay(fx.pm.id, fx.work.phaseId, "2026-11-16");
    expect((await submitPeriod(fx.pm, "2026-11-16")).ok).toBe(true);
    const period = await prisma.timesheetPeriod.findFirstOrThrow({
      where: { userId: fx.pm.id },
    });
    const self = await decidePeriod(fx.pm, period.id, "APPROVE", "");
    expect(!self.ok && self.error.code).toBe("SELF_APPROVAL");
    expect((await decidePeriod(fx.admin, period.id, "APPROVE", "")).ok).toBe(
      true,
    );
  });

  it("勤務時間がない日・理由のない大きな差があると提出できない", async () => {
    await createEntry(fx.alice.id, {
      date: "2026-11-16",
      startMinute: 540,
      endMinute: 600,
      phaseId: fx.work.phaseId,
      workCategoryId: null,
      note: "",
    });
    expect((await submitPeriod(fx.alice, "2026-11-16")).ok).toBe(false);
    await saveAttendance(fx.alice.id, {
      date: "2026-11-16",
      startMinute: 540,
      endMinute: 1080,
      breakMinutes: 60,
      gapReason: "",
    });
    expect((await submitPeriod(fx.alice, "2026-11-16")).ok).toBe(false);
    await saveAttendance(fx.alice.id, {
      date: "2026-11-16",
      startMinute: 540,
      endMinute: 1080,
      breakMinutes: 60,
      gapReason: "社外の打ち合わせ待ち",
    });
    expect((await submitPeriod(fx.alice, "2026-11-16")).ok).toBe(true);
  });

  it("承認履歴と監査ログは変更・削除できない", async () => {
    await workDay(fx.alice.id, fx.work.phaseId, "2026-11-16");
    await submitPeriod(fx.alice, "2026-11-16");
    const ev = await prisma.approvalEvent.findFirstOrThrow();
    await expect(
      prisma.approvalEvent.update({
        where: { id: ev.id },
        data: { comment: "改ざん" },
      }),
    ).rejects.toThrow();
    await expect(
      prisma.approvalEvent.delete({ where: { id: ev.id } }),
    ).rejects.toThrow();
    const log = await prisma.auditLog.findFirstOrThrow();
    await expect(
      prisma.auditLog.delete({ where: { id: log.id } }),
    ).rejects.toThrow();
  });
});

describe("月次締め", () => {
  it("未承認があると締められず、締めると人件費が確定して変更できなくなる", async () => {
    const id = await workDay(fx.alice.id, fx.work.phaseId, "2026-10-13");
    const blockers = await closingBlockers("2026-10");
    expect(blockers).toHaveLength(1);
    expect((await closeMonth(fx.admin, "2026-10")).ok).toBe(false);

    await submitPeriod(fx.alice, "2026-10-13");
    const period = await prisma.timesheetPeriod.findFirstOrThrow();
    await decidePeriod(fx.pm, period.id, "APPROVE", "");

    // 管理者以外は締められない・終わっていない月は締められない
    expect((await closeMonth(fx.pm, "2026-10")).ok).toBe(false);
    expect((await closeMonth(fx.admin, "2026-11")).ok).toBe(false);

    expect((await closeMonth(fx.admin, "2026-10")).ok).toBe(true);
    const cost = await prisma.monthlyLaborCost.findFirstOrThrow({
      where: { yearMonth: "2026-10" },
    });
    expect(cost).toMatchObject({ minutes: 480, laborCost: 24_000 });

    // 締めた月は承認の取消も工数の変更もできない
    expect(
      (await decidePeriod(fx.pm, period.id, "CANCEL_APPROVAL", "誤り")).ok,
    ).toBe(false);
    const edit = await updateEntry(fx.alice.id, id, {
      date: "2026-10-13",
      startMinute: 540,
      endMinute: 600,
      phaseId: fx.work.phaseId,
      workCategoryId: null,
      note: "",
    });
    expect(edit.ok).toBe(false);

    // 単価を変えても確定値は変わらない
    await prisma.costRate.updateMany({
      where: { userId: fx.alice.id },
      data: { hourlyRate: 9000 },
    });
    expect(
      (
        await prisma.monthlyLaborCost.findFirstOrThrow({
          where: { yearMonth: "2026-10" },
        })
      ).laborCost,
    ).toBe(24_000);

    // 解除には理由が必要
    expect((await reopenMonth(fx.admin, "2026-10", "")).ok).toBe(false);
    expect(
      (await reopenMonth(fx.admin, "2026-10", "単価の誤りを修正")).ok,
    ).toBe(true);
    expect(await prisma.monthlyLaborCost.count()).toBe(0);
  });
});
