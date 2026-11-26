"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** 予期しないエラー。詳細（スタックなど）は画面に出さない。 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <div className="bg-destructive/10 text-destructive flex size-14 items-center justify-center rounded-2xl">
        <TriangleAlert className="size-7" aria-hidden />
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        問題が発生しました
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        時間をおいてもう一度お試しください。続く場合は管理者に連絡してください。
        {error.digest ? (
          <span className="mt-1 block text-xs">エラー ID: {error.digest}</span>
        ) : null}
      </p>
      <Button variant="grad" className="mt-3" onClick={reset}>
        もう一度読み込む
      </Button>
    </div>
  );
}
