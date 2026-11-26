"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getManagerActor, isErr } from "@/features/auth/rbac";
import { decidePeriod } from "@/features/approval/usecase";

const schema = z.object({
  periodId: z.string().uuid(),
  op: z.enum(["APPROVE", "REJECT", "CANCEL_APPROVAL"]),
  comment: z.string().max(500).default(""),
});

export async function decideAction(
  raw: unknown,
): Promise<{ ok: boolean; message?: string }> {
  const actor = await getManagerActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const parsed = schema.safeParse(raw);
  if (!parsed.success)
    return { ok: false, message: "入力を確認してください。" };
  const r = await decidePeriod(
    actor,
    parsed.data.periodId,
    parsed.data.op,
    parsed.data.comment,
  );
  revalidatePath("/approvals");
  revalidatePath("/", "layout");
  if (!r.ok) return { ok: false, message: r.error.message };
  return {
    ok: true,
    message: {
      APPROVE: "承認しました。",
      REJECT: "差し戻しました。",
      CANCEL_APPROVAL: "承認を取り消しました。",
    }[parsed.data.op],
  };
}
