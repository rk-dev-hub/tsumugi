import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/features/auth/rbac";
import {
  AXIS_LABELS,
  buildReport,
  reportDetail,
  type ReportAxis,
} from "@/features/report/usecase";
import { AXES, reportRange } from "@/features/report/range";
import { encodeCsv, toCsv, type CsvEncoding } from "@/features/report/csv";
import { todayJst, ds } from "@/features/common/dates";
import { recordAudit } from "@/lib/audit";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { formatClock } from "@/lib/minutes";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const hours = (m: number) => Math.round((m / 60) * 100) / 100;

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user || user.mustChangePassword)
    return new NextResponse("Unauthorized", { status: 401 });
  if (!rateLimit(`csv:${user.id}`, 20, 60_000).ok)
    return new NextResponse("Too Many Requests", { status: 429 });

  const sp = req.nextUrl.searchParams;
  const kind = sp.get("kind") === "detail" ? "detail" : "summary";
  const axis = (AXES as readonly string[]).includes(sp.get("axis") ?? "")
    ? (sp.get("axis") as ReportAxis)
    : "project";
  const encRaw = sp.get("enc");
  const enc: CsvEncoding =
    encRaw === "utf8" || encRaw === "utf8-bom" || encRaw === "shift_jis"
      ? encRaw
      : env.CSV_ENCODING;
  const { from, to } = reportRange(
    sp.get("from") ?? undefined,
    sp.get("to") ?? undefined,
    todayJst(),
  );

  let text: string;
  let count: number;
  if (kind === "summary") {
    const r = await buildReport(user, axis, from, to);
    const header = [
      AXIS_LABELS[axis],
      "補足",
      "工数（時間）",
      "うち業務（時間）",
      "業務比率（%）",
      ...(r.showCost ? ["人件費（円）"] : []),
    ];
    text = toCsv(
      header,
      r.rows.map((x) => [
        x.label,
        x.sub,
        hours(x.minutes),
        hours(x.directMinutes),
        x.utilization,
        ...(r.showCost ? [x.laborCost] : []),
      ]),
    );
    count = r.rows.length;
  } else {
    const rows = await reportDetail(user, from, to);
    text = toCsv(
      [
        "日付",
        "メンバー",
        "メール",
        "部署",
        "プロジェクトコード",
        "プロジェクト",
        "顧客",
        "工程",
        "業務分類",
        "開始",
        "終了",
        "工数（分）",
        "メモ",
      ],
      rows.map((e) => [
        ds(e.date),
        e.user.name,
        e.user.email,
        e.user.department?.name ?? "",
        e.project.code,
        e.project.name,
        e.project.client?.name ?? "",
        e.phase.name,
        e.workCategory?.name ?? "",
        formatClock(e.startMinute),
        formatClock(e.endMinute),
        e.minutes,
        e.note,
      ]),
    );
    count = rows.length;
  }

  await prisma.$transaction((tx) =>
    recordAudit(tx, {
      actorId: user.id,
      action: "EXPORT",
      targetType: "Report",
      ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      detail: {
        kind,
        axis: kind === "summary" ? axis : undefined,
        from,
        to,
        rows: count,
      },
    }),
  );

  const name = `tsumugi-${kind === "summary" ? axis : "entries"}-${from}_${to}.csv`;
  return new NextResponse(new Uint8Array(encodeCsv(text, enc)), {
    headers: {
      "Content-Type": `text/csv; charset=${enc === "shift_jis" ? "Shift_JIS" : "utf-8"}`,
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
