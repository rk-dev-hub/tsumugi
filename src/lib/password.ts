import { hash, verify } from "@node-rs/argon2";

/**
 * パスワードのハッシュ化（Argon2id）。
 * パラメータは OWASP Password Storage Cheat Sheet の推奨（m=19 MiB, t=2, p=1）に合わせる。
 * algorithm の既定値は Argon2id。
 */
const OPTIONS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** パスワードを Argon2id でハッシュ化する。平文は保存しない。 */
export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

/** 平文とハッシュを照合する。ハッシュが壊れていても例外にせず false を返す。 */
export async function verifyPassword(
  plain: string,
  passwordHash: string,
): Promise<boolean> {
  try {
    return await verify(passwordHash, plain);
  } catch {
    return false;
  }
}

export {
  isAcceptablePassword,
  PASSWORD_POLICY_MESSAGE,
} from "./password-policy";
