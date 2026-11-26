"use client";

import { useState, useTransition } from "react";
import type React from "react";
import { useRouter } from "next/navigation";
import { Check, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";
import { saveMasterAction } from "./actions";

type Row = { id: string; code: string; name: string; active: boolean };

export function MasterTable({ kind, rows }: { kind: string; rows: Row[] }) {
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [v, setV] = useState({ code: "", name: "", active: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const edit = (r: Row | null) => {
    setError(null);
    setEditing(r ? r.id : "new");
    setV(
      r
        ? { code: r.code, name: r.name, active: r.active }
        : { code: "", name: "", active: true },
    );
  };
  const save = (id: string | null) =>
    start(async () => {
      const r = await saveMasterAction(kind, id, v);
      if (!r.ok) return setError(r.message ?? "保存できませんでした。");
      toast(r.message ?? "保存しました");
      setEditing(null);
      router.refresh();
    });

  const editor = (id: string | null) => (
    <tr className="bg-primary-soft/30 border-t">
      <td className="px-4 py-2">
        <Input
          value={v.code}
          onChange={(e) => setV({ ...v, code: e.target.value })}
          maxLength={30}
          aria-label="コード"
          className="h-9 font-mono"
          autoFocus
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={v.name}
          onChange={(e) => setV({ ...v, name: e.target.value })}
          maxLength={100}
          aria-label="名前"
          className="h-9"
        />
      </td>
      <td className="px-3 py-2">
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={v.active}
            onChange={(e) => setV({ ...v, active: e.target.checked })}
            className="accent-[var(--primary)]"
          />
          使用中
        </label>
      </td>
      <td className="px-4 py-2">
        <div className="flex justify-end gap-1">
          <Button
            size="icon-sm"
            variant="grad"
            onClick={() => save(id)}
            disabled={pending}
            aria-label="保存"
          >
            <Check />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={() => setEditing(null)}
            aria-label="やめる"
          >
            <X />
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p
          className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="bg-surface overflow-x-auto rounded-2xl border shadow-sm">
        <table className="w-full min-w-[32rem] text-sm">
          <thead className="bg-surface-2/60 text-muted-foreground text-xs">
            <tr>
              <th className="w-40 px-4 py-2 text-left font-medium">コード</th>
              <th className="px-3 py-2 text-left font-medium">名前</th>
              <th className="w-28 px-3 py-2 text-left font-medium">状態</th>
              <th className="w-24 px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              editing === r.id ? (
                <EditorRow key={r.id}>{editor(r.id)}</EditorRow>
              ) : (
                <tr
                  key={r.id}
                  className={`border-t ${r.active ? "" : "opacity-55"}`}
                >
                  <td className="px-4 py-2.5 font-mono text-xs">{r.code}</td>
                  <td className="px-3 py-2.5">{r.name}</td>
                  <td className="px-3 py-2.5">
                    {r.active ? (
                      <Badge variant="success">使用中</Badge>
                    ) : (
                      <Badge variant="outline">停止</Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => edit(r)}
                      aria-label={`${r.name} を編集`}
                    >
                      <Pencil />
                    </Button>
                  </td>
                </tr>
              ),
            )}
            {editing === "new" ? editor(null) : null}
          </tbody>
        </table>
      </div>
      {editing !== "new" ? (
        <div>
          <Button variant="outline" size="sm" onClick={() => edit(null)}>
            <Plus aria-hidden />
            追加
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function EditorRow({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
