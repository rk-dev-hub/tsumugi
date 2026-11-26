import Link from "next/link";
import { ClipboardCheck } from "lucide-react";
import { requireManager } from "@/features/auth/rbac";
import { listApprovals } from "@/features/approval/usecase";
import { formatDateJa } from "@/lib/date-range";
import { formatHm } from "@/lib/minutes";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const metadata = { title: "承認" };

const TABS = [
  { key: "SUBMITTED", label: "承認待ち" },
  { key: "APPROVED", label: "承認済み" },
  { key: "REJECTED", label: "差戻し" },
] as const;

export default async function ApprovalsPage({
  searchParams,
}: PageProps<"/approvals">) {
  const user = await requireManager();
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.status)?.key ?? "SUBMITTED";
  const rows = await listApprovals(user, tab);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="承認"
        description="部下が提出した工数を確認して、承認するか差し戻します。"
      />
      <nav
        className="bg-surface-2 inline-flex self-start rounded-xl p-1"
        aria-label="状態"
      >
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/approvals?status=${t.key}`}
            aria-current={t.key === tab ? "page" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-sm",
              t.key === tab
                ? "bg-surface font-medium shadow-sm"
                : "text-muted-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={
            tab === "SUBMITTED"
              ? "承認待ちはありません"
              : "該当する期間はありません"
          }
        />
      ) : (
        <div className="bg-surface overflow-hidden rounded-2xl border shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-surface-2/60 text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2 text-left font-medium">メンバー</th>
                <th className="px-4 py-2 text-left font-medium">期間</th>
                <th className="px-4 py-2 text-right font-medium">工数</th>
                <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">
                  提出日時
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/50 border-t">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/approvals/${r.id}`}
                      className="font-medium hover:underline"
                    >
                      {r.userName}
                    </Link>
                    {r.departmentName ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {r.departmentName}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2.5">
                    {formatDateJa(r.start)} 〜 {formatDateJa(r.end)}
                  </td>
                  <td className="tabular px-4 py-2.5 text-right font-medium">
                    {formatHm(r.totalMinutes)}
                  </td>
                  <td className="text-muted-foreground hidden px-4 py-2.5 text-xs sm:table-cell">
                    {r.submittedAt
                      ? r.submittedAt.toLocaleString("ja-JP", {
                          timeZone: "Asia/Tokyo",
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
