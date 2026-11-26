import Link from "next/link";
import { Suspense } from "react";
import {
  ArrowRight,
  CalendarX2,
  ClipboardCheck,
  FolderKanban,
  Lock,
  Timer,
} from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import { jstHourNow, todayJst } from "@/features/common/dates";
import { homeSummary } from "@/features/home/usecase";
import { listApprovals } from "@/features/approval/usecase";
import {
  budgetAlerts,
  getProjectDetail,
  forecastFactsOf,
} from "@/features/project/usecase";
import { explainForecast } from "@/features/tsumugi/tasks";
import { formatDateJa } from "@/lib/date-range";
import { formatHm } from "@/lib/minutes";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { projectColor } from "@/components/project-color";
import { BudgetBar } from "@/components/budget-bar";
import { TsumugiNote } from "@/components/tsumugi/note";
import type { SessionUser } from "@/features/auth/rbac";

export const metadata = { title: "ホーム" };

const GREETING = (h: number) =>
  h < 11
    ? "おはようございます"
    : h < 18
      ? "おつかれさまです"
      : "今日もおつかれさまでした";

export default async function HomePage() {
  const user = await requireUser();
  const today = todayJst();
  const [s, approvals, alerts] = await Promise.all([
    homeSummary(user, today),
    listApprovals(user, "SUBMITTED"),
    budgetAlerts(user),
  ]);
  const hour = jstHourNow();

  return (
    <div className="flex flex-col gap-6">
      {/* 見出しカード */}
      <section className="bg-grad relative overflow-hidden rounded-3xl p-6 text-white shadow-lg shadow-[color-mix(in_oklch,var(--grad-via)_25%,transparent)] sm:p-8">
        <svg
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-25"
          viewBox="0 0 600 200"
          preserveAspectRatio="none"
        >
          {Array.from({ length: 8 }, (_, i) => (
            <path
              key={i}
              d={`M -20 ${30 + i * 22} C 160 ${i * 25}, 360 ${120 + i * 10}, 640 ${40 + i * 20}`}
              fill="none"
              stroke="white"
              strokeWidth={i % 3 === 0 ? 1.2 : 0.6}
            />
          ))}
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-sm text-white/80">{formatDateJa(today)}</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
              {GREETING(hour)}、{user.name}さん
            </h1>
          </div>
          <div className="flex gap-3">
            <Stat label="今日" value={formatHm(s.todayMinutes)} />
            <Stat label="今週" value={formatHm(s.weekMinutes)} />
          </div>
        </div>
        {s.todayByProject.length > 0 ? (
          <div
            className="relative mt-5 flex h-2 overflow-hidden rounded-full bg-white/20"
            aria-label="今日の内訳"
          >
            {s.todayByProject.map((p) => (
              <span
                key={p.id}
                title={`${p.name} ${formatHm(p.minutes)}`}
                style={{
                  width: `${(p.minutes * 100) / s.todayMinutes}%`,
                  background: "rgba(255,255,255,.85)",
                }}
                className="border-r border-white/40 last:border-r-0"
              />
            ))}
          </div>
        ) : null}
        <div className="relative mt-5">
          <Link
            href="/timesheet"
            className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-[var(--grad-from)] shadow-sm hover:bg-white/90"
          >
            <Timer className="size-4" aria-hidden />
            工数を記録する
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* 入力漏れ・提出 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarX2 className="text-primary size-4" aria-hidden />
              入力と提出
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {s.missingDays.length === 0 && s.overdue.length === 0 ? (
              <p className="text-muted-foreground">
                入力漏れや提出の遅れはありません。
              </p>
            ) : null}
            {s.missingDays.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium">
                  工数がまだない日（直近 2 週間の営業日）
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {s.missingDays.map((x) => (
                    <Link
                      key={x}
                      href={`/timesheet?day=${x}`}
                      className="bg-warning-soft text-warning rounded-full px-2.5 py-0.5 text-xs font-medium hover:brightness-95"
                    >
                      {formatDateJa(x)}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
            {s.overdue.length > 0 ? (
              <div>
                <p className="mb-1.5 font-medium">提出期限を過ぎた期間</p>
                <ul className="flex flex-col gap-1">
                  {s.overdue.map((p) => (
                    <li key={p.start}>
                      <Link
                        href={`/timesheet?day=${p.start}`}
                        className="hover:bg-surface-2 flex items-center justify-between rounded-lg border px-3 py-1.5"
                      >
                        <span>
                          {formatDateJa(p.start)} 〜 {formatDateJa(p.end)}
                        </span>
                        <Badge
                          variant={
                            p.status === "REJECTED" ? "destructive" : "warning"
                          }
                        >
                          {p.status === "REJECTED" ? "差戻し" : "未提出"}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {user.role !== "MEMBER" ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ClipboardCheck className="text-primary size-4" aria-hidden />
                承認待ち
                {approvals.length > 0 ? (
                  <Badge variant="primary">{approvals.length}</Badge>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              {approvals.length === 0 ? (
                <p className="text-muted-foreground">承認待ちはありません。</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {approvals.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/approvals/${a.id}`}
                        className="hover:bg-surface-2 flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                      >
                        <span className="truncate">
                          {a.userName}
                          <span className="text-muted-foreground ml-2 text-xs">
                            {formatDateJa(a.start)} 〜 {formatDateJa(a.end)}
                          </span>
                        </span>
                        <span className="tabular shrink-0 font-medium">
                          {formatHm(a.totalMinutes)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        ) : null}

        {user.role !== "MEMBER" ? (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderKanban className="text-primary size-4" aria-hidden />
                予算に注意が必要なプロジェクト
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {alerts.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  予算の 80% を超えたプロジェクトはありません。
                </p>
              ) : (
                <>
                  <Suspense
                    fallback={
                      <TsumugiNote>
                        Tsumugi が見通しを確認しています…
                      </TsumugiNote>
                    }
                  >
                    <TopAlertComment
                      user={user}
                      projectId={alerts[0].id}
                      name={alerts[0].name}
                    />
                  </Suspense>
                  <ul className="grid gap-2 md:grid-cols-2">
                    {alerts.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={`/projects/${p.id}`}
                          className="hover:bg-surface-2 flex flex-col gap-2 rounded-xl border p-3"
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <span
                              className="size-2.5 rounded-full"
                              style={{
                                background: projectColor(p.colorIndex).solid,
                              }}
                              aria-hidden
                            />
                            <span className="truncate">{p.name}</span>
                            <Badge
                              variant={
                                p.budget!.level === "OVER"
                                  ? "destructive"
                                  : "warning"
                              }
                              className="ml-auto"
                            >
                              {p.budget!.level === "OVER" ? "超過" : "注意"}
                            </Badge>
                          </span>
                          <BudgetBar
                            budget={p.budget!.budgetMinutes}
                            actual={p.budget!.actualMinutes}
                            forecast={p.budget!.forecast}
                          />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        ) : null}

        {s.closing ? (
          <Card className="lg:col-span-2">
            <CardContent className="flex flex-wrap items-center gap-3 pt-5 text-sm">
              <Lock className="text-primary size-4" aria-hidden />
              <span className="flex-1">
                {s.closing.yearMonth.replace("-", " 年 ")}{" "}
                月はまだ締めていません。
                {s.closing.blockers > 0
                  ? `承認が済んでいない期間が ${s.closing.blockers} 件あります。`
                  : "締められる状態です。"}
              </span>
              <Link
                href="/admin/closing"
                className="text-primary font-medium hover:underline"
              >
                月次締めへ
              </Link>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/15 px-4 py-2 text-right backdrop-blur">
      <p className="text-xs text-white/75">{label}</p>
      <p className="tabular text-2xl font-semibold">{value}</p>
    </div>
  );
}

async function TopAlertComment({
  user,
  projectId,
  name,
}: {
  user: SessionUser;
  projectId: string;
  name: string;
}) {
  const detail = await getProjectDetail(user, projectId);
  const facts = detail ? forecastFactsOf(detail) : null;
  if (!facts) return null;
  const c = await explainForecast(user, facts);
  return (
    <TsumugiNote
      source={c.ai ? "ai" : "template"}
      action={{ label: "詳しく", href: `/projects/${projectId}` }}
    >
      <p className="font-medium">
        {name}: {c.value.headline}
      </p>
      <p className="mt-0.5 opacity-90">{c.value.points[0]}</p>
    </TsumugiNote>
  );
}
