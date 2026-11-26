"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { formatClock, formatHm } from "@/lib/minutes";
import { formatDateJa } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import {
  clearAttendanceAction,
  saveAttendanceAction,
} from "@/features/timesheet/actions";

export type AttendanceTarget = {
  date: string;
  value: {
    startMinute: number;
    endMinute: number;
    breakMinutes: number;
    gapReason: string;
  } | null;
  entryMinutes: number;
};

function label(m: number) {
  return m >= 1440 ? `翌 ${formatClock(m - 1440)}` : formatClock(m);
}

type Props = {
  target: AttendanceTarget | null;
  step: number;
  threshold: number;
  readOnly: boolean;
  onClose: () => void;
};

export function AttendanceDialog(props: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const { target, onClose } = props;
  useEffect(() => {
    if (!target) ref.current?.close();
    else if (!ref.current?.open) ref.current?.showModal();
  }, [target]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(ev) => {
        if (ev.target === ref.current) onClose();
      }}
      aria-labelledby="att-title"
      className="bg-surface text-foreground m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border p-0 shadow-2xl backdrop:bg-black/40"
    >
      {target ? (
        <AttendanceForm key={target.date} {...props} target={target} />
      ) : null}
    </dialog>
  );
}

function AttendanceForm({
  target,
  step,
  threshold,
  readOnly,
  onClose,
}: Props & { target: AttendanceTarget }) {
  const [s, setS] = useState(target.value?.startMinute ?? 540);
  const [e, setE] = useState(target.value?.endMinute ?? 1080);
  const [br, setBr] = useState(target.value?.breakMinutes ?? 60);
  const [reason, setReason] = useState(target.value?.gapReason ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const work = e - s - br;
  const gap = work - target.entryMinutes;
  const over = Math.abs(gap) > threshold;
  const starts: number[] = [];
  for (let m = 0; m < 1440; m += step) starts.push(m);
  const ends: number[] = [];
  for (let m = s + step; m <= s + 1440; m += step) ends.push(m);

  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        start(async () => {
          const r = await saveAttendanceAction({
            date: target.date,
            startMinute: s,
            endMinute: e,
            breakMinutes: br,
            gapReason: reason,
          });
          if (!r.ok) return setError(r.message ?? "保存できませんでした。");
          toast("勤務時間を保存しました");
          onClose();
        });
      }}
    >
      <div className="bg-grad-soft flex items-center justify-between rounded-t-2xl border-b px-5 py-3">
        <h2 id="att-title" className="font-semibold">
          勤務時間{" "}
          <span className="text-muted-foreground text-sm font-normal">
            {formatDateJa(target.date)}
          </span>
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
            className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          <Field label="始業" htmlFor="att-s">
            <Select
              id="att-s"
              value={s}
              onChange={(ev) => {
                const v = Number(ev.target.value);
                setS(v);
                if (e <= v) setE(v + 60);
              }}
              className="tabular"
            >
              {starts.map((m) => (
                <option key={m} value={m}>
                  {formatClock(m)}
                </option>
              ))}
              {!starts.includes(s) ? (
                <option value={s}>{formatClock(s)}</option>
              ) : null}
            </Select>
          </Field>
          <Field label="終業" htmlFor="att-e">
            <Select
              id="att-e"
              value={e}
              onChange={(ev) => setE(Number(ev.target.value))}
              className="tabular"
            >
              {ends.map((m) => (
                <option key={m} value={m}>
                  {label(m)}
                </option>
              ))}
              {!ends.includes(e) ? <option value={e}>{label(e)}</option> : null}
            </Select>
          </Field>
          <Field label="休憩（分）" htmlFor="att-b">
            <Input
              id="att-b"
              type="number"
              min={0}
              step={5}
              value={br}
              onChange={(ev) =>
                setBr(Math.max(0, Number(ev.target.value) || 0))
              }
              className="tabular"
            />
          </Field>
        </div>
        <div className="bg-surface-2 grid grid-cols-3 gap-2 rounded-lg p-3 text-center text-xs">
          <div>
            <p className="text-muted-foreground">勤務時間</p>
            <p className="tabular text-base font-semibold">
              {work > 0 ? formatHm(work) : "—"}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">工数の合計</p>
            <p className="tabular text-base font-semibold">
              {formatHm(target.entryMinutes)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">差</p>
            <p
              className={`tabular text-base font-semibold ${over ? "text-warning" : ""}`}
            >
              {work > 0 ? formatHm(gap) : "—"}
            </p>
          </div>
        </div>
        {over ? (
          <Field
            label="差の理由"
            htmlFor="att-r"
            hint={`差が ${threshold} 分を超える日は、提出のときに理由が必要です（200 文字まで）`}
          >
            <Textarea
              id="att-r"
              value={reason}
              maxLength={200}
              onChange={(ev) => setReason(ev.target.value)}
              rows={2}
              placeholder="例: 移動時間・社外の打ち合わせ待ち"
            />
          </Field>
        ) : null}
      </fieldset>
      {!readOnly ? (
        <div className="flex items-center gap-2 border-t px-5 py-3">
          {target.value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await clearAttendanceAction(target.date);
                  if (!r.ok)
                    return setError(r.message ?? "削除できませんでした。");
                  onClose();
                })
              }
            >
              クリア
            </Button>
          ) : null}
          <div className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            キャンセル
          </Button>
          <Button type="submit" variant="grad" size="sm" disabled={pending}>
            保存
          </Button>
        </div>
      ) : null}
    </form>
  );
}
