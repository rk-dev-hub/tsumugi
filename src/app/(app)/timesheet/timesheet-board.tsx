"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Play,
  Send,
  Undo2,
} from "lucide-react";
import { addDaysStr, formatDateJa } from "@/lib/date-range";
import { formatClock, formatHm } from "@/lib/minutes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge, type BadgeVariant } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { projectColor } from "@/components/project-color";
import { PageHeader } from "@/components/page-header";
import {
  isEditableStatus,
  type PeriodStatus,
} from "@/features/approval/domain/transitions";
import {
  saveEntryAction,
  startTimerAction,
  submitPeriodAction,
  withdrawPeriodAction,
  discardTimerAction,
} from "@/features/timesheet/actions";
import type {
  EntryView,
  TargetOption,
  WeekView,
} from "@/features/timesheet/usecase";
import { Timeline, type DraftBlock } from "./timeline";
import { EntryDialog, entryToDraft, type EntryDraft } from "./entry-dialog";
import { AttendanceDialog, type AttendanceTarget } from "./attendance-dialog";
import { TsumugiComposer, type ComposerDraft } from "./composer";
import { TsumugiMark } from "@/components/tsumugi/mark";

const STATUS: Record<PeriodStatus, { label: string; variant: BadgeVariant }> = {
  NONE: { label: "未提出", variant: "default" },
  SUBMITTED: { label: "提出済み", variant: "info" },
  APPROVED: { label: "承認済み", variant: "success" },
  REJECTED: { label: "差戻し", variant: "destructive" },
  WITHDRAWN: { label: "取り下げ", variant: "warning" },
};

