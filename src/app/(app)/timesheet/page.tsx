import { requireUser } from "@/features/auth/rbac";
import {
  getWeek,
  listCategories,
  listTargetOptions,
} from "@/features/timesheet/usecase";
import { weekStartOf } from "@/features/timesheet/domain/period";
import { isTsumugiAiEnabled } from "@/features/tsumugi/client";
import { todayJst } from "@/features/common/dates";
import { dateParam } from "@/lib/params";
import { nationalHolidayName } from "@/lib/holidays";
import { TimesheetBoard } from "./timesheet-board";

export const metadata = { title: "工数" };

export default async function TimesheetPage({
  searchParams,
}: PageProps<"/timesheet">) {
  const user = await requireUser();
  const sp = await searchParams;
  const today = todayJst();
  const day = dateParam(sp.day, dateParam(sp.week, today));
  const [week, targets, categories] = await Promise.all([
    getWeek(user.id, day),
    listTargetOptions(user.id),
    listCategories(),
  ]);
  const holidays = Object.fromEntries(
    week.days
      .map((d) => [d, nationalHolidayName(d)])
      .filter(([, n]) => n !== null),
  ) as Record<string, string>;
  return (
    <TimesheetBoard
      key={week.weekStart}
      week={week}
      today={today}
      initialDay={week.days.includes(day) ? day : weekStartOf(day)}
      targets={targets}
      categories={categories}
      holidays={holidays}
      aiEnabled={isTsumugiAiEnabled()}
    />
  );
}
