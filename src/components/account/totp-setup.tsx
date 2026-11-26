"use client";

import { useState, useTransition } from "react";
import { Copy, KeyRound } from "lucide-react";
import { beginTotpAction, confirmTotpAction } from "@/features/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";

/** 2 段階認証（TOTP）の設定: QR を読み取り → コードを確認 → リカバリーコードを表示 */
export function TotpSetup({ onDoneHref }: { onDoneHref?: string }) {
  const [step, setStep] = useState<"idle" | "scan" | "done">("idle");
  const [secret, setSecret] = useState("");
  const [qr, setQr] = useState("");
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (step === "done") {
    return (
      <div className="flex flex-col gap-3">
        <p className="bg-success-soft text-success rounded-md px-3 py-2 text-sm">
          2 段階認証を有効にしました。
        </p>
        <p className="text-sm">
          認証アプリが使えなくなったときのためのリカバリーコードです。
          <strong>この画面でしか表示しません。</strong>
          安全な場所に保管してください（各コードは 1 回だけ使えます）。
        </p>
        <ul className="bg-surface-2 tabular grid grid-cols-2 gap-1.5 rounded-lg p-3 font-mono text-sm">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigator.clipboard?.writeText(codes.join("\n"))}
          >
            <Copy aria-hidden />
            コピー
          </Button>
          {onDoneHref ? (
            <a
              href={onDoneHref}
              className="bg-grad inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-white"
            >
              続ける
            </a>
          ) : null}
        </div>
      </div>
    );
  }

  if (step === "idle") {
    return (
      <div className="flex flex-col gap-3">
        {message ? <p className="text-destructive text-sm">{message}</p> : null}
        <Button
          variant="grad"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await beginTotpAction();
              if (!r.ok)
                return setMessage(r.message ?? "開始できませんでした。");
              setSecret(r.secret!);
              setQr(r.qrDataUrl!);
              setStep("scan");
            })
          }
        >
          <KeyRound aria-hidden />2 段階認証を設定する
        </Button>
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await confirmTotpAction(code);
          if (!r.ok) return setMessage(r.message ?? "確認できませんでした。");
          setCodes(r.recoveryCodes ?? []);
          setStep("done");
        });
      }}
    >
      <ol className="text-muted-foreground list-inside list-decimal space-y-1 text-sm">
        <li>
          認証アプリ（Google Authenticator・1Password など）で QR
          コードを読み取ります。
        </li>
        <li>アプリに表示された 6 桁のコードを入力します。</li>
      </ol>
      <div className="flex flex-wrap items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- data URL の QR コード */}
        <img
          src={qr}
          alt="2 段階認証の QR コード"
          width={160}
          height={160}
          className="rounded-lg border bg-white p-1"
        />
        <div className="min-w-0 text-xs">
          <p className="text-muted-foreground">
            読み取れない場合は、このキーを入力してください。
          </p>
          <code className="bg-surface-2 mt-1 block rounded px-2 py-1 font-mono break-all">
            {secret}
          </code>
        </div>
      </div>
      <Field
        label="確認コード"
        htmlFor="totp-code"
        error={message ?? undefined}
      >
        <Input
          id="totp-code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="tabular w-40 text-center text-lg tracking-[0.3em]"
          required
        />
      </Field>
      <div>
        <Button type="submit" variant="grad" disabled={pending}>
          {pending ? "確認中…" : "確認して有効にする"}
        </Button>
      </div>
    </form>
  );
}
