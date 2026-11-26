"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  KeyRound,
  Plus,
  Search,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserX,
  X,
} from "lucide-react";
import { formatDateJa } from "@/lib/date-range";
import { formatHm } from "@/lib/minutes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useToast } from "@/components/toast";
import {
  addRateAction,
  deleteRateAction,
  resetPasswordAction,
  resetTotpAction,
  saveUserAction,
  setUserStatusAction,
  type UserActionResult,
} from "./actions";

type U = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "MEMBER";
  status: "ACTIVE" | "DISABLED";
  departmentId: string | null;
  departmentName: string | null;
  approverId: string | null;
  approverName: string | null;
  canViewCost: boolean;
  dailyStandardMinutes: number;
  totpEnabled: boolean;
  rates: { id: string; effectiveFrom: string; hourlyRate: number }[];
};

const ROLE = {
  ADMIN: "管理者",
  MANAGER: "マネージャー",
  MEMBER: "メンバー",
} as const;

export function UsersAdmin({
  users,
  departments,
  meId,
}: {
  users: U[];
  departments: { id: string; name: string }[];
  meId: string;
}) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<U | "new" | null>(null);
  const list = users.filter(
    (u) => !q || u.name.includes(q) || u.email.includes(q.toLowerCase()),
  );
  const current =
    editing === "new"
      ? null
      : editing
        ? (users.find((u) => u.id === editing.id) ?? null)
        : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="名前・メールで探す"
            aria-label="メンバーを探す"
            className="h-9 w-60 pl-8"
          />
        </div>
        <div className="flex-1" />
        <Button variant="grad" onClick={() => setEditing("new")}>
          <Plus aria-hidden />
          メンバーを追加
        </Button>
      </div>
      <div className="bg-surface overflow-x-auto rounded-2xl border shadow-sm">
        <table className="w-full min-w-[44rem] text-sm">
          <thead className="bg-surface-2/60 text-muted-foreground text-xs">
            <tr>
              <th className="px-4 py-2 text-left font-medium">名前</th>
              <th className="px-3 py-2 text-left font-medium">権限</th>
              <th className="px-3 py-2 text-left font-medium">部署</th>
              <th className="px-3 py-2 text-left font-medium">承認者</th>
              <th className="px-3 py-2 text-right font-medium">現在の単価</th>
              <th className="px-4 py-2 text-left font-medium">状態</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr
                key={u.id}
                className={`hover:bg-surface-2/50 cursor-pointer border-t ${u.status === "DISABLED" ? "opacity-55" : ""}`}
                onClick={() => setEditing(u)}
              >
                <td className="px-4 py-2.5">
                  <button
                    type="button"
                    className="text-left font-medium hover:underline"
                    onClick={() => setEditing(u)}
                  >
                    {u.name}
                  </button>
                  <span className="text-muted-foreground block text-xs">
                    {u.email}
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant={
                      u.role === "ADMIN"
                        ? "primary"
                        : u.role === "MANAGER"
                          ? "info"
                          : "default"
                    }
                  >
                    {ROLE[u.role]}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">{u.departmentName ?? "—"}</td>
                <td className="px-3 py-2.5">{u.approverName ?? "—"}</td>
                <td className="tabular px-3 py-2.5 text-right">
                  {u.rates[0] ? (
                    `¥${u.rates[0].hourlyRate.toLocaleString("ja-JP")}/h`
                  ) : (
                    <span className="text-warning text-xs">未設定</span>
                  )}
                </td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5">
                    {u.status === "ACTIVE" ? (
                      <Badge variant="success">有効</Badge>
                    ) : (
                      <Badge variant="outline">無効</Badge>
                    )}
                    {u.totpEnabled ? (
                      <ShieldCheck
                        className="text-success size-4"
                        aria-label="2 段階認証あり"
                      />
                    ) : null}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <UserDialog
        open={editing !== null}
        user={current}
        users={users}
        departments={departments}
        meId={meId}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

type DialogProps = {
  open: boolean;
  user: U | null;
  users: U[];
  departments: { id: string; name: string }[];
  meId: string;
  onClose: () => void;
};

