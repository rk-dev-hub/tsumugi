"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthError, CredentialsSignin } from "next-auth";
import { auth, signIn, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";
import { rateLimit, resetRateLimit } from "@/lib/rate-limit";
import { fieldErrors } from "@/lib/zod";
import { loginSchema, changePasswordSchema } from "@/features/auth/schema";

export type FormState = {
  ok?: boolean;
  error?: string;
  /** 2 段階認証のコード入力に進む */
  needCode?: boolean;
  fields?: Record<string, string>;
} | null;

async function clientIp(): Promise<string> {
  return (
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local"
  );
}

const LOGIN_FAILED = "メールアドレスまたはパスワードが違います。";

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };
  const email = parsed.data.email.trim().toLowerCase();
  const next = safeNext(parsed.data.next);
  const code = parsed.data.code?.trim() || undefined;

  const ip = await clientIp();
  // x-forwarded-for は偽装できるため、メールアドレス単位の上限も設ける
  const rl = rateLimit(`login:${ip}:${email}`, 10, 5 * 60_000);
  const rlEmail = rateLimit(`login-email:${email}`, 30, 15 * 60_000);
  if (!rl.ok || !rlEmail.ok) {
    const sec = Math.max(rl.retryAfterSec, rlEmail.retryAfterSec);
    return {
      error: `試行回数が多すぎます。${sec} 秒後にもう一度お試しください。`,
      needCode: Boolean(code),
    };
  }

  try {
    await signIn("credentials", {
      email,
      password: parsed.data.password,
      code,
      redirect: false,
    });
  } catch (e) {
    if (e instanceof CredentialsSignin) {
      if (e.code === "totp_required") return { needCode: true };
      if (e.code === "totp_invalid") {
        await logFailure(email, ip, "TOTP");
        return {
          needCode: true,
          error: "確認コードが違うか、期限が切れています。",
        };
      }
    }
    if (e instanceof AuthError) {
      await logFailure(email, ip, "PASSWORD");
      return { error: LOGIN_FAILED };
    }
    throw e;
  }

  resetRateLimit(`login:${ip}:${email}`);
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (user) {
    await prisma.$transaction((tx) =>
      recordAudit(tx, {
        actorId: user.id,
        action: "LOGIN_SUCCESS",
        targetType: "User",
        targetId: user.id,
        ip,
      }),
    );
  }
  redirect(next);
}

async function logFailure(
  email: string,
  ip: string,
  reason: "PASSWORD" | "TOTP",
) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  await prisma.$transaction((tx) =>
    recordAudit(tx, {
      actorId: null,
      action: "LOGIN_FAILURE",
      targetType: "User",
      targetId: user?.id ?? null,
      ip,
      // 存在しないメールアドレスは記録しない（列挙の手がかりを残さない）
      detail: { reason },
    }),
  );
}

export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}

export async function changePasswordAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login");

  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fields: fieldErrors(parsed.error) };

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/login");

  const rl = rateLimit(`pw-change:${userId}`, 10, 15 * 60_000);
  if (!rl.ok)
    return { error: "試行回数が多すぎます。しばらくしてからお試しください。" };

  const okCurrent = await verifyPassword(
    parsed.data.currentPassword,
    user.passwordHash,
  );
  if (!okCurrent)
    return { fields: { currentPassword: "現在のパスワードが違います" } };

  const passwordHash = await hashPassword(parsed.data.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      // 既存のセッション（ほかの端末を含む）はすべて無効にする
      data: {
        passwordHash,
        mustChangePassword: false,
        sessionVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      actorId: userId,
      action: "PASSWORD_CHANGE",
      targetType: "User",
      targetId: userId,
      ip: await clientIp(),
    });
  });

  await signOut({ redirect: false });
  redirect("/login?changed=1");
}

/** オープンリダイレクト防止: 自サイト内の絶対パスのみ許可 */
function safeNext(next: string | undefined): string {
  if (
    !next ||
    !next.startsWith("/") ||
    next.startsWith("//") ||
    next.startsWith("/\\")
  )
    return "/";
  return next;
}
