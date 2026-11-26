"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, isErr } from "@/features/auth/rbac";
import { masterInputSchema, saveMaster } from "@/features/admin/masters";
import { fieldErrors } from "@/lib/zod";

const input = masterInputSchema.extend({ active: z.boolean().default(true) });

export async function saveMasterAction(
  kind: string,
  id: string | null,
  raw: unknown,
) {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const k = z.enum(["department", "client", "category"]).safeParse(kind);
  if (!k.success || (id !== null && !z.string().uuid().safeParse(id).success))
    return { ok: false, message: "対象が見つかりません。" };
  const p = input.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      message:
        Object.values(fieldErrors(p.error))[0] ??
        "入力内容を確認してください。",
    };
  const r = await saveMaster(actor, k.data, id, p.data);
  revalidatePath("/admin/masters");
  return r.ok
    ? { ok: true, message: "保存しました。" }
    : { ok: false, message: r.error.message };
}
