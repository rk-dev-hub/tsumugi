import { prisma } from "@/lib/prisma";
import { addDaysStr, formatDateJa } from "@/lib/date-range";
import { formatClock, formatHm } from "@/lib/minutes";
import type { SessionUser } from "@/features/auth/rbac";
import { getCompany } from "@/features/common/company";
import { d, ds, todayJst } from "@/features/common/dates";
import { isWithinFutureLimit } from "@/features/timesheet/domain/entry-rules";
import {
  frequentTargets,
  listCategories,
  listTargetOptions,
} from "@/features/timesheet/usecase";
import { gapMinutes } from "@/features/timesheet/domain/attendance";
import {
  extractPeriodFlags,
  flagText,
  lateNightMinutes,
  type PeriodFlag,
} from "@/features/approval/domain/period-flags";
import { getPeriodForApprover } from "@/features/approval/usecase";
import { summarizeProject, percent } from "@/features/costing/domain/budget";
import {
  addMonths,
  firstDayOfMonth,
  lastDayOfMonth,
} from "@/features/timesheet/domain/period";
import {
  forecastTemplate,
  type ForecastComment,
} from "@/features/forecast/templates";
import type { ForecastFacts } from "@/features/forecast/domain/risk";
import { callTsumugi, isTsumugiAiEnabled } from "./client";
import {
  DRAFT_ENTRIES_PROMPT,
  EXPLAIN_FORECAST_PROMPT,
  MONTHLY_REPORT_PROMPT,
  SUMMARIZE_PERIOD_PROMPT,
} from "./prompts";
import {
  clip,
  draftEntriesSchema,
  explainForecastSchema,
  monthlyReportSchema,
  summarizePeriodSchema,
  type MonthlyReport,
} from "./schemas";
import {
  findUnknownNumbers,
  postProcessDraft,
  type DraftRow,
} from "./draft-post";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];
const weekdayOf = (s: string) =>
  WEEKDAY[new Date(`${s}T00:00:00Z`).getUTCDay()];

// ------------------------------------------------------------------
// 1. ひとこと入力
// ------------------------------------------------------------------

export type DraftOutcome =
  | { kind: "ENTRIES"; date: string; rows: DraftRow[] }
  | { kind: "CLARIFY"; question: string; choices: string[] }
  | { kind: "UNSUPPORTED"; message: string }
  | { kind: "UNAVAILABLE"; message: string };

