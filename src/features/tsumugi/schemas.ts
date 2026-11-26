import { z } from "zod";

// Tsumugi の構造化出力のスキーマ。API に渡し、受け取った後にも同じスキーマで検証する。
// 文字数の上限はモデルへの指示で伝え、表示時に clip() で切り詰める（上限超えで捨てない）。

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const hm = z.string().regex(/^\d{1,2}:\d{2}$/);

export const draftEntriesSchema = z.object({
  result: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("ENTRIES"),
      workDate: isoDate,
      entries: z.array(
        z.object({
          start: hm,
          end: hm,
          /** <data>.targets のキー（T1 など）。決められなければ空文字 */
          targetKey: z.string(),
          /** <data>.categories のキー（C1 など）。決められなければ空文字 */
          categoryKey: z.string(),
          note: z.string(),
          confidence: z.enum(["HIGH", "LOW"]),
        }),
      ),
    }),
    z.object({
      kind: z.literal("CLARIFY"),
      question: z.string(),
      choices: z.array(z.string()),
    }),
    z.object({ kind: z.literal("UNSUPPORTED"), message: z.string() }),
  ]),
});
export type DraftEntriesResult = z.infer<typeof draftEntriesSchema>["result"];

export const explainForecastSchema = z.object({
  headline: z.string(),
  points: z.array(z.string()),
  actions: z.array(z.string()),
});

export const summarizePeriodSchema = z.object({
  summary: z.string(),
  cautions: z.array(z.string()),
});

export const monthlyReportSchema = z.object({
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});
export type MonthlyReport = z.infer<typeof monthlyReportSchema>;

/** 表示用に文字数を切り詰める（サロゲートペアを壊さない） */
export function clip(text: string, max: number): string {
  const chars = Array.from(text.trim());
  return chars.length <= max
    ? chars.join("")
    : `${chars.slice(0, max - 1).join("")}…`;
}
