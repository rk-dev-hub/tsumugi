import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";
import { recordAudit } from "@/lib/audit";
import { err, ok, type Result } from "@/lib/result";
import type { SessionUser } from "@/features/auth/rbac";
import { d, ds } from "@/features/common/dates";

const nullableUuid = z
  .string()
  .uuid()
  .nullish()
  .or(z.literal("").transform(() => null));

export const userInputSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("メールアドレスの形式が正しくありません")
    .max(254),
  name: z.string().trim().min(1, "氏名を入力してください").max(50),
  role: z.enum(["ADMIN", "MANAGER", "MEMBER"]),
  departmentId: nullableUuid,
  approverId: nullableUuid,
  canViewCost: z.coerce.boolean().default(false),
  dailyStandardMinutes: z.coerce.number().int().min(0).max(1440).default(480),
});

/** 初期パスワード（初回ログイン時に変更させる） */
function temporaryPassword(): string {
  return `Tg-${randomBytes(9).toString("base64url")}`;
}

async function validateApprover(
  approverId: string | null | undefined,
  selfId?: string,
): Promise<string | null> {
  if (!approverId) return null;
  if (approverId === selfId) return "自分自身は承認者にできません";
  const a = await prisma.user.findUnique({
    where: { id: approverId },
    select: { role: true, status: true },
  });
  if (!a || a.status !== "ACTIVE" || a.role === "MEMBER")
    return "承認者には有効なマネージャーか管理者を選んでください";
  return null;
}

export async function createUser(
  actor: SessionUser,
  input: z.infer<typeof userInputSchema>,
): Promise<Result<{ id: string; password: string }>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    return err("VALIDATION", "このメールアドレスはすでに登録されています。", {
      email: "すでに登録されています",
    });
  }
  const approverErr = await validateApprover(input.approverId);
  if (approverErr)
    return err("VALIDATION", approverErr, { approverId: approverErr });
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.create({
      data: {
        ...input,
        departmentId: input.departmentId ?? null,
        approverId: input.approverId ?? null,
        passwordHash,
        mustChangePassword: true,
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "USER_CREATE",
      targetType: "User",
      targetId: u.id,
      detail: { email: u.email, role: u.role },
    });
    return ok({ id: u.id, password });
  });
}

export async function updateUser(
  actor: SessionUser,
  userId: string,
  input: z.infer<typeof userInputSchema>,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) return err("NOT_FOUND");
  const dup = await prisma.user.findFirst({
    where: { email: input.email, id: { not: userId } },
  });
  if (dup)
    return err("VALIDATION", "このメールアドレスはすでに登録されています。", {
      email: "すでに登録されています",
    });
  const approverErr = await validateApprover(input.approverId, userId);
  if (approverErr)
    return err("VALIDATION", approverErr, { approverId: approverErr });
  if (before.id === actor.id && input.role !== "ADMIN")
    return err("VALIDATION", "自分の管理者権限は外せません。");
  if (before.role === "ADMIN" && input.role !== "ADMIN") {
    const admins = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE" },
    });
    if (admins <= 1)
      return err(
        "VALIDATION",
        "有効な管理者が 1 人もいなくなる変更はできません。",
      );
  }
  const privilegeChanged =
    before.role !== input.role ||
    before.canViewCost !== input.canViewCost ||
    before.email !== input.email;
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        ...input,
        departmentId: input.departmentId ?? null,
        approverId: input.approverId ?? null,
        // 権限が変わったら既存のセッションを無効にする
        ...(privilegeChanged ? { sessionVersion: { increment: 1 } } : {}),
      },
    });
    // マネージャーでなくなった人を承認者にしているユーザーは承認者なし（管理者が承認）にする
    if (input.role === "MEMBER" && before.role !== "MEMBER") {
      await tx.user.updateMany({
        where: { approverId: userId },
        data: { approverId: null },
      });
    }
    await recordAudit(tx, {
      actorId: actor.id,
      action: "USER_UPDATE",
      targetType: "User",
      targetId: userId,
      detail: {
        before: {
          email: before.email,
          name: before.name,
          role: before.role,
          departmentId: before.departmentId,
          approverId: before.approverId,
          canViewCost: before.canViewCost,
        },
        after: {
          email: input.email,
          name: input.name,
          role: input.role,
          departmentId: input.departmentId ?? null,
          approverId: input.approverId ?? null,
          canViewCost: input.canViewCost,
        },
      },
    });
    return ok(undefined);
  });
}