export async function draftEntries(
  user: SessionUser,
  input: { text: string; date: string; previousQuestion?: string },
): Promise<DraftOutcome> {
  if (!isTsumugiAiEnabled()) {
    return {
      kind: "UNAVAILABLE",
      message: "Tsumugi は API キーが設定されていないため使えません。",
    };
  }
  const today = todayJst();
  const candidates = [
    input.date,
    addDaysStr(input.date, -1),
    addDaysStr(input.date, -2),
  ].filter((x) => isWithinFutureLimit(x, today));
  const [options, categories, frequent, company, entries, attendances] =
    await Promise.all([
      listTargetOptions(user.id),
      listCategories(),
      frequentTargets(user.id, today),
      getCompany(),
      prisma.timeEntry.findMany({
        where: { userId: user.id, date: { in: candidates.map(d) } },
        select: { date: true, startMinute: true, endMinute: true },
      }),
      prisma.attendance.findMany({
        where: { userId: user.id, date: { in: candidates.map(d) } },
      }),
    ]);

  // ID は渡さず、短いキーで渡す（AI に ID を作らせない）
  const targets = options.flatMap((p) =>
    p.phases.map((ph) => ({
      projectId: p.projectId,
      phaseId: ph.id,
      project: p.projectName,
      code: p.projectCode,
      phase: ph.name,
      client: p.clientName,
    })),
  );
  const keyed = targets
    .slice(0, 200)
    .map((t, i) => ({ ...t, key: `T${i + 1}` }));
  const catKeyed = categories.map((c, i) => ({ ...c, key: `C${i + 1}` }));
  const frequentKeys = frequent
    .map((f) => keyed.find((k) => k.phaseId === f.phaseId)?.key)
    .filter((k): k is string => Boolean(k));

  const perDate = (date: string) => {
    const a = attendances.find((x) => ds(x.date) === date);
    return {
      attendance: a
        ? {
            start: formatClock(a.startMinute),
            end: formatClock(Math.min(a.endMinute, 1440)),
            breakMinutes: a.breakMinutes,
          }
        : null,
      existing: entries
        .filter((e) => ds(e.date) === date)
        .map((e) => ({
          start: formatClock(e.startMinute),
          end: formatClock(e.endMinute),
        })),
    };
  };

  const res = await callTsumugi({
    feature: "DRAFT_ENTRIES",
    user: { id: user.id },
    system: DRAFT_ENTRIES_PROMPT,
    data: {
      today: `${today}（${weekdayOf(today)}）`,
      workDate: input.date,
      dateCandidates: candidates.map((c) => ({
        date: c,
        weekday: weekdayOf(c),
        ...perDate(c),
      })),
      ...perDate(input.date),
      targets: keyed.map((k) => ({
        key: k.key,
        project: k.project,
        code: k.code,
        phase: k.phase,
        client: k.client,
      })),
      frequent: frequentKeys,
      categories: catKeyed.map((c) => ({ key: c.key, name: c.name })),
      step: company.timeStepMinutes,
      previousQuestion: input.previousQuestion ?? null,
    },
    userText: input.text,
    schema: draftEntriesSchema,
    effort: "medium",
  });
  if (!res.ok) {
    return {
      kind: "UNAVAILABLE",
      message:
        res.reason === "RATE_LIMITED"
          ? "今日の Tsumugi の利用回数の上限に達しました。タイムラインから入力してください。"
          : "今は Tsumugi が使えません。タイムラインから入力してください。",
    };
  }
  const r = res.data.result;
  if (r.kind === "CLARIFY")
    return {
      kind: "CLARIFY",
      question: clip(r.question, 80),
      choices: r.choices.slice(0, 4).map((c) => clip(c, 30)),
    };
  if (r.kind === "UNSUPPORTED")
    return { kind: "UNSUPPORTED", message: clip(r.message, 80) };

  const date = candidates.includes(r.workDate) ? r.workDate : input.date;
  const att = attendances.find((x) => ds(x.date) === date);
  const rows = postProcessDraft(r, {
    targets: keyed.map((k) => ({
      key: k.key,
      projectId: k.projectId,
      phaseId: k.phaseId,
    })),
    categories: catKeyed.map((c) => ({ key: c.key, id: c.id })),
    step: company.timeStepMinutes,
    existing: entries.filter((e) => ds(e.date) === date),
    attendance: att
      ? { startMinute: att.startMinute, endMinute: att.endMinute }
      : null,
  });
  if (rows.length === 0) {
    return {
      kind: "UNSUPPORTED",
      message:
        "時間帯を読み取れませんでした。「10時から12時 A 案件の設計」のように書いてみてください。",
    };
  }
  return { kind: "ENTRIES", date, rows };
}

// ------------------------------------------------------------------
// 2. 予算の見通しコメント
// ------------------------------------------------------------------

export type CommentResult<T> = { value: T; ai: boolean };

export async function explainForecast(
  user: SessionUser,
  facts: ForecastFacts,
): Promise<CommentResult<ForecastComment>> {
  const fallback = forecastTemplate(facts);
  const res = await callTsumugi({
    feature: "EXPLAIN_FORECAST",
    user: { id: user.id },
    system: EXPLAIN_FORECAST_PROMPT,
    data: facts,
    schema: explainForecastSchema,
    effort: "low",
    cacheTtlSeconds: 6 * 60 * 60,
  });
  if (!res.ok) return { value: fallback, ai: false };
  return {
    value: {
      headline: clip(res.data.headline, 40),
      points: res.data.points.slice(0, 3).map((p) => clip(p, 100)),
      actions: res.data.actions.slice(0, 3).map((a) => clip(a, 70)),
    },
    ai: true,
  };
}

// ------------------------------------------------------------------
// 3. 承認の要約
// ------------------------------------------------------------------

export type PeriodSummary = {
  summary: string;
  cautions: string[];
  flags: PeriodFlag[];
};

