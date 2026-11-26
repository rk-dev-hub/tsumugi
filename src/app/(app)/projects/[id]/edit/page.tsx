import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { requireUser } from "@/features/auth/rbac";
import {
  getProjectDetail,
  projectFormOptions,
} from "@/features/project/usecase";
import { prisma } from "@/lib/prisma";
import { uuidParam } from "@/lib/params";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProjectForm } from "../../project-form";
import { updateProjectAction } from "../../actions";
import { PhaseEditor } from "./phase-editor";

export const metadata = { title: "プロジェクトの編集" };

export default async function EditProjectPage({
  params,
  searchParams,
}: PageProps<"/projects/[id]/edit">) {
  const user = await requireUser();
  const id = uuidParam((await params).id);
  if (!id) notFound();
  const detail = await getProjectDetail(user, id);
  if (!detail || !detail.access.canEdit) notFound();
  const created = (await searchParams).created === "1";
  const [{ users, clients }, phases] = await Promise.all([
    projectFormOptions(),
    prisma.phase.findMany({
      where: { projectId: id },
      orderBy: { sortOrder: "asc" },
    }),
  ]);
  const p = detail.project;
  const actuals = new Map(
    detail.budget?.phases.map((ph) => [ph.id, ph.actualMinutes]) ?? [],
  );

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
      <Link
        href={`/projects/${id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" />
        {p.name}
      </Link>
      <h1 className="page-title">プロジェクトの編集</h1>
      {created ? (
        <p className="bg-success-soft text-success rounded-lg px-4 py-2.5 text-sm">
          作成しました。続けて工程と予算を設定しましょう。
        </p>
      ) : null}
      <Card id="phases">
        <CardHeader>
          <CardTitle>工程と予算</CardTitle>
        </CardHeader>
        <CardContent>
          <PhaseEditor
            key={phases.map((ph) => `${ph.id}:${ph.active}`).join(",")}
            projectId={id}
            initial={phases.map((ph) => ({
              id: ph.id,
              name: ph.name,
              budgetMinutes: ph.budgetMinutes,
              remainingMinutes: ph.remainingMinutes,
              active: ph.active,
              actualMinutes: actuals.get(ph.id) ?? 0,
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>基本情報</CardTitle>
        </CardHeader>
        <CardContent>
          <ProjectForm
            action={updateProjectAction}
            users={users}
            clients={clients}
            isAdmin={user.role === "ADMIN"}
            submitLabel="保存する"
            initial={{
              id,
              code: p.code,
              name: p.name,
              kind: p.kind,
              status: p.status,
              clientId: p.client?.id ?? "",
              pmId: p.pm?.id ?? "",
              startDate: p.startDate,
              endDate: p.endDate ?? "",
              revenueAmount:
                p.revenueAmount !== null ? String(p.revenueAmount) : "",
              colorIndex: p.colorIndex,
              note: p.note,
              memberIds: detail.members.map((m) => m.id),
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
