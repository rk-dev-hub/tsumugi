"use client";

import { useActionState, useTransition } from "react";
import { Trash2 } from "lucide-react";
import { formatDateJa } from "@/lib/date-range";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/components/toast";
import { addExpenseAction, deleteExpenseAction } from "../actions";

type Expense = {
  id: string;
  date: string;
  kind: "OUTSOURCING" | "EXPENSE";
  amount: number;
  description: string;
};

export function ExpensePanel({
  projectId,
  expenses,
  canEdit,
}: {
  projectId: string;
  expenses: Expense[];
  canEdit: boolean;
}) {
  const [state, action, pending] = useActionState(addExpenseAction, null);
  const [deleting, startDelete] = useTransition();
  const toast = useToast();
  return (
    <Card>
      <CardHeader>
        <CardTitle>外注費・経費</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {canEdit ? (
          <form
            action={action}
            className="grid gap-2 sm:grid-cols-[9rem_8rem_8rem_1fr_auto] sm:items-end"
          >
            <input type="hidden" name="projectId" value={projectId} />
            <Input name="date" type="date" required aria-label="日付" />
            <Select name="kind" aria-label="種類" defaultValue="OUTSOURCING">
              <option value="OUTSOURCING">外注費</option>
              <option value="EXPENSE">経費</option>
            </Select>
            <Input
              name="amount"
              type="number"
              min={1}
              required
              placeholder="金額（円）"
              aria-label="金額"
              className="tabular"
            />
            <Input
              name="description"
              required
              maxLength={200}
              placeholder="内容"
              aria-label="内容"
            />
            <Button type="submit" variant="outline" disabled={pending}>
              追加
            </Button>
            {state?.message ? (
              <p
                className={`col-span-full text-sm ${state.ok ? "text-success" : "text-destructive"}`}
                role="alert"
              >
                {state.message}
              </p>
            ) : null}
          </form>
        ) : null}
        {expenses.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            まだ登録されていません。
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {expenses.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2">
                <span className="text-muted-foreground w-24 shrink-0 text-xs">
                  {formatDateJa(e.date)}
                </span>
                <span className="bg-surface-2 rounded px-1.5 text-xs">
                  {e.kind === "OUTSOURCING" ? "外注費" : "経費"}
                </span>
                <span className="min-w-0 flex-1 truncate">{e.description}</span>
                <span className="tabular font-medium">
                  ¥{e.amount.toLocaleString("ja-JP")}
                </span>
                {canEdit ? (
                  <button
                    type="button"
                    disabled={deleting}
                    aria-label={`${e.description} を削除`}
                    className="text-muted-foreground hover:text-destructive rounded p-1"
                    onClick={() =>
                      startDelete(async () => {
                        const r = await deleteExpenseAction(e.id);
                        toast(r?.message ?? "");
                      })
                    }
                  >
                    <Trash2 className="size-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
