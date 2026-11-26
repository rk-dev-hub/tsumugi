import { describe, expect, it } from "vitest";
import {
  addMonths,
  lastDayOfMonth,
  periodOf,
  periodsOfMonth,
  periodsOfWeek,
  weekStartOf,
} from "@/features/timesheet/domain/period";
import { reportRange } from "@/features/report/range";

describe("提出期間", () => {
  it("月曜始まりの週", () => {
    expect(weekStartOf("2026-11-25")).toBe("2026-11-23");
    expect(weekStartOf("2026-11-29")).toBe("2026-11-23"); // 日曜
    expect(weekStartOf("2026-11-23")).toBe("2026-11-23");
  });

  it("月の境目で分ける", () => {
    // 2026-09-28(月)〜10-04(日) は 9 月と 10 月に分かれる
    expect(periodOf("2026-09-30")).toEqual({
      start: "2026-09-28",
      end: "2026-09-30",
    });
    expect(periodOf("2026-10-02")).toEqual({
      start: "2026-10-01",
      end: "2026-10-04",
    });
    expect(periodsOfWeek("2026-09-28")).toEqual([
      { start: "2026-09-28", end: "2026-09-30" },
      { start: "2026-10-01", end: "2026-10-04" },
    ]);
  });

  it("月の期間は隙間なく並ぶ", () => {
    const ps = periodsOfMonth("2026-02");
    expect(ps[0].start).toBe("2026-02-01");
    expect(ps.at(-1)!.end).toBe("2026-02-28");
    for (let i = 1; i < ps.length; i++) {
      const prevEnd = new Date(`${ps[i - 1].end}T00:00:00Z`).getTime();
      expect(new Date(`${ps[i].start}T00:00:00Z`).getTime() - prevEnd).toBe(
        86_400_000,
      );
    }
  });

  it("月の計算（うるう年・年またぎ）", () => {
    expect(lastDayOfMonth("2028-02")).toBe("2028-02-29");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
  });
});

describe("レポートの期間", () => {
  it("不正な値は直近 3 か月", () => {
    expect(reportRange("x", undefined, "2026-11-25")).toEqual({
      from: "2026-09",
      to: "2026-11",
    });
  });
  it("逆順は入れ替え、12 か月を超えたら縮める", () => {
    expect(reportRange("2026-11", "2026-01", "2026-11-25")).toEqual({
      from: "2026-01",
      to: "2026-11",
    });
    expect(reportRange("2024-01", "2026-11", "2026-11-25")).toEqual({
      from: "2025-12",
      to: "2026-11",
    });
  });
  it("月の形式でないものは受け付けない", () => {
    expect(reportRange("2026-13", "2026-00", "2026-11-25")).toEqual({
      from: "2026-09",
      to: "2026-11",
    });
  });
});
