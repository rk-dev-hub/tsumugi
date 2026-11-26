"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, isErr } from "@/features/auth/rbac";
import {
  addHoliday,
  companyInputSchema,
  deleteHoliday,
  holidayInputSchema,
  saveCompany,
} from "@/features/admin/masters";
import { fieldErrors } from "@/lib/zod";

const input = companyInputSchema.extend({
  requireTotpForManagers: z.boolean().default(false),
});

export async function saveCompanyAction(raw: unknown) {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const p = input.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      message:
        Object.values(fieldErrors(p.error))[0] ??
        "入力内容を確認してください。",
    };
  const r = await saveCompany(actor, p.data);
  revalidatePath("/", "layout");
  return r.ok
    ? { ok: true, message: "保存しました。" }
    : { ok: false, message: r.error.message };
}

export async function addHolidayAction(raw: unknown) {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const p = holidayInputSchema.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      message:
        Object.values(fieldErrors(p.error))[0] ??
        "入力内容を確認してください。",
    };
  const r = await addHoliday(actor, p.data);
  revalidatePath("/", "layout");
  return r.ok
    ? { ok: true, message: "休日を登録しました。" }
    : { ok: false, message: r.error.message };
}

export async function deleteHolidayAction(date: string) {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    return { ok: false, message: "日付が正しくありません。" };
  const r = await deleteHoliday(actor, date);
  revalidatePath("/", "layout");
  return r.ok
    ? { ok: true, message: "削除しました。" }
    : { ok: false, message: r.error.message };
}
