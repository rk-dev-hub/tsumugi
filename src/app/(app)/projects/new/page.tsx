import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { requireManager } from "@/features/auth/rbac";
import { projectFormOptions } from "@/features/project/usecase";
import { todayJst } from "@/features/common/dates";
import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { ProjectForm } from "../project-form";
import { createProjectAction } from "../actions";

export const metadata = { title: "新しいプロジェクト" };

export default async function NewProjectPage() {
  const user = await requireManager();
  const [{ users, clients }, count] = await Promise.all([
    projectFormOptions(),
    prisma.project.count(),
  ]);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <Link
        href="/projects"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" />
        プロジェクト
      </Link>
      <h1 className="page-title">新しいプロジェクト</h1>
      <Card>
        <CardContent className="pt-5">
          <ProjectForm
            action={createProjectAction}
            users={users}
            clients={clients}
            isAdmin={user.role === "ADMIN"}
            submitLabel="作成して工程を設定する"
            initial={{
              code: "",
              name: "",
              kind: "WORK",
              status: "ACTIVE",
              clientId: "",
              pmId: user.id,
              startDate: todayJst(),
              endDate: "",
              revenueAmount: "",
              colorIndex: count % 12,
              note: "",
              memberIds: [user.id],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
