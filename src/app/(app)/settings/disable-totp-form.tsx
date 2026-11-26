"use client";

import { useState, useTransition } from "react";
import { disableTotpAction } from "@/features/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/toast";

export function DisableTotpForm() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await disableTotpAction(pw);
          if (r.ok) toast(r.message ?? "無効にしました");
          else setMsg(r.message ?? "無効にできませんでした");
        });
      }}
    >
      <label className="flex flex-col gap-1 text-xs">
        無効にするには現在のパスワードを入力
        <Input
          type="password"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          autoComplete="current-password"
          className="w-56"
          required
        />
      </label>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        無効にする
      </Button>
      {msg ? <p className="text-destructive w-full text-xs">{msg}</p> : null}
    </form>
  );
}
