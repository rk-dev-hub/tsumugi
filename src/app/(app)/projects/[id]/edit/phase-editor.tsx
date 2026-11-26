"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { formatHm } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { savePhasesAction } from "../../actions";

type Row = {
  id?: string;
  name: string;
  budgetMinutes: number;
  remainingMinutes: number | null;
  active: boolean;
  actualMinutes: number;
};

const toHours = (m: number | null) =>
  m === null ? "" : String(Math.round((m / 60) * 100) / 100);
const toMinutes = (h: string) =>
  h.trim() === "" ? null : Math.max(0, Math.round(Number(h) * 60));

export function PhaseEditor({
  projectId,
  initial,
}: {
  projectId: string;
  initial: Row[];
}) {
  const [rows, setRows] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const set = (i: number, patch: Partial<Row>) =>
    setRows(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j], next[i]];
    setRows(next);
  };
  const total = rows.reduce((s, r) => s + r.budgetMinutes, 0);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-muted-foreground text-xs">
        予算と残り見込みは時間で入力します（0.25 = 15
        分）。残り見込みを空欄にすると「予算 −
        実績」で自動計算します。工数のある工程を消すと無効になります。
      </p>
      {error ? (
        <p
          className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="text-muted-foreground text-xs">
            <tr>
              <th className="py-1 text-left font-medium">工程</th>
              <th className="w-28 py-1 text-right font-medium">予算（h）</th>
              <th className="w-20 py-1 text-right font-medium">実績</th>
              <th className="w-28 py-1 text-right font-medium">
                残り見込み（h）
              </th>
              <th className="w-16 py-1 text-center font-medium">有効</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.id ?? `new-${i}`}
                className={r.active ? "" : "opacity-60"}
              >
                <td className="py-1 pr-2">
                  <Input
                    value={r.name}
                    maxLength={50}
                    onChange={(e) => set(i, { name: e.target.value })}
                    aria-label={`${i + 1} 行目の工程名`}
                    className="h-9"
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={toHours(r.budgetMinutes)}
                    onChange={(e) =>
                      set(i, { budgetMinutes: toMinutes(e.target.value) ?? 0 })
                    }
                    aria-label={`${r.name} の予算`}
                    className="tabular h-9 text-right"
                  />
                </td>
                <td className="tabular text-muted-foreground py-1 pr-2 text-right">
                  {formatHm(r.actualMinutes)}
                </td>
                <td className="py-1 pr-2">
                  <Input
                    type="number"
                    min={0}
                    step={0.25}
                    value={toHours(r.remainingMinutes)}
                    placeholder="自動"
                    onChange={(e) =>
                      set(i, { remainingMinutes: toMinutes(e.target.value) })
                    }
                    aria-label={`${r.name} の残り見込み`}
                    className="tabular h-9 text-right"
                  />
                </td>
                <td className="py-1 text-center">
                  <input
                    type="checkbox"
                    checked={r.active}
                    onChange={(e) => set(i, { active: e.target.checked })}
                    aria-label={`${r.name} を有効にする`}
                    className="accent-[var(--primary)]"
                  />
                </td>
                <td className="py-1">
                  <div className="flex justify-end gap-0.5">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(i, -1)}
                      aria-label="上へ"
                      disabled={i === 0}
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => move(i, 1)}
                      aria-label="下へ"
                      disabled={i === rows.length - 1}
                    >
                      <ArrowDown />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setRows(rows.filter((_, j) => j !== i))}
                      aria-label={`${r.name} を削除`}
                      disabled={rows.length === 1}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t">
              <td className="py-2 text-xs font-medium">合計</td>
              <td className="tabular py-2 pr-4 text-right font-semibold">
                {formatHm(total)}
              </td>
              <td colSpan={4} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            setRows([
              ...rows,
              {
                name: "",
                budgetMinutes: 0,
                remainingMinutes: null,
                active: true,
                actualMinutes: 0,
              },
            ])
          }
          disabled={rows.length >= 50}
        >
          <Plus aria-hidden />
          工程を追加
        </Button>
        <div className="flex-1" />
        <Button
          variant="grad"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              if (rows.some((r) => !r.name.trim()))
                return setError("工程名を入力してください。");
              const r = await savePhasesAction(
                projectId,
                rows.map(
                  ({ id, name, budgetMinutes, remainingMinutes, active }) => ({
                    id,
                    name: name.trim(),
                    budgetMinutes,
                    remainingMinutes,
                    active,
                  }),
                ),
              );
              if (!r?.ok)
                return setError(r?.message ?? "保存できませんでした。");
              toast(r.message ?? "保存しました");
              router.refresh();
            })
          }
        >
          {pending ? "保存中…" : "工程と予算を保存"}
        </Button>
      </div>
    </div>
  );
}
