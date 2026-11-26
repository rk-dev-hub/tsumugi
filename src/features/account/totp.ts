import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { err, ok, type Result } from "@/lib/result";
import { open, seal } from "@/lib/secret-box";
import {
  generateRecoveryCodes,
  generateTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "@/lib/totp";
import { hashRecoveryCode } from "@/lib/auth";
import { verifyPassword } from "@/lib/password";

/** 設定を始める: シークレットを作り（まだ有効にしない）、QR コードを返す */
export async function beginTotpSetup(
  userId: string,
): Promise<Result<{ secret: string; qrDataUrl: string }>> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return err("NOT_FOUND");
  if (u.totpEnabledAt) return err("CONFLICT", "2 段階認証はすでに有効です。");
  let secret = u.totpSecretEnc ? open(u.totpSecretEnc) : null;
  if (!secret) {
    secret = generateTotpSecret();
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: seal(secret) },
    });
  }
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl(secret, u.email), {
    margin: 1,
    width: 200,
  });
  return ok({ secret, qrDataUrl });
}

/** 認証アプリのコードを確かめて有効にし、リカバリーコードを返す（一度だけ表示） */
export async function confirmTotpSetup(
  userId: string,
  code: string,
): Promise<Result<{ recoveryCodes: string[] }>> {
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u || !u.totpSecretEnc)
    return err("CONFLICT", "設定をやり直してください。");
  if (u.totpEnabledAt) return err("CONFLICT", "2 段階認証はすでに有効です。");
  const secret = open(u.totpSecretEnc);
  if (!secret) return err("CONFLICT", "設定をやり直してください。");
  const step = verifyTotp(secret, code.replace(/\s/g, ""), u.totpLastUsedStep);
  if (step === null)
    return err(
      "VALIDATION",
      "コードが違います。認証アプリに表示された 6 桁を入力してください。",
    );
  const codes = generateRecoveryCodes();
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { totpEnabledAt: new Date(), totpLastUsedStep: step },
    });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await tx.recoveryCode.createMany({
      data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(c) })),
    });
    await recordAudit(tx, {
      actorId: userId,
      action: "TOTP_ENABLE",
      targetType: "User",
      targetId: userId,
    });
  });
  return ok({ recoveryCodes: codes });
}

/** 無効にする（パスワードの再入力が必要。必須のロールは無効にできない） */
export async function disableTotp(
  userId: string,
  password: string,
  required: boolean,
): Promise<Result<void>> {
  if (required)
    return err(
      "FORBIDDEN",
      "管理者・マネージャーは 2 段階認証を無効にできません。",
    );
  const u = await prisma.user.findUnique({ where: { id: userId } });
  if (!u) return err("NOT_FOUND");
  if (!(await verifyPassword(password, u.passwordHash)))
    return err("VALIDATION", "パスワードが違います。");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: {
        totpSecretEnc: null,
        totpEnabledAt: null,
        totpLastUsedStep: null,
      },
    });
    await tx.recoveryCode.deleteMany({ where: { userId } });
    await recordAudit(tx, {
      actorId: userId,
      action: "TOTP_DISABLE",
      targetType: "User",
      targetId: userId,
    });
  });
  return ok(undefined);
}

export async function totpStatus(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      totpEnabledAt: true,
      role: true,
      recoveryCodes: { where: { usedAt: null }, select: { id: true } },
    },
  });
  return {
    enabled: Boolean(u?.totpEnabledAt),
    role: u?.role,
    remainingRecoveryCodes: u?.recoveryCodes.length ?? 0,
  };
}
