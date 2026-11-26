import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronLeft, Pencil } from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import {
  forecastFactsOf,
  getProjectDetail,
  type ProjectDetail,
} from "@/features/project/usecase";
import { explainForecast } from "@/features/tsumugi/tasks";
import { formatDateJa } from "@/lib/date-range";
import { formatHm } from "@/lib/minutes";
import { uuidParam } from "@/lib/params";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetBar } from "@/components/budget-bar";
import { TsumugiNote } from "@/components/tsumugi/note";
import { projectColor } from "@/components/project-color";
import type { SessionUser } from "@/features/auth/rbac";
import { STATUS_LABEL, STATUS_VARIANT, yen } from "../status";
import { ExpensePanel } from "./expense-panel";

export const metadata = { title: "プロジェクト" };

const LEVEL = {
  OK: null,
  NONE: null,
  CAUTION: { label: "注意", variant: "warning" },
  OVER: { label: "超過", variant: "destructive" },
} as const;

export default async function ProjectDetailPage({
  params,
}: PageProps<"/projects/[id]">) {
  const user = await requireUser();
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const detail = await getProjectDetail(user, id);
  if (!detail) notFound();
  const { project: p, budget, cost, access } = detail;
  const color = projectColor(p.colorIndex);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/projects"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" />
        プロジェクト
      </Link>

      <section
        className="relative overflow-hidden rounded-3xl border p-5 shadow-sm sm:p-6"
        style={{ background: color.gradient }}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p
              className="text-xs font-medium opacity-70"
              style={{ color: color.ink }}
            >
              {p.code}
              {p.client ? ` ・ ${p.client.name}` : ""}
              {p.kind === "INTERNAL" ? " ・ 社内" : ""}
            </p>
            <h1
              className="mt-0.5 text-2xl font-semibold tracking-tight"
              style={{ color: color.ink }}
            >
              {p.name}
            </h1>
            <p className="mt-1 text-sm opacity-80" style={{ color: color.ink }}>
              {formatDateJa(p.startDate)} 〜{" "}
              {p.endDate ? formatDateJa(p.endDate) : "終了日なし"}
              {p.pm ? ` ・ PM ${p.pm.name}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={STATUS_VARIANT[p.status]}>
              {STATUS_LABEL[p.status]}
            </Badge>
            {access.canEdit ? (
              <Link href={`/projects/${p.id}/edit`}>
                <Button variant="outline" size="sm">
                  <Pencil aria-hidden />
                  編集
                </Button>
              </Link>
            ) : null}
          </div>
        </div>
        {budget ? (
          <div className="bg-surface/80 mt-5 grid gap-4 rounded-2xl p-4 backdrop-blur sm:grid-cols-4">
            <Kpi
              label="予算"
              value={
                budget.budgetMinutes > 0
                  ? formatHm(budget.budgetMinutes)
                  : "未設定"
              }
            />
            <Kpi
              label="実績"
              value={formatHm(budget.actualMinutes)}
              sub={
                budget.burnRate !== null
                  ? `消化率 ${budget.burnRate}%`
                  : undefined
              }
            />
            <Kpi
              label="着地見込み"
              value={formatHm(budget.forecast)}
              sub={
                budget.budgetMinutes > 0
                  ? `予算比 ${budget.variance >= 0 ? "+" : ""}${formatHm(budget.variance)}`
                  : undefined
              }
              tone={budget.level}
            />
            <Kpi
              label="直近 4 週の平均"
              value={`${formatHm(detail.pace)} / 週`}
              sub={
                detail.remainingWorkdays !== null
                  ? `残り ${detail.remainingWorkdays} 営業日`
                  : undefined
              }
            />
            <BudgetBar
              budget={budget.budgetMinutes}
              actual={budget.actualMinutes}
              forecast={budget.forecast}
              className="sm:col-span-4"
              showLabels={false}
            />
          </div>
        ) : (
          <p className="bg-surface/80 mt-5 rounded-2xl p-4 text-sm">
            このプロジェクトの合計{" "}
            <span className="tabular font-semibold">
              {formatHm(detail.myTotal)}
            </span>
          </p>
        )}
      </section>

      {budget && budget.budgetMinutes > 0 ? (
        <Suspense
          fallback={
            <TsumugiNote>Tsumugi が見通しを確認しています…</TsumugiNote>
          }
        >
          <ForecastComment user={user} detail={detail} />
        </Suspense>
      ) : null}

      {budget ? (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>工程別の予実</CardTitle>
            {access.canEdit ? (
              <Link
                href={`/projects/${p.id}/edit#phases`}
                className="text-primary text-sm hover:underline"
              >
                予算・残り見込みを更新
              </Link>
            ) : null}
          </CardHeader>
          <CardContent className="overflow-x-auto px-0">
            <table className="w-full min-w-[40rem] text-sm">
              <thead className="text-muted-foreground text-xs">
                <tr className="border-b">
                  <th className="px-5 py-2 text-left font-medium">工程</th>
                  <th className="px-3 py-2 text-right font-medium">予算</th>
                  <th className="px-3 py-2 text-right font-medium">実績</th>
                  <th className="px-3 py-2 text-right font-medium">
                    残り見込み
                  </th>
                  <th className="px-3 py-2 text-right font-medium">
                    着地見込み
                  </th>
                  <th className="w-48 px-5 py-2 text-left font-medium">消化</th>
                </tr>
              </thead>
              <tbody>
                {budget.phases.map((ph) => (
                  <tr key={ph.id} className="border-b last:border-b-0">
                    <td className="px-5 py-2.5">
                      <span className="font-medium">{ph.name}</span>
                      {LEVEL[ph.level] ? (
                        <Badge
                          variant={LEVEL[ph.level]!.variant}
                          className="ml-2"
                        >
                          {LEVEL[ph.level]!.label}
                        </Badge>
                      ) : null}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {ph.budgetMinutes > 0 ? formatHm(ph.budgetMinutes) : "—"}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {formatHm(ph.actualMinutes)}
                    </td>
                    <td className="tabular px-3 py-2.5 text-right">
                      {formatHm(ph.remaining)}
                      {ph.remainingIsEstimate ? (
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          自動
                        </span>
                      ) : null}
                    </td>
                    <td
                      className={`tabular px-3 py-2.5 text-right ${ph.level === "OVER" ? "text-destructive font-semibold" : ""}`}
                    >
                      {formatHm(ph.forecast)}
                    </td>
                    <td className="px-5 py-2.5">
                      <BudgetBar
                        budget={ph.budgetMinutes}
                        actual={ph.actualMinutes}
                        forecast={ph.forecast}
                        showLabels={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        {detail.byUser.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>メンバー別の実績</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {detail.byUser.map((u) => (
                  <li
                    key={u.userId}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="w-28 truncate">{u.name}</span>
                    <span className="bg-surface-2 h-2 flex-1 overflow-hidden rounded-full">
                      <span
                        className="bg-grad block h-full rounded-full"
                        style={{
                          width: `${(u.minutes * 100) / detail.byUser[0].minutes}%`,
                        }}
                      />
                    </span>
                    <span className="tabular w-16 text-right">
                      {formatHm(u.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ) : null}

        {cost ? (
          <Card>
            <CardHeader>
              <CardTitle>原価と粗利</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3 text-sm">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Row
                  label="売上額"
                  value={
                    p.revenueAmount !== null ? yen(p.revenueAmount) : "未設定"
                  }
                />
                <Row label="人件費" value={yen(cost.laborCost)} />
                <Row label="外注費" value={yen(cost.outsourcing)} />
                <Row label="経費" value={yen(cost.expense)} />
                <Row label="原価合計" value={yen(cost.cost)} strong />
                <Row
                  label="粗利"
                  value={
                    cost.grossProfit !== null
                      ? `${yen(cost.grossProfit)}（${cost.grossMargin}%）`
                      : "—"
                  }
                  strong
                  tone={
                    cost.grossProfit !== null && cost.grossProfit < 0
                      ? "bad"
                      : undefined
                  }
                />
                <Row
                  label="着地見込みの原価"
                  value={
                    cost.forecastCost !== null ? yen(cost.forecastCost) : "—"
                  }
                />
                <Row
                  label="着地見込みの粗利"
                  value={
                    cost.forecastProfit !== null
                      ? yen(cost.forecastProfit)
                      : "—"
                  }
                  tone={
                    cost.forecastProfit !== null && cost.forecastProfit < 0
                      ? "bad"
                      : undefined
                  }
                />
              </dl>
              {cost.unratedMinutes > 0 ? (
                <p className="bg-warning-soft text-warning rounded-md px-3 py-2 text-xs">
                  原価単価が未設定のメンバーの工数が{" "}
                  {formatHm(cost.unratedMinutes)}{" "}
                  あります。人件費には含まれていません。
                </p>
              ) : null}
              <p className="text-muted-foreground text-xs">
                人件費は締めた月は確定値、それ以外はその時点の単価で計算しています。
              </p>
            </CardContent>
          </Card>
        ) : null}
      </div>

      {cost ? (
        <ExpensePanel
          projectId={p.id}
          expenses={detail.expenses}
          canEdit={access.canEdit}
        />
      ) : null}

      {detail.members.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>メンバー（{detail.members.length} 人）</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {detail.members.map((m) => (
              <span
                key={m.id}
                className="bg-surface-2 rounded-full px-2.5 py-1 text-xs"
              >
                {m.name}
                {m.departmentName ? (
                  <span className="text-muted-foreground">
                    {" "}
                    ・ {m.departmentName}
                  </span>
                ) : null}
              </span>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p
        className={`tabular text-xl font-semibold ${tone === "OVER" ? "text-destructive" : tone === "CAUTION" ? "text-warning" : ""}`}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-muted-foreground tabular text-xs">{sub}</p>
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  tone,
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: "bad";
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={`tabular text-right ${strong ? "font-semibold" : ""} ${tone === "bad" ? "text-destructive" : ""}`}
      >
        {value}
      </dd>
    </>
  );
}

async function ForecastComment({
  user,
  detail,
}: {
  user: SessionUser;
  detail: ProjectDetail;
}) {
  const facts = forecastFactsOf(detail);
  if (!facts) return null;
  const c = await explainForecast(user, facts);
  return (
    <TsumugiNote source={c.ai ? "ai" : "template"}>
      <p className="font-medium">{c.value.headline}</p>
      <ul className="mt-1.5 list-inside list-disc text-[13px]">
        {c.value.points.map((x, i) => (
          <li key={i}>{x}</li>
        ))}
      </ul>
      {c.value.actions.length > 0 ? (
        <p className="mt-1.5 text-[13px]">
          <span className="font-medium">次の一手: </span>
          {c.value.actions.join(" / ")}
        </p>
      ) : null}
    </TsumugiNote>
  );
}
