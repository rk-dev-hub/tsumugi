import Link from "next/link";
import { CheckCircle2, Lock, LockOpen } from "lucide-react";
import { requireAdmin } from "@/features/auth/rbac";
import { closingBlockers, closingOverview } from "@/features/closing/usecase";
import { todayJst } from "@/features/common/dates";
import { addMonths } from "@/features/timesheet/domain/period";
import { formatDateJa } from "@/lib/date-range";
import { stringParam } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CloseControls } from "./close-controls";
import { MonthlyReportPanel } from "./monthly-report";

export const metadata = { title: "月次締め" };

const ymLabel = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;
const STATUS = {
  NONE: "未提出",
  SUBMITTED: "承認待ち",
  REJECTED: "差戻し",
  WITHDRAWN: "取り下げ",
} as const;

export default async function ClosingPage({
  searchParams,
}: PageProps<"/admin/closing">) {
  await requireAdmin();
  const today = todayJst();
  const thisMonth = today.slice(0, 7);
  const months = Array.from({ length: 6 }, (_, i) => addMonths(thisMonth, -i));
  const overview = await closingOverview(months);
  const requested = stringParam((await searchParams).ym);
  const firstOpen = overview.find(
    (m) => !m.closed && m.yearMonth < thisMonth,
  )?.yearMonth;
  const ym =
    requested && months.includes(requested)
      ? requested
      : (firstOpen ?? addMonths(thisMonth, -1));
  const current = overview.find((m) => m.yearMonth === ym)!;
  const blockers = current.closed ? [] : await closingBlockers(ym);
  const ended = ym < thisMonth;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="月次締め"
        description="すべての期間が承認された月を締めると、その月の工数は変更できなくなり、人件費が確定します。"
      />
      <nav className="flex gap-2 overflow-x-auto pb-1" aria-label="月">
        {overview.map((m) => (
          <Link
            key={m.yearMonth}
            href={`/admin/closing?ym=${m.yearMonth}`}
            aria-current={m.yearMonth === ym ? "page" : undefined}
            className={cn(
              "flex min-w-28 flex-col rounded-xl border px-3 py-2 text-sm transition",
              m.yearMonth === ym
                ? "bg-grad border-transparent text-white shadow-md"
                : "bg-surface hover:bg-surface-2",
            )}
          >
            <span className="font-medium">{ymLabel(m.yearMonth)}</span>
            <span
              className={cn(
                "flex items-center gap-1 text-xs",
                m.yearMonth === ym ? "text-white/85" : "text-muted-foreground",
              )}
            >
              {m.closed ? (
                <Lock className="size-3" aria-hidden />
              ) : (
                <LockOpen className="size-3" aria-hidden />
              )}
              {m.closed
                ? "締め済み"
                : m.yearMonth >= thisMonth
                  ? "進行中"
                  : "未締め"}
            </span>
          </Link>
        ))}
      </nav>

      <div className="grid items-start gap-5 lg:grid-cols-[1fr_20rem]">
        <Card>
          <CardHeader>
            <CardTitle>{ymLabel(ym)}の状況</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            {current.closed ? (
              <p className="flex items-center gap-2">
                <CheckCircle2 className="text-success size-4" aria-hidden />
                {current.closedAt?.toLocaleString("ja-JP", {
                  timeZone: "Asia/Tokyo",
                })}{" "}
                に締めました。
              </p>
            ) : !ended ? (
              <p className="text-muted-foreground">
                月が終わると締められるようになります。
              </p>
            ) : blockers.length === 0 ? (
              <p className="flex items-center gap-2">
                <CheckCircle2 className="text-success size-4" aria-hidden />
                すべての期間が承認されています。締められます。
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p>承認が済んでいない期間が {blockers.length} 件あります。</p>
                <ul className="divide-y rounded-lg border">
                  {blockers.map((b) => (
                    <li
                      key={`${b.userId}-${b.start}`}
                      className="flex items-center justify-between gap-2 px-3 py-2"
                    >
                      <span>
                        <span className="font-medium">{b.userName}</span>
                        <span className="text-muted-foreground ml-2 text-xs">
                          {formatDateJa(b.start)} 〜 {formatDateJa(b.end)}
                        </span>
                      </span>
                      <Badge
                        variant={
                          b.status === "SUBMITTED"
                            ? "info"
                            : b.status === "REJECTED"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {STATUS[b.status]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {current.reopenReason && !current.closed ? (
              <p className="text-muted-foreground mt-3 text-xs">
                前回の締め解除の理由: {current.reopenReason}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <CloseControls
          ym={ym}
          label={ymLabel(ym)}
          closed={current.closed}
          canClose={ended && blockers.length === 0}
        />
      </div>

      {current.closed ? <MonthlyReportPanel ym={ym} /> : null}
    </div>
  );
}
