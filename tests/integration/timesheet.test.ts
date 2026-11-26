import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createEntries,
  createEntry,
  deleteEntry,
  saveAttendance,
  updateEntry,
} from "@/features/timesheet/usecase";
import { seedBasic, type Fx } from "./fixtures";

let fx: Fx;
beforeEach(async () => {
  fx = await seedBasic();
});

const entry = (phaseId: string, date: string, s: number, e: number) => ({
  date,
  startMinute: s,
  endMinute: e,
  phaseId,
  workCategoryId: null,
  note: "",
});

describe("工数の登録", () => {
  it("重なる時間帯は登録できない（アプリと DB の両方で防ぐ）", async () => {
    expect(
      (
        await createEntry(
          fx.alice.id,
          entry(fx.work.phaseId, "2026-11-24", 540, 600),
        )
      ).ok,
    ).toBe(true);
    const r = await createEntry(
      fx.alice.id,
      entry(fx.internal.phaseId, "2026-11-24", 570, 630),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("OVERLAP");
    // 端が接するのはよい
    expect(
      (
        await createEntry(
          fx.alice.id,
          entry(fx.internal.phaseId, "2026-11-24", 600, 630),
        )
      ).ok,
    ).toBe(true);
    // アプリを通さずに入れても DB の制約で止まる
    await expect(
      prisma.timeEntry.create({
        data: {
          userId: fx.alice.id,
          projectId: fx.work.id,
          phaseId: fx.work.phaseId,
          date: new Date("2026-11-24T00:00:00Z"),
          startMinute: 550,
          endMinute: 560,
          minutes: 10,
        },
      }),
    ).rejects.toThrow();
  });

  it("参加していない業務プロジェクトには入力できない（社内は全員できる）", async () => {
    const r = await createEntry(
      fx.bob.id,
      entry(fx.work.phaseId, "2026-11-24", 540, 600),
    );
    expect(r.ok).toBe(false);
    expect(
      (
        await createEntry(
          fx.bob.id,
          entry(fx.internal.phaseId, "2026-11-24", 540, 600),
        )
      ).ok,
    ).toBe(true);
  });

  it("まとめて登録は 1 件でも失敗したら何も登録しない", async () => {
    const r = await createEntries(fx.alice.id, [
      entry(fx.work.phaseId, "2026-11-24", 540, 600),
      entry(fx.work.phaseId, "2026-11-24", 590, 620),
    ]);
    expect(r.ok).toBe(false);
    expect(await prisma.timeEntry.count()).toBe(0);
  });

  it("他人の工数は変更・削除できない", async () => {
    const r = await createEntry(
      fx.alice.id,
      entry(fx.work.phaseId, "2026-11-24", 540, 600),
    );
    if (!r.ok) throw new Error();
    expect(
      (
        await updateEntry(
          fx.bob.id,
          r.value.id,
          entry(fx.internal.phaseId, "2026-11-24", 540, 600),
        )
      ).ok,
    ).toBe(false);
    expect((await deleteEntry(fx.bob.id, r.value.id)).ok).toBe(false);
    expect(await prisma.timeEntry.count()).toBe(1);
  });

  it("7 日より先の日付は入力できない", async () => {
    expect(
      (
        await createEntry(
          fx.alice.id,
          entry(fx.internal.phaseId, "2026-12-03", 540, 600),
        )
      ).ok,
    ).toBe(false);
  });

  it("勤務時間は翌日の時刻まで入力できる", async () => {
    expect(
      (
        await saveAttendance(fx.alice.id, {
          date: "2026-11-24",
          startMinute: 1200,
          endMinute: 1560,
          breakMinutes: 30,
          gapReason: "",
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await saveAttendance(fx.alice.id, {
          date: "2026-11-24",
          startMinute: 540,
          endMinute: 500,
          breakMinutes: 0,
          gapReason: "",
        })
      ).ok,
    ).toBe(false);
  });
});
