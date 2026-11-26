"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Trash2, X } from "lucide-react";
import { formatClock, formatHm } from "@/lib/minutes";
import { formatDateJa } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import {
  deleteEntryAction,
  saveEntryAction,
} from "@/features/timesheet/actions";
import type { EntryView, TargetOption } from "@/features/timesheet/usecase";

export type EntryDraft = {
  id: string | null;
  date: string;
  startMinute: number;
  endMinute: number;
  projectId: string | null;
  phaseId: string | null;
  workCategoryId: string | null;
  note: string;
};

export function entryToDraft(e: EntryView): EntryDraft {
  return {
    id: e.id,
    date: e.date,
    startMinute: e.startMinute,
    endMinute: e.endMinute,
    projectId: e.projectId,
    phaseId: e.phaseId,
    workCategoryId: e.workCategoryId,
    note: e.note,
  };
}

export function timeOptions(step: number, max = 1440) {
  const out: number[] = [];
  for (let m = 0; m <= max; m += step) out.push(m);
  return out;
}

type DialogProps = {
  draft: EntryDraft | null;
  days: string[];
  step: number;
  targets: TargetOption[];
  categories: { id: string; name: string }[];
  readOnly: boolean;
  /** 一覧にない（完了など）プロジェクトの既存の工数 */
  existingTarget?: {
    projectId: string;
    projectName: string;
    phaseId: string;
    phaseName: string;
  } | null;
  onClose: () => void;
};

export function EntryDialog(props: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { draft, onClose } = props;
  useEffect(() => {
    if (draft) {
      if (!ref.current?.open) ref.current?.showModal();
    } else ref.current?.close();
  }, [draft]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="entry-dialog-title"
      className="bg-surface text-foreground m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border p-0 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-[2px]"
    >
      {draft ? (
        <EntryForm
          key={`${draft.id ?? "new"}-${draft.date}-${draft.startMinute}-${draft.endMinute}`}
          {...props}
          draft={draft}
        />
      ) : null}
    </dialog>
  );
}

