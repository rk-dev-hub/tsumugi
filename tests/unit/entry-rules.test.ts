import { describe, expect, it } from "vitest";
import {
  checkProjectRules,
  checkSlotShape,
  findOverlap,
  isShrinkOrMoveOnly,
  isWithinFutureLimit,
  slotsOverlap,
  snapToStep,
  type ProjectForEntry,
} from "@/features/timesheet/domain/entry-rules";

describe("時間帯", () => {
  it("形の検査", () => {
    expect(checkSlotShape({ startMinute: 540, endMinute: 600 })).toBeNull();
    expect(checkSlotShape({ startMinute: 600, endMinute: 600 })).toBe(
      "START_NOT_BEFORE_END",
    );
    expect(checkSlotShape({ startMinute: -1, endMinute: 600 })).toBe(
      "OUT_OF_DAY",
    );
    expect(checkSlotShape({ startMinute: 0, endMinute: 1441 })).toBe(
      "OUT_OF_DAY",
    );
    expect(checkSlotShape({ startMinute: 0.5, endMinute: 60 })).toBe(
      "NOT_INTEGER",
    );
    expect(checkSlotShape({ startMinute: 0, endMinute: 1440 })).toBeNull();
  });

  it("端が接するのは重なりではない", () => {
    expect(
      slotsOverlap(
        { startMinute: 540, endMinute: 600 },
        { startMinute: 600, endMinute: 660 },
      ),
    ).toBe(false);
    expect(
      slotsOverlap(
        { startMinute: 540, endMinute: 601 },
        { startMinute: 600, endMinute: 660 },
      ),
    ).toBe(true);
    expect(
      slotsOverlap(
        { startMinute: 500, endMinute: 700 },
        { startMinute: 600, endMinute: 660 },
      ),
    ).toBe(true);
  });

  it("自分自身は重なりの対象にしない", () => {
    const others = [{ id: "a", startMinute: 540, endMinute: 600 }];
    expect(
      findOverlap({ startMinute: 550, endMinute: 580 }, others, "a"),
    ).toBeNull();
    expect(findOverlap({ startMinute: 550, endMinute: 580 }, others)).toEqual(
      others[0],
    );
  });

  it("刻みに丸める", () => {
    expect(snapToStep(547, 15)).toBe(540);
    expect(snapToStep(548, 15)).toBe(555);
    expect(snapToStep(1450, 15)).toBe(1440);
    expect(snapToStep(-3, 5)).toBe(0);
  });

  it("未来は 7 日後まで", () => {
    expect(isWithinFutureLimit("2026-12-02", "2026-11-25")).toBe(true);
    expect(isWithinFutureLimit("2026-12-03", "2026-11-25")).toBe(false);
  });
});

describe("プロジェクトの規則", () => {
  const base: ProjectForEntry = {
    kind: "WORK",
    status: "ACTIVE",
    startDate: "2026-10-01",
    endDate: "2026-12-31",
    isMember: true,
    phaseActive: true,
    categoryActive: true,
  };
  it("入力できる", () =>
    expect(checkProjectRules(base, "2026-11-25")).toBeNull());
  it("完了・中止は不可", () => {
    expect(
      checkProjectRules({ ...base, status: "COMPLETED" }, "2026-11-25"),
    ).toBe("PROJECT_NOT_OPEN");
    expect(
      checkProjectRules({ ...base, status: "CANCELED" }, "2026-11-25"),
    ).toBe("PROJECT_NOT_OPEN");
  });
  it("期間外は不可", () => {
    expect(checkProjectRules(base, "2026-09-30")).toBe("OUT_OF_PROJECT_PERIOD");
    expect(checkProjectRules(base, "2027-01-01")).toBe("OUT_OF_PROJECT_PERIOD");
    expect(
      checkProjectRules({ ...base, endDate: null }, "2030-01-01"),
    ).toBeNull();
  });
  it("業務はメンバーだけ、社内は全員", () => {
    expect(checkProjectRules({ ...base, isMember: false }, "2026-11-25")).toBe(
      "NOT_A_MEMBER",
    );
    expect(
      checkProjectRules(
        { ...base, kind: "INTERNAL", isMember: false },
        "2026-11-25",
      ),
    ).toBeNull();
  });
  it("無効な工程・分類は不可", () => {
    expect(
      checkProjectRules({ ...base, phaseActive: false }, "2026-11-25"),
    ).toBe("PHASE_INACTIVE");
    expect(
      checkProjectRules({ ...base, categoryActive: false }, "2026-11-25"),
    ).toBe("CATEGORY_INACTIVE");
  });
  it("縮める・動かすだけの判定", () => {
    const a = {
      date: "2026-11-25",
      projectId: "p",
      phaseId: "f",
      workCategoryId: null,
    };
    expect(isShrinkOrMoveOnly(a, { ...a })).toBe(true);
    expect(isShrinkOrMoveOnly(a, { ...a, phaseId: "g" })).toBe(false);
    expect(isShrinkOrMoveOnly(a, { ...a, date: "2026-11-26" })).toBe(false);
  });
});
