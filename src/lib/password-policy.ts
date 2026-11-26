// パスワードの最低要件。ブラウザ側とサーバー側の両方で使う（ハッシュ処理は含めない）。

/** よく使われる・推測されやすいパスワード（抜粋）。 */
const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password123",
  "12345678",
  "123456789",
  "1234567890",
  "qwertyuiop",
  "qwerty123",
  "11111111",
  "00000000",
  "abcd1234",
  "iloveyou",
  "letmein1",
  "welcome1",
  "admin123",
  "passw0rd",
  "changeme",
]);

/** 最低要件（12 文字以上・128 文字以下・よく使われるパスワードでない）。UI と Server Action で共有する。 */
export function isAcceptablePassword(plain: string): boolean {
  return (
    typeof plain === "string" &&
    plain.length >= 12 &&
    plain.length <= 128 &&
    !COMMON_PASSWORDS.has(plain.toLowerCase())
  );
}

export const PASSWORD_POLICY_MESSAGE =
  "12〜128 文字で、よく使われるパスワード（password123 など）以外にしてください";