export function TimesheetBoard({
  week,
  today,
  initialDay,
  targets,
  categories,
  holidays,
  aiEnabled,
}: {
  week: WeekView;
  today: string;
  initialDay: string;
  targets: TargetOption[];
  categories: { id: string; name: string }[];
  holidays: Record<string, string>;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [day, setDay] = useState(initialDay);
  const [dialog, setDialog] = useState<{
    draft: EntryDraft;
    readOnly: boolean;
    existing: EntryView | null;
  } | null>(null);
  const [attTarget, setAttTarget] = useState<AttendanceTarget | null>(null);
  const [composerDraft, setComposerDraft] = useState<ComposerDraft | null>(
    null,
  );
  const [pending, start] = useTransition();

  const periodOfDay = (d: string) =>
    week.periods.find((p) => d >= p.start && d <= p.end)!;
  const maxDate = addDaysStr(today, 7);
  const editable = (d: string) => {
    const p = periodOfDay(d);
    return (
      Boolean(p) && !p.closed && isEditableStatus(p.status) && d <= maxDate
    );
  };

  const attendance = useMemo(
    () => Object.fromEntries(week.dayViews.map((d) => [d.date, d.attendance])),
    [week.dayViews],
  );

  const drafts: DraftBlock[] = (composerDraft?.rows ?? []).map((r, i) => {
    const t = targets.find((x) => x.projectId === r.projectId);
    return {
      key: `draft-${i}`,
      date: composerDraft!.date,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
      colorIndex: t?.colorIndex ?? null,
      label: t?.projectName ?? r.note ?? "対象未選択",
      warn: r.lowConfidence || r.overlapsExisting || r.overlapsDraft,
    };
  });

  function openEntry(e: EntryView) {
    setDialog({
      draft: entryToDraft(e),
      readOnly: !editable(e.date),
      existing: e,
    });
  }

  function createAt(date: string, startMinute: number, endMinute: number) {
    const recent = week.entries.at(-1);
    const t = recent
      ? targets.find((x) => x.projectId === recent.projectId)
      : targets[0];
    setDialog({
      draft: {
        id: null,
        date,
        startMinute,
        endMinute,
        projectId: t?.projectId ?? null,
        phaseId: recent && t ? recent.phaseId : (t?.phases[0]?.id ?? null),
        workCategoryId: null,
        note: "",
      },
      readOnly: false,
      existing: null,
    });
  }

  function change(e: EntryView, date: string, s: number, en: number) {
    start(async () => {
      const r = await saveEntryAction(e.id, {
        date,
        startMinute: s,
        endMinute: en,
        phaseId: e.phaseId,
        workCategoryId: e.workCategoryId ?? "",
        note: e.note,
      });
      if (!r.ok) {
        toast(r.message ?? "変更できませんでした", "error");
        router.refresh();
      }
    });
  }

  const weekTotal = week.entries.reduce((s, e) => s + e.minutes, 0);
  const prevWeek = addDaysStr(week.weekStart, -7);
  const nextWeek = addDaysStr(week.weekStart, 7);

  // プロジェクト別 × 日 の集計
  const summary = useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        colorIndex: number;
        perDay: Record<string, number>;
        total: number;
      }
    >();
    for (const e of week.entries) {
      const row = m.get(e.projectId) ?? {
        name: e.projectName,
        colorIndex: e.colorIndex,
        perDay: {},
        total: 0,
      };
      row.perDay[e.date] = (row.perDay[e.date] ?? 0) + e.minutes;
      row.total += e.minutes;
      m.set(e.projectId, row);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [week.entries]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="工数"
        description={
          <>
            {formatDateJa(week.days[0])} 〜 {formatDateJa(week.days[6])} ・
            今週の合計{" "}
            <span className="tabular text-foreground font-semibold">
              {formatHm(weekTotal)}
            </span>
          </>
        }
        actions={
          <div className="flex items-center gap-1">
            <Link
              href={`/timesheet?week=${prevWeek}`}
              className="hover:bg-surface-2 rounded-lg border p-2"
              aria-label="前の週"
            >
              <ChevronLeft className="size-4" />
            </Link>
            <Link
              href={`/timesheet?day=${today}`}
              className="hover:bg-surface-2 rounded-lg border px-3 py-1.5 text-sm"
            >
              今週
            </Link>
            <Link
              href={`/timesheet?week=${nextWeek}`}
              className="hover:bg-surface-2 rounded-lg border p-2"
              aria-label="次の週"
            >
              <ChevronRight className="size-4" />
            </Link>
          </div>
        }
      />

      {/* 提出の状態 */}
      <div className="grid gap-3 md:grid-cols-2">
        {week.periods.map((p) => {
          const st = STATUS[p.status];
          const canSubmit =
            !p.closed && isEditableStatus(p.status) && p.start <= today;
          return (
            <div
              key={p.start}
              className="bg-surface flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 shadow-sm"
            >
              <CalendarClock className="text-primary size-4" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {formatDateJa(p.start)} 〜 {formatDateJa(p.end)}
                </p>
                <div className="mt-0.5 flex items-center gap-2">
                  <Badge variant={st.variant}>{st.label}</Badge>
                  {p.closed ? <Badge variant="outline">締め済み</Badge> : null}
                </div>
                {p.status === "REJECTED" && p.comment ? (
                  <p className="text-destructive mt-1 text-xs">
                    差戻しの理由: {p.comment}
                  </p>
                ) : null}
              </div>
              {canSubmit ? (
                <Button
                  size="sm"
                  variant="grad"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await submitPeriodAction(p.start);
                      toast(
                        r.message ??
                          (r.ok ? "提出しました" : "提出できませんでした"),
                        r.ok ? "success" : "error",
                      );
                    })
                  }
                >
                  <Send aria-hidden />
                  提出
                </Button>
              ) : null}
              {p.status === "SUBMITTED" && !p.closed ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await withdrawPeriodAction(p.start);
                      toast(r.message ?? "", r.ok ? "success" : "error");
                    })
                  }
                >
                  <Undo2 aria-hidden />
                  取り下げ
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        {aiEnabled ? (
          <TsumugiComposer
            date={day}
            editable={editable(day)}
            step={week.step}
            targets={targets}
            categories={categories}
            draft={composerDraft}
            onDraft={setComposerDraft}
          />
        ) : (
          <section
            aria-label="Tsumugi のひとこと入力"
            className="bg-tsumugi-grad border-tsumugi-border flex flex-col justify-center gap-1.5 rounded-2xl border px-4 py-3 text-sm"
          >
            <p className="text-tsumugi-foreground flex items-center gap-2 font-semibold">
              <TsumugiMark className="size-5" />
              ひとことで記録
              <span className="bg-surface/70 rounded-full px-2 py-0.5 text-[11px] font-normal">
                API キーの設定で使えます
              </span>
            </p>
            <p className="text-tsumugi-foreground/80 text-xs leading-relaxed">
              「9時半から A 社定例 1
              時間、午後はコーディング」のような一言から、Tsumugi
              が工数の下書きを作ります。今はタイムラインの空いている所をドラッグして追加できます（ブロックはドラッグで移動、下端で長さを変更）。
            </p>
          </section>
        )}
        <TimerStart
          targets={targets}
          categories={categories}
          running={Boolean(week.timer)}
        />
      </div>

      {/* スマホ: 日の切り替え */}
      <div
        className="flex gap-1 overflow-x-auto lg:hidden"
        role="tablist"
        aria-label="日付"
      >
        {week.days.map((d) => (
          <button
            key={d}
            role="tab"
            aria-selected={d === day}
            onClick={() => setDay(d)}
            className={cn(
              "flex min-w-12 flex-1 flex-col items-center rounded-xl border px-2 py-1.5 text-xs",
              d === day
                ? "bg-grad border-transparent text-white shadow"
                : "bg-surface",
            )}
          >
            <span>{formatDateJa(d).replace(/^\d+\//, "")}</span>
            <span className="tabular text-[10px] opacity-80">
              {formatHm(
                week.dayViews.find((x) => x.date === d)?.entryMinutes ?? 0,
              )}
            </span>
          </button>
        ))}
      </div>

      {/* PC: 週 / スマホ: 選んだ日 */}
      <div className="hidden lg:block">
        <Timeline
          days={week.days}
          entries={week.entries}
          drafts={drafts}
          step={week.step}
          today={today}
          holidays={holidays}
          editable={editable}
          attendance={attendance}
          onCreate={createAt}
          onChange={change}
          onOpen={openEntry}
        />
      </div>
      <div className="lg:hidden">
        <Timeline
          days={[day]}
          entries={week.entries.filter((e) => e.date === day)}
          drafts={drafts.filter((x) => x.date === day)}
          step={week.step}
          today={today}
          holidays={holidays}
          editable={editable}
          attendance={attendance}
          onCreate={createAt}
          onChange={change}
          onOpen={openEntry}
        />
      </div>

      {/* 日ごとの勤務時間と差 */}
      <section
        aria-label="日ごとの勤務時間"
        className="bg-surface overflow-x-auto rounded-2xl border shadow-sm"
      >
        <table className="w-full min-w-[44rem] text-sm">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="px-3 py-2 text-left font-medium">日付</th>
              {week.days.map((d) => (
                <th
                  key={d}
                  className={cn(
                    "px-2 py-2 text-center font-medium",
                    d === today && "text-primary",
                  )}
                >
                  {formatDateJa(d)}
                </th>
              ))}
              <th className="px-3 py-2 text-right font-medium">合計</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((row) => (
              <tr key={row.name} className="border-b last:border-b-0">
                <th className="px-3 py-1.5 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: projectColor(row.colorIndex).solid }}
                      aria-hidden
                    />
                    <span className="truncate">{row.name}</span>
                  </span>
                </th>
                {week.days.map((d) => (
                  <td key={d} className="tabular px-2 py-1.5 text-center">
                    {row.perDay[d] ? (
                      formatHm(row.perDay[d])
                    ) : (
                      <span className="text-muted-foreground/50">·</span>
                    )}
                  </td>
                ))}
                <td className="tabular px-3 py-1.5 text-right font-medium">
                  {formatHm(row.total)}
                </td>
              </tr>
            ))}
            <tr className="bg-surface-2/60 border-t">
              <th className="px-3 py-2 text-left font-medium">工数の合計</th>
              {week.dayViews.map((d) => (
                <td
                  key={d.date}
                  className="tabular px-2 py-2 text-center font-medium"
                >
                  {d.entryMinutes ? formatHm(d.entryMinutes) : "—"}
                </td>
              ))}
              <td className="tabular px-3 py-2 text-right font-semibold">
                {formatHm(weekTotal)}
              </td>
            </tr>
            <tr>
              <th className="px-3 py-2 text-left font-medium">勤務時間</th>
              {week.dayViews.map((d) => {
                const a = d.attendance;
                const work = a
                  ? a.endMinute - a.startMinute - a.breakMinutes
                  : null;
                const gap = work !== null ? work - d.entryMinutes : null;
                const over = gap !== null && Math.abs(gap) > week.gapThreshold;
                const missing = !a && d.entryMinutes > 0;
                return (
                  <td key={d.date} className="px-1 py-1.5 text-center">
                    <button
                      type="button"
                      onClick={() =>
                        setAttTarget({
                          date: d.date,
                          value: d.attendance,
                          entryMinutes: d.entryMinutes,
                        })
                      }
                      className={cn(
                        "hover:bg-surface-2 w-full rounded-lg px-1 py-1 text-xs",
                        missing && "text-warning",
                        over && "bg-warning-soft text-warning",
                      )}
                      aria-label={`${formatDateJa(d.date)} の勤務時間を${editable(d.date) ? "入力" : "見る"}`}
                    >
                      {a ? (
                        <>
                          <span className="tabular block">
                            {formatClock(a.startMinute)}–
                            {a.endMinute >= 1440
                              ? `翌${formatClock(a.endMinute - 1440)}`
                              : formatClock(a.endMinute)}
                          </span>
                          <span className="tabular block opacity-70">
                            {formatHm(work!)}
                            {over ? (
                              <>
                                {" "}
                                <AlertTriangle
                                  className="inline size-3"
                                  aria-label="差が大きい"
                                />
                              </>
                            ) : null}
                          </span>
                        </>
                      ) : editable(d.date) ? (
                        <span
                          className={
                            missing ? "font-medium" : "text-muted-foreground"
                          }
                        >
                          {missing ? "未入力" : "＋ 入力"}
                        </span>
                      ) : (
                        "—"
                      )}
                    </button>
                  </td>
                );
              })}
              <td />
            </tr>
          </tbody>
        </table>
      </section>

      <EntryDialog
        draft={dialog?.draft ?? null}
        readOnly={dialog?.readOnly ?? false}
        existingTarget={
          dialog?.existing
            ? {
                projectId: dialog.existing.projectId,
                projectName: dialog.existing.projectName,
                phaseId: dialog.existing.phaseId,
                phaseName: dialog.existing.phaseName,
              }
            : null
        }
        days={week.days}
        step={week.step}
        targets={targets}
        categories={categories}
        onClose={() => setDialog(null)}
      />
      <AttendanceDialog
        target={attTarget}
        step={week.step}
        threshold={week.gapThreshold}
        readOnly={attTarget ? !editable(attTarget.date) : false}
        onClose={() => setAttTarget(null)}
      />
    </div>
  );
}

