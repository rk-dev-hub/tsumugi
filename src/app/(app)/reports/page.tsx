import Link from "next/link";
import { BarChart3, Download } from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import {
  AXIS_LABELS,
  buildReport,
  type ReportAxis,
} from "@/features/report/usecase";
import { AXES, reportRange } from "@/features/report/range";
import { todayJst } from "@/features/common/dates";
import { addMonths } from "@/features/timesheet/domain/period";
import { stringParam } from "@/lib/params";
import { formatHm } from "@/lib/minutes";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LinkTabs } from "@/components/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";

export const metadata = { title: "レポート" };

const ymLabel = (ym: string) => `${ym.slice(0, 4)}年${Number(ym.slice(5))}月`;

export default async function ReportsPage({
  searchParams,
}: PageProps<"/reports">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayJst();
  const { from, to } = reportRange(
    stringParam(sp.from),
    stringParam(sp.to),
    today,
  );
  const axisRaw = stringParam(sp.axis) ?? "";
  const axis: ReportAxis = (AXES as readonly string[]).includes(axisRaw)
    ? (axisRaw as ReportAxis)
    : "project";
  const axes =
    user.role === "MEMBER"
      ? (["project", "client", "category"] as const)
      : AXES;
  const r = await buildReport(user, axis, from, to);
  const months = Array.from({ length: 24 }, (_, i) =>
    addMonths(today.slice(0, 7), -i),
  );
  const href = (a: string) =>
    `/reports?${new URLSearchParams({ axis: a, from, to })}`;
  const csv = (kind: string) =>
    `/api/reports/csv?${new URLSearchParams({ kind, axis, from, to })}`;
  const maxMonthly = Math.max(1, ...r.monthly.map((m) => m.minutes));
  const maxRow = Math.max(1, ...r.rows.map((x) => x.minutes));

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="レポート"
        description={
          user.role === "ADMIN"
            ? "全社の工数と人件費を集計します。"
            : user.role === "MANAGER"
              ? "部下と担当プロジェクトの工数を集計します。"
              : "自分の工数を集計します。"
        }
        actions={
          <>
            <a href={csv("summary")}>
              <Button variant="outline" size="sm">
                <Download aria-hidden />
                集計 CSV
              </Button>
            </a>
            <a href={csv("detail")}>
              <Button variant="outline" size="sm">
                <Download aria-hidden />
                明細 CSV
              </Button>
            </a>
          </>
        }
      />

      <form className="bg-surface flex flex-wrap items-end gap-2 rounded-2xl border p-3 shadow-sm">
        <input type="hidden" name="axis" value={axis} />
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">開始月</span>
          <Select name="from" defaultValue={from} className="h-9 w-36">
            {months.map((m) => (
              <option key={m} value={m}>
                {ymLabel(m)}
              </option>
            ))}
          </Select>
        </label>
        <span className="text-muted-foreground pb-2">〜</span>
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">終了月</span>
          <Select name="to" defaultValue={to} className="h-9 w-36">
            {months.map((m) => (
              <option key={m} value={m}>
                {ymLabel(m)}
              </option>
            ))}
          </Select>
        </label>
        <Button type="submit" size="sm" variant="soft" className="h-9">
          集計する
        </Button>
        <p className="text-muted-foreground w-full text-xs sm:ml-auto sm:w-auto sm:pb-2">
          最大 12 か月まで
        </p>
      </form>

      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="工数の合計" value={formatHm(r.total)} />
        <Kpi
          label="業務の比率"
          value={r.utilization !== null ? `${r.utilization}%` : "—"}
          sub="社内業務を除いた割合"
        />
        {r.laborCost !== null ? (
          <Kpi
            label="人件費"
            value={`¥${r.laborCost.toLocaleString("ja-JP")}`}
          />
        ) : (
          <Kpi label="対象期間" value={`${r.monthly.length} か月`} />
        )}
      </div>

      {r.monthly.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>月ごとの推移</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className="flex h-44 items-end gap-2"
              role="img"
              aria-label="月ごとの工数"
            >
              {r.monthly.map((m) => (
                <div
                  key={m.yearMonth}
                  className="flex h-full min-w-0 flex-1 flex-col items-center gap-1"
                >
                  <div className="flex w-full flex-1 flex-col items-center justify-end gap-1">
                    <span className="tabular text-[11px] font-medium">
                      {formatHm(m.minutes)}
                    </span>
                    <span
                      className="bg-grad w-full max-w-14 rounded-t-lg"
                      style={{
                        height: `${(m.minutes * 85) / maxMonthly}%`,
                        minHeight: 2,
                      }}
                      title={`${ymLabel(m.yearMonth)} ${formatHm(m.minutes)}`}
                    />
                  </div>
                  <span className="text-muted-foreground text-[11px]">
                    {Number(m.yearMonth.slice(5))}月
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <LinkTabs
        tabs={axes.map((a) => ({
          key: a,
          label: `${AXIS_LABELS[a]}別`,
          href: href(a),
        }))}
        current={axis}
      />

      {r.rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="この期間の工数はありません">
          期間を変えるか、
          <Link href="/timesheet" className="text-primary hover:underline">
            工数を記録
          </Link>
          してください。
        </EmptyState>
      ) : (
        <div className="bg-surface overflow-x-auto rounded-2xl border shadow-sm">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-surface-2/60 text-muted-foreground text-xs">
              <tr>
                <th className="px-4 py-2 text-left font-medium">
                  {AXIS_LABELS[axis]}
                </th>
                <th className="px-3 py-2 text-right font-medium">工数</th>
                <th className="w-[30%] px-3 py-2 text-left font-medium" />
                {axis !== "project" ? (
                  <th className="px-3 py-2 text-right font-medium">
                    業務の比率
                  </th>
                ) : null}
                {r.showCost ? (
                  <th className="px-4 py-2 text-right font-medium">人件費</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {r.rows.map((x) => (
                <tr key={x.key} className="border-t">
                  <td className="px-4 py-2.5">
                    {axis === "project" ? (
                      <Link
                        href={`/projects/${x.key}`}
                        className="font-medium hover:underline"
                      >
                        {x.label}
                      </Link>
                    ) : (
                      <span className="font-medium">{x.label}</span>
                    )}
                    {x.sub ? (
                      <span className="text-muted-foreground ml-2 text-xs">
                        {x.sub}
                      </span>
                    ) : null}
                  </td>
                  <td className="tabular px-3 py-2.5 text-right">
                    {formatHm(x.minutes)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="bg-surface-2 block h-2 overflow-hidden rounded-full">
                      <span
                        className="bg-grad block h-full rounded-full"
                        style={{ width: `${(x.minutes * 100) / maxRow}%` }}
                      />
                    </span>
                  </td>
                  {axis !== "project" ? (
                    <td className="tabular px-3 py-2.5 text-right">
                      {x.utilization !== null ? `${x.utilization}%` : "—"}
                    </td>
                  ) : null}
                  {r.showCost ? (
                    <td className="tabular px-4 py-2.5 text-right">
                      ¥{(x.laborCost ?? 0).toLocaleString("ja-JP")}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.showCost ? (
        <p className="text-muted-foreground text-xs">
          人件費は締めた月は確定値、それ以外はその時点の単価で計算しています。軸ごとの按分のため、合計は数円ずれることがあります。
        </p>
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="bg-surface relative overflow-hidden rounded-2xl border p-4 shadow-sm">
      <span className="bg-grad absolute inset-y-0 left-0 w-1" aria-hidden />
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="tabular mt-0.5 text-2xl font-semibold">{value}</p>
      {sub ? <p className="text-muted-foreground text-xs">{sub}</p> : null}
    </div>
  );
}
