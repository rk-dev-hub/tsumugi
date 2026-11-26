"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Copy, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { TsumugiHeading } from "@/components/tsumugi/note";
import { useToast } from "@/components/toast";
import { monthlyReportAction } from "./actions";

export function MonthlyReportPanel({ ym }: { ym: string }) {
  const [text, setText] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ ai: boolean; unknown: string[] } | null>(
    null,
  );
  const [pending, start] = useTransition();
  const toast = useToast();

  return (
    <section className="bg-tsumugi-grad border-tsumugi-border flex flex-col gap-3 rounded-2xl border p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TsumugiHeading>月次採算レポートの下書き</TsumugiHeading>
        <Button
          variant="tsumugi"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await monthlyReportAction(ym);
              if (!r) return toast("下書きを作れませんでした");
              setText(
                [
                  r.value.title,
                  "",
                  ...r.value.sections.flatMap((s) => [
                    `■ ${s.heading}`,
                    s.body,
                    "",
                  ]),
                ]
                  .join("\n")
                  .trim(),
              );
              setMeta({ ai: r.ai, unknown: r.unknownNumbers });
            })
          }
        >
          <Sparkles aria-hidden />
          {pending ? "まとめています…" : text ? "作り直す" : "下書きを作る"}
        </Button>
      </div>
      <p className="text-tsumugi-foreground/80 text-xs">
        数値はアプリが計算した確定値です。Tsumugi
        は文章だけを作ります。内容を確かめて、必要なら直してから使ってください。
      </p>
      {text !== null ? (
        <>
          {meta?.unknown.length ? (
            <p className="bg-warning-soft text-warning flex items-center gap-1.5 rounded-md px-3 py-2 text-xs">
              <AlertTriangle className="size-3.5" aria-hidden />
              データにない数値が含まれています（{meta.unknown.join("、")}
              ）。確認してください。
            </p>
          ) : null}
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={12}
            className="bg-surface/90 text-sm leading-relaxed"
            aria-label="レポートの下書き"
          />
          <div className="flex items-center justify-between">
            <span className="text-tsumugi-foreground/70 text-xs">
              {meta?.ai ? "Tsumugi（AI）が作成" : "テンプレートで作成"}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(text);
                toast("コピーしました");
              }}
            >
              <Copy aria-hidden />
              コピー
            </Button>
          </div>
        </>
      ) : null}
    </section>
  );
}
