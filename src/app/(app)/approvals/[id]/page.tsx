import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft } from "lucide-react";
import { requireManager } from "@/features/auth/rbac";
import { getPeriodForApprover } from "@/features/approval/usecase";
import { listEntries } from "@/features/timesheet/usecase";
import { summarizePeriod } from "@/features/tsumugi/tasks";
import { prisma } from "@/lib/prisma";
import { d, ds } from "@/features/common/dates";
import { eachDateStr, formatDateJa } from "@/lib/date-range";
import { formatClock, formatHm } from "@/lib/minutes";
import { uuidParam } from "@/lib/params";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TsumugiNote } from "@/components/tsumugi/note";
import { projectColor } from "@/components/project-color";
import type { SessionUser } from "@/features/auth/rbac";
import { DecisionPanel } from "./decision-panel";

export const metadata = { title: "承認の詳細" };

const STATUS_LABEL = {
  SUBMITTED: "承認待ち",
  APPROVED: "承認済み",
  REJECTED: "差戻し",
  WITHDRAWN: "取り下げ",
} as const;
const EVENT_LABEL = {
  SUBMIT: "提出",
  WITHDRAW: "取り下げ",
  APPROVE: "承認",
  REJECT: "差戻し",
  CANCEL_APPROVAL: "承認の取消",
} as const;

export default async function ApprovalDetailPage({
  params,
}: PageProps<"/approvals/[id]">) {
  const user = await requireManager();
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const period = await getPeriodForApprover(user, id);
  if (!period) notFound();
  const [entries, attendances] = await Promise.all([
    listEntries(period.userId, period.start, period.end),
    prisma.attendance.findMany({
      where: {
        userId: period.userId,
        date: { gte: d(period.start), lte: d(period.end) },
      },
    }),
  ]);
  const days = eachDateStr(period.start, period.end);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/approvals"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" />
        承認の一覧
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">
            {period.userName}
            <span className="text-muted-foreground ml-2 text-base font-normal">
              {formatDateJa(period.start)} 〜 {formatDateJa(period.end)}
            </span>
          </h1>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <Badge
              variant={
                period.status === "APPROVED"
                  ? "success"
                  : period.status === "REJECTED"
                    ? "destructive"
                    : "info"
              }
            >
              {STATUS_LABEL[period.status]}
            </Badge>
            <span className="text-muted-foreground">
              合計{" "}
              <span className="tabular text-foreground font-semibold">
                {formatHm(period.totalMinutes)}
              </span>
            </span>
            {period.closed ? <Badge variant="outline">締め済み</Badge> : null}
          </div>
        </div>
      </div>

      <Suspense
        fallback={
          <TsumugiNote>Tsumugi が提出内容をまとめています…</TsumugiNote>
        }
      >
        <PeriodSummary user={user} periodId={period.id} />
      </Suspense>

      <div className="grid gap-5 lg:grid-cols-[1fr_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>日ごとの工数</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {days.map((day) => {
              const es = entries.filter((e) => e.date === day);
              const a = attendances.find((x) => ds(x.date) === day);
              const total = es.reduce((s, e) => s + e.minutes, 0);
              const work = a
                ? a.endMinute - a.startMinute - a.breakMinutes
                : null;
              if (es.length === 0 && !a) return null;
              return (
                <section key={day} className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 text-sm">
                    <h3 className="font-medium">{formatDateJa(day)}</h3>
                    <span className="text-muted-foreground tabular text-xs">
                      工数 {formatHm(total)}
                      {work !== null
                        ? ` ・ 勤務 ${formatClock(a!.startMinute)}–${formatClock(a!.endMinute % 1440)}（${formatHm(work)}）・ 差 ${formatHm(work - total)}`
                        : " ・ 勤務時間なし"}
                    </span>
                  </div>
                  {a?.gapReason ? (
                    <p className="text-muted-foreground text-xs">
                      差の理由: {a.gapReason}
                    </p>
                  ) : null}
                  <ul className="flex flex-col gap-1">
                    {es.map((e) => (
                      <li
                        key={e.id}
                        className="flex items-start gap-2 rounded-lg border px-2.5 py-1.5 text-sm"
                        style={{
                          borderLeft: `3px solid ${projectColor(e.colorIndex).solid}`,
                        }}
                      >
                        <span className="tabular text-muted-foreground w-24 shrink-0 text-xs leading-5">
                          {formatClock(e.startMinute)}–
                          {formatClock(e.endMinute)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="font-medium">{e.projectName}</span>
                          <span className="text-muted-foreground">
                            {" "}
                            / {e.phaseName}
                            {e.workCategoryName
                              ? ` · ${e.workCategoryName}`
                              : ""}
                          </span>
                          {e.note ? (
                            <span className="text-muted-foreground block text-xs">
                              {e.note}
                            </span>
                          ) : null}
                        </span>
                        <span className="tabular shrink-0 text-xs leading-5">
                          {formatHm(e.minutes)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-5">
          <DecisionPanel
            periodId={period.id}
            status={period.status}
            closed={period.closed}
          />
          <Card>
            <CardHeader>
              <CardTitle>履歴</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="flex flex-col gap-2 text-sm">
                {period.events.map((e, i) => (
                  <li key={i} className="flex flex-col">
                    <span>
                      <span className="font-medium">{EVENT_LABEL[e.type]}</span>
                      <span className="text-muted-foreground">
                        {" "}
                        ・ {e.actorName}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {e.at.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                    </span>
                    {e.comment ? (
                      <span className="text-xs">「{e.comment}」</span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

async function PeriodSummary({
  user,
  periodId,
}: {
  user: SessionUser;
  periodId: string;
}) {
  const r = await summarizePeriod(user, periodId);
  if (!r) return null;
  return (
    <TsumugiNote source={r.ai ? "ai" : "template"}>
      <p className="font-medium">{r.value.summary}</p>
      {r.value.cautions.length > 0 ? (
        <ul className="mt-1.5 list-inside list-disc text-[13px]">
          {r.value.cautions.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-0.5 text-[13px] opacity-80">
          気になる点は見つかりませんでした。
        </p>
      )}
    </TsumugiNote>
  );
}