export async function setUserStatus(
  actor: SessionUser,
  userId: string,
  active: boolean,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  if (userId === actor.id)
    return err("VALIDATION", "自分自身は無効にできません。");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return err("NOT_FOUND");
  if (!active && u.role === "ADMIN") {
    const admins = await prisma.user.count({
      where: { role: "ADMIN", status: "ACTIVE" },
    });
    if (admins <= 1)
      return err(
        "VALIDATION",
        "有効な管理者が 1 人もいなくなる変更はできません。",
      );
  }
  return prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        status: active ? "ACTIVE" : "DISABLED",
        sessionVersion: { increment: 1 },
      },
    });
    if (!active) await tx.runningTimer.deleteMany({ where: { userId } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: active ? "USER_UPDATE" : "USER_DISABLE",
      targetType: "User",
      targetId: userId,
      detail: { status: active ? "ACTIVE" : "DISABLED" },
    });
    return ok(undefined);
  });
}

export async function resetUserPassword(
  actor: SessionUser,
  userId: string,
): Promise<Result<{ password: string }>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return err("NOT_FOUND");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        mustChangePassword: true,
        sessionVersion: { increment: 1 },
      },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "PASSWORD_RESET",
      targetType: "User",
      targetId: userId,
    });
  });
  return ok({ password });
}

export async function resetUserTotp(
  actor: SessionUser,
  userId: string,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return err("NOT_FOUND");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
        sessionVersion: { increment: 1 },
      },
    });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "TOTP_RESET",
      targetType: "User",
      targetId: userId,
    });
  });
  return ok(undefined);
}

export const rateInputSchema = z.object({
  effectiveFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "適用開始日を入力してください"),
  hourlyRate: z.coerce
    .number()
    .int("整数で入力してください")
    .min(0)
    .max(100_000, "100,000 円以下にしてください"),
});

export async function addCostRate(
  actor: SessionUser,
  userId: string,
  input: z.infer<typeof rateInputSchema>,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return err("NOT_FOUND");
  const before = await prisma.costRate.findUnique({
    where: {
      userId_effectiveFrom: { userId, effectiveFrom: d(input.effectiveFrom) },
    },
  });
  return prisma.$transaction(async (tx) => {
    await tx.costRate.upsert({
      where: {
        userId_effectiveFrom: { userId, effectiveFrom: d(input.effectiveFrom) },
      },
      create: {
        userId,
        effectiveFrom: d(input.effectiveFrom),
        hourlyRate: input.hourlyRate,
      },
      update: { hourlyRate: input.hourlyRate },
    });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "RATE_CHANGE",
      targetType: "User",
      targetId: userId,
      detail: {
        effectiveFrom: input.effectiveFrom,
        before: before?.hourlyRate ?? null,
        after: input.hourlyRate,
      },
    });
    return ok(undefined);
  });
}

export async function deleteCostRate(
  actor: SessionUser,
  rateId: string,
): Promise<Result<void>> {
  if (actor.role !== "ADMIN") return err("FORBIDDEN");
  const r = await prisma.costRate.findUnique({ where: { id: rateId } });
  if (!r) return err("NOT_FOUND");
  await prisma.$transaction(async (tx) => {
    await tx.costRate.delete({ where: { id: rateId } });
    await recordAudit(tx, {
      actorId: actor.id,
      action: "RATE_CHANGE",
      targetType: "User",
      targetId: r.userId,
      detail: {
        effectiveFrom: ds(r.effectiveFrom),
        before: r.hourlyRate,
        after: null,
      },
    });
  });
  return ok(undefined);
}

export async function listUsers() {
  const users = await prisma.user.findMany({
    orderBy: [
      { status: "asc" },
      { role: "asc" },
      { departmentId: "asc" },
      { email: "asc" },
    ],
    include: {
      department: { select: { name: true } },
      approver: { select: { name: true } },
      costRates: { orderBy: { effectiveFrom: "desc" } },
    },
  });
  return users.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    departmentId: u.departmentId,
    departmentName: u.department?.name ?? null,
    approverId: u.approverId,
    approverName: u.approver?.name ?? null,
    canViewCost: u.canViewCost,
    dailyStandardMinutes: u.dailyStandardMinutes,
    totpEnabled: Boolean(u.totpEnabledAt),
    rates: u.costRates.map((r) => ({
      id: r.id,
      effectiveFrom: ds(r.effectiveFrom),
      hourlyRate: r.hourlyRate,
    })),
  }));
}