export async function summarizePeriod(
  actor: SessionUser,
  periodId: string,
): Promise<CommentResult<PeriodSummary> | null> {
  const period = await getPeriodForApprover(actor, periodId);
  if (!period) return null;
  const company = await getCompany();
  const [entries, attendances, baselineEntries] = await Promise.all([
    prisma.timeEntry.findMany({
      where: {
        userId: period.userId,
        date: { gte: d(period.start), lte: d(period.end) },
      },
      include: {
        project: { select: { id: true, code: true, name: true } },
        phase: { select: { id: true, name: true, budgetMinutes: true } },
      },
    }),
    prisma.attendance.findMany({
      where: {
        userId: period.userId,
        date: { gte: d(period.start), lte: d(period.end) },
      },
    }),
    prisma.timeEntry.groupBy({
      by: ["projectId"],
      where: {
        userId: period.userId,
        date: { gte: d(addDaysStr(period.start, -56)), lt: d(period.start) },
      },
      _sum: { minutes: true },
    }),
  ]);

  const days = [];
  for (let x = period.start; x <= period.end; x = addDaysStr(x, 1)) {
    const es = entries.filter((e) => ds(e.date) === x);
    const total = es.reduce((s, e) => s + e.minutes, 0);
    const a = attendances.find((y) => ds(y.date) === x) ?? null;
    days.push({
      date: x,
      entryMinutes: total,
      workMinutes: a ? a.endMinute - a.startMinute - a.breakMinutes : null,
      gap: gapMinutes(a, total),
      gapReason: a?.gapReason ?? "",
      lateNightMinutes: lateNightMinutes(es),
      longBlankNoteMinutes: es
        .filter((e) => e.note.trim() === "" && e.minutes >= 240)
        .reduce((s, e) => s + e.minutes, 0),
    });
  }
  const baseTotal = baselineEntries.reduce(
    (s, b) => s + (b._sum.minutes ?? 0),
    0,
  );
  const byProject = new Map<
    string,
    { code: string; name: string; minutes: number }
  >();
  for (const e of entries) {
    const cur = byProject.get(e.projectId) ?? {
      code: e.project.code,
      name: e.project.name,
      minutes: 0,
    };
    cur.minutes += e.minutes;
    byProject.set(e.projectId, cur);
  }
  const shares = [...byProject.entries()].map(([id, v]) => {
    const base =
      baselineEntries.find((b) => b.projectId === id)?._sum.minutes ?? 0;
    return {
      projectCode: v.code,
      projectName: v.name,
      minutes: v.minutes,
      baselineShare:
        baseTotal >= 600 ? Math.round((base * 100) / baseTotal) : null,
    };
  });

  // 予算超過の工程への工数
  const phaseIds = [...new Set(entries.map((e) => e.phaseId))];
  const phaseActuals = await prisma.timeEntry.groupBy({
    by: ["phaseId"],
    where: { phaseId: { in: phaseIds } },
    _sum: { minutes: true },
  });
  const overBudgetPhases = [];
  for (const pid of phaseIds) {
    const e0 = entries.find((e) => e.phaseId === pid)!;
    const actual =
      phaseActuals.find((p) => p.phaseId === pid)?._sum.minutes ?? 0;
    if (e0.phase.budgetMinutes > 0 && actual > e0.phase.budgetMinutes) {
      overBudgetPhases.push({
        projectName: e0.project.name,
        phase: e0.phase.name,
        minutes: entries
          .filter((e) => e.phaseId === pid)
          .reduce((s, e) => s + e.minutes, 0),
      });
    }
  }
  const due = addDaysStr(period.end, company.submissionGraceDays);
  const submitted = period.submittedAt
    ? ds(new Date(period.submittedAt.getTime() + 9 * 3600_000))
    : null;
  const daysLate =
    submitted && submitted > due
      ? Math.round((d(submitted).getTime() - d(due).getTime()) / 86_400_000)
      : 0;

  const flags = extractPeriodFlags({
    days,
    shares,
    overBudgetPhases,
    gapThreshold: company.gapThresholdMinutes,
    daysLate,
  });
  const total = shares.reduce((s, x) => s + x.minutes, 0);
  const top = [...shares].sort((a, b) => b.minutes - a.minutes).slice(0, 3);
  const fallback: PeriodSummary = {
    summary:
      total === 0
        ? "この期間の工数はありません。"
        : `合計 ${formatHm(total)}。${top.map((t) => `${t.projectName} ${formatHm(t.minutes)}`).join("、")}。`,
    cautions: flags.map(flagText),
    flags,
  };

  const res = await callTsumugi({
    feature: "SUMMARIZE_PERIOD",
    user: { id: actor.id },
    system: SUMMARIZE_PERIOD_PROMPT,
    data: {
      period: { start: period.start, end: period.end, totalMinutes: total },
      shares: top.map((t) => ({
        project: t.projectName,
        minutes: t.minutes,
        hm: formatHm(t.minutes),
        share: percent(t.minutes, total),
      })),
      flags: flags.map(flagText),
      gapReasons: days
        .filter((x) => x.gapReason)
        .map((x) => ({ date: formatDateJa(x.date), reason: x.gapReason })),
    },
    schema: summarizePeriodSchema,
    effort: "low",
    cacheTtlSeconds: 7 * 24 * 60 * 60,
  });
  if (!res.ok) return { value: fallback, ai: false };
  return {
    value: {
      summary: clip(res.data.summary, 100),
      // 注意点はコードの抽出と数を合わせる（AI が足したものは捨てる）
      cautions:
        flags.length === 0
          ? []
          : res.data.cautions.slice(0, flags.length).map((c) => clip(c, 60)),
      flags,
    },
    ai: true,
  };
}

