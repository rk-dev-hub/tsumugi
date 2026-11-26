import { requireAdmin } from "@/features/auth/rbac";
import { listMasters } from "@/features/admin/masters";
import { stringParam } from "@/lib/params";
import { PageHeader } from "@/components/page-header";
import { LinkTabs } from "@/components/tabs";
import { MasterTable } from "./master-table";

export const metadata = { title: "マスタ" };

const KINDS = [
  {
    key: "department",
    label: "部署",
    hint: "メンバーの所属。レポートの部署別集計に使います。",
  },
  {
    key: "client",
    label: "顧客",
    hint: "業務プロジェクトの取引先。レポートの顧客別集計に使います。",
  },
  {
    key: "category",
    label: "業務分類",
    hint: "設計・開発・打ち合わせなど、作業の種類。並び順は登録順です。",
  },
] as const;

export default async function MastersPage({
  searchParams,
}: PageProps<"/admin/masters">) {
  await requireAdmin();
  const sp = await searchParams;
  const kind = KINDS.find((k) => k.key === stringParam(sp.kind)) ?? KINDS[0];
  const m = await listMasters();
  const rows = {
    department: m.departments,
    client: m.clients,
    category: m.categories,
  }[kind.key];
  return (
    <div className="flex flex-col gap-5">
      <PageHeader title="マスタ" description={kind.hint} />
      <LinkTabs
        tabs={KINDS.map((k) => ({
          key: k.key,
          label: k.label,
          href: `/admin/masters?kind=${k.key}`,
        }))}
        current={kind.key}
      />
      <MasterTable
        key={kind.key}
        kind={kind.key}
        rows={rows.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          active: r.active,
        }))}
      />
    </div>
  );
}
