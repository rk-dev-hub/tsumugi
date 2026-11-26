import Link from "next/link";
import { ScrollText } from "lucide-react";
import { requireAdmin } from "@/features/auth/rbac";
import { prisma } from "@/lib/prisma";
import { stringParam } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import type { AuditAction } from "@/generated/prisma/client";

export const metadata = { title: "監査ログ" };

const ACTIONS: Record<AuditAction, string> = {
  LOGIN_SUCCESS: "ログイン",
  LOGIN_FAILURE: "ログイン失敗",
  PASSWORD_CHANGE: "パスワード変更",
  PASSWORD_RESET: "パスワード再発行",
  TOTP_ENABLE: "2 段階認証の設定",
  TOTP_DISABLE: "2 段階認証の解除",
  TOTP_RESET: "2 段階認証のリセット",
  USER_CREATE: "メンバー追加",
  USER_UPDATE: "メンバー変更",
  USER_DISABLE: "メンバー無効化",
  RATE_CHANGE: "単価変更",
  TIMESHEET_SUBMIT: "提出",
  TIMESHEET_WITHDRAW: "取り下げ",
  TIMESHEET_APPROVE: "承認",
  TIMESHEET_REJECT: "差戻し",
  TIMESHEET_APPROVAL_CANCEL: "承認の取消",
  MONTH_CLOSE: "月次締め",
  MONTH_REOPEN: "締め解除",
  PROJECT_CHANGE: "プロジェクト変更",
  EXPENSE_CHANGE: "経費変更",
  MASTER_CHANGE: "マスタ変更",
  COMPANY_CHANGE: "会社設定変更",
  EXPORT: "CSV 出力",
};
const WARN = new Set<AuditAction>([
  "LOGIN_FAILURE",
  "USER_DISABLE",
  "MONTH_REOPEN",
  "TOTP_DISABLE",
  "TOTP_RESET",
  "PASSWORD_RESET",
]);
const PAGE = 50;

export default async function AuditPage({
  searchParams,
}: PageProps<"/admin/audit">) {
  await requireAdmin();
  const sp = await searchParams;
  const actionRaw = stringParam(sp.action);
  const action =
    actionRaw && actionRaw in ACTIONS ? (actionRaw as AuditAction) : undefined;
  const page = Math.min(1000, Math.max(1, Number(stringParam(sp.page)) || 1));
  const where = action ? { action } : {};
  const [rows, count] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      include: { actor: { select: { name: true } } },
    }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const link = (p: number) =>
    `/admin/audit?${new URLSearchParams({ ...(action ? { action } : {}), page: String(p) })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="監査ログ"
        description="ログイン・承認・締め・権限や単価の変更などの記録です。記録は変更・削除できません。"
      />
      <form className="flex items-end gap-2">
        <Select
          name="action"
          defaultValue={action ?? ""}
          aria-label="操作で絞り込む"
          className="h-9 w-56"
        >
          <option value="">すべての操作</option>
          {Object.entries(ACTIONS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Select>
        <Button type="submit" size="sm" variant="soft" className="h-9">
          絞り込む
        </Button>
        <span className="text-muted-foreground ml-auto text-xs">
          {count.toLocaleString("ja-JP")} 件
        </span>
      </form>
      {rows.length === 0 ? (
        <EmptyState icon={ScrollText} title="記録はありません" />
      ) : (
        <div className="bg-surface overflow-x-auto rounded-2xl border shadow-sm">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-surface-2/60 text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2 text-left font-medium">日時</th>
                <th className="px-3 py-2 text-left font-medium">操作</th>
                <th className="px-3 py-2 text-left font-medium">実行した人</th>
                <th className="px-3 py-2 text-left font-medium">対象</th>
                <th className="px-4 py-2 text-left font-medium">内容</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t align-top">
                  <td className="tabular text-muted-foreground px-4 py-2 text-xs whitespace-nowrap">
                    {r.at.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={WARN.has(r.action) ? "warning" : "default"}>
                      {ACTIONS[r.action]}
                    </Badge>
                  </td>
                  <td className="px-3 py-2">
                    {r.actor?.name ?? "—"}
                    {r.ip ? (
                      <span className="text-muted-foreground block text-[11px]">
                        {r.ip}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.targetType}
                    {r.targetId ? (
                      <span className="text-muted-foreground block max-w-40 truncate font-mono text-[11px]">
                        {r.targetId}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2">
                    {r.detail ? (
                      <code className="text-muted-foreground line-clamp-3 max-w-md text-[11px] break-all">
                        {JSON.stringify(r.detail)}
                      </code>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 ? (
        <nav
          className="flex items-center justify-center gap-3 text-sm"
          aria-label="ページ"
        >
          {page > 1 ? (
            <Link
              href={link(page - 1)}
              className="text-primary hover:underline"
            >
              前へ
            </Link>
          ) : (
            <span className="text-muted-foreground">前へ</span>
          )}
          <span className="tabular">
            {page} / {pages}
          </span>
          {page < pages ? (
            <Link
              href={link(page + 1)}
              className="text-primary hover:underline"
            >
              次へ
            </Link>
          ) : (
            <span className="text-muted-foreground">次へ</span>
          )}
        </nav>
      ) : null}
    </div>
  );
}
