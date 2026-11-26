import Link from "next/link";
import { SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

/** 見つからない・見る権限がないページ。権限の有無は区別しない（存在を推測させない）。 */
export function NotFoundView() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
      <div className="bg-grad shadow-primary/25 flex size-14 items-center justify-center rounded-2xl text-white shadow-lg">
        <SearchX className="size-7" aria-hidden />
      </div>
      <h1 className="mt-2 text-xl font-semibold tracking-tight">
        ページが見つかりません
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm leading-relaxed">
        URL が間違っているか、削除された、または表示する権限がないページです。
      </p>
      <Link
        href="/"
        className={buttonVariants({ variant: "grad", className: "mt-3" })}
      >
        ホームへ戻る
      </Link>
    </div>
  );
}