function TimerStart({
  targets,
  categories,
  running,
}: {
  targets: TargetOption[];
  categories: { id: string; name: string }[];
  running: boolean;
}) {
  const [projectId, setProjectId] = useState(targets[0]?.projectId ?? "");
  const project = targets.find((t) => t.projectId === projectId);
  const [phaseId, setPhaseId] = useState(project?.phases[0]?.id ?? "");
  const [categoryId, setCategoryId] = useState("");
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <section
      aria-label="タイマー"
      className="bg-surface flex flex-col gap-2 rounded-2xl border p-4 shadow-sm"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Play className="text-primary size-4" aria-hidden />
        タイマー
      </h2>
      {running ? (
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground text-xs">
            動いています。止めると工数に記録します（ヘッダーの ■）。
          </p>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive self-start"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await discardTimerAction();
                toast(r.message ?? "", r.ok ? "success" : "error");
              })
            }
          >
            記録せずに破棄
          </Button>
        </div>
      ) : (
        <>
          <Select
            aria-label="プロジェクト"
            value={projectId}
            onChange={(e) => {
              setProjectId(e.target.value);
              setPhaseId(
                targets.find((t) => t.projectId === e.target.value)?.phases[0]
                  ?.id ?? "",
              );
            }}
            className="h-9 text-sm"
          >
            {targets.map((t) => (
              <option key={t.projectId} value={t.projectId}>
                {t.projectName}
              </option>
            ))}
          </Select>
          <div className="grid grid-cols-2 gap-2">
            <Select
              aria-label="工程"
              value={phaseId}
              onChange={(e) => setPhaseId(e.target.value)}
              className="h-9 text-sm"
            >
              {project?.phases.map((ph) => (
                <option key={ph.id} value={ph.id}>
                  {ph.name}
                </option>
              ))}
            </Select>
            <Select
              aria-label="業務分類"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="h-9 text-sm"
            >
              <option value="">分類なし</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </div>
          <Button
            size="sm"
            variant="grad"
            disabled={pending || !phaseId}
            onClick={() =>
              start(async () => {
                const r = await startTimerAction({
                  phaseId,
                  workCategoryId: categoryId,
                  note: "",
                });
                toast(r.message ?? "", r.ok ? "success" : "error");
              })
            }
          >
            <Play aria-hidden className="fill-current" />
            開始
          </Button>
        </>
      )}
    </section>
  );
}
