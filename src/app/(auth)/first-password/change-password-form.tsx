"use client";

import { useActionState, useEffect, useState } from "react";
import { isAcceptablePassword } from "@/lib/password-policy";
import { useToast } from "@/components/toast";
import { changePasswordAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/** パスワードの強さの目安（0〜3）。長さと文字の種類で決める。 */
function strength(pw: string): number {
  if (!isAcceptablePassword(pw)) return 0;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) =>
    r.test(pw),
  ).length;
  if (pw.length >= 14 && kinds >= 3) return 3;
  if (pw.length >= 10 && kinds >= 2) return 2;
  return 1;
}

const STRENGTH = ["要件を満たしていません", "弱い", "ふつう", "強い"];

export function ChangePasswordForm({
  submitLabel = "パスワードを変更",
  from,
}: {
  submitLabel?: string;
  /** "settings" のとき、変更後もこの画面にとどまる */
  from?: "settings";
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    changePasswordAction,
    null,
  );
  const [pw, setPw] = useState("");
  const toast = useToast();
  useEffect(() => {
    if (state?.ok) toast("パスワードを変更しました");
  }, [state, toast]);
  const level = strength(pw);

  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      key={state?.ok ? "done" : "form"}
    >
      {state?.error ? (
        <p
          className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <Field
        label="現在のパスワード"
        htmlFor="currentPassword"
        error={state?.fields?.currentPassword}
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!state?.fields?.currentPassword}
        />
      </Field>

      <Field
        label="新しいパスワード"
        htmlFor="newPassword"
        hint="12〜128 文字。長いほど安全です"
        error={state?.fields?.newPassword}
      >
        <Input
          id="newPassword"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
          maxLength={128}
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          aria-invalid={!!state?.fields?.newPassword}
          aria-describedby="pw-strength"
        />
        {pw ? (
          <div
            id="pw-strength"
            className="flex items-center gap-2"
            aria-live="polite"
          >
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={
                    "h-1 flex-1 rounded-full " +
                    (level >= i
                      ? level === 1
                        ? "bg-warning"
                        : "bg-success"
                      : "bg-surface-2")
                  }
                />
              ))}
            </div>
            <span className="text-muted-foreground w-28 text-right text-xs">
              {STRENGTH[level]}
            </span>
          </div>
        ) : null}
      </Field>

      <Field
        label="新しいパスワード（確認）"
        htmlFor="confirmPassword"
        error={state?.fields?.confirmPassword}
      >
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={!!state?.fields?.confirmPassword}
        />
      </Field>

      {from ? <input type="hidden" name="from" value={from} /> : null}
      <Button
        type="submit"
        variant="grad"
        disabled={pending}
        className="mt-2 w-full"
      >
        {pending ? "変更中…" : submitLabel}
      </Button>
    </form>
  );
}
