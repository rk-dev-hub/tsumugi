"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { projectColor } from "@/components/project-color";
import type { FormState } from "./actions";

export type ProjectFormValues = {
  id?: string;
  code: string;
  name: string;
  kind: "WORK" | "INTERNAL";
  status: "PROSPECT" | "ACTIVE" | "COMPLETED" | "CANCELED";
  clientId: string;
  pmId: string;
  startDate: string;
  endDate: string;
  revenueAmount: string;
  colorIndex: number;
  note: string;
  memberIds: string[];
};

export function ProjectForm({
  action,
  initial,
  users,
  clients,
  isAdmin,
  submitLabel,
}: {
  action: (s: FormState, fd: FormData) => Promise<FormState>;
  initial: ProjectFormValues;
  users: { id: string; name: string; role: string }[];
  clients: { id: string; name: string }[];
  isAdmin: boolean;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [kind, setKind] = useState(initial.kind);
  const [color, setColor] = useState(initial.colorIndex);
  const [members, setMembers] = useState<string[]>(initial.memberIds);
  const [memberQuery, setMemberQuery] = useState("");
  const f = state?.fields ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {initial.id ? <input type="hidden" name="id" value={initial.id} /> : null}
      {state?.message ? (
        <p
          className={
            state.ok
              ? "bg-success-soft text-success rounded-md px-3 py-2 text-sm"
              : "bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          }
          role="alert"
        >
          {state.message}
        </p>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Field label="コード" htmlFor="p-code" error={f.code}>
          <Input
            id="p-code"
            name="code"
            defaultValue={initial.code}
            maxLength={30}
            required
            className="font-mono"
          />
        </Field>
        <Field label="名前" htmlFor="p-name" error={f.name}>
          <Input
            id="p-name"
            name="name"
            defaultValue={initial.name}
            maxLength={100}
            required
          />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="種類" htmlFor="p-kind">
          <Select
            id="p-kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as "WORK")}
          >
            <option value="WORK">業務（顧客・売上あり）</option>
            <option value="INTERNAL">社内（全員が入力できる）</option>
          </Select>
        </Field>
        <Field label="状態" htmlFor="p-status">
          <Select id="p-status" name="status" defaultValue={initial.status}>
            <option value="PROSPECT">見込み</option>
            <option value="ACTIVE">進行中</option>
            <option value="COMPLETED">完了</option>
            <option value="CANCELED">中止</option>
          </Select>
        </Field>
        {kind === "WORK" ? (
          <Field label="顧客" htmlFor="p-client">
            <Select
              id="p-client"
              name="clientId"
              defaultValue={initial.clientId}
            >
              <option value="">（なし）</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="開始日" htmlFor="p-start" error={f.startDate}>
          <Input
            id="p-start"
            name="startDate"
            type="date"
            defaultValue={initial.startDate}
            required
          />
        </Field>
        <Field label="終了日（任意）" htmlFor="p-end" error={f.endDate}>
          <Input
            id="p-end"
            name="endDate"
            type="date"
            defaultValue={initial.endDate}
          />
        </Field>
        {isAdmin ? (
          <Field label="PM" htmlFor="p-pm">
            <Select id="p-pm" name="pmId" defaultValue={initial.pmId}>
              <option value="">（なし）</option>
              {users
                .filter((u) => u.role !== "MEMBER")
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </Select>
          </Field>
        ) : null}
      </div>
      {isAdmin && kind === "WORK" ? (
        <Field
          label="売上額（円・任意）"
          htmlFor="p-rev"
          hint="入力すると粗利と粗利率を計算します"
          error={f.revenueAmount}
        >
          <Input
            id="p-rev"
            name="revenueAmount"
            type="number"
            min={0}
            step={1000}
            defaultValue={initial.revenueAmount}
            className="tabular sm:w-60"
          />
        </Field>
      ) : null}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium">色</legend>
        <input type="hidden" name="colorIndex" value={color} />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 12 }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setColor(i)}
              aria-label={`色 ${i + 1}`}
              aria-pressed={color === i}
              className="ring-offset-surface grid size-8 place-items-center rounded-full ring-offset-2 aria-pressed:ring-2 aria-pressed:ring-[var(--foreground)]"
              style={{ background: projectColor(i).solid }}
            >
              {color === i ? (
                <Check className="size-4 text-white" aria-hidden />
              ) : null}
            </button>
          ))}
        </div>
      </fieldset>
      {kind === "WORK" ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">
            メンバー{" "}
            <span className="text-muted-foreground text-xs font-normal">
              （{members.length} 人。工数を入力できる人）
            </span>
          </legend>
          <Input
            value={memberQuery}
            onChange={(e) => setMemberQuery(e.target.value)}
            placeholder="名前で絞り込む"
            aria-label="メンバーを絞り込む"
            className="sm:w-60"
          />
          <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-3">
            {users
              .filter(
                (u) =>
                  !memberQuery ||
                  u.name.includes(memberQuery) ||
                  members.includes(u.id),
              )
              .map((u) => (
                <label
                  key={u.id}
                  className="hover:bg-surface-2 flex items-center gap-2 rounded-md px-2 py-1 text-sm"
                >
                  <input
                    type="checkbox"
                    name="memberIds"
                    value={u.id}
                    checked={members.includes(u.id)}
                    onChange={(e) =>
                      setMembers(
                        e.target.checked
                          ? [...members, u.id]
                          : members.filter((x) => x !== u.id),
                      )
                    }
                    className="accent-[var(--primary)]"
                  />
                  {u.name}
                </label>
              ))}
          </div>
        </fieldset>
      ) : null}
      <Field label="メモ" htmlFor="p-note">
        <Textarea
          id="p-note"
          name="note"
          defaultValue={initial.note}
          maxLength={1000}
          rows={2}
        />
      </Field>
      <div>
        <Button type="submit" variant="grad" disabled={pending}>
          {pending ? "保存中…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
