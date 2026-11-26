"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, ShieldCheck } from "lucide-react";
import { loginAction, type FormState } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    loginAction,
    null,
  );
  const [show, setShow] = useState(false);
  const needCode = Boolean(state?.needCode);
  // 2 段階目でもメールとパスワードを送り直す（画面には出さない）。
  // 送信後にフォームが初期化されても値が残るよう、状態で持つ。
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />

      {state?.error ? (
        <p
          className="bg-destructive-soft text-destructive rounded-md px-3 py-2 text-sm"
          role="alert"
        >
          {state.error}
        </p>
      ) : null}

      <div className={needCode ? "hidden" : "contents"}>
        <Field
          label="メールアドレス"
          htmlFor="email"
          error={state?.fields?.email}
        >
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            autoFocus={!needCode}
            aria-invalid={!!state?.fields?.email}
          />
        </Field>

        <Field
          label="パスワード"
          htmlFor="password"
          error={state?.fields?.password}
        >
          <div className="relative">
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              id="password"
              name="password"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              required
              className="pr-10"
              aria-invalid={!!state?.fields?.password}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="text-muted-foreground hover:text-foreground absolute inset-y-0 right-0 grid w-10 place-items-center"
              aria-label={show ? "パスワードを隠す" : "パスワードを表示"}
              aria-pressed={show}
            >
              {show ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </Field>
      </div>

      {needCode ? (
        <div className="flex flex-col gap-3">
          <div className="bg-grad-soft flex items-start gap-2.5 rounded-lg p-3 text-sm">
            <ShieldCheck
              className="text-primary mt-0.5 size-4 shrink-0"
              aria-hidden
            />
            <p>
              認証アプリに表示されている 6
              桁のコードを入力してください。リカバリーコードも使えます。
            </p>
          </div>
          <Field label="確認コード" htmlFor="code">
            <Input
              id="code"
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              maxLength={20}
              className="tabular text-center text-lg tracking-[0.3em]"
            />
          </Field>
        </div>
      ) : null}

      <Button
        type="submit"
        variant="grad"
        disabled={pending}
        className="mt-2 w-full"
      >
        {pending ? "確認中…" : needCode ? "確認してログイン" : "ログイン"}
      </Button>
    </form>
  );
}