// ------------------------------------------------------------------
// 4. 月次採算レポートの下書き
// ------------------------------------------------------------------

const yen = (n: number) => `¥${n.toLocaleString("ja-JP")}`;

export async function monthlyFacts(ym: string) {
  const prev = addMonths(ym, -1);
  const [rows, prevRows, entries, prevEntries, projects, expenses] =
    await Promise.all([
      prisma.monthlyLaborCost.findMany({ where: { yearMonth: ym } }),
      prisma.monthlyLaborCost.findMany({ where: { yearMonth: prev } }),
      prisma.timeEntry.findMany({
        where: {
          date: { gte: d(firstDayOfMonth(ym)), lte: d(lastDayOfMonth(ym)) },
        },
        select: { minutes: true, project: { select: { kind: true } } },
      }),
      prisma.timeEntry.aggregate({
        where: {
          date: { gte: d(firstDayOfMonth(prev)), lte: d(lastDayOfMonth(prev)) },
        },
        _sum: { minutes: true },
      }),
      prisma.project.findMany({
        select: {
          id: true,
          code: true,
          name: true,
          kind: true,
          revenueAmount: true,
          phases: {
            select: {
              id: true,
              name: true,
              budgetMinutes: true,
              remainingMinutes: true,
            },
          },
        },
      }),
      prisma.expense.groupBy({ by: ["projectId"], _sum: { amount: true } }),
    ]);
  const total = entries.reduce((s, e) => s + e.minutes, 0);
  const direct = entries
    .filter((e) => e.project.kind === "WORK")
    .reduce((s, e) => s + e.minutes, 0);
  const labor = rows.reduce((s, r) => s + r.laborCost, 0);
  const prevLabor = prevRows.reduce((s, r) => s + r.laborCost, 0);

  // プロジェクトごとの累計原価（締め済みの確定値＋経費）
  const allFixed = await prisma.monthlyLaborCost.groupBy({
    by: ["projectId"],
    where: { yearMonth: { lte: ym } },
    _sum: { laborCost: true },
  });
  const actuals = await prisma.timeEntry.groupBy({
    by: ["phaseId"],
    _sum: { minutes: true },
  });
  const perProject = projects
    .filter((p) => p.kind === "WORK" && rows.some((r) => r.projectId === p.id))
    .map((p) => {
      const monthCost = rows
        .filter((r) => r.projectId === p.id)
        .reduce((s, r) => s + r.laborCost, 0);
      const monthMinutes = rows
        .filter((r) => r.projectId === p.id)
        .reduce((s, r) => s + r.minutes, 0);
      const cumulative =
        (allFixed.find((f) => f.projectId === p.id)?._sum.laborCost ?? 0) +
        (expenses.find((e) => e.projectId === p.id)?._sum.amount ?? 0);
      const budget = summarizeProject(
        p.phases.map((ph) => ({
          ...ph,
          actualMinutes:
            actuals.find((a) => a.phaseId === ph.id)?._sum.minutes ?? 0,
        })),
      );
      const margin =
        p.revenueAmount && p.revenueAmount > 0
          ? percent(p.revenueAmount - cumulative, p.revenueAmount)
          : null;
      return {
        code: p.code,
        name: p.name,
        monthMinutes,
        monthLaborCost: monthCost,
        cumulativeCost: cumulative,
        revenue: p.revenueAmount,
        grossMarginPercent: margin,
        burnRate: budget.burnRate,
        budgetLevel: budget.level,
      };
    })
    .sort((a, b) => b.monthLaborCost - a.monthLaborCost);

  return {
    yearMonth: ym,
    totalMinutes: total,
    totalHours: Math.round(total / 60),
    utilizationPercent: percent(direct, total),
    laborCost: labor,
    prevMonth: prev,
    prevLaborCost: prevRows.length > 0 ? prevLabor : null,
    prevTotalHours: prevEntries._sum.minutes
      ? Math.round(prevEntries._sum.minutes / 60)
      : null,
    projects: perProject,
  };
}

