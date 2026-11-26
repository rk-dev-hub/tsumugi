import { z } from "zod";
import {
  isAcceptablePassword,
  PASSWORD_POLICY_MESSAGE,
} from "@/lib/password-policy";

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, "メールアドレスを入力してください")
    .email("メールアドレスの形式が正しくありません"),
  password: z.string().min(1, "パスワードを入力してください"),
  code: z.string().max(32).optional(),
  next: z.string().optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "現在のパスワードを入力してください"),
    newPassword: z
      .string()
      .min(12, "新しいパスワードは 12 文字以上にしてください")
      .refine(isAcceptablePassword, PASSWORD_POLICY_MESSAGE),
    confirmPassword: z.string().min(1, "確認用パスワードを入力してください"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "新しいパスワードと一致しません",
  })
  .refine((v) => v.newPassword !== v.currentPassword, {
    path: ["newPassword"],
    message: "現在のパスワードと異なるものにしてください",
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
