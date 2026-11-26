import { describe, expect, it } from "vitest";
import { splitTimer } from "@/features/timesheet/domain/timer";
import {
  checkAttendance,
  checkDaysForSubmit,
  gapMinutes,
} from "@/features/timesheet/domain/attendance";

const jst = (s: string) => new Date(`${s}+09:00`);

describe("タイマーの分割", () => {
  it("同じ日", () => {
    expect(
      splitTimer(jst("2026-11-25T09:00:30"), jst("2026-11-25T10:15:59")),
    ).toEqual({
      ok: true,
      segments: [{ date: "2026-11-25", startMinute: 540, endMinute: 615 }],
    });
  });
  it("日付をまたぐ", () => {
    expect(
      splitTimer(jst("2026-11-25T23:30:00"), jst("2026-11-26T01:00:00")),
    ).toEqual({
      ok: true,
      segments: [
        { date: "2026-11-25", startMinute: 1410, endMinute: 1440 },
        { date: "2026-11-26", startMinute: 0, endMinute: 60 },
      ],
    });
  });
  it("0:00 ちょうどに止めた場合は翌日分を作らない", () => {
    const r = splitTimer(
      jst("2026-11-25T22:00:00"),
      jst("2026-11-26T00:00:00"),
    );
    expect(r).toEqual({
      ok: true,
      segments: [{ date: "2026-11-25", startMinute: 1320, endMinute: 1440 }],
    });
  });
  it("1 分未満・24 時間超・逆順", () => {
    expect(
      splitTimer(jst("2026-11-25T09:00:10"), jst("2026-11-25T09:00:50")),
    ).toEqual({ ok: false, reason: "TOO_SHORT" });
    expect(
      splitTimer(jst("2026-11-25T09:00:00"), jst("2026-11-26T09:01:00")),
    ).toEqual({ ok: false, reason: "TOO_LONG" });
    expect(
      splitTimer(jst("2026-11-25T09:00:00"), jst("2026-11-25T08:00:00")),
    ).toEqual({ ok: false, reason: "NEGATIVE" });
  });
});

describe("勤務時間", () => {
  it("入力の検査", () => {
    expect(
      checkAttendance({ startMinute: 540, endMinute: 1080, breakMinutes: 60 }),
    ).toBeNull();
    expect(
      checkAttendance({ startMinute: 1320, endMinute: 1560, breakMinutes: 0 }),
    ).toBeNull(); // 翌 2:00 まで
    expect(
      checkAttendance({ startMinute: 1440, endMinute: 1500, breakMinutes: 0 }),
    ).toBe("START_RANGE");
    expect(
      checkAttendance({ startMinute: 540, endMinute: 540, breakMinutes: 0 }),
    ).toBe("END_NOT_AFTER_START");
    expect(
      checkAttendance({ startMinute: 0, endMinute: 1441, breakMinutes: 0 }),
    ).toBe("TOO_LONG");
    expect(
      checkAttendance({ startMinute: 540, endMinute: 600, breakMinutes: 60 }),
    ).toBe("BREAK_RANGE");
  });
  it("差 = 勤務 − 工数", () => {
    expect(
      gapMinutes({ startMinute: 540, endMinute: 1080, breakMinutes: 60 }, 450),
    ).toBe(30);
    expect(gapMinutes(null, 450)).toBeNull();
  });
  it("提出前の確認", () => {
    const att = {
      startMinute: 540,
      endMinute: 1080,
      breakMinutes: 60,
      gapReason: "",
    };
    const problems = checkDaysForSubmit(
      [
        { date: "2026-11-23", entryMinutes: 480, attendance: null },
        { date: "2026-11-24", entryMinutes: 400, attendance: att },
        {
          date: "2026-11-25",
          entryMinutes: 400,
          attendance: { ...att, gapReason: "移動" },
        },
        { date: "2026-11-26", entryMinutes: 470, attendance: att },
        { date: "2026-11-27", entryMinutes: 0, attendance: null },
      ],
      15,
    );
    expect(problems).toEqual([
      { date: "2026-11-23", kind: "NO_ATTENDANCE" },
      { date: "2026-11-24", kind: "GAP_REASON_REQUIRED", gap: 80 },
    ]);
  });
});
