"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { formatDateJa } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import {
  addHolidayAction,
  deleteHolidayAction,
  saveCompanyAction,
} from "./actions";

type Company = {
  name: string;
  timeStepMinutes: number;
  gapThresholdMinutes: number;
  submissionGraceDays: number;
  requireTotpForManagers: boolean;
};

export function CompanyForm({ initial }: { initial: Company }) {
  const [v, setV] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  return (
    <Card>
      <CardHeader>
        <CardTitle>基本設定</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            start(async () => {
              setError(null);
              const r = await saveCompanyAction(v);
              if (!r.ok) return setError(r.message ?? null);
              toast(r.message ?? "保存しました");
              router.refresh();
            });
          }}
        >
          {error ? (
            <p
              className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <Field label="会社名" htmlFor="c-name">
            <Input
              id="c-name"
              value={v.name}
              maxLength={100}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="入力の刻み" htmlFor="c-step">
              <Select
                id="c-step"
                value={v.timeStepMinutes}
                onChange={(e) =>
                  setV({ ...v, timeStepMinutes: Number(e.target.value) })
                }
              >
                {[5, 10, 15, 30].map((m) => (
                  <option key={m} value={m}>
                    {m} 分
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="差の許容（分）" htmlFor="c-gap">
              <Input
                id="c-gap"
                type="number"
                min={0}
                max={120}
                value={v.gapThresholdMinutes}
                onChange={(e) =>
                  setV({
                    ...v,
                    gapThresholdMinutes: Number(e.target.value) || 0,
                  })
                }
                className="tabular"
              />
            </Field>
            <Field label="提出の猶予（日）" htmlFor="c-grace">
              <Input
                id="c-grace"
                type="number"
                min={0}
                max={14}
                value={v.submissionGraceDays}
                onChange={(e) =>
                  setV({
                    ...v,
                    submissionGraceDays: Number(e.target.value) || 0,
                  })
                }
                className="tabular"
              />
            </Field>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={v.requireTotpForManagers}
              onChange={(e) =>
                setV({ ...v, requireTotpForManagers: e.target.checked })
              }
              className="mt-0.5 accent-[var(--primary)]"
            />
            <span>
              管理者とマネージャーに 2 段階認証を必須にする
              <span className="text-muted-foreground block text-xs">
                オンにすると、未設定の人は次の操作のときに設定画面へ案内されます。
              </span>
            </span>
          </label>
          <div>
            <Button type="submit" variant="grad" disabled={pending}>
              保存する
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export function HolidayEditor({
  holidays,
  national,
}: {
  holidays: { date: string; name: string }[];
  national: { date: string; name: string }[];
}) {
  const [v, setV] = useState({ date: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  const run = (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    after?: () => void,
  ) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) return setError(r.message ?? null);
      toast(r.message ?? "");
      after?.();
      router.refresh();
    });
  return (
    <Card>
      <CardHeader>
        <CardTitle>会社の休日</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 text-sm">
        <p className="text-muted-foreground text-xs">
          土日と国民の祝日は自動で休日になります。夏季休暇・年末年始など会社独自の休日を登録してください。
        </p>
        {error ? (
          <p
            className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
            role="alert"
          >
            {error}
          </p>
        ) : null}
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => addHolidayAction(v),
              () => setV({ date: "", name: "" }),
            );
          }}
        >
          <Input
            type="date"
            value={v.date}
            onChange={(e) => setV({ ...v, date: e.target.value })}
            required
            aria-label="日付"
            className="w-40"
          />
          <Input
            value={v.name}
            onChange={(e) => setV({ ...v, name: e.target.value })}
            maxLength={50}
            required
            placeholder="名前（例: 夏季休暇）"
            aria-label="名前"
            className="min-w-0 flex-1"
          />
          <Button type="submit" variant="outline" disabled={pending}>
            追加
          </Button>
        </form>
        {holidays.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {holidays.map((h) => (
              <li key={h.date} className="flex items-center gap-3 px-3 py-1.5">
                <span className="tabular w-36 text-xs">
                  {h.date.slice(0, 4)}/{formatDateJa(h.date)}
                </span>
                <span className="flex-1">{h.name}</span>
                <button
                  type="button"
                  aria-label={`${h.name} を削除`}
                  className="text-muted-foreground hover:text-destructive p-1"
                  disabled={pending}
                  onClick={() => run(() => deleteHolidayAction(h.date))}
                >
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted-foreground">
            会社独自の休日はまだありません。
          </p>
        )}
        <div>
          <p className="text-muted-foreground mb-1 text-xs font-medium">
            これからの国民の祝日
          </p>
          <ul className="text-muted-foreground grid grid-cols-2 gap-x-4 text-xs">
            {national.map((h) => (
              <li key={h.date}>
                {formatDateJa(h.date)} {h.name}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
