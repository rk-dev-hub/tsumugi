import { requireAdmin } from "@/features/auth/rbac";
import { listUsers } from "@/features/admin/users";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { UsersAdmin } from "./users-admin";

export const metadata = { title: "メンバー" };

export default async function UsersPage() {
  const me = await requireAdmin();
  const [users, departments] = await Promise.all([
    listUsers(),
    prisma.department.findMany({
      where: { active: true },
      orderBy: { code: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="メンバー"
        description="アカウント・権限・承認者・原価単価を管理します。"
      />
      <UsersAdmin users={users} departments={departments} meId={me.id} />
    </div>
  );
}
