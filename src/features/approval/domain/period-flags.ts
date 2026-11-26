import { formatHm } from "@/lib/minutes";
import { formatDateJa } from "@/lib/date-range";

/**
 * 承認の要約に使う「気になる点」をコードで抽出する。Tsumugi はこれを言い換えるだけ。
 */

export type DayFacts = {
  date: string;
  entryMinutes: number;
  workMinutes: number | null;
  gap: number | null;
  gapReason: string;
  lateNightMinutes: number;
  longBlankNoteMinutes: number;
};

export type ShareFacts = {
  projectCode: string;
  projectName: string;
  minutes: number;
  baselineShare: number | null;
};

export type PeriodFlag =
  | { kind: "GAP"; date: string; gap: number; hasReason: boolean }
  | { kind: "LATE_NIGHT"; date: string; minutes: number }
  | {
      kind: "SHARE_SHIFT";
      projectName: string;
      share: number;
      baselineShare: number;
    }
  | {
      kind: "OVER_BUDGET_PHASE";
      projectName: string;
      phase: string;
      minutes: number;
    }
  | { kind: "BLANK_NOTE"; date: string; minutes: number }
  | { kind: "LATE_SUBMISSION"; daysLate: number };

export function extractPeriodFlags(input: {
  days: readonly DayFacts[];
  shares: readonly ShareFacts[];
  overBudgetPhases: readonly {
    projectName: string;
    phase: string;
    minutes: number;
  }[];
  gapThreshold: number;
  daysLate: number;
}): PeriodFlag[] {
  const flags: PeriodFlag[] = [];
  for (const d of input.days) {
    if (d.gap !== null && Math.abs(d.gap) > input.gapThreshold) {
      flags.push({
        kind: "GAP",
        date: d.date,
        gap: d.gap,
        hasReason: d.gapReason.trim() !== "",
      });
    }
    if (d.lateNightMinutes > 0)
      flags.push({
        kind: "LATE_NIGHT",
        date: d.date,
        minutes: d.lateNightMinutes,
      });
    if (d.longBlankNoteMinutes >= 240)
      flags.push({
        kind: "BLANK_NOTE",
        date: d.date,
        minutes: d.longBlankNoteMinutes,
      });
  }
  const total = input.shares.reduce((s, x) => s + x.minutes, 0);
  if (total > 0) {
    for (const s of input.shares) {
      if (s.baselineShare === null) continue;
      const share = Math.round((s.minutes * 100) / total);
      if (Math.abs(share - s.baselineShare) >= 20) {
        flags.push({
          kind: "SHARE_SHIFT",
          projectName: s.projectName,
          share,
          baselineShare: s.baselineShare,
        });
      }
    }
  }
  for (const p of input.overBudgetPhases)
    flags.push({ kind: "OVER_BUDGET_PHASE", ...p });
  if (input.daysLate > 0)
    flags.push({ kind: "LATE_SUBMISSION", daysLate: input.daysLate });
  return flags;
}

export function flagText(f: PeriodFlag): string {
  switch (f.kind) {
    case "GAP":
      return `${formatDateJa(f.date)} は勤務時間と工数の差が ${formatHm(f.gap)}${f.hasReason ? "（理由あり）" : ""}`;
    case "LATE_NIGHT":
      return `${formatDateJa(f.date)} に 22 時以降の工数が ${formatHm(f.minutes)}`;
    case "SHARE_SHIFT":
      return `${f.projectName} の割合が ${f.share}%（普段は ${f.baselineShare}%）`;
    case "OVER_BUDGET_PHASE":
      return `予算超過の ${f.projectName}／${f.phase} に ${formatHm(f.minutes)}`;
    case "BLANK_NOTE":
      return `${formatDateJa(f.date)} にメモのない長い作業が ${formatHm(f.minutes)}`;
    case "LATE_SUBMISSION":
      return `提出期限から ${f.daysLate} 日遅れ`;
  }
}

/** 22:00 以降の分 */
export function lateNightMinutes(
  slots: readonly { startMinute: number; endMinute: number }[],
): number {
  return slots.reduce(
    (s, x) => s + Math.max(0, x.endMinute - Math.max(x.startMinute, 1320)),
    0,
  );
}
