import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { createHash } from "node:crypto";
import { z } from "zod";
import type { Role, UserStatus } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/password";
import { open } from "@/lib/secret-box";
import { verifyTotp } from "@/lib/totp";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
  code: z.string().max(32).optional(),
});

/** パスワードは正しいが、2 段階認証のコードが必要（または違う） */
export class TotpRequired extends CredentialsSignin {
  code = "totp_required";
}
export class TotpInvalid extends CredentialsSignin {
  code = "totp_invalid";
}

type TokenExtras = {
  role: Role;
  status: UserStatus;
  mustChangePassword: boolean;
  sessionVersion: number;
};

export function hashRecoveryCode(code: string): string {
  return createHash("sha256")
    .update(`tsumugi:recovery:${code.trim().toLowerCase()}`)
    .digest("hex");
}

/** 2 段階認証のコード（6 桁）かリカバリーコードを確かめる。成功なら true。 */
async function verifySecondFactor(
  user: {
    id: string;
    totpSecretEnc: string | null;
    totpLastUsedStep: number | null;
  },
  code: string,
): Promise<boolean> {
  const trimmed = code.replace(/\s/g, "");
  if (/^\d{6}$/.test(trimmed) && user.totpSecretEnc) {
    const secret = open(user.totpSecretEnc);
    if (!secret) return false;
    const step = verifyTotp(secret, trimmed, user.totpLastUsedStep);
    if (step === null) return false;
    // 同じコードを 2 回使えないよう、使ったステップを記録する（競合時は後勝ちでも安全側）
    const updated = await prisma.user.updateMany({
      where: {
        id: user.id,
        OR: [{ totpLastUsedStep: null }, { totpLastUsedStep: { lt: step } }],
      },
      data: { totpLastUsedStep: step },
    });
    return updated.count === 1;
  }
  // リカバリーコード（一度だけ使える）
  const hit = await prisma.recoveryCode.updateMany({
    where: {
      userId: user.id,
      codeHash: hashRecoveryCode(trimmed),
      usedAt: null,
    },
    data: { usedAt: new Date() },
  });
  return hit.count === 1;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 12 }, // 最大 12 時間
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {}, code: {} },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.trim().toLowerCase();
        const user = await prisma.user.findUnique({ where: { email } });
        // 存在しない・無効化・パスワード誤りは区別しない
        if (!user || user.status !== "ACTIVE") return null;
        const okPassword = await verifyPassword(
          parsed.data.password,
          user.passwordHash,
        );
        if (!okPassword) return null;

        if (user.totpEnabledAt) {
          const code = parsed.data.code?.trim();
          if (!code) throw new TotpRequired();
          if (!(await verifySecondFactor(user, code))) throw new TotpInvalid();
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          mustChangePassword: user.mustChangePassword,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        const u = user as Partial<TokenExtras> & { id?: string };
        return {
          ...token,
          uid: u.id,
          role: u.role,
          status: u.status,
          mustChangePassword: u.mustChangePassword,
          sv: u.sessionVersion,
        };
      }
      // 以降のリクエスト: 権限・状態を DB から最新にし、
      // パスワード変更・権限変更・無効化（sessionVersion の変化）でセッションを破棄する。
      const uid = token.uid;
      if (typeof uid !== "string") return null;
      const fresh = await prisma.user.findUnique({
        where: { id: uid },
        select: {
          role: true,
          status: true,
          mustChangePassword: true,
          sessionVersion: true,
        },
      });
      if (
        !fresh ||
        fresh.status !== "ACTIVE" ||
        fresh.sessionVersion !== token.sv
      ) {
        return null;
      }
      return {
        ...token,
        role: fresh.role,
        status: fresh.status,
        mustChangePassword: fresh.mustChangePassword,
      };
    },
    async session({ session, token }) {
      session.user.id = typeof token.uid === "string" ? token.uid : "";
      session.user.role = token.role as Role;
      session.user.status = token.status as UserStatus;
      session.user.mustChangePassword = Boolean(token.mustChangePassword);
      return session;
    },
  },
});
