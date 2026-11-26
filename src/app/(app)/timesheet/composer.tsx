"use client";

import { useState, useTransition } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { formatClock, formatHm } from "@/lib/minutes";
import { formatDateJa } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { TsumugiMark } from "@/components/tsumugi/mark";
import { draftEntriesAction } from "@/features/tsumugi/actions";
import { saveEntriesAction } from "@/features/timesheet/actions";
import type { TargetOption } from "@/features/timesheet/usecase";
import type { DraftRow } from "@/features/tsumugi/draft-post";
import { timeOptions } from "./entry-dialog";

export type ComposerDraft = { date: string; rows: DraftRow[] };

const EXAMPLES = [
  "9時半から A 社定例 1 時間、お昼までデザイン修正、午後はコーディング",
  "昨日は 10〜12 時に社内MTG、そのあと定時まで実装",
];

export function TsumugiComposer({
  date,
  editable,
  step,
  targets,
  categories,
  draft,
  onDraft,
}: {
  date: string;
  editable: boolean;
  step: number;
  targets: TargetOption[];
  categories: { id: string; name: string }[];
  draft: ComposerDraft | null;
  onDraft: (d: ComposerDraft | null) => void;
}) {
  const [text, setText] = useState("");
  const [question, setQuestion] = useState<{
    q: string;
    choices: string[];
  } | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  function send(body: string, previousQuestion?: string) {
    setInfo(null);
    setError(null);
    start(async () => {
      const r = await draftEntriesAction({
        text: body,
        date,
        previousQuestion,
      });
      if (r.kind === "ENTRIES") {
        setQuestion(null);
        onDraft({ date: r.date, rows: r.rows });
      } else if (r.kind === "CLARIFY") {
        setQuestion({ q: r.question, choices: r.choices });
      } else {
        setQuestion(null);
        setInfo(r.message);
      }
    });
  }

  function update(i: number, patch: Partial<DraftRow>) {
    if (!draft) return;
    onDraft({
      ...draft,
      rows: draft.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)),
    });
  }

  function commit() {
    if (!draft) return;
    const missing = draft.rows.findIndex((r) => !r.phaseId);
    if (missing >= 0)
      return setError(`${missing + 1} 行目のプロジェクトを選んでください。`);
    startSave(async () => {
      const r = await saveEntriesAction(
        draft.rows.map((x) => ({
          date: draft.date,
          startMinute: x.startMinute,
          endMinute: x.endMinute,
          phaseId: x.phaseId,
          workCategoryId: x.workCategoryId ?? "",
          note: x.note,
        })),
      );
      if (!r.ok) {
        return setError(
          r.index !== undefined
            ? `${r.index + 1} 行目: ${r.message}`
            : (r.message ?? "登録できませんでした。"),
        );
      }
      toast(r.message ?? "登録しました");
      onDraft(null);
      setText("");
    });
  }

  const times = timeOptions(step);
  const total =
    draft?.rows.reduce((s, r) => s + (r.endMinute - r.startMinute), 0) ?? 0;

  return (
    <section
      aria-label="Tsumugi のひとこと入力"
      className="bg-tsumugi-grad border-tsumugi-border relative overflow-hidden rounded-2xl border shadow-sm"
    >
      <div
        className="pointer-events-none absolute -top-16 -right-10 size-48 rounded-full bg-[var(--grad-to)] opacity-10 blur-3xl"
        aria-hidden
      />
      <form
        className="relative flex flex-col gap-2 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send(text.trim(), question?.q);
        }}
      >
        <div className="flex items-center gap-2">
          <TsumugiMark className="size-5" />
          <h2 className="text-tsumugi-foreground text-sm font-semibold">
            ひとことで記録
          </h2>
          <span className="text-tsumugi-foreground/70 text-xs">
            {formatDateJa(date)} の作業を Tsumugi が下書きします
          </span>
        </div>
        <div className="bg-surface/80 focus-within:ring-ring/40 flex items-end gap-2 rounded-xl border p-2 focus-within:ring-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                if (text.trim()) send(text.trim(), question?.q);
              }
            }}
            rows={2}
            maxLength={500}
            disabled={!editable || pending}
            placeholder={
              editable
                ? `例: ${EXAMPLES[0]}`
                : "この日は提出済み・締め済みのため入力できません"
            }
            aria-label="今日やったこと"
            className="placeholder:text-muted-foreground/70 min-h-12 flex-1 resize-none bg-transparent px-1 text-sm outline-none"
          />
          <Button
            type="submit"
            variant="grad"
            size="icon-sm"
            disabled={!editable || pending || !text.trim()}
            aria-label="下書きを作る"
            className="rounded-lg"
          >
            {pending ? <Sparkles className="animate-pulse" /> : <ArrowUp />}
          </Button>
        </div>
        {pending ? (
          <p className="text-tsumugi-foreground text-xs">
            Tsumugi が一日の工数を紡いでいます…
          </p>
        ) : null}
        {info ? (
          <p className="text-tsumugi-foreground text-sm">{info}</p>
        ) : null}
        {question ? (
          <div className="bg-surface/80 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
            <TsumugiMark />
            <span className="flex-1">{question.q}</span>
            {question.choices.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant="tsumugi"
                onClick={() => send(c, question.q)}
              >
                {c}
              </Button>
            ))}
          </div>
        ) : null}
      </form>

      {draft ? (
        <div className="bg-surface/90 relative border-t px-4 py-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">
              {formatDateJa(draft.date)} の下書き{" "}
              <span className="text-muted-foreground tabular">
                （{draft.rows.length} 件・{formatHm(total)}）
              </span>
            </p>
            <p className="text-muted-foreground text-xs">
              内容を確かめてから登録してください。
            </p>
          </div>
          {error ? (
            <p
              className="bg-destructive-soft text-destructive mb-2 rounded-md px-3 py-2 text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {draft.rows.map((r, i) => {
              const project =
                targets.find((t) => t.projectId === r.projectId) ?? null;
              const warn =
                r.lowConfidence ||
                r.overlapsExisting ||
                r.overlapsDraft ||
                r.outsideAttendance;
              return (
                <li
                  key={i}
                  className={`grid gap-2 rounded-lg border p-2 sm:grid-cols-[auto_auto_1fr_1fr_1fr_auto] sm:items-center ${warn ? "border-warning/60 bg-warning-soft/40" : ""}`}
                >
                  <div className="flex items-center gap-1">
                    <Select
                      aria-label="開始"
                      value={r.startMinute}
                      onChange={(e) =>
                        update(i, { startMinute: Number(e.target.value) })
                      }
                      className="tabular h-8 w-[5.5rem] text-xs"
                    >
                      {times.slice(0, -1).map((m) => (
                        <option key={m} value={m}>
                          {formatClock(m)}
                        </option>
                      ))}
                    </Select>
                    <span className="text-muted-foreground">–</span>
                    <Select
                      aria-label="終了"
                      value={r.endMinute}
                      onChange={(e) =>
                        update(i, { endMinute: Number(e.target.value) })
                      }
                      className="tabular h-8 w-[5.5rem] text-xs"
                    >
                      {times
                        .filter((m) => m > r.startMinute)
                        .map((m) => (
                          <option key={m} value={m}>
                            {formatClock(m)}
                          </option>
                        ))}
                    </Select>
                  </div>
                  <span className="tabular text-muted-foreground hidden text-xs sm:inline">
                    {formatHm(r.endMinute - r.startMinute)}
                  </span>
                  <Select
                    aria-label="プロジェクト"
                    value={r.projectId ?? ""}
                    onChange={(e) => {
                      const p = targets.find(
                        (t) => t.projectId === e.target.value,
                      );
                      update(i, {
                        projectId: p?.projectId ?? null,
                        phaseId: p?.phases[0]?.id ?? null,
                        lowConfidence: false,
                      });
                    }}
                    className="h-8 text-xs"
                  >
                    <option value="">プロジェクトを選ぶ</option>
                    {targets.map((t) => (
                      <option key={t.projectId} value={t.projectId}>
                        {t.projectName}
                      </option>
                    ))}
                  </Select>
                  <Select
                    aria-label="工程"
                    value={r.phaseId ?? ""}
                    onChange={(e) =>
                      update(i, { phaseId: e.target.value || null })
                    }
                    className="h-8 text-xs"
                  >
                    {!project ? <option value="">工程</option> : null}
                    {project?.phases.map((ph) => (
                      <option key={ph.id} value={ph.id}>
                        {ph.name}
                      </option>
                    ))}
                  </Select>
                  <div className="flex items-center gap-1">
                    <Select
                      aria-label="業務分類"
                      value={r.workCategoryId ?? ""}
                      onChange={(e) =>
                        update(i, { workCategoryId: e.target.value || null })
                      }
                      className="h-8 text-xs"
                    >
                      <option value="">分類なし</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      onDraft({
                        ...draft,
                        rows: draft.rows.filter((_, j) => j !== i),
                      })
                    }
                    className="text-muted-foreground hover:text-destructive justify-self-end rounded p-1"
                    aria-label={`${i + 1} 行目を削除`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                  <input
                    aria-label="メモ"
                    value={r.note}
                    maxLength={500}
                    onChange={(e) => update(i, { note: e.target.value })}
                    className="bg-surface-2 col-span-full h-8 rounded-md px-2 text-xs outline-none"
                  />
                  {warn ? (
                    <p className="text-warning col-span-full flex items-center gap-1 text-xs">
                      <AlertTriangle className="size-3.5" aria-hidden />
                      {[
                        r.lowConfidence && "対象を確認してください",
                        r.overlapsExisting && "既存の工数と重なっています",
                        r.overlapsDraft && "下書き同士が重なっています",
                        r.outsideAttendance && "勤務時間の外です",
                      ]
                        .filter(Boolean)
                        .join("・")}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onDraft(null)}
            >
              <X aria-hidden />
              やめる
            </Button>
            <Button
              type="button"
              variant="grad"
              size="sm"
              onClick={commit}
              disabled={saving || draft.rows.length === 0}
            >
              <Check aria-hidden />
              {saving ? "登録中…" : "まとめて登録"}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