function UserDialog(props: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const { open, user, onClose } = props;
  useEffect(() => {
    if (!open) ref.current?.close();
    else if (!ref.current?.open) ref.current?.showModal();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="user-dialog-title"
      className="bg-surface text-foreground m-auto max-h-[calc(100dvh-2rem)] w-[min(36rem,calc(100vw-2rem))] rounded-2xl border p-0 shadow-2xl backdrop:bg-black/40"
    >
      {open ? <UserDialogBody key={user?.id ?? "new"} {...props} /> : null}
    </dialog>
  );
}

function UserDialogBody({
  user,
  users,
  departments,
  meId,
  onClose,
}: DialogProps) {
  const [v, setV] = useState(() =>
    user
      ? {
          email: user.email,
          name: user.name,
          role: user.role,
          departmentId: user.departmentId ?? "",
          approverId: user.approverId ?? "",
          canViewCost: user.canViewCost,
          dailyStandardMinutes: user.dailyStandardMinutes,
        }
      : {
          email: "",
          name: "",
          role: "MEMBER" as U["role"],
          departmentId: "",
          approverId: "",
          canViewCost: false,
          dailyStandardMinutes: 480,
        },
  );
  const [result, setResult] = useState<UserActionResult | null>(null);
  const [rate, setRate] = useState({ effectiveFrom: "", hourlyRate: "" });
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();

  const run = (
    fn: () => Promise<UserActionResult>,
    after?: (r: UserActionResult) => void,
  ) =>
    start(async () => {
      const r = await fn();
      setResult(r);
      if (r.ok) {
        if (!r.password) toast(r.message ?? "保存しました");
        router.refresh();
        after?.(r);
      }
    });

  const approvers = users.filter(
    (u) => u.role !== "MEMBER" && u.status === "ACTIVE" && u.id !== user?.id,
  );
  const f = result?.fields ?? {};

  return (
    <>
      <div className="bg-grad-soft sticky top-0 z-10 flex items-center justify-between border-b px-5 py-3">
        <h2 id="user-dialog-title" className="font-semibold">
          {user ? user.name : "メンバーを追加"}
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
      <div className="flex flex-col gap-5 px-5 py-4">
        {result?.password ? (
          <div
            className="bg-success-soft text-success rounded-lg px-3 py-2.5 text-sm"
            role="status"
          >
            <p>{result.message}</p>
            <p className="mt-1 flex items-center gap-2">
              初期パスワード:
              <code className="bg-surface text-foreground rounded px-2 py-0.5 font-mono text-sm select-all">
                {result.password}
              </code>
            </p>
            <p className="mt-1 text-xs opacity-80">
              この画面を閉じると再表示できません。初回ログイン時に変更してもらいます。
            </p>
          </div>
        ) : result && !result.ok ? (
          <p
            className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
            role="alert"
          >
            {result.message}
          </p>
        ) : null}

        <form
          className="grid gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => saveUserAction(user?.id ?? null, v));
          }}
        >
          <Field label="氏名" htmlFor="u-name" error={f.name}>
            <Input
              id="u-name"
              value={v.name}
              maxLength={50}
              onChange={(e) => setV({ ...v, name: e.target.value })}
              required
            />
          </Field>
          <Field label="メールアドレス" htmlFor="u-email" error={f.email}>
            <Input
              id="u-email"
              type="email"
              value={v.email}
              maxLength={254}
              onChange={(e) => setV({ ...v, email: e.target.value })}
              required
            />
          </Field>
          <Field label="権限" htmlFor="u-role">
            <Select
              id="u-role"
              value={v.role}
              onChange={(e) =>
                setV({ ...v, role: e.target.value as U["role"] })
              }
            >
              <option value="MEMBER">メンバー</option>
              <option value="MANAGER">マネージャー</option>
              <option value="ADMIN">管理者</option>
            </Select>
          </Field>
          <Field label="部署" htmlFor="u-dept">
            <Select
              id="u-dept"
              value={v.departmentId}
              onChange={(e) => setV({ ...v, departmentId: e.target.value })}
            >
              <option value="">（なし）</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="承認者" htmlFor="u-approver" error={f.approverId}>
            <Select
              id="u-approver"
              value={v.approverId}
              onChange={(e) => setV({ ...v, approverId: e.target.value })}
            >
              <option value="">（なし）</option>
              {approvers.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="1 日の所定時間（分）"
            htmlFor="u-std"
            hint={formatHm(v.dailyStandardMinutes)}
          >
            <Input
              id="u-std"
              type="number"
              min={0}
              max={1440}
              step={15}
              value={v.dailyStandardMinutes}
              onChange={(e) =>
                setV({
                  ...v,
                  dailyStandardMinutes: Number(e.target.value) || 0,
                })
              }
              className="tabular"
            />
          </Field>
          {v.role === "MANAGER" ? (
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input
                type="checkbox"
                checked={v.canViewCost}
                onChange={(e) => setV({ ...v, canViewCost: e.target.checked })}
                className="accent-[var(--primary)]"
              />
              PM を担当するプロジェクトの原価・粗利を見られる
            </label>
          ) : null}
          <div className="sm:col-span-2">
            <Button type="submit" variant="grad" disabled={pending}>
              {user ? "保存する" : "登録して初期パスワードを発行"}
            </Button>
          </div>
        </form>

        {user ? (
          <>
            <section className="flex flex-col gap-2 border-t pt-4">
              <h3 className="text-sm font-semibold">原価単価（円/時）</h3>
              <p className="text-muted-foreground text-xs">
                適用開始日から次の単価まで使います。締めた月の人件費は変わりません。
              </p>
              {user.rates.length > 0 ? (
                <ul className="divide-y rounded-lg border text-sm">
                  {user.rates.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center gap-3 px-3 py-1.5"
                    >
                      <span className="text-muted-foreground flex-1 text-xs">
                        {formatDateJa(r.effectiveFrom)} から
                      </span>
                      <span className="tabular font-medium">
                        ¥{r.hourlyRate.toLocaleString("ja-JP")}
                      </span>
                      <button
                        type="button"
                        aria-label={`${r.effectiveFrom} の単価を削除`}
                        className="text-muted-foreground hover:text-destructive p-1"
                        onClick={() => run(() => deleteRateAction(r.id))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form
                className="flex flex-wrap items-end gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(
                    () => addRateAction(user.id, rate),
                    () => setRate({ effectiveFrom: "", hourlyRate: "" }),
                  );
                }}
              >
                <Input
                  type="date"
                  value={rate.effectiveFrom}
                  onChange={(e) =>
                    setRate({ ...rate, effectiveFrom: e.target.value })
                  }
                  required
                  aria-label="適用開始日"
                  className="w-40"
                />
                <Input
                  type="number"
                  min={0}
                  max={100000}
                  value={rate.hourlyRate}
                  onChange={(e) =>
                    setRate({ ...rate, hourlyRate: e.target.value })
                  }
                  required
                  placeholder="単価"
                  aria-label="単価（円/時）"
                  className="tabular w-28"
                />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  className="h-10"
                >
                  追加
                </Button>
              </form>
            </section>

            <section className="flex flex-col gap-2 border-t pt-4">
              <h3 className="text-sm font-semibold">アカウント</h3>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    confirm(
                      `${user.name} さんのパスワードを再発行しますか？`,
                    ) && run(() => resetPasswordAction(user.id))
                  }
                >
                  <KeyRound aria-hidden />
                  パスワードを再発行
                </Button>
                {user.totpEnabled ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      confirm(
                        `${user.name} さんの 2 段階認証を解除しますか？`,
                      ) && run(() => resetTotpAction(user.id))
                    }
                  >
                    <ShieldOff aria-hidden />2 段階認証を解除
                  </Button>
                ) : null}
                {user.id !== meId ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    className={
                      user.status === "ACTIVE" ? "text-destructive" : ""
                    }
                    onClick={() =>
                      (user.status !== "ACTIVE" ||
                        confirm(
                          `${user.name} さんを無効にしますか？ログインできなくなります。`,
                        )) &&
                      run(() =>
                        setUserStatusAction(user.id, user.status !== "ACTIVE"),
                      )
                    }
                  >
                    <UserX aria-hidden />
                    {user.status === "ACTIVE" ? "無効にする" : "有効に戻す"}
                  </Button>
                ) : null}
              </div>
            </section>
          </>
        ) : null}
      </div>
    </>
  );
}
