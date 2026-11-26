import { describe, expect, it } from "vitest";
import {
  canDecide,
  isEditableStatus,
  nextStatus,
} from "@/features/approval/domain/transitions";
import {
  extractPeriodFlags,
  flagText,
  lateNightMinutes,
} from "@/features/approval/domain/period-flags";

describe("状態遷移", () => {
  it("提出・取り下げ・承認・差戻し・取消", () => {
    expect(nextStatus("NONE", "SUBMIT")).toBe("SUBMITTED");
    expect(nextStatus("REJECTED", "SUBMIT")).toBe("SUBMITTED");
    expect(nextStatus("WITHDRAWN", "SUBMIT")).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "SUBMIT")).toBeNull();
    expect(nextStatus("SUBMITTED", "WITHDRAW")).toBe("WITHDRAWN");
    expect(nextStatus("APPROVED", "WITHDRAW")).toBeNull();
    expect(nextStatus("SUBMITTED", "APPROVE")).toBe("APPROVED");
    expect(nextStatus("NONE", "APPROVE")).toBeNull();
    expect(nextStatus("SUBMITTED", "REJECT")).toBe("REJECTED");
    expect(nextStatus("APPROVED", "CANCEL_APPROVAL")).toBe("SUBMITTED");
    expect(nextStatus("SUBMITTED", "CANCEL_APPROVAL")).toBeNull();
  });
  it("本人が編集できる状態", () => {
    expect(isEditableStatus("NONE")).toBe(true);
    expect(isEditableStatus("REJECTED")).toBe(true);
    expect(isEditableStatus("WITHDRAWN")).toBe(true);
    expect(isEditableStatus("SUBMITTED")).toBe(false);
    expect(isEditableStatus("APPROVED")).toBe(false);
  });
});

describe("承認できる人", () => {
  const owner = { id: "u1", approverId: "m1" };
  it("自分は承認できない（管理者でも）", () => {
    expect(
      canDecide({
        actor: { id: "u1", role: "ADMIN" },
        owner,
        approverIsValid: true,
      }),
    ).toBe("SELF");
  });
  it("管理者はだれでも承認できる", () => {
    expect(
      canDecide({
        actor: { id: "a1", role: "ADMIN" },
        owner,
        approverIsValid: false,
      }),
    ).toBe("OK");
  });
  it("マネージャーは自分が承認者の人だけ", () => {
    expect(
      canDecide({
        actor: { id: "m1", role: "MANAGER" },
        owner,
        approverIsValid: true,
      }),
    ).toBe("OK");
    expect(
      canDecide({
        actor: { id: "m2", role: "MANAGER" },
        owner,
        approverIsValid: true,
      }),
    ).toBe("NOT_APPROVER");
    expect(
      canDecide({
        actor: { id: "m1", role: "MANAGER" },
        owner,
        approverIsValid: false,
      }),
    ).toBe("NOT_APPROVER");
    expect(
      canDecide({
        actor: { id: "m1", role: "MEMBER" },
        owner,
        approverIsValid: true,
      }),
    ).toBe("NOT_APPROVER");
  });
});

describe("承認の要約に使う気になる点", () => {
  it("差・深夜・割合の変化・予算超過・遅れを拾う", () => {
    const flags = extractPeriodFlags({
      days: [
        {
          date: "2026-11-24",
          entryMinutes: 400,
          workMinutes: 480,
          gap: 80,
          gapReason: "",
          lateNightMinutes: 0,
          longBlankNoteMinutes: 0,
        },
        {
          date: "2026-11-25",
          entryMinutes: 480,
          workMinutes: 480,
          gap: 0,
          gapReason: "",
          lateNightMinutes: 30,
          longBlankNoteMinutes: 300,
        },
        {
          date: "2026-11-26",
          entryMinutes: 480,
          workMinutes: 470,
          gap: -10,
          gapReason: "",
          lateNightMinutes: 0,
          longBlankNoteMinutes: 0,
        },
      ],
      shares: [
        {
          projectCode: "A",
          projectName: "A 案件",
          minutes: 900,
          baselineShare: 40,
        },
        {
          projectCode: "B",
          projectName: "B 案件",
          minutes: 460,
          baselineShare: 55,
        },
        {
          projectCode: "C",
          projectName: "C 案件",
          minutes: 0,
          baselineShare: null,
        },
      ],
      overBudgetPhases: [
        { projectName: "A 案件", phase: "開発", minutes: 120 },
      ],
      gapThreshold: 15,
      daysLate: 2,
    });
    expect(flags.map((f) => f.kind)).toEqual([
      "GAP",
      "LATE_NIGHT",
      "BLANK_NOTE",
      "SHARE_SHIFT",
      "SHARE_SHIFT",
      "OVER_BUDGET_PHASE",
      "LATE_SUBMISSION",
    ]);
    expect(flagText(flags[0])).toContain("1:20");
    expect(flagText(flags.at(-1)!)).toBe("提出期限から 2 日遅れ");
  });
  it("問題がなければ空", () => {
    expect(
      extractPeriodFlags({
        days: [],
        shares: [],
        overBudgetPhases: [],
        gapThreshold: 15,
        daysLate: 0,
      }),
    ).toEqual([]);
  });
  it("22 時以降の分", () => {
    expect(
      lateNightMinutes([
        { startMinute: 1260, endMinute: 1380 },
        { startMinute: 540, endMinute: 600 },
      ]),
    ).toBe(60);
  });
});