function EntryForm({
  draft,
  days,
  step,
  targets,
  categories,
  readOnly,
  existingTarget,
  onClose,
}: DialogProps & { draft: EntryDraft }) {
  const [v, setV] = useState<EntryDraft>(draft);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();

  const allTargets = useMemo(() => {
    if (
      !existingTarget ||
      targets.some((t) => t.projectId === existingTarget.projectId)
    )
      return targets;
    return [
      ...targets,
      {
        projectId: existingTarget.projectId,
        projectCode: "",
        projectName: `${existingTarget.projectName}（入力終了）`,
        projectKind: "WORK" as const,
        colorIndex: 0,
        clientName: null,
        startDate: "0000-01-01",
        endDate: null,
        phases: [
          { id: existingTarget.phaseId, name: existingTarget.phaseName },
        ],
      },
    ];
  }, [targets, existingTarget]);

  const project = allTargets.find((t) => t.projectId === v.projectId) ?? null;
  const times = timeOptions(step);

  function save() {
    if (!v.phaseId) return setError("プロジェクトと工程を選んでください。");
    start(async () => {
      const r = await saveEntryAction(v.id, {
        date: v.date,
        startMinute: v.startMinute,
        endMinute: v.endMinute,
        phaseId: v.phaseId,
        workCategoryId: v.workCategoryId ?? "",
        note: v.note,
      });
      if (!r.ok) return setError(r.message ?? "保存できませんでした。");
      toast(v.id ? "工数を更新しました" : "工数を追加しました");
      onClose();
    });
  }

  function remove() {
    if (!v.id) return;
    start(async () => {
      const r = await deleteEntryAction(v.id!);
      if (!r.ok) return setError(r.message ?? "削除できませんでした。");
      toast("工数を削除しました");
      onClose();
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      className="flex flex-col"
    >
      <div className="bg-grad-soft flex items-center justify-between rounded-t-2xl border-b px-5 py-3">
        <h2 id="entry-dialog-title" className="font-semibold">
          {readOnly ? "工数" : v.id ? "工数を編集" : "工数を追加"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="hover:bg-surface/60 rounded-md p-1"
          aria-label="閉じる"
        >
          <X className="size-4" />
        </button>
      </div>
      <fieldset
        disabled={readOnly || pending}
        className="flex flex-col gap-4 px-5 py-4"
      >
        {error ? (
          <p
            className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm whitespace-pre-line"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2">
          <Field label="日付" htmlFor="e-date">
            <Select
              id="e-date"
              value={v.date}
              onChange={(e) => setV({ ...v, date: e.target.value })}
            >
              {days.map((d) => (
                <option key={d} value={d}>
                  {formatDateJa(d)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="開始" htmlFor="e-start">
            <Select
              id="e-start"
              value={v.startMinute}
              onChange={(e) => {
                const s = Number(e.target.value);
                setV({
                  ...v,
                  startMinute: s,
                  endMinute: Math.max(v.endMinute, s + step),
                });
              }}
              className="tabular w-24"
            >
              {times.slice(0, -1).map((m) => (
                <option key={m} value={m}>
                  {formatClock(m)}
                </option>
              ))}
              {!times.includes(v.startMinute) ? (
                <option value={v.startMinute}>
                  {formatClock(v.startMinute)}
                </option>
              ) : null}
            </Select>
          </Field>
          <Field label="終了" htmlFor="e-end">
            <Select
              id="e-end"
              value={v.endMinute}
              onChange={(e) =>
                setV({ ...v, endMinute: Number(e.target.value) })
              }
              className="tabular w-24"
            >
              {times
                .filter((m) => m > v.startMinute)
                .map((m) => (
                  <option key={m} value={m}>
                    {formatClock(m)}
                  </option>
                ))}
              {!times.includes(v.endMinute) ? (
                <option value={v.endMinute}>{formatClock(v.endMinute)}</option>
              ) : null}
            </Select>
          </Field>
        </div>
        <p className="text-muted-foreground -mt-2 text-xs">
          長さ{" "}
          <span className="tabular text-foreground font-medium">
            {formatHm(v.endMinute - v.startMinute)}
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="プロジェクト" htmlFor="e-project">
            <Select
              id="e-project"
              value={v.projectId ?? ""}
              onChange={(e) => {
                const p = allTargets.find(
                  (t) => t.projectId === e.target.value,
                );
                setV({
                  ...v,
                  projectId: p?.projectId ?? null,
                  phaseId: p?.phases[0]?.id ?? null,
                });
              }}
              required
            >
              <option value="">選んでください</option>
              <optgroup label="業務">
                {allTargets
                  .filter((t) => t.projectKind === "WORK")
                  .map((t) => (
                    <option
                      key={t.projectId}
                      value={t.projectId}
                      disabled={
                        v.date < t.startDate ||
                        (t.endDate !== null && v.date > t.endDate)
                      }
                    >
                      {t.projectName}
                      {t.clientName ? `（${t.clientName}）` : ""}
                    </option>
                  ))}
              </optgroup>
              <optgroup label="社内">
                {allTargets
                  .filter((t) => t.projectKind === "INTERNAL")
                  .map((t) => (
                    <option key={t.projectId} value={t.projectId}>
                      {t.projectName}
                    </option>
                  ))}
              </optgroup>
            </Select>
          </Field>
          <Field label="工程" htmlFor="e-phase">
            <Select
              id="e-phase"
              value={v.phaseId ?? ""}
              onChange={(e) => setV({ ...v, phaseId: e.target.value || null })}
              required
            >
              {!project ? <option value="">—</option> : null}
              {project?.phases.map((ph) => (
                <option key={ph.id} value={ph.id}>
                  {ph.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="業務分類" htmlFor="e-category">
          <Select
            id="e-category"
            value={v.workCategoryId ?? ""}
            onChange={(e) =>
              setV({ ...v, workCategoryId: e.target.value || null })
            }
          >
            <option value="">（なし）</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="メモ" htmlFor="e-note" hint="500 文字まで">
          <Textarea
            id="e-note"
            value={v.note}
            maxLength={500}
            onChange={(e) => setV({ ...v, note: e.target.value })}
            rows={2}
          />
        </Field>
      </fieldset>
      {readOnly ? (
        <p className="text-muted-foreground border-t px-5 py-3 text-xs">
          提出済み・承認済み・締め済みのため編集できません。
        </p>
      ) : (
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {v.id ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={remove}
              disabled={pending}
              className="text-destructive"
            >
              <Trash2 aria-hidden />
              削除
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" variant="grad" size="sm" disabled={pending}>
            {pending ? "保存中…" : "保存"}
          </Button>
        </div>
      )}
    </form>
  );
}
