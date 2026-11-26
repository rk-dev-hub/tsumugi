import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatHm,
  parseClock,
  parseDuration,
} from "@/lib/minutes";
import { isWorkday, nationalHolidayName } from "@/lib/holidays";
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  totpAt,
  verifyTotp,
} from "@/lib/totp";
import { encodeCsv, sanitizeCell, toCsv } from "@/features/report/csv";
import iconv from "iconv-lite";

describe("分の表示と入力", () => {
  it("表示", () => {
    expect(formatHm(0)).toBe("0:00");
    expect(formatHm(615)).toBe("10:15");
    expect(formatHm(-75)).toBe("-1:15");
    expect(formatClock(570)).toBe("09:30");
    expect(formatClock(1440)).toBe("24:00");
  });
  it("時間の入力", () => {
    expect(parseDuration("1:30")).toBe(90);
    expect(parseDuration("1.5")).toBe(90);
    expect(parseDuration("2h")).toBe(120);
    expect(parseDuration("45m")).toBe(45);
    expect(parseDuration("1h30m")).toBe(90);
    expect(parseDuration("1:75")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
  it("時刻の入力", () => {
    expect(parseClock("9:30")).toBe(570);
    expect(parseClock("24:00")).toBe(1440);
    expect(parseClock("24:15")).toBeNull();
    expect(parseClock("25:30", 2880)).toBe(1530);
    expect(parseClock("9時")).toBeNull();
  });
});

describe("祝日", () => {
  it("固定・ハッピーマンデー・春分秋分・振替", () => {
    expect(nationalHolidayName("2026-01-01")).toBe("元日");
    expect(nationalHolidayName("2026-01-12")).toBe("成人の日");
    expect(nationalHolidayName("2026-03-20")).toBe("春分の日");
    expect(nationalHolidayName("2026-09-23")).toBe("秋分の日");
    expect(nationalHolidayName("2026-11-23")).toBe("勤労感謝の日");
    expect(nationalHolidayName("2026-05-06")).toBe("振替休日");
    expect(nationalHolidayName("2026-11-24")).toBeNull();
  });
  it("営業日", () => {
    expect(isWorkday("2026-11-24")).toBe(true);
    expect(isWorkday("2026-11-28")).toBe(false); // 土
    expect(isWorkday("2026-11-23")).toBe(false); // 祝
    expect(isWorkday("2026-12-29", new Set(["2026-12-29"]))).toBe(false); // 会社の休日
  });
});

describe("2 段階認証（RFC 6238 のテストベクター）", () => {
  // RFC 6238 付録 B（SHA1, シークレット "12345678901234567890"）
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  it("Base32", () => {
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
  });
  it("既知の値と一致する", () => {
    expect(totpAt(secret, Math.floor(59 / 30))).toBe("287082");
    expect(totpAt(secret, Math.floor(1111111109 / 30))).toBe("081804");
    expect(totpAt(secret, Math.floor(1234567890 / 30))).toBe("005924");
  });
  it("前後 1 ステップまで許容し、使ったステップの再利用は拒否", () => {
    const now = 1234567890_000;
    const step = Math.floor(now / 30_000);
    expect(verifyTotp(secret, totpAt(secret, step), null, now)).toBe(step);
    expect(verifyTotp(secret, totpAt(secret, step - 1), null, now)).toBe(
      step - 1,
    );
    expect(verifyTotp(secret, totpAt(secret, step - 2), null, now)).toBeNull();
    expect(verifyTotp(secret, totpAt(secret, step), step, now)).toBeNull();
    expect(verifyTotp(secret, "12345", null, now)).toBeNull();
  });
  it("リカバリーコード", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-7]{4}-[a-z2-7]{4}$/);
  });
});

describe("CSV", () => {
  it("数式として解釈されうる値を無害化する", () => {
    expect(sanitizeCell('=HYPERLINK("x")')).toBe('"\'=HYPERLINK(""x"")"');
    expect(sanitizeCell("+1")).toBe("'+1");
    expect(sanitizeCell("-1")).toBe("'-1");
    expect(sanitizeCell("@x")).toBe("'@x");
    expect(sanitizeCell(-1)).toBe("-1");
    expect(sanitizeCell("a,b")).toBe('"a,b"');
    expect(sanitizeCell(null)).toBe("");
  });
  it("CRLF とエンコーディング", () => {
    const text = toCsv(["名前", "工数"], [["佐倉", 7.5]]);
    expect(text).toBe("名前,工数\r\n佐倉,7.5\r\n");
    expect([...encodeCsv(text, "utf8-bom").subarray(0, 3)]).toEqual([
      0xef, 0xbb, 0xbf,
    ]);
    expect(iconv.decode(encodeCsv(text, "shift_jis"), "Shift_JIS")).toBe(text);
  });
});