export function monthlyReportTemplate(
  f: Awaited<ReturnType<typeof monthlyFacts>>,
): MonthlyReport {
  const [y, m] = f.yearMonth.split("-").map(Number);
  const good = f.projects
    .filter((p) => p.grossMarginPercent !== null)
    .sort((a, b) => b.grossMarginPercent! - a.grossMarginPercent!);
  const risky = f.projects.filter(
    (p) =>
      p.budgetLevel === "OVER" ||
      (p.grossMarginPercent !== null && p.grossMarginPercent < 20),
  );
  const sections = [
    {
      heading: "全体の概況",
      body:
        `工数は合計 ${f.totalHours} 時間、業務の比率（社内業務を除いた割合）は ${f.utilizationPercent ?? "-"}% でした。人件費は ${yen(f.laborCost)} です。` +
        (f.prevLaborCost !== null
          ? `前月（${f.prevMonth}）の人件費は ${yen(f.prevLaborCost)} でした。`
          : ""),
    },
  ];
  if (good.length > 0) {
    sections.push({
      heading: "採算の良いプロジェクト",
      body:
        good
          .slice(0, 3)
          .map((p) => `${p.name}（粗利率 ${p.grossMarginPercent}%）`)
          .join("、") + "。",
    });
  }
  if (risky.length > 0) {
    sections.push({
      heading: "注意が必要なプロジェクト",
      body:
        risky
          .slice(0, 3)
          .map(
            (p) =>
              `${p.name}（${p.budgetLevel === "OVER" ? `消化率 ${p.burnRate ?? "-"}%` : `粗利率 ${p.grossMarginPercent}%`}）`,
          )
          .join("、") + "。残り見込みと体制を確認してください。",
    });
  }
  return { title: `${y} 年 ${m} 月の採算レポート`, sections };
}

export async function monthlyReport(
  actor: SessionUser,
  ym: string,
): Promise<
  (CommentResult<MonthlyReport> & { unknownNumbers: string[] }) | null
> {
  if (actor.role !== "ADMIN") return null;
  const closed = await prisma.closingMonth.findUnique({
    where: { yearMonth: ym },
  });
  if (!closed?.closed) return null;
  const facts = await monthlyFacts(ym);
  const fallback = monthlyReportTemplate(facts);
  const yenFacts = {
    ...facts,
    laborCostText: yen(facts.laborCost),
    prevLaborCostText:
      facts.prevLaborCost !== null ? yen(facts.prevLaborCost) : null,
    projects: facts.projects.slice(0, 8).map((p) => ({
      ...p,
      monthLaborCostText: yen(p.monthLaborCost),
      cumulativeCostText: yen(p.cumulativeCost),
      revenueText: p.revenue !== null ? yen(p.revenue) : null,
    })),
  };
  const res = await callTsumugi({
    feature: "MONTHLY_REPORT",
    user: { id: actor.id },
    system: MONTHLY_REPORT_PROMPT,
    data: yenFacts,
    schema: monthlyReportSchema,
    effort: "medium",
    cacheTtlSeconds: 24 * 60 * 60,
  });
  if (!res.ok) return { value: fallback, ai: false, unknownNumbers: [] };
  const report: MonthlyReport = {
    title: clip(res.data.title, 40),
    sections: res.data.sections
      .slice(0, 4)
      .map((s) => ({ heading: clip(s.heading, 24), body: clip(s.body, 320) })),
  };
  // データにない数値が混ざっていないか、コードで照合する
  const allowed = new Set<string>();
  const collect = (v: unknown) => {
    if (typeof v === "number") allowed.add(String(v));
    else if (typeof v === "string")
      for (const n of v.match(/\d[\d,]*(?:\.\d+)?/g) ?? [])
        allowed.add(n.replaceAll(",", ""));
    else if (Array.isArray(v)) v.forEach(collect);
    else if (v && typeof v === "object") Object.values(v).forEach(collect);
  };
  collect(yenFacts);
  const unknownNumbers = report.sections.flatMap((s) =>
    findUnknownNumbers(`${s.body}`, allowed),
  );
  return { value: report, ai: true, unknownNumbers };
}
