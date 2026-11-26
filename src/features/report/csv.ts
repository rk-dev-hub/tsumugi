import iconv from "iconv-lite";

/** 先頭が = + - @ タブ 改行 の値は数式として解釈されないよう ' を付ける（CSV インジェクション対策） */
export function sanitizeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\r\n]/.test(s)) s = `"${s.replaceAll('"', '""')}"`;
  return s;
}

export function toCsv(
  header: string[],
  rows: (string | number | null)[][],
): string {
  return (
    [header, ...rows].map((r) => r.map(sanitizeCell).join(",")).join("\r\n") +
    "\r\n"
  );
}

export type CsvEncoding = "utf8" | "utf8-bom" | "shift_jis";

export function encodeCsv(text: string, enc: CsvEncoding): Buffer {
  if (enc === "shift_jis") return iconv.encode(text, "Shift_JIS");
  if (enc === "utf8-bom")
    return Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]),
      Buffer.from(text, "utf8"),
    ]);
  return Buffer.from(text, "utf8");
}
