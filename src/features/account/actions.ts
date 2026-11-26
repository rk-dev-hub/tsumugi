"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentUser } from "@/features/auth/rbac";
import { getCompany } from "@/features/common/company";
import { rateLimit } from "@/lib/rate-limit";
import { beginTotpSetup, confirmTotpSetup, disableTotp } from "./totp";

export async function beginTotpAction(): Promise<{
  ok: boolean;
  secret?: string;
  qrDataUrl?: string;
  message?: string;
}> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "ログインし直してください。" };
  const r = await beginTotpSetup(user.id);
  return r.ok
    ? { ok: true, ...r.value }
    : { ok: false, message: r.error.message };
}

export async function confirmTotpAction(
  code: string,
): Promise<{ ok: boolean; recoveryCodes?: string[]; message?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "ログインし直してください。" };
  if (!rateLimit(`totp-setup:${user.id}`, 10, 10 * 60_000).ok) {
    return {
      ok: false,
      message: "試行回数が多すぎます。しばらくしてからお試しください。",
    };
  }
  const parsed = z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .safeParse(code.replace(/\s/g, ""));
  if (!parsed.success)
    return { ok: false, message: "6 桁の数字を入力してください。" };
  const r = await confirmTotpSetup(user.id, parsed.data);
  revalidatePath("/settings");
  return r.ok
    ? { ok: true, recoveryCodes: r.value.recoveryCodes }
    : { ok: false, message: r.error.message };
}

export async function disableTotpAction(
  password: string,
): Promise<{ ok: boolean; message?: string }> {
  const user = await currentUser();
  if (!user) return { ok: false, message: "ログインし直してください。" };
  if (!rateLimit(`totp-disable:${user.id}`, 10, 10 * 60_000).ok) {
    return {
      ok: false,
      message: "試行回数が多すぎます。しばらくしてからお試しください。",
    };
  }
  const company = await getCompany();
  const required = company.requireTotpForManagers && user.role !== "MEMBER";
  const r = await disableTotp(user.id, password, required);
  revalidatePath("/settings");
  return r.ok
    ? { ok: true, message: "2 段階認証を無効にしました。" }
    : { ok: false, message: r.error.message };
}
