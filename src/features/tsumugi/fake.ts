import type { AiFeature } from "@/generated/prisma/client";

/**
 * E2E テスト用のフェイク応答（TSUMUGI_FAKE=1 のときだけ使う）。実際の API は呼ばない。
 * 入力に応じて決まった形の応答を返し、後処理・画面の流れを確かめられるようにする。
 */
export function fakeTsumugiResponse(
  feature: AiFeature,
  data: unknown,
  userText?: string,
): unknown {
  const dt = data as Record<string, unknown>;
  switch (feature) {
    case "DRAFT_ENTRIES": {
      if (userText?.includes("？") || userText?.includes("?")) {
        return {
          result: {
            kind: "CLARIFY",
            question: "どの日の作業ですか？",
            choices: ["今日", "昨日"],
          },
        };
      }
      if (userText?.includes("天気")) {
        return {
          result: {
            kind: "UNSUPPORTED",
            message: "工数の記録について書いてください。",
          },
        };
      }
      const targets = (dt.targets as { key: string }[]) ?? [];
      const cats = (dt.categories as { key: string }[]) ?? [];
      return {
        result: {
          kind: "ENTRIES",
          workDate: dt.workDate,
          entries: [
            {
              start: "09:30",
              end: "10:30",
              targetKey: targets[0]?.key ?? "",
              categoryKey: cats[0]?.key ?? "",
              note: "定例ミーティング",
              confidence: "HIGH",
            },
            {
              start: "10:30",
              end: "12:00",
              targetKey: targets[1]?.key ?? "",
              categoryKey: cats[1]?.key ?? "",
              note: "デザイン修正",
              confidence: "HIGH",
            },
            {
              start: "13:00",
              end: "17:30",
              targetKey: "",
              categoryKey: "",
              note: "コーディング",
              confidence: "LOW",
            },
          ],
        },
      };
    }
    case "EXPLAIN_FORECAST":
      return {
        headline: "（テスト）予算の見通しです",
        points: ["（テスト）消化率を確認してください。"],
        actions: ["（テスト）残り見込みを更新する"],
      };
    case "SUMMARIZE_PERIOD":
      return {
        summary: "（テスト）今週の作業の要約です。",
        cautions: ((dt.flags as string[]) ?? []).map((f) => `（テスト）${f}`),
      };
    case "MONTHLY_REPORT":
      return {
        title: "（テスト）月次レポート",
        sections: [{ heading: "概況", body: "（テスト）締めた月の概況です。" }],
      };
  }
}
