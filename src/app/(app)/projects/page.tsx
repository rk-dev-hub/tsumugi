import Link from "next/link";
import { FolderKanban, Plus, Search } from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import { listProjects, type ProjectListItem } from "@/features/project/usecase";
import { stringParam } from "@/lib/params";
import { formatHm } from "@/lib/minutes";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LinkTabs } from "@/components/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BudgetBar } from "@/components/budget-bar";
import { projectColor } from "@/components/project-color";
import { STATUS_LABEL, STATUS_VARIANT } from "./status";

export const metadata = { title: "プロジェクト" };

const FILTERS = [
  { key: "", label: "進行中・見込み" },
  { key: "COMPLETED", label: "完了" },
  { key: "ALL", label: "すべて" },
];

export default async function ProjectsPage({
  searchParams,
}: PageProps<"/projects">) {
  const user = await requireUser();
  const sp = await searchParams;
  const status =
    FILTERS.find((f) => f.key === stringParam(sp.status))?.key ?? "";
  const q = (stringParam(sp.q) ?? "").slice(0, 50);
  const projects = await listProjects(user, {
    status: status || undefined,
    q: q || undefined,
  });
  const work = projects.filter((p) => p.kind === "WORK");
  const internal = projects.filter((p) => p.kind === "INTERNAL");
  const qs = (s: string) =>
    `/projects?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="プロジェクト"
        description={
          user.role === "MEMBER"
            ? "参加しているプロジェクトと社内業務です。"
            : "予算の消化と着地見込みを確認できます。"
        }
        actions={
          user.role !== "MEMBER" ? (
            <Link href="/projects/new">
              <Button variant="grad">
                <Plus aria-hidden />
                新しいプロジェクト
              </Button>
            </Link>
          ) : null
        }
      />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <LinkTabs
          tabs={FILTERS.map((f) => ({
            key: f.key,
            label: f.label,
            href: qs(f.key),
          }))}
          current={status}
          className="flex-1"
        />
        <form className="relative" role="search">
          {status ? <input type="hidden" name="status" value={status} /> : null}
          <Search
            className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            name="q"
            defaultValue={q}
            placeholder="名前・コードで探す"
            aria-label="プロジェクトを探す"
            className="bg-surface focus:ring-ring/40 h-9 w-56 rounded-lg border pr-3 pl-8 text-sm outline-none focus:ring-2"
          />
        </form>
      </div>
      {projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="該当するプロジェクトはありません"
        />
      ) : (
        <>
          {work.length > 0 ? <Section title="業務" items={work} /> : null}
          {internal.length > 0 ? (
            <Section title="社内" items={internal} />
          ) : null}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  items,
}: {
  title: string;
  items: ProjectListItem[];
}) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-muted-foreground text-xs font-semibold tracking-wider">
        {title}
      </h2>
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((p) => (
          <li key={p.id}>
            <Link
              href={`/projects/${p.id}`}
              className="bg-surface group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: projectColor(p.colorIndex).solid }}
                aria-hidden
              />
              <div className="flex items-start gap-2">
                <span
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-xs font-bold"
                  style={{
                    background: projectColor(p.colorIndex).gradient,
                    color: projectColor(p.colorIndex).ink,
                  }}
                  aria-hidden
                >
                  {p.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium group-hover:underline">
                    {p.name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {p.code}
                    {p.clientName ? ` ・ ${p.clientName}` : ""}
                    {p.pmName ? ` ・ PM ${p.pmName}` : ""}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[p.status]}>
                  {STATUS_LABEL[p.status]}
                </Badge>
              </div>
              {p.budget ? (
                <BudgetBar
                  budget={p.budget.budgetMinutes}
                  actual={p.budget.actualMinutes}
                  forecast={p.budget.forecast}
                  className="mt-auto"
                />
              ) : (
                <p className="text-muted-foreground mt-auto text-xs">
                  実績{" "}
                  <span className="tabular text-foreground font-medium">
                    {formatHm(p.actualMinutes)}
                  </span>
                </p>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
