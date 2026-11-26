import { requireAdmin } from "@/features/auth/rbac";
import { getCompany } from "@/features/common/company";
import { todayJst, ds } from "@/features/common/dates";
import { nationalHolidays } from "@/lib/holidays";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/page-header";
import { CompanyForm, HolidayEditor } from "./company-forms";

export const metadata = { title: "会社設定" };

export default async function CompanyPage() {
  await requireAdmin();
  const today = todayJst();
  const year = Number(today.slice(0, 4));
  const [company, holidays] = await Promise.all([
    getCompany(),
    prisma.holiday.findMany({
      where: { date: { gte: new Date(`${year - 1}-01-01T00:00:00Z`) } },
      orderBy: { date: "asc" },
    }),
  ]);
  const national = [...nationalHolidays(year), ...nationalHolidays(year + 1)]
    .filter(([date]) => date >= today)
    .slice(0, 8)
    .map(([date, name]) => ({ date, name }));
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="会社設定"
        description="入力の刻み・提出期限・セキュリティと、会社の休日を設定します。"
      />
      <div className="grid items-start gap-5 lg:grid-cols-2">
        <CompanyForm
          initial={{
            name: company.name,
            timeStepMinutes: company.timeStepMinutes,
            gapThresholdMinutes: company.gapThresholdMinutes,
            submissionGraceDays: company.submissionGraceDays,
            requireTotpForManagers: company.requireTotpForManagers,
          }}
        />
        <HolidayEditor
          holidays={holidays.map((h) => ({ date: ds(h.date), name: h.name }))}
          national={national}
        />
      </div>
    </div>
  );
}
