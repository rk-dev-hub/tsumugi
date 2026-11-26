"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminActor, isErr } from "@/features/auth/rbac";
import {
  addCostRate,
  createUser,
  deleteCostRate,
  rateInputSchema,
  resetUserPassword,
  resetUserTotp,
  setUserStatus,
  updateUser,
  userInputSchema,
} from "@/features/admin/users";
import { fieldErrors } from "@/lib/zod";
import type { Result } from "@/lib/result";

export type UserActionResult = {
  ok: boolean;
  message?: string;
  fields?: Record<string, string>;
  password?: string;
};

const uuid = z.string().uuid();
const input = userInputSchema.extend({
  canViewCost: z.boolean().default(false),
});

function res(r: Result<unknown>, success: string): UserActionResult {
  revalidatePath("/admin/users");
  return r.ok
    ? { ok: true, message: success }
    : { ok: false, message: r.error.message, fields: r.error.fields };
}

export async function saveUserAction(
  id: string | null,
  raw: unknown,
): Promise<UserActionResult> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  const p = input.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      message: "入力内容を確認してください。",
      fields: fieldErrors(p.error),
    };
  if (id === null) {
    const r = await createUser(actor, p.data);
    revalidatePath("/admin/users");
    if (!r.ok)
      return { ok: false, message: r.error.message, fields: r.error.fields };
    return {
      ok: true,
      message: "登録しました。初期パスワードを本人に伝えてください。",
      password: r.value.password,
    };
  }
  if (!uuid.safeParse(id).success)
    return { ok: false, message: "対象が見つかりません。" };
  return res(await updateUser(actor, id, p.data), "保存しました。");
}

export async function setUserStatusAction(
  id: string,
  active: boolean,
): Promise<UserActionResult> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  if (!uuid.safeParse(id).success)
    return { ok: false, message: "対象が見つかりません。" };
  return res(
    await setUserStatus(actor, id, Boolean(active)),
    active ? "有効にしました。" : "無効にしました。",
  );
}

export async function resetPasswordAction(
  id: string,
): Promise<UserActionResult> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  if (!uuid.safeParse(id).success)
    return { ok: false, message: "対象が見つかりません。" };
  const r = await resetUserPassword(actor, id);
  if (!r.ok) return { ok: false, message: r.error.message };
  return {
    ok: true,
    message: "パスワードを再発行しました。本人に伝えてください。",
    password: r.value.password,
  };
}

export async function resetTotpAction(id: string): Promise<UserActionResult> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  if (!uuid.safeParse(id).success)
    return { ok: false, message: "対象が見つかりません。" };
  return res(await resetUserTotp(actor, id), "2 段階認証を解除しました。");
}

export async function addRateAction(
  userId: string,
  raw: unknown,
): Promise<UserActionResult> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  if (!uuid.safeParse(userId).success)
    return { ok: false, message: "対象が見つかりません。" };
  const p = rateInputSchema.safeParse(raw);
  if (!p.success)
    return {
      ok: false,
      message: "入力内容を確認してください。",
      fields: fieldErrors(p.error),
    };
  return res(await addCostRate(actor, userId, p.data), "単価を保存しました。");
}

export async function deleteRateAction(
  rateId: string,
): Promise<UserActionResult> {
  const actor = await getAdminActor();
  if (isErr(actor)) return { ok: false, message: actor.error.message };
  if (!uuid.safeParse(rateId).success)
    return { ok: false, message: "対象が見つかりません。" };
  return res(await deleteCostRate(actor, rateId), "単価を削除しました。");
}
