import { parseClock } from "@/lib/minutes";
import {
  slotsOverlap,
  snapToStep,
} from "@/features/timesheet/domain/entry-rules";
import type { DraftEntriesResult } from "./schemas";

/**
 * ひとこと入力の後処理（コード）。Tsumugi の出力を画面の下書きに変換する。
 * - キーは許可された一覧と照合し、知らないキーは「未選択」にする（ID を AI に作らせない）
 * - 刻みに丸め、0:00〜24:00 に収める
 * - 重なり・勤務時間外に印を付ける（削らない、人が直す）
 */

export type DraftTarget = { key: string; projectId: string; phaseId: string };
export type DraftCategory = { key: string; id: string };

export type DraftRow = {
  startMinute: number;
  endMinute: number;
  projectId: string | null;
  phaseId: string | null;
  workCategoryId: string | null;
  note: string;
  lowConfidence: boolean;
  overlapsExisting: boolean;
  overlapsDraft: boolean;
  outsideAttendance: boolean;
};

export function postProcessDraft(
  result: Extract<DraftEntriesResult, { kind: "ENTRIES" }>,
  ctx: {
    targets: readonly DraftTarget[];
    categories: readonly DraftCategory[];
    step: number;
    existing: readonly { startMinute: number; endMinute: number }[];
    attendance: { startMinute: number; endMinute: number } | null;
    maxEntries?: number;
  },
): DraftRow[] {
  const rows: DraftRow[] = [];
  for (const e of result.entries.slice(0, ctx.maxEntries ?? 20)) {
    const s = parseClock(e.start);
    const en = parseClock(e.end);
    if (s === null || en === null) continue;
    const startMinute = snapToStep(s, ctx.step);
    const endMinute = snapToStep(en, ctx.step);
    if (endMinute <= startMinute) continue;
    const t = ctx.targets.find((x) => x.key === e.targetKey) ?? null;
    const c = ctx.categories.find((x) => x.key === e.categoryKey) ?? null;
    rows.push({
      startMinute,
      endMinute,
      projectId: t?.projectId ?? null,
      phaseId: t?.phaseId ?? null,
      workCategoryId: c?.id ?? null,
      note: Array.from(e.note.trim()).slice(0, 100).join(""),
      lowConfidence: e.confidence === "LOW" || !t,
      overlapsExisting: ctx.existing.some((x) =>
        slotsOverlap(x, { startMinute, endMinute }),
      ),
      overlapsDraft: false,
      outsideAttendance: ctx.attendance
        ? startMinute < ctx.attendance.startMinute ||
          endMinute > Math.min(ctx.attendance.endMinute, 1440)
        : false,
    });
  }
  rows.sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (slotsOverlap(rows[i], rows[j])) {
        rows[i].overlapsDraft = true;
        rows[j].overlapsDraft = true;
      }
    }
  }
  return rows;
}

/** 本文中の数値（金額・割合・時間）がデータにある値だけかを確かめる（月次レポート用の簡易照合） */
export function findUnknownNumbers(
  text: string,
  allowed: ReadonlySet<string>,
): string[] {
  const found = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  const unknown: string[] = [];
  for (const raw of found) {
    const n = raw.replaceAll(",", "");
    if (n.length <= 2) continue; // 月・日・小さな数（「3 件」など）は照合しない
    if (!allowed.has(n)) unknown.push(raw);
  }
  return unknown;
}
