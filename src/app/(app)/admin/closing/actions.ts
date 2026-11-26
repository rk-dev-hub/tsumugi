"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, isErr } from "@/features/auth/rbac";
import { closeMonth, reopenMonth } from "@/features/closing/usecase";
import { monthlyReport } from "@/features/tsumugi/tasks";

const ym = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export async function closeMonthAction(raw: string) {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const p = ym.safeParse(raw);
  if (!p.success) return { ok: false, message: "月の形式が正しくありません。" };
  const r = await closeMonth(actor, p.data);
  revalidatePath("/", "layout");
  return r.ok
    ? { ok: true, message: "締めました。人件費を確定しました。" }
    : { ok: false, message: r.error.message };
}

export async function reopenMonthAction(raw: string, reason: string) {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const p = ym.safeParse(raw);
  if (!p.success) return { ok: false, message: "月の形式が正しくありません。" };
  const r = await reopenMonth(
    actor,
    p.data,
    String(reason ?? "").slice(0, 500),
  );
  revalidatePath("/", "layout");
  return r.ok
    ? { ok: true, message: "締めを解除しました。" }
    : { ok: false, message: r.error.message };
}

export async function monthlyReportAction(raw: string) {
  const actor = await getAdminActor();
  if (isErr(actor)) return null;
  const p = ym.safeParse(raw);
  if (!p.success) return null;
  return monthlyReport(actor, p.data);
}
